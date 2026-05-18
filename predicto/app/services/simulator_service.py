"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/services/simulator_service.py                                          ║
║  Predicto V2 — Multi-Variable Revenue Scenario Simulator (Feature 01)      ║
║                                                                              ║
║  Reads exclusively from `predicto_cache_v2`.  No I/O, no external calls.   ║
║                                                                              ║
║  Degradation contract:                                                       ║
║    OFFLINE  — engineered_df or snapshots_df is None / empty.               ║
║    PARTIAL  — sales_df absent (segment breakdown skipped) OR cold-start     ║
║               model active (trajectory confidence → MEDIUM).                ║
║    ACTIVE   — all tables present, full GRU trajectory available.            ║
║                                                                              ║
║  Zero-crash guarantee: every numeric output defaults to 0.0.                ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.core.cache import predicto_cache_v2  # type: ignore[import]
from app.core.schema_resolver import resolve_canonical_df
from app.models.response_models import (
    AppliedLevers,
    CliffAlertLevel,
    ConfidenceLevel,
    FeatureAvailability,
    MonthlyProjection,
    SegmentImpact,
    SimulatorRequest,
    SimulatorResponse,
)

log = logging.getLogger("predicto.v2.simulator")

# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

# KPI column names as they appear in engineered_df
COL_CUSTOMER_ID        = "customer_id"
COL_ARR                = "arr"
COL_MRR                = "mrr"
COL_CHURN_PROB         = "churn_probability"
COL_CLUSTER            = "cluster_label"
COL_SEGMENT            = "segment"
COL_SNAPSHOT_MONTH     = "snapshot_month"
COL_DISCOUNT           = "discount_pct"
COL_WIN_LOSS           = "win_loss_status"
COL_FAV                = "FAV"
COL_RER                = "RER"
COL_EDI                = "EDI"
COL_SBS                = "SBS"

# Expansion multipliers per K-Means cluster label (matches ExpansionCluster enum)
EXPANSION_MULTIPLIERS: Dict[str, float] = {
    "Champion": 0.30,
    "Growth":   0.18,
    "Stable":   0.05,
    "At-Risk":  0.00,
}

# How much churn probability INCREASES per unit of discount above the ceiling
# (estimated from the DealPriorityScorer's learned feature importance)
DISCOUNT_TO_CHURN_GRADIENT: float = 0.55

# Churn probability boost applied when a CSM intervention is triggered
# (i.e., probability is multiplied by this factor to simulate "intervention saves customer")
INTERVENTION_CHURN_REDUCTION: float = 0.30

# Minimum customers required for full-confidence simulation
MIN_CUSTOMERS_FULL_CONFIDENCE: int = 50

# GRU cold-start trajectory depth (months beyond this are LOW_CONFIDENCE)
COLDSTART_TRAJECTORY_DEPTH: int = 3


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def run_scenario_simulation(request: SimulatorRequest) -> SimulatorResponse:
    """
    Main entry point for Feature 01.

    Steps:
      1. Validate cache readiness → derive data_availability.
      2. Build the customer simulation matrix from engineered_df + snapshots_df.
      3. Establish the baseline 9-month MRR trajectory per customer.
      4. Apply discount-ceiling lever → re-score churn probabilities.
      5. Apply churn-intervention-threshold lever → reduce churn on intervened customers.
      6. Apply expansion-cluster lever → add incremental expansion ARR.
      7. Aggregate to monthly portfolio MRR + confidence bands.
      8. Build segment-level breakdown from sales_df (if present).
      9. Assemble and return SimulatorResponse.
    """

    warnings: List[str] = []

    # ── Step 1: Validate cache ────────────────────────────────────────────────
    availability, trajectory_mode, warnings = _assess_cache_readiness(warnings)
    if availability == FeatureAvailability.OFFLINE:
        return _offline_response(warnings)

    # ── Step 2: Build customer simulation matrix ──────────────────────────────
    sim_df, missing_columns, build_warnings = _build_simulation_matrix()
    warnings.extend(build_warnings)

    if sim_df.empty:
        warnings.append("Simulation matrix is empty after join — returning OFFLINE response.")
        return _offline_response(warnings)

    # ── Step 3: Clamp and echo input levers ──────────────────────────────────
    levers, lever_warnings = _process_levers(request, sim_df)
    warnings.extend(lever_warnings)

    # ── Step 4: Apply discount ceiling → delta churn probability ─────────────
    sim_df = _apply_discount_lever(sim_df, levers)

    # ── Step 5: Apply churn intervention threshold ────────────────────────────
    sim_df = _apply_intervention_lever(sim_df, levers)

    # ── Step 6: Apply expansion cluster activation ────────────────────────────
    sim_df = _apply_expansion_lever(sim_df, levers)

    # ── Step 7: Build month-by-month MRR projections ──────────────────────────
    monthly_projections, total_churn_saved, total_expansion = _build_monthly_projections(
        sim_df,
        levers.forecast_months,
        trajectory_mode,
    )

    # ── Step 8: Segment breakdown ─────────────────────────────────────────────
    segment_impacts = _build_segment_impacts(sim_df)

    # ── Step 9: Assemble response ─────────────────────────────────────────────
    total_mrr_gain = sum(m.mrr_delta for m in monthly_projections)
    net_arr_delta  = total_churn_saved + total_expansion

    overall_confidence = _derive_overall_confidence(
        monthly_projections, trajectory_mode, len(sim_df)
    )

    narrative = _build_narrative(
        total_mrr_gain, total_churn_saved, total_expansion,
        levers, len(sim_df),
    )

    return SimulatorResponse(
        monthly_projections=monthly_projections,
        total_projected_mrr_gain=round(total_mrr_gain, 2),
        total_churn_arr_saved=round(total_churn_saved, 2),
        total_expansion_arr_added=round(total_expansion, 2),
        net_arr_delta=round(net_arr_delta, 2),
        segment_impacts=segment_impacts,
        applied_levers=levers,
        scenario_narrative=narrative,
        trajectory_mode=trajectory_mode,
        data_availability=availability,
        overall_confidence=overall_confidence,
        customers_in_simulation=len(sim_df),
        missing_columns=missing_columns,
        warnings=warnings,
    )


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — CACHE READINESS
# ─────────────────────────────────────────────────────────────────────────────

def _assess_cache_readiness(
    warnings: List[str],
) -> Tuple[FeatureAvailability, str, List[str]]:
    """
    Determines the data availability level and trajectory mode.

    Returns (availability, trajectory_mode, updated_warnings).
    """
    cache = predicto_cache_v2

    if not cache.is_ready:
        warnings.append("Cache not ready — ingestion has not completed.")
        return FeatureAvailability.OFFLINE, "linear_fallback", warnings

    eng_df = cache.engineered_df
    snap_df = cache.snapshots_df

    if eng_df is None or eng_df.empty:
        warnings.append("engineered_df is absent — simulation requires KPI features.")
        return FeatureAvailability.OFFLINE, "linear_fallback", warnings

    if snap_df is None or snap_df.empty:
        warnings.append("snapshots_df is absent — MRR baseline unavailable.")
        return FeatureAvailability.OFFLINE, "linear_fallback", warnings

    # Determine trajectory mode from active model
    active_model = cache.active_model or "none"
    if active_model == "full":
        trajectory_mode = "gru_full"
        availability    = FeatureAvailability.ACTIVE
    elif active_model == "lite":
        trajectory_mode = "gru_coldstart"
        availability    = FeatureAvailability.PARTIAL
        warnings.append(
            "Cold-start model active — trajectory confidence is MEDIUM for months 1-3, "
            "LOW for months 4+."
        )
    else:
        trajectory_mode = "linear_fallback"
        availability    = FeatureAvailability.PARTIAL
        warnings.append(
            "No trained model found in cache — using linear extrapolation from snapshots."
        )

    # Sales_df missing → PARTIAL (segment breakdown will be skipped)
    if cache.sales_df is None or cache.sales_df.empty:
        if availability == FeatureAvailability.ACTIVE:
            availability = FeatureAvailability.PARTIAL
        warnings.append(
            "sales_df absent — discount lever and segment breakdown will be skipped."
        )

    return availability, trajectory_mode, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — BUILD SIMULATION MATRIX
# ─────────────────────────────────────────────────────────────────────────────

def _build_simulation_matrix() -> Tuple[pd.DataFrame, List[str], List[str]]:
    """
    Constructs a per-customer DataFrame containing all columns needed for simulation.

    Source:
        engineered_df  — KPI columns + churn_probability + cluster_label
        snapshots_df   — latest MRR per customer (used as baseline MRR)
        sales_df       — discount_pct per deal, for discount-lever re-scoring

    Returns (sim_df, missing_columns, warnings).
    The returned sim_df has one row per customer with columns:
        customer_id, arr, mrr, churn_probability, cluster_label, segment,
        discount_pct (optional), FAV, EDI, SBS, RER,
        churn_trajectory (list of 9 floats — forward churn risk per month)
    """
    cache = predicto_cache_v2
    missing_columns: List[str] = []
    warnings:        List[str] = []

    eng_df  = cache.engineered_df.copy()
    snap_df = cache.snapshots_df.copy()

    # ── Normalise column names to lowercase ──────────────────────────────────
    eng_df.columns  = [c.lower() for c in eng_df.columns]
    snap_df.columns = [c.lower() for c in snap_df.columns]

    # ── Pull latest snapshot per customer (for baseline MRR) ─────────────────
    if "snapshot_month" in snap_df.columns:
        latest_snap = (
            snap_df.sort_values("snapshot_month", ascending=False)
            .groupby("customer_id", as_index=False)
            .first()
        )
    else:
        # No time column — take first occurrence
        latest_snap = snap_df.groupby("customer_id", as_index=False).first()
        warnings.append(
            "snapshot_month absent — using first occurrence per customer as MRR baseline."
        )

    mrr_col = "mrr" if "mrr" in latest_snap.columns else None
    if mrr_col is None:
        # Derive monthly MRR from ARR if available
        if "arr" in latest_snap.columns:
            latest_snap["mrr"] = latest_snap["arr"] / 12.0
            warnings.append("mrr absent — approximated as arr / 12.")
        else:
            latest_snap["mrr"] = 0.0
            missing_columns.append("mrr")
            warnings.append("Neither mrr nor arr found in snapshots_df — MRR set to 0.0.")

    # ── Merge engineered features with latest snapshot MRR ───────────────────
    keep_snap_cols = {"customer_id", "mrr"} & set(latest_snap.columns)
    sim_df = eng_df.merge(
        latest_snap[list(keep_snap_cols)],
        on="customer_id",
        how="left",
    )
    if "mrr_x" in sim_df.columns:
        # Resolve collision if both tables had mrr
        sim_df["mrr"] = sim_df["mrr_x"].fillna(sim_df.get("mrr_y", 0.0))
        sim_df.drop(columns=["mrr_x", "mrr_y"], errors="ignore", inplace=True)

    # ── Fill required numeric columns with safe defaults ─────────────────────
    for col in [COL_ARR, COL_MRR, COL_CHURN_PROB, COL_FAV, COL_RER, COL_EDI, COL_SBS]:
        if col not in sim_df.columns:
            sim_df[col] = 0.0
            missing_columns.append(col)
        else:
            sim_df[col] = pd.to_numeric(sim_df[col], errors="coerce").fillna(0.0)

    # ── Ensure cluster_label and segment columns exist ────────────────────────
    if COL_CLUSTER not in sim_df.columns:
        sim_df[COL_CLUSTER] = "Stable"
        missing_columns.append(COL_CLUSTER)
        warnings.append("cluster_label absent — all customers defaulted to 'Stable' cluster.")
    if COL_SEGMENT not in sim_df.columns:
        sim_df[COL_SEGMENT] = "Unknown"
        warnings.append("segment absent from engineered_df — segment breakdown skipped.")

    # ── Merge discount info from sales_df (best-effort) ──────────────────────
    sim_df["discount_pct"] = 0.0
    sales_df = cache.sales_df
    if sales_df is not None and not sales_df.empty:
        sd = sales_df.copy()
        sd.columns = [c.lower() for c in sd.columns]
        if "discount_pct" in sd.columns and "customer_id" in sd.columns:
            avg_discount = (
                sd.groupby("customer_id")["discount_pct"]
                .mean()
                .reset_index()
            )
            sim_df = sim_df.merge(
                avg_discount.rename(columns={"discount_pct": "_disc_merge"}),
                on="customer_id",
                how="left",
            )
            sim_df["discount_pct"] = sim_df["_disc_merge"].fillna(0.0)
            sim_df.drop(columns=["_disc_merge"], inplace=True)
        elif "discount_percentage" in sd.columns and "customer_id" in sd.columns:
            # Handle alternate column name
            avg_discount = (
                sd.groupby("customer_id")["discount_percentage"]
                .mean()
                .reset_index()
            )
            sim_df = sim_df.merge(
                avg_discount.rename(columns={"discount_percentage": "_disc_merge"}),
                on="customer_id",
                how="left",
            )
            sim_df["discount_pct"] = sim_df["_disc_merge"].fillna(0.0)
            sim_df.drop(columns=["_disc_merge"], inplace=True)
        else:
            missing_columns.append("discount_pct")
            warnings.append(
                "discount_pct / discount_percentage not found in sales_df — "
                "discount lever will have no effect."
            )

    # ── Build churn trajectory (9 floats per customer) ────────────────────────
    sim_df = _attach_churn_trajectory(sim_df, cache)

    # ── Store working copy of baseline churn probability ─────────────────────
    # (the levers mutate churn_probability in-place; we keep a baseline copy)
    sim_df["baseline_churn_probability"] = sim_df[COL_CHURN_PROB].clip(0.0, 1.0)
    sim_df[COL_CHURN_PROB] = sim_df[COL_CHURN_PROB].clip(0.0, 1.0)

    # ── ARR: prefer engineered_df value; fall back to mrr × 12 ────────────────
    arr_zero_mask = sim_df[COL_ARR] == 0.0
    if arr_zero_mask.any():
        sim_df.loc[arr_zero_mask, COL_ARR] = sim_df.loc[arr_zero_mask, COL_MRR] * 12.0

    return sim_df, list(set(missing_columns)), warnings


def _attach_churn_trajectory(sim_df: pd.DataFrame, cache) -> pd.DataFrame:
    """
    Attaches a 9-element list `churn_trajectory` to each customer row.

    Sources (in priority order):
      1. router.predict() — GRU or XGBoost ColdStartRouter per-customer trajectories
         (expected shape: dict[customer_id → array of 9 probabilities])
      2. GRU output stored as a separate column in engineered_df
         (column name: 'churn_risk_scores' or 'churn_trajectory')
      3. Linear extrapolation from current churn_probability + EDI trend

    All trajectories are clipped to [0, 1].
    """
    n = len(sim_df)
    trajectories: Dict[str, List[float]] = {}

    # ── Attempt 1: router.predict_trajectories() if available ─────────────────
    router = cache.router
    if router is not None and hasattr(router, "predict_trajectories"):
        try:
            raw = router.predict_trajectories(sim_df)
            # Expect: {customer_id: np.ndarray shape (9,)}
            if isinstance(raw, dict):
                for cid, traj in raw.items():
                    arr = np.asarray(traj, dtype=float).clip(0.0, 1.0)
                    # Pad or truncate to exactly 9 months
                    if len(arr) < 9:
                        arr = np.pad(arr, (0, 9 - len(arr)), mode="edge")
                    trajectories[str(cid)] = arr[:9].tolist()
        except Exception as exc:
            log.warning("router.predict_trajectories() failed: %s — falling back.", exc)

    # ── Attempt 2: pre-computed trajectory column in engineered_df ────────────
    if not trajectories:
        for col_name in ("churn_trajectory", "churn_risk_scores"):
            if col_name in sim_df.columns:
                for _, row in sim_df.iterrows():
                    cid  = str(row.get("customer_id", ""))
                    raw  = row[col_name]
                    if isinstance(raw, (list, np.ndarray)) and len(raw) >= 1:
                        arr = np.asarray(raw, dtype=float).clip(0.0, 1.0)
                        if len(arr) < 9:
                            arr = np.pad(arr, (0, 9 - len(arr)), mode="edge")
                        trajectories[cid] = arr[:9].tolist()
                if trajectories:
                    break

    # ── Attempt 3: linear extrapolation from baseline churn + EDI ────────────
    if not trajectories:
        log.info("No model trajectory found — building linear extrapolation.")
        for _, row in sim_df.iterrows():
            cid     = str(row.get("customer_id", ""))
            p0      = float(row.get(COL_CHURN_PROB, 0.0))
            edi     = float(row.get(COL_EDI, 0.0))
            # EDI represents engagement decay; higher EDI accelerates churn
            # Use a small monthly slope proportional to EDI
            monthly_slope = edi * 0.03   # empirical calibration constant
            traj = [
                float(np.clip(p0 + monthly_slope * m, 0.0, 1.0))
                for m in range(1, 10)
            ]
            trajectories[cid] = traj

    # ── Attach trajectories back to sim_df ────────────────────────────────────
    sim_df["churn_trajectory"] = sim_df["customer_id"].apply(
        lambda cid: trajectories.get(
            str(cid),
            # Safe fallback: hold current churn probability flat for 9 months
            [float(np.clip(
                sim_df.loc[sim_df["customer_id"] == cid, COL_CHURN_PROB].values[0]
                if not sim_df.loc[sim_df["customer_id"] == cid].empty else 0.0,
                0.0, 1.0
            ))] * 9,
        )
    )

    return sim_df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — PROCESS INPUT LEVERS
# ─────────────────────────────────────────────────────────────────────────────

def _process_levers(
    request: SimulatorRequest,
    sim_df: pd.DataFrame,
) -> Tuple[AppliedLevers, List[str]]:
    """
    Validates, clamps, and echoes back the input levers.
    Returns (AppliedLevers, warnings).
    """
    warnings: List[str] = []

    discount_ceiling    = request.discount_ceiling
    intervention_thresh = request.churn_intervention_threshold
    expansion_clusters  = request.expansion_activation_clusters or []
    forecast_months     = request.forecast_months

    # Count deals affected by the discount ceiling
    discount_affected = 0
    if discount_ceiling is not None and "discount_pct" in sim_df.columns:
        above_ceiling = (sim_df["discount_pct"] > discount_ceiling).sum()
        discount_affected = int(above_ceiling)
        if discount_affected == 0:
            warnings.append(
                f"Discount ceiling {discount_ceiling:.0%} has no effect — "
                f"no customers currently exceed this threshold."
            )

    # Count expansion-activated customers
    expansion_activated = 0
    if expansion_clusters and COL_CLUSTER in sim_df.columns:
        expansion_activated = int(
            sim_df[COL_CLUSTER].isin(expansion_clusters).sum()
        )
        if expansion_activated == 0:
            warnings.append(
                f"Expansion clusters {expansion_clusters} match 0 customers — "
                "check cluster labels."
            )

    return AppliedLevers(
        discount_ceiling=discount_ceiling,
        churn_intervention_threshold=intervention_thresh,
        expansion_activation_clusters=expansion_clusters,
        forecast_months=forecast_months,
        discount_affected_deals=discount_affected,
        expansion_activated_customers=expansion_activated,
    ), warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — DISCOUNT CEILING LEVER
# ─────────────────────────────────────────────────────────────────────────────

def _apply_discount_lever(
    sim_df: pd.DataFrame,
    levers: AppliedLevers,
) -> pd.DataFrame:
    """
    For customers/deals above the discount ceiling, increase churn probability
    proportional to the discount excess.

    Formula:
        excess         = max(0, discount_pct − discount_ceiling)
        Δchurn_prob    = excess × DISCOUNT_TO_CHURN_GRADIENT
        new_churn_prob = min(1.0, churn_probability + Δchurn_prob)

    This propagates through the churn_trajectory by scaling the trajectory's
    expected churn values by the same delta.
    """
    if levers.discount_ceiling is None:
        return sim_df

    ceiling = levers.discount_ceiling
    mask    = sim_df["discount_pct"] > ceiling

    if not mask.any():
        return sim_df

    # Scalar delta per customer (vectorised via pandas)
    excess      = (sim_df.loc[mask, "discount_pct"] - ceiling).clip(lower=0.0)
    delta_churn = (excess * DISCOUNT_TO_CHURN_GRADIENT).clip(upper=0.5)

    sim_df.loc[mask, COL_CHURN_PROB] = (
        sim_df.loc[mask, COL_CHURN_PROB] + delta_churn
    ).clip(0.0, 1.0)

    # Apply the same delta to each month of the trajectory
    def _shift_trajectory(row) -> List[float]:
        if not mask.loc[row.name]:
            return row["churn_trajectory"]
        d      = float(delta_churn.get(row.name, 0.0))
        traj   = np.asarray(row["churn_trajectory"], dtype=float)
        return np.clip(traj + d, 0.0, 1.0).tolist()

    sim_df["churn_trajectory"] = sim_df.apply(_shift_trajectory, axis=1)

    return sim_df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — CHURN INTERVENTION LEVER
# ─────────────────────────────────────────────────────────────────────────────

def _apply_intervention_lever(
    sim_df: pd.DataFrame,
    levers: AppliedLevers,
) -> pd.DataFrame:
    """
    For customers above the intervention threshold, reduce their churn probability
    by INTERVENTION_CHURN_REDUCTION (simulates successful CSM engagement).

    Formula:
        new_churn_prob = churn_probability × (1 − INTERVENTION_CHURN_REDUCTION)

    The reduction is applied uniformly across the 9-month trajectory to model
    the sustained effect of proactive CSM outreach.
    """
    if levers.churn_intervention_threshold is None:
        return sim_df

    threshold = levers.churn_intervention_threshold
    mask      = sim_df[COL_CHURN_PROB] > threshold

    if not mask.any():
        return sim_df

    reduction_factor = 1.0 - INTERVENTION_CHURN_REDUCTION

    sim_df.loc[mask, COL_CHURN_PROB] = (
        sim_df.loc[mask, COL_CHURN_PROB] * reduction_factor
    ).clip(0.0, 1.0)

    def _reduce_trajectory(row) -> List[float]:
        if not mask.loc[row.name]:
            return row["churn_trajectory"]
        traj = np.asarray(row["churn_trajectory"], dtype=float)
        return np.clip(traj * reduction_factor, 0.0, 1.0).tolist()

    sim_df["churn_trajectory"] = sim_df.apply(_reduce_trajectory, axis=1)

    return sim_df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — EXPANSION CLUSTER LEVER
# ─────────────────────────────────────────────────────────────────────────────

def _apply_expansion_lever(
    sim_df: pd.DataFrame,
    levers: AppliedLevers,
) -> pd.DataFrame:
    """
    Marks customers in activated expansion clusters and attaches their monthly
    expansion_arr_contribution for later aggregation.

    Expansion ARR is distributed linearly across the forecast horizon,
    reaching the full predicted_expansion_arr by month forecast_months.
    """
    if not levers.expansion_activation_clusters:
        sim_df["expansion_arr_per_month"] = 0.0
        return sim_df

    activated  = set(levers.expansion_activation_clusters)
    mask       = sim_df[COL_CLUSTER].isin(activated)

    # Predicted total expansion ARR per customer = arr × cluster multiplier
    multipliers = sim_df[COL_CLUSTER].map(EXPANSION_MULTIPLIERS).fillna(0.0)
    predicted_expansion = sim_df[COL_ARR] * multipliers

    # Monthly ramp: divide total expansion evenly across forecast horizon
    # Only activated clusters receive expansion; others get 0
    months = levers.forecast_months
    sim_df["expansion_arr_per_month"] = np.where(
        mask,
        predicted_expansion / max(months, 1),
        0.0,
    )
    # Store full predicted expansion for segment breakdown
    sim_df["predicted_expansion_arr"] = np.where(mask, predicted_expansion, 0.0)

    return sim_df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — MONTHLY MRR PROJECTIONS
# ─────────────────────────────────────────────────────────────────────────────

def _build_monthly_projections(
    sim_df:          pd.DataFrame,
    forecast_months: int,
    trajectory_mode: str,
) -> Tuple[List[MonthlyProjection], float, float]:
    """
    Aggregates per-customer trajectories to portfolio-level monthly MRR.

    For each month m:
        retained_mrr_customer    = mrr × (1 − churn_trajectory[m-1])
        baseline_retained_mrr    = mrr × (1 − baseline_churn_probability)
        expansion_mrr_month      = expansion_arr_per_month / 12
        projected_mrr            = retained_mrr + expansion_mrr
        baseline_mrr             = sum of baseline_retained_mrr

    Confidence bands:
        Portfolio-level variance from the cross-customer std of the trajectory.
        σ_month = std(churn_trajectory[:, m]) × mean(mrr)
        lower   = projected_mrr − 1.96 × σ_month × portfolio_mrr
        upper   = projected_mrr + 1.96 × σ_month × portfolio_mrr

    Returns (monthly_projections, total_churn_arr_saved, total_expansion_arr_added).
    """
    mrr_array  = sim_df[COL_MRR].values.astype(float)             # (N,)
    arr_array  = sim_df[COL_ARR].values.astype(float)             # (N,)
    base_churn = sim_df["baseline_churn_probability"].values       # (N,)
    exp_month  = sim_df.get("expansion_arr_per_month", pd.Series(
        np.zeros(len(sim_df)))).values                            # (N,)

    # Build trajectory matrix: shape (N, 9)
    traj_matrix = np.array(
        [row if isinstance(row, list) else [0.0] * 9
         for row in sim_df["churn_trajectory"]],
        dtype=float,
    )
    # Safety: ensure exactly (N, 9)
    if traj_matrix.shape[1] < 9:
        pad = np.zeros((traj_matrix.shape[0], 9 - traj_matrix.shape[1]))
        traj_matrix = np.hstack([traj_matrix, pad])
    traj_matrix = traj_matrix[:, :9].clip(0.0, 1.0)

    # Baseline MRR (no levers applied): use baseline_churn_probability held flat
    baseline_portfolio_mrr = float(np.sum(mrr_array * (1.0 - base_churn)))

    total_churn_saved  = 0.0
    total_expansion    = 0.0
    projections:       List[MonthlyProjection] = []

    for m in range(1, forecast_months + 1):
        idx = m - 1  # 0-indexed

        # Scenario retained MRR (customers not yet churned)
        retained_mrr  = float(np.sum(mrr_array * (1.0 - traj_matrix[:, idx])))
        # Monthly expansion contribution (ARR/month → MRR-equivalent)
        expansion_mrr = float(np.sum(exp_month / 12.0))
        projected_mrr = retained_mrr + expansion_mrr

        # Baseline MRR (flat churn, no expansion)
        baseline_mrr  = baseline_portfolio_mrr

        # MRR delta
        mrr_delta = projected_mrr - baseline_mrr

        # Confidence band using cross-customer churn variance
        churn_std   = float(np.std(traj_matrix[:, idx]))
        portfolio_sigma = churn_std * float(np.mean(mrr_array)) * np.sqrt(len(mrr_array))
        z = 1.96
        conf_lower  = projected_mrr - z * portfolio_sigma
        conf_upper  = projected_mrr + z * portfolio_sigma

        # Incremental churn ARR saved this month vs. baseline
        churn_saved_month = float(
            np.sum(mrr_array * (base_churn - traj_matrix[:, idx]).clip(min=0.0)) * 12.0
        )
        expansion_month = float(np.sum(exp_month))  # ARR basis

        total_churn_saved += churn_saved_month
        total_expansion   += expansion_month

        # Determine confidence level
        confidence = _month_confidence(m, trajectory_mode, len(sim_df))

        projections.append(
            MonthlyProjection(
                month=m,
                projected_mrr=round(projected_mrr, 2),
                baseline_mrr=round(baseline_mrr, 2),
                mrr_delta=round(mrr_delta, 2),
                confidence_lower=round(max(0.0, conf_lower), 2),
                confidence_upper=round(conf_upper, 2),
                confidence=confidence,
                churn_arr_saved=round(churn_saved_month, 2),
                expansion_arr_added=round(expansion_month, 2),
            )
        )

    return projections, round(total_churn_saved, 2), round(total_expansion, 2)


def _month_confidence(
    month: int,
    trajectory_mode: str,
    n_customers: int,
) -> ConfidenceLevel:
    """Maps (month, trajectory_mode, n_customers) to a ConfidenceLevel."""
    if n_customers < 10:
        return ConfidenceLevel.LOW
    if trajectory_mode == "gru_full":
        return ConfidenceLevel.HIGH
    if trajectory_mode == "gru_coldstart":
        return ConfidenceLevel.MEDIUM if month <= COLDSTART_TRAJECTORY_DEPTH else ConfidenceLevel.LOW
    # linear_fallback
    return ConfidenceLevel.MEDIUM if month <= 3 else ConfidenceLevel.LOW


# ─────────────────────────────────────────────────────────────────────────────
# STEP 8 — SEGMENT IMPACTS
# ─────────────────────────────────────────────────────────────────────────────

def _build_segment_impacts(sim_df: pd.DataFrame) -> List[SegmentImpact]:
    """
    Builds a per-segment ARR delta breakdown.
    Skipped gracefully when segment column is 'Unknown' across the board.
    """
    if COL_SEGMENT not in sim_df.columns:
        return []

    segments = sim_df[COL_SEGMENT].unique()
    if len(segments) == 1 and segments[0] == "Unknown":
        return []

    impacts: List[SegmentImpact] = []
    for seg in segments:
        mask = sim_df[COL_SEGMENT] == seg
        seg_df = sim_df[mask]

        # Baseline ARR (no levers)
        baseline_arr = float(
            (seg_df[COL_ARR] * (1.0 - seg_df["baseline_churn_probability"])).sum()
        )
        # Scenario ARR (after levers)
        scenario_arr = float(
            (seg_df[COL_ARR] * (1.0 - seg_df[COL_CHURN_PROB])).sum()
            + seg_df.get("predicted_expansion_arr", pd.Series(0.0, index=seg_df.index)).sum()
        )
        affected = int(
            (seg_df[COL_CHURN_PROB] != seg_df["baseline_churn_probability"]).sum()
        )

        impacts.append(
            SegmentImpact(
                segment=str(seg),
                baseline_arr=round(baseline_arr, 2),
                scenario_arr=round(scenario_arr, 2),
                arr_delta=round(scenario_arr - baseline_arr, 2),
                customers_affected=affected,
            )
        )

    # Sort by arr_delta descending (biggest upside first)
    impacts.sort(key=lambda x: x.arr_delta, reverse=True)
    return impacts


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _derive_overall_confidence(
    projections: List[MonthlyProjection],
    trajectory_mode: str,
    n_customers: int,
) -> ConfidenceLevel:
    """Returns the minimum confidence level across all monthly projections."""
    if not projections:
        return ConfidenceLevel.LOW
    levels = {ConfidenceLevel.HIGH: 2, ConfidenceLevel.MEDIUM: 1, ConfidenceLevel.LOW: 0}
    min_level = min(projections, key=lambda p: levels[p.confidence]).confidence
    return min_level


def _build_narrative(
    total_mrr_gain:   float,
    total_churn_saved: float,
    total_expansion:  float,
    levers:           AppliedLevers,
    n_customers:      int,
) -> str:
    """
    Deterministic plain-English scenario narrative.
    Invoked as a fallback when Llama-3.3 is unavailable.
    """
    gain_dir   = "gain" if total_mrr_gain >= 0 else "loss"
    gain_abs   = abs(total_mrr_gain)
    churn_str  = f"${total_churn_saved:,.0f} in ARR retained" if total_churn_saved > 0 else "no churn ARR saved"
    exp_str    = f"${total_expansion:,.0f} in expansion ARR unlocked" if total_expansion > 0 else "no expansion ARR activated"

    levers_active = []
    if levers.discount_ceiling is not None:
        levers_active.append(f"discount ceiling at {levers.discount_ceiling:.0%}")
    if levers.churn_intervention_threshold is not None:
        levers_active.append(f"churn intervention at {levers.churn_intervention_threshold:.0%}")
    if levers.expansion_activation_clusters:
        levers_active.append(f"{', '.join(levers.expansion_activation_clusters)} cluster outreach")

    levers_str = ", ".join(levers_active) if levers_active else "no active levers"

    return (
        f"Across {n_customers} customers over {levers.forecast_months} months, "
        f"this scenario projects a net MRR {gain_dir} of ${gain_abs:,.0f} "
        f"({levers_str}). "
        f"The key drivers are {churn_str} and {exp_str}."
    )


def _offline_response(warnings: List[str]) -> SimulatorResponse:
    """Returns a safe zero-state SimulatorResponse with OFFLINE status."""
    return SimulatorResponse(
        monthly_projections=[],
        total_projected_mrr_gain=0.0,
        total_churn_arr_saved=0.0,
        total_expansion_arr_added=0.0,
        net_arr_delta=0.0,
        segment_impacts=[],
        applied_levers=AppliedLevers(
            expansion_activation_clusters=[],
            forecast_months=9,
        ),
        scenario_narrative=(
            "Simulation unavailable — required data tables are not yet loaded. "
            "Upload customer contract snapshots and engineered KPI data to enable this feature."
        ),
        trajectory_mode="linear_fallback",
        data_availability=FeatureAvailability.OFFLINE,
        overall_confidence=ConfidenceLevel.LOW,
        customers_in_simulation=0,
        missing_columns=[],
        warnings=warnings,
    )
