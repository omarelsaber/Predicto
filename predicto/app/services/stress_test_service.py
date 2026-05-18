import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.stats import t as student_t

from app.core.cache import predicto_cache_v2
from app.core.schema_resolver import resolve_canonical_df
from app.models.response_models import (
    StressTestRequest,
    StressTestResponse,
    ShockScenarioResult,
    MonteCarloPercentileBand,
    SegmentStressResult,
    ShockScenario,
    StressTestMode,
    FeatureAvailability,
    ConfidenceLevel,
)

log = logging.getLogger("predicto.v2.stress_test")

RIDGE_LAMBDA      = 1e-4
MIN_ROWS_FOR_VAR  = 12
VAR_LAG_ORDER     = 1
FORECAST_HORIZON  = 9
N_MC_ITERATIONS   = 500

SHOCK_PARAMS: Dict[ShockScenario, Tuple[float, float, float]] = {
    ShockScenario.LIQUIDITY_SHOCK:    (3.0, -0.15, 0.08),
    ShockScenario.DEMAND_CONTRACTION: (4.0, -0.20, 0.12),
    ShockScenario.COMPETITIVE_EVENT:  (5.0, -0.10, 0.05),
}

DETERMINISTIC_MATRIX: Dict[str, Dict[ShockScenario, float]] = {
    "Enterprise":   {ShockScenario.LIQUIDITY_SHOCK: -0.08, ShockScenario.DEMAND_CONTRACTION: -0.10, ShockScenario.COMPETITIVE_EVENT: -0.05},
    "Mid-Market":   {ShockScenario.LIQUIDITY_SHOCK: -0.14, ShockScenario.DEMAND_CONTRACTION: -0.18, ShockScenario.COMPETITIVE_EVENT: -0.09},
    "SMB":          {ShockScenario.LIQUIDITY_SHOCK: -0.22, ShockScenario.DEMAND_CONTRACTION: -0.28, ShockScenario.COMPETITIVE_EVENT: -0.14},
    "Unknown":      {ShockScenario.LIQUIDITY_SHOCK: -0.15, ShockScenario.DEMAND_CONTRACTION: -0.20, ShockScenario.COMPETITIVE_EVENT: -0.10},
}


def _fit_ridge_var(Y: np.ndarray, lag: int = VAR_LAG_ORDER) -> Optional[np.ndarray]:
    T, K = Y.shape
    if T <= lag + 1:
        return None

    rows = []
    for t in range(lag, T):
        row = Y[t - lag: t][::-1].flatten()
        rows.append(row)
    X    = np.array(rows, dtype=float)
    Y_t  = Y[lag:, :]

    try:
        lam  = RIDGE_LAMBDA
        XtX  = X.T @ X + lam * np.eye(X.shape[1])
        XtY  = X.T @ Y_t
        B    = np.linalg.solve(XtX, XtY)
        return B
    except np.linalg.LinAlgError:
        return None


def _var_forecast(history: np.ndarray, B: np.ndarray, horizon: int, lag: int = VAR_LAG_ORDER) -> np.ndarray:
    K        = history.shape[1]
    buf      = list(history[-lag:])
    forecast = []
    for _ in range(horizon):
        x       = np.array(buf[-lag:][::-1]).flatten()
        y_next  = x @ B
        forecast.append(y_next)
        buf.append(y_next)
    return np.array(forecast)


def _cvar(samples: np.ndarray, alpha: float = 0.05) -> float:
    threshold = np.quantile(samples, alpha)
    tail      = samples[samples <= threshold]
    return float(tail.mean()) if len(tail) > 0 else float(threshold)


def _build_survival_curve(baseline_arr: float, shock_multipliers_mc: np.ndarray) -> List[MonteCarloPercentileBand]:
    cum_multipliers = np.cumprod(1.0 + shock_multipliers_mc, axis=1)
    arr_paths       = baseline_arr * cum_multipliers

    bands: List[MonteCarloPercentileBand] = []
    for m in range(shock_multipliers_mc.shape[1]):
        month_arr = arr_paths[:, m]
        bands.append(MonteCarloPercentileBand(
            month  = m + 1,
            p5     = round(float(np.percentile(month_arr, 5)),  2),
            p25    = round(float(np.percentile(month_arr, 25)), 2),
            p50    = round(float(np.percentile(month_arr, 50)), 2),
            p75    = round(float(np.percentile(month_arr, 75)), 2),
            p95    = round(float(np.percentile(month_arr, 95)), 2),
            mean   = round(float(month_arr.mean()), 2),
            cvar_5 = round(_cvar(month_arr, alpha=0.05), 2),
        ))
    return bands


def _segment_stress(engineered_df: Optional[pd.DataFrame], shock_scenario: ShockScenario, nu: float, mu: float, sigma: float, n_iter: int, horizon: int, rng: np.random.Generator) -> List[SegmentStressResult]:
    results: List[SegmentStressResult] = []

    if engineered_df is None or engineered_df.empty:
        return results

    seg_col = next((c for c in ("segment", "customer_segment") if c in engineered_df.columns), None)
    mrr_col = next((c for c in ("mrr",) if c in engineered_df.columns), None)

    if not seg_col or not mrr_col:
        return results

    for seg, group in engineered_df.groupby(seg_col):
        seg_str  = str(seg)
        base_arr = float(group[mrr_col].sum()) * 12.0

        shocks = student_t.rvs(df=nu, loc=mu, scale=sigma, size=(n_iter, horizon), random_state=None)
        shocks = np.clip(shocks, -0.99, 0.5)

        cum_mult       = np.cumprod(1.0 + shocks, axis=1)
        final_arr      = base_arr * cum_mult[:, -1]
        shocked_mean   = float(final_arr.mean())
        arr_loss_pct   = (base_arr - shocked_mean) / base_arr if base_arr > 0 else 0.0
        seg_cvar       = _cvar(final_arr, alpha=0.05)
        survival_prob  = float((final_arr > 0).mean())

        results.append(SegmentStressResult(
            segment          = seg_str,
            baseline_arr     = round(base_arr, 2),
            shocked_arr_mean = round(shocked_mean, 2),
            arr_loss_pct     = round(arr_loss_pct, 4),
            cvar_5           = round(seg_cvar, 2),
            survival_probability = round(survival_prob, 4),
        ))

    return results


def calculate_stress_test(request: StressTestRequest) -> StressTestResponse:
    warnings:       List[str] = []
    raw_snapshots    = predicto_cache_v2.snapshots_df
    raw_engineered   = predicto_cache_v2.engineered_df
    
    # Apply Intelligent Schema Alignment
    snapshots_df  = resolve_canonical_df(raw_snapshots)
    engineered_df = resolve_canonical_df(raw_engineered)

    horizon         = request.forecast_horizon_months
    n_iter          = request.n_iterations
    rng             = np.random.default_rng(seed=42)

    baseline_arr = 0.0
    if engineered_df is not None and not engineered_df.empty and "mrr" in engineered_df.columns:
        baseline_arr = float(engineered_df["mrr"].sum()) * 12.0
    elif snapshots_df is not None and not snapshots_df.empty and "mrr" in snapshots_df.columns:
        baseline_arr = float(snapshots_df["mrr"].sum())

    var_coeff:   Optional[np.ndarray] = None
    model_mode:  StressTestMode       = StressTestMode.DETERMINISTIC_MACRO
    var_lag_order_used                = 0
    n_snapshot_rows                   = 0
    ridge_lambda_used                 = 0.0

    if snapshots_df is not None and not snapshots_df.empty:
        var_target_cols = [c for c in ("mrr", "churn_probability") if c in snapshots_df.columns]
        if len(var_target_cols) >= 2:
            date_col = next((c for c in ("snapshot_date", "date", "month", "period") if c in snapshots_df.columns), None)
            if date_col:
                ts = snapshots_df.groupby(date_col)[var_target_cols].mean().sort_index().fillna(method="ffill").fillna(0.0)
            else:
                ts = snapshots_df[var_target_cols].fillna(0.0)

            Y              = ts.values.astype(float)
            n_snapshot_rows = len(Y)

            col_var = np.var(Y, axis=0)
            zero_var_mask = col_var < 1e-12

            if zero_var_mask.all():
                warnings.append("All VAR target columns have near-zero variance — falling back to Deterministic Macro-Sensitivity Matrix.")
                model_mode = StressTestMode.DETERMINISTIC_MACRO
            else:
                if zero_var_mask.any():
                    zero_cols = [var_target_cols[i] for i, z in enumerate(zero_var_mask) if z]
                    warnings.append(f"Zero-variance columns excluded from VAR: {zero_cols}. Ridge regularisation applied.")
                    keep_cols = [c for c, z in zip(var_target_cols, zero_var_mask) if not z]
                    Y         = ts[keep_cols].values.astype(float)

                if n_snapshot_rows >= MIN_ROWS_FOR_VAR:
                    var_coeff = _fit_ridge_var(Y, lag=VAR_LAG_ORDER)
                    if var_coeff is not None:
                        model_mode        = StressTestMode.RIDGE_VAR
                        var_lag_order_used = VAR_LAG_ORDER
                        ridge_lambda_used  = RIDGE_LAMBDA
                        log.info("stress_test: fitted Ridge VAR(%d), rows=%d", VAR_LAG_ORDER, n_snapshot_rows)
                    else:
                        warnings.append("Ridge VAR fitting failed (LinAlgError) — falling back to Deterministic.")
                        model_mode = StressTestMode.DETERMINISTIC_MACRO
                else:
                    warnings.append(f"Insufficient snapshot rows ({n_snapshot_rows} < {MIN_ROWS_FOR_VAR}) for VAR fitting — using Ridge VAR with limited history.")
                    var_coeff = _fit_ridge_var(Y, lag=min(VAR_LAG_ORDER, max(1, n_snapshot_rows - 2)))
                    if var_coeff is not None:
                        model_mode        = StressTestMode.RIDGE_VAR
                        var_lag_order_used = min(VAR_LAG_ORDER, max(1, n_snapshot_rows - 2))
                        ridge_lambda_used  = RIDGE_LAMBDA
                    else:
                        model_mode = StressTestMode.DETERMINISTIC_MACRO
        else:
            warnings.append("Insufficient VAR target columns in snapshots_df — falling back to Deterministic Macro-Sensitivity Matrix.")
    else:
        warnings.append("snapshots_df absent — using Deterministic Macro-Sensitivity Matrix.")

    scenario_results: List[ShockScenarioResult] = []

    for scenario in request.scenarios:
        nu, mu, sigma = SHOCK_PARAMS[scenario]

        if model_mode == StressTestMode.DETERMINISTIC_MACRO or var_coeff is None:
            avg_multiplier = np.mean([DETERMINISTIC_MATRIX.get(seg, DETERMINISTIC_MATRIX["Unknown"])[scenario] for seg in DETERMINISTIC_MATRIX if seg != "Unknown"])
            base_shocks = np.full((n_iter, horizon), avg_multiplier)
            noise       = student_t.rvs(df=nu, loc=0.0, scale=sigma * 0.5, size=(n_iter, horizon))
            shock_matrix = np.clip(base_shocks + noise, -0.99, 0.5)
        else:
            Y_last = snapshots_df[[c for c in ("mrr", "churn_probability") if c in snapshots_df.columns]].fillna(0.0).values.astype(float)
            if len(Y_last) > VAR_LAG_ORDER:
                det_forecast = _var_forecast(Y_last, var_coeff, horizon, VAR_LAG_ORDER)
                base_mrr    = float(Y_last[-1, 0]) if Y_last[-1, 0] > 0 else 1.0
                det_growths = np.diff(np.concatenate([[base_mrr], det_forecast[:, 0]]) / base_mrr)
                det_growths = np.clip(det_growths, -0.99, 0.5)
            else:
                det_growths = np.zeros(horizon)

            t_noise      = student_t.rvs(df=nu, loc=mu, scale=sigma, size=(n_iter, horizon))
            shock_matrix = np.clip(det_growths[None, :] + t_noise, -0.99, 0.5)

        survival_curve = _build_survival_curve(baseline_arr, shock_matrix)

        final_arr_samples  = baseline_arr * np.cumprod(1.0 + shock_matrix, axis=1)[:, -1]
        portfolio_cvar     = _cvar(final_arr_samples, alpha=0.05)

        seg_results = _segment_stress(
            engineered_df   = engineered_df,
            shock_scenario  = scenario,
            nu=nu, mu=mu, sigma=sigma,
            n_iter=n_iter,
            horizon=horizon,
            rng=rng,
        )

        median_arr   = np.array([b.p50 for b in survival_curve])
        worst_month  = int(np.argmin(median_arr)) + 1
        arr_drawdown = float((baseline_arr - median_arr.min()) / baseline_arr) if baseline_arr > 0 else 0.0

        scenario_results.append(ShockScenarioResult(
            scenario          = scenario,
            nu                = nu,
            mu                = mu,
            sigma             = sigma,
            portfolio_cvar_5  = round(portfolio_cvar, 2),
            survival_curve    = survival_curve,
            segment_breakdown = seg_results,
            worst_month       = worst_month,
            arr_drawdown_pct  = round(arr_drawdown, 4),
        ))

        log.info("stress_test: scenario=%s, mode=%s, cvar_5=%.2f, worst_month=%d", scenario.value, model_mode.value, portfolio_cvar, worst_month)

    worst_scenario = max(scenario_results, key=lambda s: s.arr_drawdown_pct) if scenario_results else None
    if worst_scenario:
        narrative = (
            f"Stress test complete across {len(scenario_results)} shock scenarios using {model_mode.value} with {n_iter} Monte Carlo iterations. "
            f"Worst-case scenario: {worst_scenario.scenario.value} with {worst_scenario.arr_drawdown_pct:.1%} ARR drawdown "
            f"(CVaR₅: ${worst_scenario.portfolio_cvar_5:,.0f}). Baseline portfolio ARR: ${baseline_arr:,.0f}."
        )
    else:
        narrative = "No stress-test scenarios completed."

    confidence = ConfidenceLevel.HIGH if model_mode == StressTestMode.RIDGE_VAR and n_snapshot_rows >= MIN_ROWS_FOR_VAR else ConfidenceLevel.MEDIUM if model_mode == StressTestMode.RIDGE_VAR else ConfidenceLevel.LOW
    avail = FeatureAvailability.ACTIVE if snapshots_df is not None and not snapshots_df.empty else FeatureAvailability.PARTIAL if engineered_df is not None and not engineered_df.empty else FeatureAvailability.OFFLINE

    return StressTestResponse(
        scenario_results    = scenario_results,
        baseline_arr        = round(baseline_arr, 2),
        model_mode          = model_mode,
        var_lag_order       = var_lag_order_used,
        ridge_lambda        = ridge_lambda_used,
        n_snapshot_rows     = n_snapshot_rows,
        summary_narrative   = narrative,
        data_availability   = avail,
        overall_confidence  = confidence,
        warnings            = warnings,
    )
