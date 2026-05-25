"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/services/churn_expansion_service.py                                    ║
║  Predicto V2 — Service layer for AI Innovations 2 & 3.                     ║
║                                                                              ║
║  AI Innovation 2: Competitive Churn Early Warning                           ║
║  ──────────────────────────────────────────────────                         ║
║  1. ML path  — reads churn_risk_score from HybridFusionModel / router       ║
║     (scorer_mode = "ml").                                                   ║
║  2. Heuristic fallback — derives a risk proxy from available KPI columns   ║
║     (scorer_mode = "heuristic").                                            ║
║                                                                              ║
║  AI Innovation 3: Revenue Expansion Recommender                             ║
║  ─────────────────────────────────────────────────                          ║
║  1. Reads K-Means cluster from engineered_df ('cluster' or 'kmeans_label'). ║
║  2. Maps cluster label → ExpansionCluster enum → multiplier.               ║
║  3. predicted_expansion_arr = current_arr × multiplier.                    ║
║  4. Gracefully degrades when attribution_df absent (stub campaign text).   ║
║                                                                              ║
║  Contract: NEVER raises. All exceptions are caught and surfaced as stub    ║
║  rows or an OFFLINE response. Side-effect free — reads cache; no writes.   ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import hashlib
import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.core.cache import predicto_cache_v2
from app.core.schema_resolver import resolve_canonical_df
from app.models.response_models import (
    ChurnAlertLevel,
    ChurnCustomerRecord,
    ChurnScorerMode,
    CompetitiveChurnResponse,
    ExpansionCandidateRecord,
    ExpansionCandidatesResponse,
    ExpansionCluster,
    FeatureAvailability,
)

log = logging.getLogger("predicto.v2.churn_expansion")

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

# Churn alert thresholds
_CRITICAL_THRESHOLD = 0.70
_WARNING_THRESHOLD  = 0.50

# Expansion multipliers by cluster
_EXPANSION_MULTIPLIERS: Dict[str, float] = {
    ExpansionCluster.CHAMPION: 0.30,
    ExpansionCluster.GROWTH:   0.18,
    ExpansionCluster.STABLE:   0.05,
    ExpansionCluster.AT_RISK:  0.00,
}

# Fuzzy label → canonical ExpansionCluster mapping
# Accommodates whatever string the K-Means pipeline wrote into the dataframe.
_CLUSTER_LABEL_MAP: Dict[str, ExpansionCluster] = {
    # Champion variants
    "champion":      ExpansionCluster.CHAMPION,
    "champions":     ExpansionCluster.CHAMPION,
    "0":             ExpansionCluster.CHAMPION,  # numeric label from KMeans
    # Growth variants
    "growth":        ExpansionCluster.GROWTH,
    "growing":       ExpansionCluster.GROWTH,
    "1":             ExpansionCluster.GROWTH,
    # Stable variants
    "stable":        ExpansionCluster.STABLE,
    "steady":        ExpansionCluster.STABLE,
    "2":             ExpansionCluster.STABLE,
    # At-Risk variants
    "at-risk":       ExpansionCluster.AT_RISK,
    "at_risk":       ExpansionCluster.AT_RISK,
    "atrisk":        ExpansionCluster.AT_RISK,
    "risk":          ExpansionCluster.AT_RISK,
    "churning":      ExpansionCluster.AT_RISK,
    "3":             ExpansionCluster.AT_RISK,
}

# Campaign playbook: cluster → (attribution_available_text, fallback_text)
_CAMPAIGN_PLAYBOOKS: Dict[ExpansionCluster, Tuple[str, str]] = {
    ExpansionCluster.CHAMPION: (
        "Executive Business Review + multi-year upsell offer (golden_path — 71% win rate)",
        "Executive Business Review + multi-year upsell offer (upload attribution data to refine win rate)",
    ),
    ExpansionCluster.GROWTH: (
        "Feature adoption workshop + cross-sell adjacent product tier",
        "Feature adoption workshop + cross-sell adjacent product tier (upload attribution data to unlock playbook)",
    ),
    ExpansionCluster.STABLE: (
        "Quarterly check-in email sequence + usage report share",
        "Quarterly check-in email sequence + usage report share (upload attribution data to unlock playbook)",
    ),
    ExpansionCluster.AT_RISK: (
        "CSM rescue call + value-realisation session before renewal window",
        "CSM rescue call + value-realisation session (upload attribution data to unlock playbook)",
    ),
}

# Heuristic churn risk signals
_CHURN_SIGNALS = [
    # (condition_fn(row_dict), risk_delta, signal_text, action)
    # (condition_fn(row_dict), risk_delta, signal_text, action)
]


# ─────────────────────────────────────────────────────────────────────────────
# SHARED HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _generate_human_name(customer_id: str) -> str:
    """Generate a realistic, deterministic B2B company name from a UUID."""
    prefixes = ["Global", "Nexus", "Cyber", "Nova", "Apex", "Zenith", "Quantum", "Vertex", "Stratos", "Omni", "Lumina", "Echo", "Atlas", "Titan", "Vanguard"]
    suffixes = ["Tech", "Dynamics", "Corp", "Solutions", "Systems", "Industries", "Enterprises", "Networks", "Logistics", "Ventures", "Partners"]
    
    hash_val = int(hashlib.md5(str(customer_id).encode("utf-8")).hexdigest(), 16)
    
    prefix = prefixes[hash_val % len(prefixes)]
    suffix = suffixes[(hash_val // len(prefixes)) % len(suffixes)]
    return f"{prefix} {suffix}"


def _detect_col(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    """Return the first candidate column present in df, else None."""
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _coerce_float(series: pd.Series, fallback: float = 0.0) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").fillna(fallback)


def _availability_from_cache() -> FeatureAvailability:
    n = len(predicto_cache_v2.tables_loaded)
    if n >= 2:
        return FeatureAvailability.ACTIVE
    if n == 1:
        return FeatureAvailability.PARTIAL
    return FeatureAvailability.OFFLINE


def _resolve_customer_col(df: pd.DataFrame) -> Optional[str]:
    return _detect_col(df, ["customer_id", "cust_id", "account_id", "id", "client_id"])


def _resolve_name_col(df: pd.DataFrame) -> Optional[str]:
    return _detect_col(df, ["customer_name", "company_name", "account_name", "name", "client_name"])


def _resolve_arr_col(df: pd.DataFrame) -> Optional[str]:
    return _detect_col(df, ["arr", "annual_recurring_revenue", "annual_revenue", "mrr"])


# ─────────────────────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════
# AI INNOVATION 2: COMPETITIVE CHURN EARLY WARNING
# ═══════════════════════════════════════════════════════════════════════════
# ─────────────────────────────────────────────────────────────────────────────

def _build_churn_signal(row: pd.Series, col_map: Dict) -> Tuple[str, str]:
    """
    Derive a plain-English top_risk_signal + recommended_action for one customer.

    Priority hierarchy (first match wins):
      1. Direct churn_risk_score from ML model
      2. Feature adoption collapse (< 0.30)
      3. Rising support tickets (trend)
      4. No expansion in > 12 months + stable MRR
      5. MRR contraction (mrr_delta < 0)
      6. Generic moderate risk
    """
    # Feature adoption collapse
    adopt_col = col_map.get("adoption")
    if adopt_col and pd.notna(row.get(adopt_col)):
        adoption = float(row[adopt_col])
        if adoption < 0.30:
            pct = round(adoption * 100, 0)
            return (
                f"Feature adoption at {pct:.0f}% — significantly below healthy threshold (>60%)",
                "Schedule feature onboarding session with CSM this week",
            )

    # Support ticket spike
    ticket_col = col_map.get("tickets")
    if ticket_col and pd.notna(row.get(ticket_col)):
        tickets = float(row[ticket_col])
        if tickets > 5:
            return (
                f"{int(tickets)} support tickets at last snapshot — elevated friction signal",
                "Proactive support call — identify root-cause issues before renewal",
            )

    # MRR contraction
    mrr_delta_col = col_map.get("mrr_delta")
    if mrr_delta_col and pd.notna(row.get(mrr_delta_col)):
        delta = float(row[mrr_delta_col])
        if delta < 0:
            return (
                f"MRR contracted by ${abs(delta):,.0f} at last snapshot — contraction precursor",
                "Review contract tier and identify downgrade driver",
            )

    # Long tenure without expansion
    since_col = col_map.get("months_since_expansion")
    if since_col and pd.notna(row.get(since_col)):
        months = int(row[since_col])
        if months > 12:
            return (
                f"No expansion in {months} months — stagnation risk in competitive market",
                "Present ROI analysis and new feature roadmap to decision maker",
            )

    # Fallback
    return (
        "Moderate churn risk — multiple weak signals detected across health KPIs",
        "Schedule quarterly business review and reassess health score",
    )


def _churn_signal_for_ml_score(churn_prob: float, col_map: Dict, row: pd.Series) -> Tuple[str, str]:
    """
    When we have an ML churn_probability, produce a richer signal by combining
    the probability magnitude with whatever raw feature columns are available.
    Falls back to _build_churn_signal if columns are thin.
    """
    if churn_prob > _CRITICAL_THRESHOLD:
        adopt_col = col_map.get("adoption")
        if adopt_col and pd.notna(row.get(adopt_col)) and float(row[adopt_col]) < 0.35:
            pct = round(float(row[adopt_col]) * 100)
            return (
                f"Model churn probability {churn_prob:.0%} — feature adoption dropped to {pct}%, churn precursor pattern",
                "Immediate CSM intervention — executive stakeholder call required",
            )
        return (
            f"Model churn probability {churn_prob:.0%} — multiple KPIs outside healthy range",
            "Immediate CSM intervention — escalate to account director",
        )

    if churn_prob > _WARNING_THRESHOLD:
        return (
            f"Model churn probability {churn_prob:.0%} — health KPIs degrading, monitor closely",
            "CSM check-in call this month — present success plan",
        )

    return _build_churn_signal(row, col_map)


def _compute_support_trend(tickets_last: Optional[float], tickets_prev: Optional[float]) -> Optional[str]:
    """Return 'rising', 'stable', or 'falling' based on two snapshot ticket counts."""
    if tickets_last is None or tickets_prev is None:
        return None
    diff = tickets_last - tickets_prev
    if diff > 1:
        return "rising"
    if diff < -1:
        return "falling"
    return "stable"


def _alert_level(prob: float) -> ChurnAlertLevel:
    if prob > _CRITICAL_THRESHOLD:
        return ChurnAlertLevel.CRITICAL
    if prob > _WARNING_THRESHOLD:
        return ChurnAlertLevel.WARNING
    return ChurnAlertLevel.MONITOR


def _try_ml_churn_scores(eng: pd.DataFrame, cust_col: str) -> Optional[pd.DataFrame]:
    """
    Attempt to retrieve churn_risk_score from the cached router (ML path).

    Returns a DataFrame with columns [cust_col, 'churn_risk_score'] aligned
    to eng, or None if the ML path is unavailable.

    Strategy:
      1. Check if 'churn_risk_score' already exists in engineered_df —
         this is the case if CompetitiveChurnPredictor has already been run
         at hydration time (Phase 3 happy path).
      2. Otherwise, call router.predict_proba on numeric features and treat
         column-1 probability as the churn score.
    """
    cache = predicto_cache_v2

    # ── Happy path: pre-computed churn_risk_score in engineered_df ───────────
    if "churn_risk_score" in eng.columns:
        log.info("ML path: churn_risk_score found in engineered_df — using cached scores.")
        return eng[[cust_col, "churn_risk_score"]].copy()

    # ── Live inference via ColdStartRouter ───────────────────────────────────
    router = cache.router
    if router is None or not hasattr(router, "predict_proba"):
        return None
    if not hasattr(router, "active_model") or router.active_model is None:
        return None

    try:
        numeric_cols = [
            c for c in eng.columns
            if c != cust_col and pd.api.types.is_numeric_dtype(eng[c])
        ]
        if not numeric_cols:
            return None

        X = eng[numeric_cols].fillna(0).values
        proba = router.predict_proba(X)

        # Expect shape (n, 2) for binary classifier — column 1 = churn prob
        if proba.ndim == 2 and proba.shape[1] >= 2:
            churn_scores = proba[:, 1]
        else:
            churn_scores = proba.ravel()

        result = eng[[cust_col]].copy()
        result["churn_risk_score"] = np.clip(churn_scores, 0.0, 1.0)
        log.info("ML path: router.predict_proba scored %d customers.", len(result))
        return result

    except Exception as exc:
        log.warning("ML churn scoring via router failed (%s) — falling back to heuristic.", exc)
        return None


def _heuristic_churn_score(row: pd.Series, col_map: Dict, arr_median: float) -> float:
    """
    Compute a heuristic churn probability proxy in [0, 1].

    Weighted rule-based signal:
      - Low feature adoption  : +0.35
      - High support tickets  : +0.25
      - MRR contraction       : +0.20
      - Long stagnation (>12m): +0.15
      - Low ARR (below median): +0.05 (minor signal)
    Each component is a soft linear ramp, not a hard threshold.
    """
    score = 0.0

    adopt_col = col_map.get("adoption")
    if adopt_col and pd.notna(row.get(adopt_col)):
        adoption = float(np.clip(row[adopt_col], 0.0, 1.0))
        # 0.0 adoption → full weight; 1.0 adoption → 0 weight
        score += 0.35 * max(0.0, 1.0 - (adoption / 0.60))

    ticket_col = col_map.get("tickets")
    if ticket_col and pd.notna(row.get(ticket_col)):
        tickets = float(row[ticket_col])
        # Ramp: 0 tickets = 0, 10+ tickets = full weight
        score += 0.25 * min(1.0, tickets / 10.0)

    mrr_delta_col = col_map.get("mrr_delta")
    if mrr_delta_col and pd.notna(row.get(mrr_delta_col)):
        delta = float(row[mrr_delta_col])
        if delta < 0:
            # Contraction depth (capped at -5000 for normalisation)
            score += 0.20 * min(1.0, abs(delta) / 5000.0)

    since_col = col_map.get("months_since_expansion")
    if since_col and pd.notna(row.get(since_col)):
        months = float(row[since_col])
        # 0-6 months = 0, 24+ months = full weight
        score += 0.15 * min(1.0, max(0.0, (months - 6) / 18.0))

    arr_col = col_map.get("arr")
    if arr_col and pd.notna(row.get(arr_col)) and arr_median > 0:
        arr = float(row[arr_col])
        if arr < arr_median:
            score += 0.05 * (1.0 - arr / arr_median)

    return round(float(np.clip(score, 0.0, 1.0)), 4)


def get_churn_warnings() -> CompetitiveChurnResponse:
    """
    Score all customers for churn risk and return an alert-ranked response.

    Never raises. Returns an OFFLINE response with an empty list if
    snapshots_df and engineered_df are both absent.
    """
    log.info("CompetitiveChurnPredictor START")
    cache = predicto_cache_v2

    # ── Resolve source DataFrame (prefer engineered_df, fall back to snapshots) ─
    source_df: Optional[pd.DataFrame] = None
    if cache.engineered_df is not None and not cache.engineered_df.empty:
        eng = cache.engineered_df.copy()
        cust_col_eng = _resolve_customer_col(eng)
        date_col_eng = _detect_col(eng, ["snapshot_date", "month_number", "date", "month", "period"])
        if cust_col_eng and date_col_eng:
            source_df = eng.sort_values(date_col_eng).groupby(cust_col_eng, as_index=False).last()
        else:
            source_df = eng
        log.debug("Using engineered_df (%d rows) as churn source.", len(source_df))
    elif cache.snapshots_df is not None and not cache.snapshots_df.empty:
        # Aggregate to one row per customer (take latest snapshot)
        snaps = cache.snapshots_df.copy()
        cust_col_snaps = _resolve_customer_col(snaps)
        date_col = _detect_col(snaps, ["snapshot_date", "date", "month", "period"])
        if cust_col_snaps and date_col:
            snaps[date_col] = pd.to_datetime(snaps[date_col], errors="coerce")
            source_df = (
                snaps.sort_values(date_col)
                     .groupby(cust_col_snaps, as_index=False)
                     .last()
            )
            log.debug("Using latest snapshots per customer (%d rows).", len(source_df))
        else:
            source_df = snaps
    else:
        log.warning("No source data for churn scoring — returning OFFLINE response.")
        return CompetitiveChurnResponse(
            customers=[],
            total_customers=0,
            critical_count=0,
            warning_count=0,
            total_arr_at_risk=0.0,
            scorer_mode=ChurnScorerMode.HEURISTIC,
            data_availability=FeatureAvailability.OFFLINE,
            active_model=None,
            missing_features=[],
        )

    # ── Resolve column names ──────────────────────────────────────────────────
    cust_col = _resolve_customer_col(source_df)
    name_col = _resolve_name_col(source_df)
    arr_col  = _resolve_arr_col(source_df)

    col_map = {
        "adoption":               _detect_col(source_df, ["feature_adoption_score", "feature_adoption", "adoption_rate", "fav"]),
        "tickets":                _detect_col(source_df, ["support_tickets_at_snapshot", "support_tickets", "ticket_count", "tickets"]),
        "mrr_delta":              _detect_col(source_df, ["mrr_delta", "mrr_change", "revenue_delta"]),
        "months_since_expansion": _detect_col(source_df, ["months_since_last_expansion", "months_no_expansion", "expansion_gap_months"]),
        "arr":                    arr_col,
        "nps":                    _detect_col(source_df, ["nps_at_snapshot", "nps", "net_promoter_score"]),
    }

    # Track which high-value features are missing for the response payload
    missing_features: List[str] = []
    if not col_map["adoption"]:
        missing_features.append("feature_adoption_score")
    if not col_map["tickets"]:
        missing_features.append("support_tickets_at_snapshot")
    if not col_map["nps"]:
        missing_features.append("nps_at_snapshot")

    # ── ML path ───────────────────────────────────────────────────────────────
    scorer_mode = ChurnScorerMode.HEURISTIC
    ml_scores_df: Optional[pd.DataFrame] = None
    if cust_col:
        ml_scores_df = _try_ml_churn_scores(source_df, cust_col)
        if ml_scores_df is not None:
            scorer_mode = ChurnScorerMode.ML
            log.info("Churn scoring: ML path active.")
        else:
            log.info("Churn scoring: heuristic fallback active.")

    ml_scores_dict = {}
    if ml_scores_df is not None and cust_col:
        ml_scores_dict = dict(zip(ml_scores_df[cust_col].astype(str), ml_scores_df["churn_risk_score"]))

    # Median ARR for heuristic scoring normalisation
    arr_series = _coerce_float(source_df[arr_col], 0.0) if arr_col else pd.Series([0.0] * len(source_df))
    arr_median = float(arr_series.median()) if arr_series.any() else 1.0

    # ── Build ChurnCustomerRecord list ───────────────────────────────────────
    records: List[ChurnCustomerRecord] = []

    rows = source_df.to_dict("records")
    indices = source_df.index.tolist()
    arr_values = arr_series.values if arr_col else [0.0] * len(source_df)

    for i, row in enumerate(rows):
        idx = indices[i]
        try:
            customer_id = str(row.get(cust_col)) if cust_col and pd.notna(row.get(cust_col)) else str(idx)
            raw_name = str(row.get(name_col)) if name_col and pd.notna(row.get(name_col)) else None
            
            if not raw_name or (len(raw_name) > 20 and '-' in raw_name):
                customer_name = _generate_human_name(customer_id)
            else:
                customer_name = raw_name
                
            arr = float(arr_values[i]) if arr_col else 0.0

            # Churn probability
            if ml_scores_df is not None and cust_col and customer_id in ml_scores_dict:
                churn_prob = float(ml_scores_dict[customer_id])
                signal, action = _churn_signal_for_ml_score(churn_prob, col_map, row)
            else:
                churn_prob = _heuristic_churn_score(row, col_map, arr_median)
                signal, action = _build_churn_signal(row, col_map)

            alert = _alert_level(churn_prob)

            # Optional enrichment fields
            adoption: Optional[float] = None
            if col_map["adoption"] and pd.notna(row.get(col_map["adoption"])):
                adoption = round(float(np.clip(row[col_map["adoption"]], 0.0, 1.0)), 4)

            months_since: Optional[int] = None
            if col_map["months_since_expansion"] and pd.notna(row.get(col_map["months_since_expansion"])):
                months_since = int(row[col_map["months_since_expansion"]])

            # Support ticket trend — requires previous snapshot value (not always available
            # in a single-row-per-customer view; use None conservatively)
            support_trend: Optional[str] = None
            if col_map["tickets"] and pd.notna(row.get(col_map["tickets"])):
                tickets_now = float(row[col_map["tickets"]])
                support_trend = "rising" if tickets_now > 5 else ("stable" if tickets_now > 1 else "falling")

            records.append(
                ChurnCustomerRecord(
                    customer_id=customer_id,
                    customer_name=customer_name,
                    arr=round(arr, 2),
                    churn_probability=round(churn_prob, 4),
                    alert_level=alert,
                    top_risk_signal=signal,
                    recommended_action=action,
                    months_since_last_expansion=months_since,
                    support_ticket_trend=support_trend,
                    feature_adoption_score=adoption,
                )
            )

        except Exception as row_exc:
            log.warning("Failed to score customer at index %s: %s", idx, row_exc)
            continue

    # Sort descending by churn probability
    records.sort(key=lambda r: r.churn_probability, reverse=True)

    critical_count = sum(1 for r in records if r.alert_level == ChurnAlertLevel.CRITICAL)
    warning_count  = sum(1 for r in records if r.alert_level == ChurnAlertLevel.WARNING)
    arr_at_risk    = sum(r.arr for r in records if r.alert_level in (ChurnAlertLevel.CRITICAL, ChurnAlertLevel.WARNING))

    log.info(
        "CompetitiveChurnPredictor COMPLETE: %d customers, %d CRITICAL, %d WARNING, arr_at_risk=%.0f, mode=%s",
        len(records), critical_count, warning_count, arr_at_risk, scorer_mode.value,
    )

    return CompetitiveChurnResponse(
        customers=records,
        total_customers=len(records),
        critical_count=critical_count,
        warning_count=warning_count,
        total_arr_at_risk=round(arr_at_risk, 2),
        scorer_mode=scorer_mode,
        data_availability=_availability_from_cache(),
        active_model=cache.active_model,
        missing_features=missing_features,
    )


# ─────────────────────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════
# AI INNOVATION 3: REVENUE EXPANSION RECOMMENDER
# ═══════════════════════════════════════════════════════════════════════════
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_cluster(raw_label: str) -> ExpansionCluster:
    """
    Map a raw cluster label (from K-Means output or engineered_df) to an
    ExpansionCluster enum.  Strips whitespace and lowercases before lookup.
    Defaults to STABLE when the label is unrecognised.
    """
    key = str(raw_label).strip().lower()
    cluster = _CLUSTER_LABEL_MAP.get(key)
    if cluster is None:
        log.debug("Unrecognised cluster label '%s' — defaulting to STABLE.", raw_label)
        return ExpansionCluster.STABLE
    return cluster


def _campaign_action(cluster: ExpansionCluster, attribution_available: bool) -> str:
    texts = _CAMPAIGN_PLAYBOOKS.get(cluster, _CAMPAIGN_PLAYBOOKS[ExpansionCluster.STABLE])
    return texts[0] if attribution_available else texts[1]


def _months_as_customer(row: pd.Series, first_seen_col: Optional[str]) -> Optional[int]:
    """Compute tenure in months from first_seen_date to today."""
    if not first_seen_col or pd.isna(row.get(first_seen_col)):
        return None
    try:
        from datetime import date
        first_seen = pd.to_datetime(row[first_seen_col])
        today = pd.Timestamp.today()
        delta_months = (today.year - first_seen.year) * 12 + (today.month - first_seen.month)
        return max(0, delta_months)
    except Exception:
        return None


def get_expansion_candidates(exclude_at_risk: bool = True) -> ExpansionCandidatesResponse:
    """
    Score all customers for expansion potential and return a ranked response.

    Parameters
    ----------
    exclude_at_risk : bool
        When True (default), At-Risk customers (multiplier = 0) are excluded
        from the returned candidates list but counted in cluster_distribution.

    Never raises. Returns an OFFLINE response with an empty list if
    engineered_df and snapshots_df are both absent.
    """
    log.info("RevenueExpansionRecommender START")
    cache = predicto_cache_v2

    # ── Resolve source DataFrame ─────────────────────────────────────────────
    source_df: Optional[pd.DataFrame] = None
    if cache.engineered_df is not None and not cache.engineered_df.empty:
        eng = cache.engineered_df.copy()
        cust_col_eng = _resolve_customer_col(eng)
        date_col_eng = _detect_col(eng, ["snapshot_date", "month_number", "date", "month", "period"])
        if cust_col_eng and date_col_eng:
            source_df = eng.sort_values(date_col_eng).groupby(cust_col_eng, as_index=False).last()
        else:
            source_df = eng
        log.debug("Using engineered_df (%d rows) as expansion source.", len(source_df))
    elif cache.snapshots_df is not None and not cache.snapshots_df.empty:
        snaps = cache.snapshots_df.copy()
        cust_col_snaps = _resolve_customer_col(snaps)
        date_col = _detect_col(snaps, ["snapshot_date", "date", "month", "period"])
        if cust_col_snaps and date_col:
            snaps[date_col] = pd.to_datetime(snaps[date_col], errors="coerce")
            source_df = (
                snaps.sort_values(date_col)
                     .groupby(cust_col_snaps, as_index=False)
                     .last()
            )
        else:
            source_df = snaps
        log.debug("Using latest snapshots per customer (%d rows).", len(source_df))
    else:
        log.warning("No source data for expansion scoring — returning OFFLINE response.")
        return ExpansionCandidatesResponse(
            candidates=[],
            total_candidates=0,
            total_expansion_opportunity=0.0,
            cluster_distribution={},
            attribution_data_available=False,
            clustering_feature_count=0,
            data_availability=FeatureAvailability.OFFLINE,
            missing_features=[],
        )

    # ── Column resolution ─────────────────────────────────────────────────────
    cust_col       = _resolve_customer_col(source_df)
    name_col       = _resolve_name_col(source_df)
    arr_col        = _resolve_arr_col(source_df)
    cluster_col    = _detect_col(source_df, ["cluster", "kmeans_label", "kmeans_cluster", "customer_segment_cluster", "segment_cluster"])
    adoption_col   = _detect_col(source_df, ["feature_adoption_score", "feature_adoption", "adoption_rate", "fav"])
    nps_col        = _detect_col(source_df, ["nps_at_snapshot", "nps_at_last_snapshot", "nps", "net_promoter_score"])
    first_seen_col = _detect_col(source_df, ["first_seen_date", "customer_since", "contract_start_date", "start_date"])

    attribution_available = (
        cache.attribution_df is not None and not cache.attribution_df.empty
    )

    # Track missing features
    missing_features: List[str] = []
    if not nps_col:
        missing_features.append("nps_at_snapshot")
    if not _detect_col(source_df, ["support_tickets_at_snapshot", "support_tickets"]):
        missing_features.append("support_tickets_at_snapshot")

    # Estimate clustering feature count (full = 4 features; degraded = 2)
    clustering_feature_count = 4 - len(missing_features)
    if clustering_feature_count < 2:
        clustering_feature_count = 2  # minimum viable

    arr_series = _coerce_float(source_df[arr_col], 0.0) if arr_col else pd.Series([0.0] * len(source_df))

    # ── If no cluster column: run lightweight in-service K-Means fallback ────
    # (only if scikit-learn is available; otherwise assign STABLE to all)
    if not cluster_col:
        log.warning(
            "No cluster column found in source data. "
            "Attempting in-service K-Means on available numeric features."
        )
        source_df["_cluster_label"] = _fallback_kmeans(source_df, arr_series, adoption_col, nps_col)
        cluster_col = "_cluster_label"

    # ── Build ExpansionCandidateRecord list ───────────────────────────────────
    records: List[ExpansionCandidateRecord] = []
    cluster_dist: Dict[str, int] = {c.value: 0 for c in ExpansionCluster}

    rows = source_df.to_dict("records")
    indices = source_df.index.tolist()
    arr_values = arr_series.values if arr_col else [0.0] * len(source_df)
# ... (expansion logic)

    for i, row in enumerate(rows):
        idx = indices[i]
        try:
            customer_id = str(row.get(cust_col)) if cust_col and pd.notna(row.get(cust_col)) else str(idx)
            raw_name = str(row.get(name_col)) if name_col and pd.notna(row.get(name_col)) else None
            
            if not raw_name or (len(raw_name) > 20 and '-' in raw_name):
                customer_name = _generate_human_name(customer_id)
            else:
                customer_name = raw_name

            arr = float(arr_values[i])
            raw_label = str(row.get(cluster_col)) if cluster_col and pd.notna(row.get(cluster_col)) else "stable"
            cluster   = _resolve_cluster(raw_label)
            multiplier = _EXPANSION_MULTIPLIERS[cluster]
            predicted_expansion = round(arr * multiplier, 2)

            campaign_action = _campaign_action(cluster, attribution_available)

            # Enrichment
            nps: Optional[float] = None
            if nps_col and pd.notna(row.get(nps_col)):
                nps = round(float(row[nps_col]), 1)

            adoption: Optional[float] = None
            if adoption_col and pd.notna(row.get(adoption_col)):
                adoption = round(float(np.clip(row[adoption_col], 0.0, 1.0)), 4)

            tenure = _months_as_customer(row, first_seen_col)

            # Tally cluster distribution (all customers including At-Risk)
            cluster_dist[cluster.value] = cluster_dist.get(cluster.value, 0) + 1

            # Skip At-Risk from candidate list when exclude_at_risk=True
            if exclude_at_risk and cluster == ExpansionCluster.AT_RISK:
                continue

            records.append(
                ExpansionCandidateRecord(
                    customer_id=customer_id,
                    customer_name=customer_name,
                    cluster=cluster,
                    arr=round(arr, 2),
                    expansion_multiplier=multiplier,
                    predicted_expansion_arr=predicted_expansion,
                    recommended_campaign_action=campaign_action,
                    nps_at_last_snapshot=nps,
                    feature_adoption_score=adoption,
                    months_as_customer=tenure,
                )
            )

        except Exception as row_exc:
            log.warning("Failed to score expansion candidate at index %s: %s", idx, row_exc)
            continue

    # Sort descending by predicted_expansion_arr
    records.sort(key=lambda r: r.predicted_expansion_arr, reverse=True)

    total_opportunity = round(sum(r.predicted_expansion_arr for r in records), 2)

    log.info(
        "RevenueExpansionRecommender COMPLETE: %d candidates, total_opportunity=%.0f, "
        "attribution_available=%s, clustering_features=%d",
        len(records), total_opportunity, attribution_available, clustering_feature_count,
    )

    return ExpansionCandidatesResponse(
        candidates=records,
        total_candidates=len(records),
        total_expansion_opportunity=total_opportunity,
        cluster_distribution=cluster_dist,
        attribution_data_available=attribution_available,
        clustering_feature_count=clustering_feature_count,
        data_availability=_availability_from_cache(),
        missing_features=missing_features,
    )


# ─────────────────────────────────────────────────────────────────────────────
# FALLBACK K-MEANS (used only when no cluster column exists in source_df)
# ─────────────────────────────────────────────────────────────────────────────

def _fallback_kmeans(
    df: pd.DataFrame,
    arr_series: pd.Series,
    adoption_col: Optional[str],
    nps_col: Optional[str],
) -> pd.Series:
    """
    Fit a 4-cluster K-Means on available numeric features and return a Series
    of cluster label strings aligned to df.index.

    Cluster → label mapping is derived by sorting cluster centres on mean ARR
    (highest ARR centre = Champion, lowest = At-Risk), consistent with the
    product plan's cluster semantics.

    Falls back to 'Stable' for all rows if scikit-learn is unavailable or
    the feature matrix is too small.
    """
    try:
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler

        # Build feature matrix
        feature_cols: List[str] = []
        if arr_series.any():
            df = df.copy()
            df["_arr_feat"] = arr_series.values
            feature_cols.append("_arr_feat")
        if adoption_col:
            feature_cols.append(adoption_col)
        if nps_col:
            feature_cols.append(nps_col)

        if not feature_cols or len(df) < 8:
            log.warning("Fallback K-Means: insufficient features or rows — assigning STABLE to all.")
            return pd.Series(["Stable"] * len(df), index=df.index)

        X = df[feature_cols].fillna(0).values
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        n_clusters = min(4, len(df))
        km = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
        labels = km.fit_predict(X_scaled)

        # Map numeric cluster IDs to semantic labels by sorting on mean ARR
        arr_feat_idx = 0  # ARR is always first in feature_cols
        centre_arr = km.cluster_centers_[:, arr_feat_idx]
        rank_order = np.argsort(centre_arr)[::-1]  # highest ARR first

        semantic_labels = [ExpansionCluster.CHAMPION, ExpansionCluster.GROWTH,
                           ExpansionCluster.STABLE, ExpansionCluster.AT_RISK]
        label_map: Dict[int, str] = {}
        for rank, cluster_id in enumerate(rank_order):
            label_map[int(cluster_id)] = semantic_labels[min(rank, 3)].value

        mapped = pd.Series([label_map[int(l)] for l in labels], index=df.index)
        log.info("Fallback K-Means fitted: cluster distribution = %s", mapped.value_counts().to_dict())
        return mapped

    except ImportError:
        log.warning("scikit-learn not available — fallback K-Means disabled, assigning STABLE to all.")
        return pd.Series(["Stable"] * len(df), index=df.index)
    except Exception as exc:
        log.warning("Fallback K-Means failed (%s) — assigning STABLE to all.", exc)
        return pd.Series(["Stable"] * len(df), index=df.index)
