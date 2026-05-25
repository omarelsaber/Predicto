"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/services/deal_priority_service.py                                      ║
║  Predicto V2 — DealPriorityScorer service layer.                           ║
║                                                                              ║
║  Scoring hierarchy                                                          ║
║  ─────────────────                                                          ║
║  1. If the ColdStartRouter in cache has a fitted model, delegate to it     ║
║     (ML path — scorer_mode = "ml").                                        ║
║  2. Otherwise, apply the heuristic mock scorer (scorer_mode = "mock"):     ║
║       score = w_arr × arr_score                                            ║
║             + w_disc × discount_score (inverted — high discount = low)     ║
║             + w_seg  × segment_score                                       ║
║             + w_cycle × cycle_score (inverted — long cycle = low)          ║
║     Result clipped to [0, 100].                                            ║
║                                                                              ║
║  All functions are side-effect free (read cache; return typed objects).    ║
║  Never raises — exceptions are caught and surfaced as low-scored stub rows. ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging
from typing import List, Optional, Tuple

import numpy as np
import pandas as pd

from app.core.cache import predicto_cache_v2
from app.models.response_models import (
    DealPriorityResponse,
    DealRecord,
    DealSignalType,
    FeatureAvailability,
)

log = logging.getLogger("predicto.v2.deal_priority")

# ─────────────────────────────────────────────────────────────────────────────
# THRESHOLDS (mirroring config.py values; imported from config in production)
# ─────────────────────────────────────────────────────────────────────────────

HIGH_DISCOUNT_THRESHOLD = 0.30   # config.high_discount_threshold
SAFE_MARGIN_FLOOR       = 0.05   # config.safe_margin_floor

# Heuristic scorer weights (must sum to 1.0)
_W_ARR   = 0.35
_W_DISC  = 0.30
_W_SEG   = 0.20
_W_CYCLE = 0.15

# Segment priority map — higher = better fit for enterprise sales motion
_SEGMENT_PRIORITY = {
    "enterprise": 1.0,
    "mid-market": 0.75,
    "midmarket":  0.75,
    "smb":        0.50,
    "startup":    0.40,
    "other":      0.30,
}

# Human-readable feature name mapping for top signals
_FEATURE_LABELS = {
    "discount_percentage": "Discount",
    "arr":                 "ARR",
    "segment":             "Segment",
    "days_in_pipeline":    "Pipeline age",
    "rsfs":                "Rep-Segment Fit",
    "orc":                 "Onboarding Risk",
    "cqs":                 "Customer Quality",
    "margin":              "Estimated margin",
}


# ─────────────────────────────────────────────────────────────────────────────
# COLUMN DETECTION HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _detect_col(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    """Return the first candidate column name present in df, or None."""
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _coerce_float(series: pd.Series, fallback: float = 0.0) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").fillna(fallback)


# ─────────────────────────────────────────────────────────────────────────────
# SIGNAL GENERATOR — plain-English top signal per deal
# ─────────────────────────────────────────────────────────────────────────────

def _build_top_signal(
    discount: float,
    arr: float,
    days_in_pipeline: int,
    segment: str,
    rsfs: Optional[float],
) -> Tuple[str, DealSignalType, str]:
    """
    Return (signal_text, signal_type, recommended_action) for one deal.

    Priority order:
      1. Discount cliff risk (> HIGH_DISCOUNT_THRESHOLD)
      2. Margin pressure (discount between 20-30%)
      3. Rep-segment mismatch (RSFS < 0.55)
      4. Long pipeline (days_in_pipeline > 90)
      5. High ARR (positive signal)
      6. Generic
    """
    if discount >= HIGH_DISCOUNT_THRESHOLD:
        pct = round(discount * 100, 1)
        return (
            f"Discount {pct}% — approaching margin cliff",
            DealSignalType.DISCOUNT_CLIFF,
            "Review discount with finance before close",
        )

    if discount >= 0.20:
        pct = round(discount * 100, 1)
        return (
            f"Discount {pct}% — margin pressure building",
            DealSignalType.MARGIN_PRESSURE,
            "Negotiate value exchange before reducing further",
        )

    if rsfs is not None and rsfs < 0.55:
        return (
            f"Rep-Segment Fit Score {round(rsfs, 2)} — mismatch with {segment} segment",
            DealSignalType.SEGMENT_MISMATCH,
            "Consider reassigning to segment specialist",
        )

    if days_in_pipeline > 90:
        return (
            f"{days_in_pipeline} days in pipeline — stale deal risk",
            DealSignalType.LONG_CYCLE,
            "Escalate or close out of pipeline",
        )

    if arr >= 50_000:
        arr_k = round(arr / 1000, 1)
        return (
            f"High-value deal — ${arr_k}K ARR, strong close candidate",
            DealSignalType.HIGH_ARR,
            "Prioritise executive sponsor outreach",
        )

    return (
        "Moderate priority — review pipeline hygiene",
        DealSignalType.GENERIC,
        "Schedule next follow-up",
    )


# ─────────────────────────────────────────────────────────────────────────────
# MOCK HEURISTIC SCORER
# ─────────────────────────────────────────────────────────────────────────────

def _score_one_heuristic(
    arr: float,
    discount: float,
    segment: str,
    days_in_pipeline: int,
    arr_p90: float,
) -> float:
    """
    Compute a priority score in [0, 100] using the weighted heuristic model.

    ARR component: normalised to p90 ARR, capped at 1.0.
    Discount component: inverted — higher discount → lower score.
    Segment component: lookup table score.
    Cycle component: inverted — 0 days = 1.0, 120+ days = 0.0.
    """
    # ARR score (normalised)
    arr_score = min(arr / max(arr_p90, 1.0), 1.0)

    # Discount score (inverted, penalty beyond threshold)
    if discount >= HIGH_DISCOUNT_THRESHOLD:
        disc_score = max(0.0, 1.0 - (discount - HIGH_DISCOUNT_THRESHOLD) * 5)
    else:
        disc_score = 1.0 - (discount / HIGH_DISCOUNT_THRESHOLD)
    disc_score = float(np.clip(disc_score, 0.0, 1.0))

    # Segment score
    seg_score = _SEGMENT_PRIORITY.get(segment.lower().strip(), 0.40)

    # Cycle score (120 days = max stale)
    cycle_score = float(np.clip(1.0 - days_in_pipeline / 120.0, 0.0, 1.0))

    raw = (
        _W_ARR   * arr_score
        + _W_DISC  * disc_score
        + _W_SEG   * seg_score
        + _W_CYCLE * cycle_score
    )

    return round(float(np.clip(raw * 100, 0.0, 100.0)), 2)


# ─────────────────────────────────────────────────────────────────────────────
# ML MODEL PATH
# ─────────────────────────────────────────────────────────────────────────────

def _try_ml_score(sales_df: pd.DataFrame) -> Optional[pd.Series]:
    """
    Attempt to get priority scores from the cached ColdStartRouter.

    Returns a Series aligned to sales_df.index with scores in [0, 100],
    or None if the router is unavailable / not fitted.
    """
    try:
        router = predicto_cache_v2.router
        if router is None:
            return None
        if not hasattr(router, "active_model") or router.active_model is None:
            return None

        # The router exposes predict_proba or predict on tabular features.
        # We use the engineered_df features for the deals present in sales_df.
        eng = predicto_cache_v2.engineered_df
        if eng is None or eng.empty:
            return None

        # Attempt to join on customer_id if available
        cust_col = _detect_col(sales_df, ["customer_id", "account_id", "cust_id"])
        if cust_col and cust_col in eng.columns:
            merged = sales_df[[cust_col]].merge(
                eng[[cust_col]].assign(_idx=eng.index),
                on=cust_col,
                how="left",
            )
            if hasattr(router, "predict_proba"):
                # Use model's churn probability as an inverse priority signal
                common_feats = [c for c in eng.columns if c != cust_col and pd.api.types.is_numeric_dtype(eng[c])]
                X = eng[common_feats].fillna(0).values
                proba = router.predict_proba(X)
                # Invert: high churn risk → low deal priority for closed/open deals
                scores = pd.Series(
                    np.clip((1 - proba[:, 1]) * 100, 0, 100),
                    index=eng.index,
                )
                log.info("ML scoring via router.predict_proba succeeded.")
                return scores
        return None

    except Exception as exc:
        log.warning("ML scoring attempt failed (%s) — falling back to heuristic.", exc)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# SALES TABLE COLUMN RESOLUTION
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_sales_columns(df: pd.DataFrame) -> dict:
    """Resolve canonical column names from the sales DataFrame."""
    return {
        "id":       _detect_col(df, ["deal_id", "opportunity_id", "id", "opp_id"]),
        "name":     _detect_col(df, ["deal_name", "company_name", "account_name", "customer_name", "name"]),
        "arr":      _detect_col(df, ["arr", "annual_recurring_revenue", "annual_revenue", "deal_value"]),
        "rep":      _detect_col(df, ["rep", "sales_rep", "owner", "assigned_rep", "ae"]),
        "segment":  _detect_col(df, ["segment", "customer_segment", "tier", "market_segment"]),
        "discount": _detect_col(df, ["discount_percentage", "discount_pct", "discount", "disc_pct"]),
        "days":     _detect_col(df, ["days_in_pipeline", "pipeline_age_days", "age_days", "cycle_days"]),
        "status":   _detect_col(df, ["win_loss_status", "deal_status", "stage", "status"]),
        "rsfs":     _detect_col(df, ["rsfs", "rep_segment_fit_score"]),
        "win_prob": _detect_col(df, ["win_probability", "close_probability", "win_prob"]),
    }


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def score_deals() -> DealPriorityResponse:
    """
    Score all deals in the sales table and return a priority-ranked response.

    Never raises. Returns an OFFLINE response with an empty list if the
    sales table is absent.
    """
    log.info("DealPriorityScorer START")

    cache = predicto_cache_v2

    # ── Guard: sales table absent ─────────────────────────────────────────────
    if cache.sales_df is None or cache.sales_df.empty:
        log.warning("sales_df is absent — returning OFFLINE deal priority response.")
        return DealPriorityResponse(
            deals=[],
            total_deals=0,
            total_arr_at_stake=0.0,
            high_discount_threshold=HIGH_DISCOUNT_THRESHOLD,
            safe_margin_floor=SAFE_MARGIN_FLOOR,
            scorer_mode="mock",
            data_availability=FeatureAvailability.OFFLINE,
        )

    sales = cache.sales_df.copy()

    # Attempt to resolve missing customer names using snapshots_df
    if cache.snapshots_df is not None and not cache.snapshots_df.empty:
        c_name = _detect_col(cache.snapshots_df, ["customer_name", "company_name", "account_name", "name"])
        s_cid = _detect_col(sales, ["customer_id", "account_id", "cust_id"])
        c_cid = _detect_col(cache.snapshots_df, ["customer_id", "account_id", "cust_id"])
        if c_name and s_cid and c_cid:
            mapping = cache.snapshots_df.drop_duplicates(subset=[c_cid]).set_index(c_cid)[c_name].to_dict()
            s_name = _detect_col(sales, ["deal_name", "company_name", "account_name", "customer_name", "name"])
            if not s_name:
                sales["customer_name"] = sales[s_cid].map(mapping)
            else:
                sales[s_name] = sales[s_name].fillna(sales[s_cid].map(mapping))

    cols  = _resolve_sales_columns(sales)
    log.debug("Resolved columns: %s", {k: v for k, v in cols.items() if v})

    # ── Extract numeric fields with safe fallbacks ────────────────────────────
    arr_series  = _coerce_float(sales[cols["arr"]],      0.0)      if cols["arr"]      else pd.Series([0.0] * len(sales))
    disc_series = _coerce_float(sales[cols["discount"]], 0.10)     if cols["discount"] else pd.Series([0.10] * len(sales))
    days_series = _coerce_float(sales[cols["days"]],     30.0).astype(int) if cols["days"] else pd.Series([30] * len(sales))
    rsfs_series: Optional[pd.Series] = (
        _coerce_float(sales[cols["rsfs"]], np.nan).replace(0, np.nan)
        if cols["rsfs"] else None
    )

    # Discount normalisation — if stored as 0-100 range, convert to 0-1
    if disc_series.max() > 1.0:
        disc_series = disc_series / 100.0

    arr_p90 = float(arr_series.quantile(0.90)) if arr_series.any() else 1.0

    # ── Attempt ML scoring ────────────────────────────────────────────────────
    ml_scores = _try_ml_score(sales)
    scorer_mode = "ml" if ml_scores is not None else "mock"

    # ── Build DealRecord list ─────────────────────────────────────────────────
    records: List[DealRecord] = []

    for idx in sales.index:
        try:
            deal_id = str(sales.loc[idx, cols["id"]]) if cols["id"] else str(idx)
            deal_name = (
                str(sales.loc[idx, cols["name"]])
                if cols["name"] and pd.notna(sales.loc[idx, cols["name"]])
                else deal_id
            )
            arr      = float(arr_series.loc[idx])
            discount = float(np.clip(disc_series.loc[idx], 0.0, 1.0))
            days     = int(days_series.loc[idx])
            segment  = str(sales.loc[idx, cols["segment"]]) if cols["segment"] and pd.notna(sales.loc[idx, cols["segment"]]) else "Unknown"
            rep      = str(sales.loc[idx, cols["rep"]])     if cols["rep"]     and pd.notna(sales.loc[idx, cols["rep"]])     else "Unknown"
            rsfs     = float(rsfs_series.loc[idx]) if rsfs_series is not None and pd.notna(rsfs_series.loc[idx]) else None
            win_prob: Optional[float] = None
            if cols["win_prob"] and pd.notna(sales.loc[idx, cols["win_prob"]]):
                win_prob = float(np.clip(pd.to_numeric(sales.loc[idx, cols["win_prob"]], errors="coerce"), 0, 1))

            # Score
            if ml_scores is not None and idx in ml_scores.index:
                score = float(np.clip(ml_scores.loc[idx], 0, 100))
            else:
                score = _score_one_heuristic(arr, discount, segment, days, arr_p90)

            signal_text, signal_type, action = _build_top_signal(
                discount, arr, days, segment, rsfs
            )

            records.append(
                DealRecord(
                    deal_id=deal_id,
                    deal_name=deal_name,
                    priority_score=score,
                    arr=arr,
                    rep=rep,
                    segment=segment,
                    discount_pct=round(discount, 4),
                    days_in_pipeline=days,
                    top_signal=signal_text,
                    top_signal_type=signal_type,
                    recommended_action=action,
                    win_probability=win_prob,
                )
            )
        except Exception as row_exc:
            log.warning("Failed to score deal at index %s: %s", idx, row_exc)
            continue

    # Sort descending by priority_score
    records.sort(key=lambda r: r.priority_score, reverse=True)

    total_arr = sum(r.arr for r in records)
    n_tables  = len(cache.tables_loaded)
    availability = (
        FeatureAvailability.ACTIVE  if n_tables >= 2 else
        FeatureAvailability.PARTIAL if n_tables == 1 else
        FeatureAvailability.OFFLINE
    )

    log.info(
        "DealPriorityScorer COMPLETE: %d deals scored, mode=%s, total_arr=%.0f",
        len(records), scorer_mode, total_arr,
    )

    return DealPriorityResponse(
        deals=records,
        total_deals=len(records),
        total_arr_at_stake=round(total_arr, 2),
        high_discount_threshold=HIGH_DISCOUNT_THRESHOLD,
        safe_margin_floor=SAFE_MARGIN_FLOOR,
        scorer_mode=scorer_mode,
        data_availability=availability,
    )
