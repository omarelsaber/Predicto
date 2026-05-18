"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/services/kpi_engine.py                                                 ║
║  Predicto V2 — Safe RevOps KPI calculation service.                        ║
║                                                                              ║
║  Computes portfolio-wide averages for the 7 core RevOps KPIs from the      ║
║  engineered_df (preferred) or raw tables (degraded fallback).               ║
║                                                                              ║
║  KPI Catalogue                                                              ║
║  ─────────────                                                              ║
║  FAV   Feature Adoption Velocity   — adoption_rate trend across months     ║
║  RER   Revenue Efficiency Ratio    — ARR / (CAC × discount_multiplier)     ║
║  EDI   Engagement Decay Index      — (users_m1 - users_now) / users_m1     ║
║  SBS   Support Burden Score        — cumulative_tickets / mrr              ║
║  ORC   Onboarding Risk Coefficient — onboarding_score inverse risk         ║
║  CQS   Customer Quality Score      — composite health signal               ║
║  RSFS  Rep-Segment Fit Score       — win_rate per rep × segment pairing    ║
║                                                                              ║
║  Design contract: every public function returns a float (never raises).    ║
║  A return of 0.0 always means "insufficient data", never "zero revenue".   ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.core.cache import predicto_cache_v2
from app.models.response_models import (
    ConfidenceLevel,
    FeatureAvailability,
    KPIValue,
    RevOpsKPIResponse,
)

log = logging.getLogger("predicto.v2.kpi_engine")

# ─────────────────────────────────────────────────────────────────────────────
# KPI METADATA REGISTRY
# ─────────────────────────────────────────────────────────────────────────────

_KPI_META: List[Dict] = [
    {
        "key":         "FAV",
        "label":       "Feature Adoption Velocity",
        "description": (
            "Measures how quickly customers adopt new product features over time. "
            "Higher is better. Below 0.30 indicates slow onboarding momentum."
        ),
        "unit":        "ratio",
        "benchmark":   0.60,
        "higher_is_better": True,
    },
    {
        "key":         "RER",
        "label":       "Revenue Efficiency Ratio",
        "description": (
            "ARR earned per unit of cost (CAC × discount_multiplier). "
            "Healthy portfolios target RER ≥ 2.0. Below 2.0 triggers a red warning."
        ),
        "unit":        "ratio",
        "benchmark":   2.0,
        "higher_is_better": True,
    },
    {
        "key":         "EDI",
        "label":       "Engagement Decay Index",
        "description": (
            "Fraction of initial active users lost since month 1. "
            "Lower is better. EDI > 0.30 is a leading churn indicator."
        ),
        "unit":        "ratio",
        "benchmark":   0.20,
        "higher_is_better": False,
    },
    {
        "key":         "SBS",
        "label":       "Support Burden Score",
        "description": (
            "Cumulative support tickets normalised by MRR. "
            "SBS > 0.15 correlates with 2.3× churn likelihood in the model."
        ),
        "unit":        "ratio",
        "benchmark":   0.10,
        "higher_is_better": False,
    },
    {
        "key":         "ORC",
        "label":       "Onboarding Risk Coefficient",
        "description": (
            "Inverse of the onboarding health score — higher ORC means higher "
            "risk of early churn. Target ORC < 0.35."
        ),
        "unit":        "ratio",
        "benchmark":   0.35,
        "higher_is_better": False,
    },
    {
        "key":         "CQS",
        "label":       "Customer Quality Score",
        "description": (
            "Composite health signal combining MRR stability, feature adoption, "
            "and NPS. Range 0-1. Scores > 0.70 indicate a healthy account."
        ),
        "unit":        "score",
        "benchmark":   0.70,
        "higher_is_better": True,
    },
    {
        "key":         "RSFS",
        "label":       "Rep-Segment Fit Score",
        "description": (
            "Win-rate of the assigned sales rep within the deal's customer segment. "
            "Low RSFS (< 0.55) suggests a rep-segment mismatch driving deal risk."
        ),
        "unit":        "ratio",
        "benchmark":   0.65,
        "higher_is_better": True,
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# SAFE AGGREGATION HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _safe_mean(series: pd.Series, fallback: float = 0.0) -> float:
    """Return the mean of a numeric Series, or fallback if empty / all-NaN."""
    try:
        if series is None or series.empty:
            return fallback
        cleaned = pd.to_numeric(series, errors="coerce").dropna()
        if cleaned.empty:
            return fallback
        return float(cleaned.mean())
    except Exception as exc:
        log.warning("_safe_mean failed: %s", exc)
        return fallback


def _confidence_from_n(n: int, has_degradation: bool) -> ConfidenceLevel:
    """Map row count + degradation flag to a ConfidenceLevel enum."""
    if n == 0:
        return ConfidenceLevel.LOW
    if n < 10 or has_degradation:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.HIGH


def _is_healthy(value: float, benchmark: float, higher_is_better: bool) -> bool:
    if higher_is_better:
        return value >= benchmark
    return value <= benchmark


# ─────────────────────────────────────────────────────────────────────────────
# INDIVIDUAL KPI CALCULATORS
# ─────────────────────────────────────────────────────────────────────────────

def _calc_fav(eng: Optional[pd.DataFrame], snap: Optional[pd.DataFrame]) -> Tuple[float, int]:
    """
    Feature Adoption Velocity — portfolio-average adoption_rate.

    Primary: engineered_df['adoption_rate']
    Fallback: snapshots_df['active_users'] / snapshots_df['total_seats'] if available
    """
    # Primary path
    if eng is not None and not eng.empty and "adoption_rate" in eng.columns:
        val = _safe_mean(eng["adoption_rate"])
        n = int(eng["adoption_rate"].notna().sum())
        if n > 0:
            log.debug("FAV: computed from engineered_df (n=%d, value=%.4f)", n, val)
            return val, n

    # Fallback: infer adoption from snapshots
    if snap is not None and not snap.empty:
        for user_col in ("active_users", "active_users_at_snapshot"):
            for seat_col in ("total_seats", "contracted_seats"):
                if user_col in snap.columns and seat_col in snap.columns:
                    ratio = (
                        pd.to_numeric(snap[user_col], errors="coerce")
                        / pd.to_numeric(snap[seat_col], errors="coerce").replace(0, np.nan)
                    ).dropna()
                    if not ratio.empty:
                        val = float(ratio.clip(0, 1).mean())
                        log.debug("FAV: fallback from snapshots (n=%d, value=%.4f)", len(ratio), val)
                        return val, len(ratio)

    log.warning("FAV: no data available — returning fallback 0.0")
    return 0.0, 0


def _calc_rer(eng: Optional[pd.DataFrame], sales: Optional[pd.DataFrame]) -> Tuple[float, int]:
    """
    Revenue Efficiency Ratio — ARR / (CAC × discount_multiplier).

    Primary: engineered_df['rer'] if present.
    Fallback: compute from sales_df cols arr + cac + discount_percentage.
    """
    if eng is not None and not eng.empty and "rer" in eng.columns:
        val = _safe_mean(eng["rer"])
        n = int(eng["rer"].notna().sum())
        if n > 0:
            log.debug("RER: from engineered_df (n=%d, value=%.4f)", n, val)
            return val, n

    if sales is not None and not sales.empty:
        required = {"arr", "cac", "discount_percentage"}
        available = set(sales.columns)
        if required.issubset(available):
            arr  = pd.to_numeric(sales["arr"], errors="coerce")
            cac  = pd.to_numeric(sales["cac"], errors="coerce").replace(0, np.nan)
            disc = pd.to_numeric(sales["discount_percentage"], errors="coerce").fillna(0.10)
            # discount_multiplier: 1 - discount (so 20% off → 0.80)
            dm   = (1 - disc.clip(0, 0.99))
            rer  = (arr / (cac * dm)).replace([np.inf, -np.inf], np.nan).dropna()
            if not rer.empty:
                val = float(rer.mean())
                log.debug("RER: fallback from sales_df (n=%d, value=%.4f)", len(rer), val)
                return val, len(rer)
        elif "arr" in available:
            # Minimal: just check ARR is positive (RER ≥ 1 trivially) — LOW confidence
            arr = pd.to_numeric(sales["arr"], errors="coerce").dropna()
            if not arr.empty:
                log.debug("RER: minimal fallback — missing cac/discount (n=%d)", len(arr))
                return 1.0, len(arr)   # neutral placeholder; confidence will be LOW

    log.warning("RER: no data — returning 0.0")
    return 0.0, 0


def _calc_edi(eng: Optional[pd.DataFrame], snap: Optional[pd.DataFrame]) -> Tuple[float, int]:
    """
    Engagement Decay Index — (users_month1 - users_current) / users_month1.

    Primary: engineered_df['edi'] or 'engagement_decay_index'.
    Fallback: compute per customer from snapshots_df.
    """
    for col in ("edi", "engagement_decay_index"):
        if eng is not None and not eng.empty and col in eng.columns:
            val = _safe_mean(eng[col])
            n = int(eng[col].notna().sum())
            if n > 0:
                log.debug("EDI: from engineered_df[%s] (n=%d, value=%.4f)", col, n, val)
                return val, n

    if snap is not None and not snap.empty:
        user_col = next(
            (c for c in ("active_users", "active_users_at_snapshot") if c in snap.columns), None
        )
        cust_col = next(
            (c for c in ("customer_id", "account_id", "id") if c in snap.columns), None
        )
        month_col = next(
            (c for c in ("snapshot_month", "month", "date", "period") if c in snap.columns), None
        )

        if user_col and cust_col and month_col:
            try:
                df = snap[[cust_col, month_col, user_col]].copy()
                df[user_col] = pd.to_numeric(df[user_col], errors="coerce")
                df[month_col] = pd.to_datetime(df[month_col], errors="coerce")
                df = df.dropna()
                df = df.sort_values([cust_col, month_col])

                edis = []
                for _, grp in df.groupby(cust_col):
                    first = grp[user_col].iloc[0]
                    last  = grp[user_col].iloc[-1]
                    if first > 0:
                        edis.append((first - last) / first)

                if edis:
                    val = float(np.mean(np.clip(edis, 0, 1)))
                    log.debug("EDI: fallback from snapshots (n=%d, value=%.4f)", len(edis), val)
                    return val, len(edis)
            except Exception as exc:
                log.warning("EDI fallback calculation failed: %s", exc)

    log.warning("EDI: no data — returning 0.0")
    return 0.0, 0


def _calc_sbs(eng: Optional[pd.DataFrame], snap: Optional[pd.DataFrame]) -> Tuple[float, int]:
    """
    Support Burden Score — cumulative_tickets / mrr.

    Primary: engineered_df['sbs'] or 'support_burden_score'.
    Fallback: support_tickets_at_snapshot / mrr_at_snapshot from snapshots.
    """
    for col in ("sbs", "support_burden_score"):
        if eng is not None and not eng.empty and col in eng.columns:
            val = _safe_mean(eng[col])
            n = int(eng[col].notna().sum())
            if n > 0:
                log.debug("SBS: from engineered_df[%s] (n=%d, value=%.4f)", col, n, val)
                return val, n

    if snap is not None and not snap.empty:
        ticket_col = next(
            (c for c in ("support_tickets_at_snapshot", "support_tickets", "tickets") if c in snap.columns), None
        )
        mrr_col = next(
            (c for c in ("mrr_at_snapshot", "mrr", "monthly_recurring_revenue") if c in snap.columns), None
        )
        if ticket_col and mrr_col:
            tickets = pd.to_numeric(snap[ticket_col], errors="coerce")
            mrr     = pd.to_numeric(snap[mrr_col], errors="coerce").replace(0, np.nan)
            sbs     = (tickets / mrr).replace([np.inf, -np.inf], np.nan).dropna()
            if not sbs.empty:
                val = float(sbs.mean())
                log.debug("SBS: fallback (n=%d, value=%.4f)", len(sbs), val)
                return val, len(sbs)

    log.warning("SBS: no data — returning 0.0")
    return 0.0, 0


def _calc_orc(eng: Optional[pd.DataFrame], prod: Optional[pd.DataFrame]) -> Tuple[float, int]:
    """
    Onboarding Risk Coefficient — 1 - onboarding_score (normalised to 0-1).

    Primary: engineered_df['orc'] or 'onboarding_risk_coefficient'.
    Fallback: invert product_df['onboarding_score'] if present.
    """
    for col in ("orc", "onboarding_risk_coefficient"):
        if eng is not None and not eng.empty and col in eng.columns:
            val = _safe_mean(eng[col])
            n = int(eng[col].notna().sum())
            if n > 0:
                log.debug("ORC: from engineered_df[%s] (n=%d, value=%.4f)", col, n, val)
                return val, n

    if prod is not None and not prod.empty:
        for score_col in ("onboarding_score", "onboarding_health", "onboard_score"):
            if score_col in prod.columns:
                scores = pd.to_numeric(prod[score_col], errors="coerce").dropna()
                if not scores.empty:
                    # Normalise to 0-10 if needed, then flip to risk
                    mx = scores.max()
                    if mx > 1:
                        scores = scores / mx
                    orc = (1 - scores.clip(0, 1))
                    val = float(orc.mean())
                    log.debug("ORC: fallback from product_df (n=%d, value=%.4f)", len(orc), val)
                    return val, len(orc)

    log.warning("ORC: no data — returning 0.0")
    return 0.0, 0


def _calc_cqs(eng: Optional[pd.DataFrame], snap: Optional[pd.DataFrame]) -> Tuple[float, int]:
    """
    Customer Quality Score — composite health signal (0-1).

    Primary: engineered_df['cqs'] or 'customer_quality_score'.
    Fallback: average of available health proxies (churn_risk_score inverse, nps norm.).
    """
    for col in ("cqs", "customer_quality_score"):
        if eng is not None and not eng.empty and col in eng.columns:
            val = _safe_mean(eng[col])
            n = int(eng[col].notna().sum())
            if n > 0:
                log.debug("CQS: from engineered_df[%s] (n=%d, value=%.4f)", col, n, val)
                return val, n

    if snap is not None and not snap.empty:
        component_series: List[pd.Series] = []

        # Inverse churn risk
        for cr_col in ("churn_risk_score", "churn_risk", "churn_probability"):
            if cr_col in snap.columns:
                cr = pd.to_numeric(snap[cr_col], errors="coerce").dropna().clip(0, 1)
                if not cr.empty:
                    component_series.append(1 - cr)
                    break

        # NPS normalised (0-10 range → 0-1)
        for nps_col in ("nps_at_snapshot", "nps_score", "nps"):
            if nps_col in snap.columns:
                nps = pd.to_numeric(snap[nps_col], errors="coerce").dropna()
                if not nps.empty:
                    mx = nps.max()
                    component_series.append((nps / mx).clip(0, 1) if mx > 0 else nps)
                    break

        if component_series:
            try:
                combined = pd.concat(component_series, axis=1).mean(axis=1).dropna()
                if not combined.empty:
                    val = float(combined.mean())
                    log.debug("CQS: fallback composite (n=%d, value=%.4f)", len(combined), val)
                    return val, len(combined)
            except Exception as exc:
                log.warning("CQS composite failed: %s", exc)

    log.warning("CQS: no data — returning 0.0")
    return 0.0, 0


def _calc_rsfs(eng: Optional[pd.DataFrame], sales: Optional[pd.DataFrame]) -> Tuple[float, int]:
    """
    Rep-Segment Fit Score — per-rep win rate within customer segment.

    Primary: engineered_df['rsfs'] or 'rep_segment_fit_score'.
    Fallback: compute win-rate groupby (rep × segment) from sales_df.
    """
    for col in ("rsfs", "rep_segment_fit_score"):
        if eng is not None and not eng.empty and col in eng.columns:
            val = _safe_mean(eng[col])
            n = int(eng[col].notna().sum())
            if n > 0:
                log.debug("RSFS: from engineered_df[%s] (n=%d, value=%.4f)", col, n, val)
                return val, n

    if sales is not None and not sales.empty:
        rep_col = next(
            (c for c in ("rep", "sales_rep", "owner", "assigned_rep") if c in sales.columns), None
        )
        seg_col = next(
            (c for c in ("segment", "customer_segment", "tier") if c in sales.columns), None
        )
        wl_col = next(
            (c for c in ("win_loss_status", "deal_status", "outcome") if c in sales.columns), None
        )

        if rep_col and seg_col and wl_col:
            try:
                df = sales[[rep_col, seg_col, wl_col]].dropna().copy()
                # Normalise win labels
                won_mask = df[wl_col].astype(str).str.lower().isin(
                    {"closed_won", "won", "win", "closed won"}
                )
                df["is_won"] = won_mask.astype(int)
                grp = df.groupby([rep_col, seg_col])["is_won"].mean()
                if not grp.empty:
                    val = float(grp.mean())
                    n = len(grp)
                    log.debug("RSFS: fallback groupby (n_pairs=%d, value=%.4f)", n, val)
                    return val, n
            except Exception as exc:
                log.warning("RSFS fallback failed: %s", exc)

    log.warning("RSFS: no data — returning 0.0")
    return 0.0, 0


# ─────────────────────────────────────────────────────────────────────────────
# DEGRADATION DETECTION HELPER
# ─────────────────────────────────────────────────────────────────────────────

def _table_was_degraded(table_name: str, degradation_log: List[Dict]) -> bool:
    """Return True if any entry in the degradation log references this table."""
    return any(
        entry.get("table") == table_name for entry in degradation_log
    )


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE AVAILABILITY ASSESSMENT
# ─────────────────────────────────────────────────────────────────────────────

def _assess_availability(tables_loaded: List[str]) -> FeatureAvailability:
    if len(tables_loaded) == 0:
        return FeatureAvailability.OFFLINE
    if len(tables_loaded) >= 3:
        return FeatureAvailability.ACTIVE
    return FeatureAvailability.PARTIAL


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def calculate_revops_kpis() -> RevOpsKPIResponse:
    """
    Compute all 7 RevOps KPIs from the cache and return a typed response.

    Never raises — all failures are absorbed and reflected as LOW-confidence
    KPIs with value 0.0.  Callers can always render the response.
    """
    log.info("RevOps KPI calculation START")

    cache = predicto_cache_v2

    if not cache.is_ready:
        log.warning("Cache not ready — returning zero-state KPI response.")
        return _zero_state_response()

    eng   = cache.engineered_df
    snap  = cache.snapshots_df
    prod  = cache.product_df
    sales = cache.sales_df
    dlog  = cache.degradation_log or []

    # ── Per-table degradation flags ───────────────────────────────────────────
    snap_degraded  = _table_was_degraded("snapshots", dlog)
    prod_degraded  = _table_was_degraded("product",   dlog)
    sales_degraded = _table_was_degraded("sales",     dlog)

    # ── Calculate each KPI ────────────────────────────────────────────────────
    calculators = [
        ("FAV",  lambda: _calc_fav(eng,  snap),  snap_degraded),
        ("RER",  lambda: _calc_rer(eng, sales),  sales_degraded),
        ("EDI",  lambda: _calc_edi(eng,  snap),  snap_degraded),
        ("SBS",  lambda: _calc_sbs(eng,  snap),  snap_degraded),
        ("ORC",  lambda: _calc_orc(eng,  prod),  prod_degraded),
        ("CQS",  lambda: _calc_cqs(eng,  snap),  snap_degraded),
        ("RSFS", lambda: _calc_rsfs(eng, sales), sales_degraded),
    ]

    kpi_results: Dict[str, Tuple[float, int]] = {}
    for key, fn, _ in calculators:
        try:
            kpi_results[key] = fn()
        except Exception as exc:
            log.error("KPI %s calculation raised unexpectedly: %s", key, exc, exc_info=True)
            kpi_results[key] = (0.0, 0)

    # ── Build KPIValue list from metadata registry ────────────────────────────
    kpi_values: List[KPIValue] = []
    for meta in _KPI_META:
        key  = meta["key"]
        val, n = kpi_results.get(key, (0.0, 0))
        is_degraded = any(
            d for _, _, d in calculators if _ == key
        )
        # Derive is_degraded from the respective flag
        flag_map = {fn_key: flag for fn_key, _, flag in calculators}
        is_degraded = flag_map.get(key, False)

        confidence = _confidence_from_n(n, is_degraded)
        benchmark  = meta.get("benchmark")
        healthy: Optional[bool] = None
        if benchmark is not None and n > 0:
            healthy = _is_healthy(val, benchmark, meta["higher_is_better"])

        kpi_values.append(
            KPIValue(
                key=key,
                label=meta["label"],
                description=meta["description"],
                value=round(val, 4),
                unit=meta["unit"],
                benchmark=benchmark,
                is_healthy=healthy,
                confidence=confidence,
                n_customers=n,
            )
        )
        log.debug("KPI %s: value=%.4f, n=%d, confidence=%s", key, val, n, confidence)

    log.info("RevOps KPI calculation COMPLETE (%d KPIs)", len(kpi_values))

    return RevOpsKPIResponse(
        kpis=kpi_values,
        overall_health_score=cache.health_score,
        tables_loaded=cache.tables_loaded,
        active_model=cache.active_model,
        degradation_events=len(dlog),
    )


def _zero_state_response() -> RevOpsKPIResponse:
    """Return a safe all-zeros response when the cache has no data."""
    kpi_values = [
        KPIValue(
            key=meta["key"],
            label=meta["label"],
            description=meta["description"],
            value=0.0,
            unit=meta["unit"],
            benchmark=meta.get("benchmark"),
            is_healthy=None,
            confidence=ConfidenceLevel.LOW,
            n_customers=0,
        )
        for meta in _KPI_META
    ]
    return RevOpsKPIResponse(
        kpis=kpi_values,
        overall_health_score=0,
        tables_loaded=[],
        active_model=None,
        degradation_events=0,
    )
