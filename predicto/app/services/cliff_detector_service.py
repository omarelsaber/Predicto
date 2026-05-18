"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/services/cliff_detector_service.py                                     ║
║  Predicto V2 — Cascading Revenue Cliff Detector (Feature 04)               ║
║                                                                              ║
║  Reads exclusively from `predicto_cache_v2`.  No I/O, no external calls.   ║
║                                                                              ║
║  Core algorithm:                                                             ║
║    1. Attach a renewal month (known or estimated) to every customer.        ║
║    2. Pull the GRU / cold-start churn trajectory for each customer and      ║
║       extract the churn probability at their renewal month.                 ║
║    3. Aggregate per-month renewal windows → cliff_severity_score.           ║
║    4. Detect CLIFF_ALERT months (severity > 0.25 AND ARR floor > 5% MRR).  ║
║    5. Run ANOVA on KPIs to identify the compounding risk drivers.           ║
║    6. Return CliffDetectorResponse with a board-ready narrative.            ║
║                                                                              ║
║  Degradation contract:                                                       ║
║    OFFLINE  — engineered_df or snapshots_df absent.                         ║
║    PARTIAL  — renewal month absent (estimated); cold-start model active.    ║
║    ACTIVE   — all tables present, full GRU trajectory available.            ║
║                                                                              ║
║  Zero-crash guarantee: all numeric outputs default to 0.0.                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy import stats  # type: ignore[import]

from app.core.cache import predicto_cache_v2  # type: ignore[import]
from app.core.schema_resolver import resolve_canonical_df
from app.models.response_models import (
    CliffAlertLevel,
    CliffDetectorResponse,
    CliffDriverKPI,
    CliffMonthWindow,
    ConfidenceLevel,
    CustomerRenewalRecord,
    FeatureAvailability,
    RenewalSource,
)

log = logging.getLogger("predicto.v2.cliff_detector")

# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

# Churn probability above which a renewing customer is "high risk"
HIGH_RISK_THRESHOLD: float = 0.65

# Churn probability band for "medium risk"
MEDIUM_RISK_LOWER: float = 0.40
MEDIUM_RISK_UPPER: float = 0.65

# A month is CLIFF_ALERT if severity_score > this threshold AND ARR floor is met
CLIFF_SEVERITY_CUTOFF: float = 0.25

# Secondary cliff condition: high_risk_arr must exceed this fraction of portfolio MRR
CLIFF_MRR_FLOOR: float = 0.05

# Default contract tenure (months) used when first_seen is present but no renewal date
DEFAULT_CONTRACT_TENURE_MONTHS: int = 12

# GRU cold-start trajectory depth (months 4-9 are LOW_CONFIDENCE for coldstart)
COLDSTART_TRAJECTORY_DEPTH: int = 3

# Maximum customers returned in per-cliff drill-down
MAX_CLIFF_CUSTOMERS: int = 10

# KPI metadata: (column_name, human_label, healthy_benchmark)
KPI_METADATA: List[Tuple[str, str, float]] = [
    ("edi", "Engagement Decay Index",    0.10),
    ("sbs", "Support Burden Score",      0.10),
    ("fav", "Feature Adoption Velocity", 1.00),
    ("rer", "Revenue Efficiency Ratio",  2.00),
    ("orc", "Onboarding Risk Composite", 0.20),
    ("cqs", "Customer Quality Score",    0.70),
]


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def run_cliff_detection(
    forecast_months: int = 9,
) -> CliffDetectorResponse:
    """
    Main entry point for Feature 04.

    Parameters
    ----------
    forecast_months : int
        How many forward months to include in the cliff calendar (1–9).

    Returns
    -------
    CliffDetectorResponse
        Zero-crash; always returns a valid response object.
    """
    warnings: List[str] = []
    forecast_months = max(1, min(9, forecast_months))

    # ── Step 1: Validate cache ────────────────────────────────────────────────
    availability, trajectory_mode, warnings = _assess_cache_readiness(
        forecast_months, warnings
    )
    if availability == FeatureAvailability.OFFLINE:
        return _offline_response(warnings, forecast_months)

    # ── Step 2: Build per-customer renewal matrix ─────────────────────────────
    renewal_df, missing_columns, build_warnings = _build_renewal_matrix(forecast_months)
    warnings.extend(build_warnings)

    if renewal_df.empty:
        warnings.append(
            "Renewal matrix is empty — no customers with renewals in the forecast window."
        )
        return _offline_response(warnings, forecast_months)

    # ── Step 3: Compute portfolio MRR (needed for ARR-floor condition) ────────
    portfolio_mrr = _get_portfolio_mrr()

    # ── Step 4: Build monthly cliff windows ───────────────────────────────────
    cliff_calendar, top_customers_per_month = _build_cliff_calendar(
        renewal_df,
        portfolio_mrr,
        forecast_months,
        trajectory_mode,
    )

    # ── Step 5: Identify alert and elevated months ────────────────────────────
    cliff_alert_months = [w.month for w in cliff_calendar if w.alert_level == CliffAlertLevel.CLIFF_ALERT]
    elevated_months    = [w.month for w in cliff_calendar if w.alert_level == CliffAlertLevel.ELEVATED]

    # ── Step 6: Find peak cliff month ─────────────────────────────────────────
    peak_month_window = max(
        cliff_calendar, key=lambda w: w.cliff_severity_score, default=None
    )
    peak_cliff_month     = peak_month_window.month if peak_month_window else None
    peak_cliff_arr_risk  = peak_month_window.high_risk_arr if peak_month_window else 0.0

    # ── Step 7: ANOVA-based KPI driver detection for peak cliff ───────────────
    driver_kpis: List[CliffDriverKPI] = []
    if peak_cliff_month is not None:
        peak_customers = renewal_df[renewal_df["renewal_month"] == peak_cliff_month]
        driver_kpis = _identify_cliff_drivers(peak_customers, renewal_df)

    # ── Step 8: Per-customer drill-down for peak cliff month ──────────────────
    peak_cliff_customers: List[CustomerRenewalRecord] = []
    if peak_cliff_month is not None:
        peak_cliff_customers = top_customers_per_month.get(peak_cliff_month, [])

    # ── Step 9: Portfolio renewal metadata ───────────────────────────────────
    total_arr_at_risk = sum(w.high_risk_arr for w in cliff_calendar)
    total_with_renewals = int(renewal_df["customer_id"].nunique())
    est_fraction = float(
        (renewal_df["renewal_source"] == "ESTIMATED").sum() / max(len(renewal_df), 1)
    )

    # ── Step 10: Derive overall confidence ───────────────────────────────────
    overall_confidence = _derive_overall_confidence(cliff_calendar)

    # ── Step 11: Build narrative ──────────────────────────────────────────────
    narrative = _build_narrative(
        cliff_alert_months,
        peak_cliff_month,
        peak_cliff_arr_risk,
        total_arr_at_risk,
        driver_kpis,
        peak_cliff_customers[:3],
    )

    return CliffDetectorResponse(
        cliff_calendar=cliff_calendar,
        cliff_alert_months=cliff_alert_months,
        elevated_months=elevated_months,
        total_arr_at_risk=round(total_arr_at_risk, 2),
        peak_cliff_month=peak_cliff_month,
        peak_cliff_arr_at_risk=round(peak_cliff_arr_risk, 2),
        cliff_driver_kpis=driver_kpis,
        peak_cliff_customers=peak_cliff_customers[:MAX_CLIFF_CUSTOMERS],
        total_customers_with_renewals=total_with_renewals,
        estimated_renewal_fraction=round(est_fraction, 4),
        cliff_narrative=narrative,
        high_risk_threshold=HIGH_RISK_THRESHOLD,
        cliff_severity_cutoff=CLIFF_SEVERITY_CUTOFF,
        cliff_mrr_floor=CLIFF_MRR_FLOOR,
        forecast_horizon_months=forecast_months,
        trajectory_mode=trajectory_mode,
        data_availability=availability,
        overall_confidence=overall_confidence,
        missing_columns=missing_columns,
        warnings=warnings,
    )


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — CACHE READINESS
# ─────────────────────────────────────────────────────────────────────────────

def _assess_cache_readiness(
    forecast_months: int,
    warnings: List[str],
) -> Tuple[FeatureAvailability, str, List[str]]:
    """Mirrors the pattern in simulator_service for consistency."""
    cache = predicto_cache_v2

    if not cache.is_ready:
        warnings.append("Cache not ready.")
        return FeatureAvailability.OFFLINE, "linear_fallback", warnings

    if cache.engineered_df is None or cache.engineered_df.empty:
        warnings.append("engineered_df absent — cliff detection requires KPI features.")
        return FeatureAvailability.OFFLINE, "linear_fallback", warnings

    if cache.snapshots_df is None or cache.snapshots_df.empty:
        warnings.append("snapshots_df absent — MRR and renewal dates unavailable.")
        return FeatureAvailability.OFFLINE, "linear_fallback", warnings

    active_model = cache.active_model or "none"
    if active_model == "full":
        trajectory_mode = "gru_full"
        availability    = FeatureAvailability.ACTIVE
    elif active_model == "lite":
        trajectory_mode = "gru_coldstart"
        availability    = FeatureAvailability.PARTIAL
        if forecast_months > COLDSTART_TRAJECTORY_DEPTH:
            warnings.append(
                f"Cold-start model active — months {COLDSTART_TRAJECTORY_DEPTH + 1}–"
                f"{forecast_months} will be LOW_CONFIDENCE."
            )
    else:
        trajectory_mode = "linear_fallback"
        availability    = FeatureAvailability.PARTIAL
        warnings.append(
            "No trained model in cache — churn probability held flat across all months."
        )

    return availability, trajectory_mode, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — BUILD RENEWAL MATRIX
# ─────────────────────────────────────────────────────────────────────────────

def _build_renewal_matrix(
    forecast_months: int,
) -> Tuple[pd.DataFrame, List[str], List[str]]:
    """
    Constructs a per-customer DataFrame with columns:
        customer_id, customer_name, arr, mrr,
        renewal_month (int 1–forecast_months),
        renewal_source ('KNOWN' | 'ESTIMATED'),
        churn_probability (current scalar),
        churn_trajectory (list of 9 floats),
        churn_at_renewal (float — trajectory value at renewal_month),
        arr_at_risk (arr × churn_at_renewal),
        edi, sbs, fav, rer (KPI values from engineered_df)

    Only customers whose renewal_month falls within [1, forecast_months] are included.
    """
    cache           = predicto_cache_v2
    missing_columns: List[str] = []
    warnings:        List[str] = []

    eng_df  = cache.engineered_df.copy()
    snap_df = cache.snapshots_df.copy()

    # ── Normalise column names ────────────────────────────────────────────────
    eng_df.columns  = [c.lower() for c in eng_df.columns]
    snap_df.columns = [c.lower() for c in snap_df.columns]

    # ── Get the latest snapshot per customer ──────────────────────────────────
    if "snapshot_month" in snap_df.columns:
        latest_snap = (
            snap_df.sort_values("snapshot_month", ascending=False)
            .groupby("customer_id", as_index=False)
            .first()
        )
    else:
        latest_snap = snap_df.groupby("customer_id", as_index=False).first()

    # ── MRR from snapshots (or derived) ──────────────────────────────────────
    if "mrr" not in latest_snap.columns:
        if "arr" in latest_snap.columns:
            latest_snap["mrr"] = latest_snap["arr"] / 12.0
            warnings.append("mrr absent — approximated as arr / 12.")
        else:
            latest_snap["mrr"] = 0.0
            missing_columns.append("mrr")

    # ── Compute renewal month (offset from today) ─────────────────────────────
    latest_snap, renewal_warnings, renewal_missing = _attach_renewal_months(
        latest_snap, forecast_months
    )
    warnings.extend(renewal_warnings)
    missing_columns.extend(renewal_missing)

    # ── Merge with engineered KPIs ────────────────────────────────────────────
    kpi_cols   = ["customer_id"] + [c for c, _, _ in KPI_METADATA if c in eng_df.columns]
    churn_cols = ["customer_id", "churn_probability"]
    if "arr" in eng_df.columns:
        churn_cols.append("arr")
    if "cluster_label" in eng_df.columns:
        churn_cols.append("cluster_label")
    if "customer_name" in eng_df.columns or "name" in eng_df.columns:
        name_col = "customer_name" if "customer_name" in eng_df.columns else "name"
        churn_cols.append(name_col)

    merge_cols = list(set(kpi_cols + churn_cols))
    eng_subset = eng_df[[c for c in merge_cols if c in eng_df.columns]].copy()

    # Ensure numeric defaults on KPI columns
    for col, _, _ in KPI_METADATA:
        if col not in eng_subset.columns:
            eng_subset[col] = 0.0
            if col not in missing_columns:
                missing_columns.append(col)
        else:
            eng_subset[col] = pd.to_numeric(eng_subset[col], errors="coerce").fillna(0.0)

    if "churn_probability" not in eng_subset.columns:
        eng_subset["churn_probability"] = 0.0
        missing_columns.append("churn_probability")
    else:
        eng_subset["churn_probability"] = (
            pd.to_numeric(eng_subset["churn_probability"], errors="coerce")
            .fillna(0.0)
            .clip(0.0, 1.0)
        )

    # ── Join snapshot + KPIs ──────────────────────────────────────────────────
    renewal_df = latest_snap.merge(eng_subset, on="customer_id", how="left")

    # Resolve ARR collision: prefer engineered_df value
    if "arr_x" in renewal_df.columns and "arr_y" in renewal_df.columns:
        renewal_df["arr"] = renewal_df["arr_y"].fillna(renewal_df["arr_x"]).fillna(0.0)
        renewal_df.drop(columns=["arr_x", "arr_y"], inplace=True)
    elif "arr" not in renewal_df.columns:
        renewal_df["arr"] = renewal_df.get("mrr", pd.Series(0.0, index=renewal_df.index)) * 12.0

    # Fill customer_name safely
    if "customer_name" not in renewal_df.columns and "name" in renewal_df.columns:
        renewal_df["customer_name"] = renewal_df["name"]
    elif "customer_name" not in renewal_df.columns:
        renewal_df["customer_name"] = renewal_df["customer_id"].astype(str)

    # ── Filter to customers renewing within [1, forecast_months] ─────────────
    renewal_df = renewal_df[
        renewal_df["renewal_month"].between(1, forecast_months)
    ].copy()

    if renewal_df.empty:
        warnings.append(
            "No customers have renewal dates within the forecast window. "
            "Try uploading contract renewal dates or extending the horizon."
        )
        return renewal_df, list(set(missing_columns)), warnings

    # ── Attach churn trajectory ───────────────────────────────────────────────
    renewal_df = _attach_churn_trajectory_cliff(renewal_df)

    # ── Compute churn_at_renewal from trajectory ──────────────────────────────
    def _churn_at_renewal(row) -> float:
        traj  = row.get("churn_trajectory", [])
        month = int(row.get("renewal_month", 1))
        idx   = max(0, min(month - 1, len(traj) - 1)) if traj else 0
        return float(traj[idx]) if traj else float(row.get("churn_probability", 0.0))

    renewal_df["churn_at_renewal"] = renewal_df.apply(_churn_at_renewal, axis=1)
    renewal_df["arr_at_risk"] = (
        renewal_df["arr"].fillna(0.0) * renewal_df["churn_at_renewal"]
    ).clip(lower=0.0)

    return renewal_df, list(set(missing_columns)), warnings


def _attach_renewal_months(
    snap_df: pd.DataFrame,
    forecast_months: int,
) -> Tuple[pd.DataFrame, List[str], List[str]]:
    """
    Attempts to derive a renewal_month offset (1–N) for each customer.

    Priority:
      1. contract_renewal_month column (absolute month number)
         → converted to offset from latest snapshot_month
      2. contract_renewal_date / renewal_date (date column)
         → converted to month offset from today
      3. first_seen + DEFAULT_CONTRACT_TENURE_MONTHS heuristic
      4. Uniform random assignment across [1, 12] (last-resort fallback)
    """
    warnings:        List[str] = []
    missing_columns: List[str] = []

    snap_df = snap_df.copy()
    n       = len(snap_df)

    # ── Determine current reference month ────────────────────────────────────
    today_month = pd.Timestamp.now().normalize().to_period("M")

    # ── Option 1: contract_renewal_month as absolute month number ────────────
    if "contract_renewal_month" in snap_df.columns:
        snap_df["contract_renewal_month"] = pd.to_numeric(
            snap_df["contract_renewal_month"], errors="coerce"
        )
        # Treat as "months from now" if values are small (1-24), else treat as
        # an absolute month counter relative to the most recent snapshot
        latest_abs = snap_df["snapshot_month"].max() if "snapshot_month" in snap_df.columns else 0
        renewal_offset = (snap_df["contract_renewal_month"] - latest_abs).clip(lower=1)
        valid_mask = renewal_offset.between(1, 24)

        if valid_mask.mean() > 0.5:
            snap_df["renewal_month"]  = renewal_offset.round().astype("Int64")
            snap_df["renewal_source"] = "KNOWN"
            # Fill remaining with estimation
            snap_df.loc[~valid_mask, "renewal_source"] = "ESTIMATED"
            snap_df.loc[~valid_mask, "renewal_month"]  = _estimate_renewal_offsets(
                snap_df[~valid_mask], today_month
            )
            est_count = (~valid_mask).sum()
            if est_count > 0:
                warnings.append(
                    f"{est_count} customers have out-of-range renewal months — estimated."
                )
            return snap_df, warnings, missing_columns

    # ── Option 2: date-based renewal column ──────────────────────────────────
    for col in ("contract_renewal_date", "renewal_date", "contract_end_date"):
        if col in snap_df.columns:
            parsed = pd.to_datetime(snap_df[col], errors="coerce")
            valid  = parsed.notna()
            if valid.sum() > 0:
                # Compute month offset from now
                offsets = ((parsed.dt.to_period("M") - today_month)
                           .apply(lambda x: x.n if pd.notna(x) else np.nan))
                snap_df["renewal_month"] = offsets.clip(lower=1).round().astype("Int64")
                snap_df["renewal_source"] = np.where(valid, "KNOWN", "ESTIMATED")

                # Fill invalid rows with heuristic
                invalid_mask = ~valid | snap_df["renewal_month"].isna()
                if invalid_mask.any():
                    snap_df.loc[invalid_mask, "renewal_month"] = _estimate_renewal_offsets(
                        snap_df[invalid_mask], today_month
                    )
                    snap_df.loc[invalid_mask, "renewal_source"] = "ESTIMATED"
                return snap_df, warnings, missing_columns

    # ── Option 3: first_seen + tenure heuristic ───────────────────────────────
    missing_columns.append("contract_renewal_month")
    warnings.append(
        "contract_renewal_month / renewal_date absent — "
        "estimating renewal dates from first_seen + default tenure."
    )
    snap_df["renewal_month"] = _estimate_renewal_offsets(snap_df, today_month)
    snap_df["renewal_source"] = "ESTIMATED"
    return snap_df, warnings, missing_columns


def _estimate_renewal_offsets(
    df: pd.DataFrame,
    today_month: pd.Period,
) -> pd.Series:
    """
    Heuristic: renewal_month = (first_seen + DEFAULT_CONTRACT_TENURE_MONTHS) - now,
    falling back to random uniform [1, 12] if first_seen is absent.
    """
    if "first_seen" in df.columns or "contract_start_date" in df.columns:
        start_col = "first_seen" if "first_seen" in df.columns else "contract_start_date"
        parsed = pd.to_datetime(df[start_col], errors="coerce")
        offsets = (
            parsed.dt.to_period("M")
            .apply(lambda p: (
                (p + DEFAULT_CONTRACT_TENURE_MONTHS - today_month).n
                if pd.notna(p) else np.nan
            ))
        )
        valid = offsets.notna() & (offsets >= 1)
        result = offsets.copy()
        # For invalids (past or null), assume next renewal in 1-12 months
        if (~valid).any():
            rng = np.random.default_rng(seed=42)
            result.loc[~valid] = rng.integers(1, 13, size=(~valid).sum())
        return result.clip(lower=1).round().astype("Int64")

    # Last resort: uniform random assignment across [1, 12]
    rng    = np.random.default_rng(seed=42)
    return pd.Series(
        rng.integers(1, 13, size=len(df)),
        index=df.index,
        dtype="Int64",
    )


def _attach_churn_trajectory_cliff(snap_df: pd.DataFrame) -> pd.DataFrame:
    """
    Attaches 9-month churn trajectories from the cached router (or linear fallback).
    Mirrors the logic in simulator_service._attach_churn_trajectory.
    """
    cache       = predicto_cache_v2
    trajectories: Dict[str, List[float]] = {}

    router = cache.router
    if router is not None and hasattr(router, "predict_trajectories"):
        try:
            raw = router.predict_trajectories(snap_df)
            if isinstance(raw, dict):
                for cid, traj in raw.items():
                    arr = np.asarray(traj, dtype=float).clip(0.0, 1.0)
                    if len(arr) < 9:
                        arr = np.pad(arr, (0, 9 - len(arr)), mode="edge")
                    trajectories[str(cid)] = arr[:9].tolist()
        except Exception as exc:
            log.warning("router.predict_trajectories() failed: %s", exc)

    if not trajectories:
        for col_name in ("churn_trajectory", "churn_risk_scores"):
            if col_name in snap_df.columns:
                for _, row in snap_df.iterrows():
                    cid = str(row.get("customer_id", ""))
                    raw = row[col_name]
                    if isinstance(raw, (list, np.ndarray)) and len(raw) >= 1:
                        arr = np.asarray(raw, dtype=float).clip(0.0, 1.0)
                        if len(arr) < 9:
                            arr = np.pad(arr, (0, 9 - len(arr)), mode="edge")
                        trajectories[cid] = arr[:9].tolist()
                if trajectories:
                    break

    if not trajectories:
        # Linear extrapolation from churn_probability + EDI
        for _, row in snap_df.iterrows():
            cid   = str(row.get("customer_id", ""))
            p0    = float(row.get("churn_probability", 0.0))
            edi   = float(row.get("edi", 0.0))
            slope = edi * 0.03
            traj  = [float(np.clip(p0 + slope * m, 0.0, 1.0)) for m in range(1, 10)]
            trajectories[cid] = traj

    snap_df["churn_trajectory"] = snap_df["customer_id"].apply(
        lambda cid: trajectories.get(str(cid), [0.0] * 9)
    )
    return snap_df


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — PORTFOLIO MRR
# ─────────────────────────────────────────────────────────────────────────────

def _get_portfolio_mrr() -> float:
    """Returns the current portfolio MRR from the latest snapshots."""
    cache = predicto_cache_v2
    snap_df = cache.snapshots_df

    if snap_df is None or snap_df.empty:
        return 0.0

    df = snap_df.copy()
    df.columns = [c.lower() for c in df.columns]

    # Sum of latest MRR per customer
    if "snapshot_month" in df.columns and "mrr" in df.columns:
        latest = (
            df.sort_values("snapshot_month", ascending=False)
            .groupby("customer_id")["mrr"]
            .first()
        )
        return float(latest.fillna(0.0).sum())

    if "mrr" in df.columns:
        return float(df.groupby("customer_id")["mrr"].mean().sum())

    if "arr" in df.columns:
        return float(df.groupby("customer_id")["arr"].mean().sum() / 12.0)

    return 0.0


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — BUILD MONTHLY CLIFF CALENDAR
# ─────────────────────────────────────────────────────────────────────────────

def _build_cliff_calendar(
    renewal_df:      pd.DataFrame,
    portfolio_mrr:   float,
    forecast_months: int,
    trajectory_mode: str,
) -> Tuple[List[CliffMonthWindow], Dict[int, List[CustomerRenewalRecord]]]:
    """
    Iterates over months 1–forecast_months and builds a CliffMonthWindow for each.

    Also returns a per-month dict of CustomerRenewalRecord lists for drill-down.
    """
    cliff_calendar:          List[CliffMonthWindow]              = []
    top_customers_per_month: Dict[int, List[CustomerRenewalRecord]] = {}

    for m in range(1, forecast_months + 1):
        month_df = renewal_df[renewal_df["renewal_month"] == m].copy()

        if month_df.empty:
            # Stub window — no renewals this month
            cliff_calendar.append(
                CliffMonthWindow(
                    month=m,
                    total_renewing_arr=0.0,
                    high_risk_arr=0.0,
                    medium_risk_arr=0.0,
                    low_risk_arr=0.0,
                    cliff_severity_score=0.0,
                    renewing_customer_count=0,
                    high_risk_customer_count=0,
                    alert_level=CliffAlertLevel.NORMAL,
                    confidence=_month_confidence(m, trajectory_mode),
                    renewal_source=RenewalSource.ESTIMATED,
                    top_risk_customer_ids=[],
                )
            )
            top_customers_per_month[m] = []
            continue

        # ── Aggregate ARR buckets ─────────────────────────────────────────────
        arr         = month_df["arr"].fillna(0.0)
        churn_proba = month_df["churn_at_renewal"].clip(0.0, 1.0)

        total_arr   = float(arr.sum())
        high_mask   = churn_proba >= HIGH_RISK_THRESHOLD
        med_mask    = churn_proba.between(MEDIUM_RISK_LOWER, HIGH_RISK_THRESHOLD, inclusive="left")
        low_mask    = churn_proba < MEDIUM_RISK_LOWER

        high_arr    = float(arr[high_mask].sum())
        med_arr     = float(arr[med_mask].sum())
        low_arr     = float(arr[low_mask].sum())

        severity    = float(high_arr / total_arr) if total_arr > 0 else 0.0
        high_count  = int(high_mask.sum())

        # ── Determine alert level ─────────────────────────────────────────────
        alert_level = _classify_alert(
            severity_score=severity,
            high_risk_arr=high_arr,
            portfolio_mrr=portfolio_mrr,
        )

        # ── Renewal source: KNOWN if majority of month's customers have known dates ─
        known_frac      = (month_df["renewal_source"] == "KNOWN").mean()
        renewal_source  = RenewalSource.KNOWN if known_frac >= 0.5 else RenewalSource.ESTIMATED

        # ── Top risk customer IDs (sorted by arr_at_risk) ─────────────────────
        top_ids = (
            month_df.sort_values("arr_at_risk", ascending=False)
            .head(5)["customer_id"]
            .astype(str)
            .tolist()
        )

        cliff_calendar.append(
            CliffMonthWindow(
                month=m,
                total_renewing_arr=round(total_arr, 2),
                high_risk_arr=round(high_arr, 2),
                medium_risk_arr=round(med_arr, 2),
                low_risk_arr=round(low_arr, 2),
                cliff_severity_score=round(severity, 4),
                renewing_customer_count=len(month_df),
                high_risk_customer_count=high_count,
                alert_level=alert_level,
                confidence=_month_confidence(m, trajectory_mode),
                renewal_source=renewal_source,
                top_risk_customer_ids=top_ids,
            )
        )

        # ── Per-customer records for drill-down ───────────────────────────────
        top_customers_per_month[m] = _build_customer_records(
            month_df.sort_values("arr_at_risk", ascending=False).head(MAX_CLIFF_CUSTOMERS),
            m,
        )

    return cliff_calendar, top_customers_per_month


def _classify_alert(
    severity_score: float,
    high_risk_arr:  float,
    portfolio_mrr:  float,
) -> CliffAlertLevel:
    """
    Classifies a cliff window's alert level.

    CLIFF_ALERT: severity > 25% AND high_risk_arr > 5% of portfolio MRR (annualised)
    ELEVATED:    severity between 10% and 25%
    NORMAL:      severity < 10%
    """
    portfolio_arr = portfolio_mrr * 12.0  # annualise for comparison with ARR
    mrr_floor_met = (
        high_risk_arr > CLIFF_MRR_FLOOR * portfolio_arr
        if portfolio_arr > 0
        else True  # if we have no MRR baseline, rely on severity alone
    )

    if severity_score >= CLIFF_SEVERITY_CUTOFF and mrr_floor_met:
        return CliffAlertLevel.CLIFF_ALERT
    if severity_score >= 0.10:
        return CliffAlertLevel.ELEVATED
    return CliffAlertLevel.NORMAL


def _build_customer_records(
    df: pd.DataFrame,
    renewal_month: int,
) -> List[CustomerRenewalRecord]:
    """Converts a subset of renewal_df rows into CustomerRenewalRecord objects."""
    records = []
    for _, row in df.iterrows():
        # Identify which KPIs are most deviated from benchmark
        driver_kpis = _identify_driver_kpis_for_customer(row)

        records.append(
            CustomerRenewalRecord(
                customer_id=str(row.get("customer_id", "")),
                customer_name=str(row.get("customer_name", row.get("customer_id", "Unknown"))),
                renewal_month=renewal_month,
                arr=round(float(row.get("arr", 0.0)), 2),
                churn_probability_at_renewal=round(
                    float(row.get("churn_at_renewal", 0.0)), 4
                ),
                arr_at_risk=round(float(row.get("arr_at_risk", 0.0)), 2),
                edi_score=round(float(row.get("edi", 0.0)), 4),
                sbs_score=round(float(row.get("sbs", 0.0)), 4),
                fav_score=round(float(row.get("fav", 0.0)), 4),
                renewal_source=(
                    RenewalSource.KNOWN
                    if row.get("renewal_source") == "KNOWN"
                    else RenewalSource.ESTIMATED
                ),
                driver_kpis=driver_kpis,
            )
        )
    return records


def _identify_driver_kpis_for_customer(row: pd.Series) -> List[str]:
    """
    Returns the top 1-3 KPI names that deviate most from their healthy benchmarks
    for a single customer.
    """
    deviations = []
    for col, label, benchmark in KPI_METADATA:
        val = float(row.get(col, 0.0))
        if benchmark == 0.0:
            continue
        deviation = abs(val - benchmark) / benchmark
        deviations.append((col.upper(), deviation))

    deviations.sort(key=lambda x: x[1], reverse=True)
    return [kpi for kpi, _ in deviations[:3] if _ > 0.1]  # only surface meaningful deviations


# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — KPI CLIFF DRIVER DETECTION (ANOVA)
# ─────────────────────────────────────────────────────────────────────────────

def _identify_cliff_drivers(
    peak_month_df: pd.DataFrame,
    all_renewal_df: pd.DataFrame,
) -> List[CliffDriverKPI]:
    """
    Uses a one-way ANOVA (scipy.stats.f_oneway) to identify which KPIs best
    discriminate between high-risk and low-risk customers in the peak cliff month.

    Groups:
        high_risk: churn_at_renewal >= HIGH_RISK_THRESHOLD
        low_risk:  churn_at_renewal <  HIGH_RISK_THRESHOLD

    Returns up to 3 CliffDriverKPI records sorted by F-statistic (descending).
    Requires at least 3 customers in each group to produce a valid F-statistic.
    """
    drivers: List[CliffDriverKPI] = []

    high_mask = peak_month_df["churn_at_renewal"] >= HIGH_RISK_THRESHOLD
    low_mask  = ~high_mask

    high_group = peak_month_df[high_mask]
    low_group  = peak_month_df[low_mask]

    if len(high_group) < 3 or len(low_group) < 3:
        # Not enough data for a meaningful ANOVA
        return []

    # Portfolio-wide KPI distribution (for z-score computation)
    for col, label, benchmark in KPI_METADATA:
        if col not in peak_month_df.columns:
            continue

        high_vals  = high_group[col].dropna().values.astype(float)
        low_vals   = low_group[col].dropna().values.astype(float)

        if len(high_vals) < 2 or len(low_vals) < 2:
            continue

        try:
            f_stat, p_value = stats.f_oneway(high_vals, low_vals)
        except Exception:
            continue

        if np.isnan(f_stat) or np.isinf(f_stat):
            continue

        # Z-score: how far is the high-risk mean from the portfolio mean?
        portfolio_col = all_renewal_df[col].dropna().values.astype(float)
        portfolio_mean = float(portfolio_col.mean()) if len(portfolio_col) > 0 else 0.0
        portfolio_std  = float(portfolio_col.std())  if len(portfolio_col) > 1 else 1.0
        if portfolio_std == 0.0:
            portfolio_std = 1.0

        mean_at_risk = float(high_vals.mean())
        z_score      = (mean_at_risk - portfolio_mean) / portfolio_std

        drivers.append(
            CliffDriverKPI(
                kpi_name=col.upper(),
                kpi_label=label,
                mean_value_at_risk=round(mean_at_risk, 4),
                healthy_benchmark=benchmark,
                deviation_z_score=round(float(z_score), 3),
                f_statistic=round(float(f_stat), 3),
            )
        )

    # Sort by F-statistic descending — strongest discriminators first
    drivers.sort(key=lambda d: d.f_statistic, reverse=True)
    return drivers[:3]


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _month_confidence(
    month: int,
    trajectory_mode: str,
) -> ConfidenceLevel:
    if trajectory_mode == "gru_full":
        return ConfidenceLevel.HIGH
    if trajectory_mode == "gru_coldstart":
        return ConfidenceLevel.MEDIUM if month <= COLDSTART_TRAJECTORY_DEPTH else ConfidenceLevel.LOW
    return ConfidenceLevel.MEDIUM if month <= 3 else ConfidenceLevel.LOW


def _derive_overall_confidence(
    cliff_calendar: List[CliffMonthWindow],
) -> ConfidenceLevel:
    """Returns the minimum confidence level across the calendar."""
    if not cliff_calendar:
        return ConfidenceLevel.LOW
    levels = {ConfidenceLevel.HIGH: 2, ConfidenceLevel.MEDIUM: 1, ConfidenceLevel.LOW: 0}
    return min(cliff_calendar, key=lambda w: levels[w.confidence]).confidence


def _build_narrative(
    cliff_alert_months:      List[int],
    peak_cliff_month:        Optional[int],
    peak_cliff_arr_risk:     float,
    total_arr_at_risk:       float,
    driver_kpis:             List[CliffDriverKPI],
    top_customers:           List[CustomerRenewalRecord],
) -> str:
    """
    Deterministic 3-sentence board-ready narrative.
    Invoked as a fallback when Llama-3.3 is unavailable.
    """
    if peak_cliff_month is None or total_arr_at_risk == 0.0:
        return (
            "No revenue cliff events detected within the forecast horizon. "
            "Renewal risk is distributed across months with no dangerous concentration. "
            "Continue monitoring high-risk customers through the Churn Early Warning module."
        )

    # Sentence 1: cliff location + ARR magnitude
    cliff_months_str = (
        f"Month {cliff_alert_months[0]}"
        if len(cliff_alert_months) == 1
        else f"Months {', '.join(str(m) for m in cliff_alert_months)}"
    )
    s1 = (
        f"{cliff_months_str} represent a revenue cliff event with "
        f"${peak_cliff_arr_risk:,.0f} in high-risk ARR concentrated in a single renewal window."
    )

    # Sentence 2: KPI drivers
    if driver_kpis:
        kpi_names = " and ".join(d.kpi_label for d in driver_kpis[:2])
        s2 = (
            f"The primary compounding risk drivers are {kpi_names}, "
            f"which show statistically significant divergence between at-risk and healthy "
            f"customers in this window."
        )
    else:
        s2 = (
            f"Across the full {total_arr_at_risk:,.0f} in at-risk ARR, "
            f"engagement and adoption signals are the leading indicators of concentration risk."
        )

    # Sentence 3: recommended action
    if top_customers:
        names = ", ".join(
            c.customer_name for c in top_customers[:2]
            if c.customer_name not in ("Unknown", c.customer_id)
        ) or "the top at-risk accounts"
        s3 = (
            f"Immediate CSM intervention on {names} is recommended "
            f"to reduce exposure before the renewal window opens."
        )
    else:
        s3 = (
            "Proactive CSM outreach on all CRITICAL-tier accounts before "
            "the renewal window is the highest-leverage intervention available."
        )

    return f"{s1} {s2} {s3}"


def _offline_response(
    warnings: List[str],
    forecast_months: int,
) -> CliffDetectorResponse:
    """Returns a safe zero-state CliffDetectorResponse with OFFLINE status."""
    # Return stub calendar with empty windows for each month
    stub_calendar = [
        CliffMonthWindow(
            month=m,
            total_renewing_arr=0.0,
            high_risk_arr=0.0,
            medium_risk_arr=0.0,
            low_risk_arr=0.0,
            cliff_severity_score=0.0,
            renewing_customer_count=0,
            high_risk_customer_count=0,
            alert_level=CliffAlertLevel.NORMAL,
            confidence=ConfidenceLevel.LOW,
            renewal_source=RenewalSource.ESTIMATED,
            top_risk_customer_ids=[],
        )
        for m in range(1, forecast_months + 1)
    ]
    return CliffDetectorResponse(
        cliff_calendar=stub_calendar,
        cliff_alert_months=[],
        elevated_months=[],
        total_arr_at_risk=0.0,
        peak_cliff_month=None,
        peak_cliff_arr_at_risk=0.0,
        cliff_driver_kpis=[],
        peak_cliff_customers=[],
        total_customers_with_renewals=0,
        estimated_renewal_fraction=0.0,
        cliff_narrative=(
            "Cliff detection unavailable — required data tables are not yet loaded. "
            "Upload customer contract snapshots and engineered KPI data to enable this feature."
        ),
        high_risk_threshold=HIGH_RISK_THRESHOLD,
        cliff_severity_cutoff=CLIFF_SEVERITY_CUTOFF,
        cliff_mrr_floor=CLIFF_MRR_FLOOR,
        forecast_horizon_months=forecast_months,
        trajectory_mode="linear_fallback",
        data_availability=FeatureAvailability.OFFLINE,
        overall_confidence=ConfidenceLevel.LOW,
        missing_columns=[],
        warnings=warnings,
    )
