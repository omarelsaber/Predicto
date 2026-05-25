"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/api/v2/intelligence.py                                                 ║
║  Predicto V2 — FastAPI router for RevOps KPIs and Intelligence Hub.        ║
║                                                                              ║
║  Routes                                                                     ║
║  ──────                                                                     ║
║  GET /api/v2/revops/kpis         Portfolio KPI bundle (7 core KPIs)        ║
║  GET /api/v2/intelligence/hub    Master executive dashboard endpoint        ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging
from typing import List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from app.core.cache import predicto_cache_v2
from app.models.response_models import (
    AIInnovation,
    ActionQueueItem,
    ConfidenceLevel,
    FeatureAvailability,
    HeadlineKPI,
    IntelligenceHubResponse,
    KPIValue,
    RevOpsKPIResponse,
    RevenueRiskItem,
)
from app.services.kpi_engine import calculate_revops_kpis
from app.services.deal_priority_service import score_deals

log = logging.getLogger("predicto.v2.intelligence")

router = APIRouter(prefix="/api/v2", tags=["intelligence", "revops"])


# ─────────────────────────────────────────────────────────────────────────────
# UTILITY HELPERS (hub-internal)
# ─────────────────────────────────────────────────────────────────────────────

def _safe_float(val, fallback: float = 0.0) -> float:
    try:
        f = float(val)
        return f if np.isfinite(f) else fallback
    except (TypeError, ValueError):
        return fallback


def _detect_col(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    for c in candidates:
        if c in df.columns:
            return c
    return None


# ─────────────────────────────────────────────────────────────────────────────
# HEADLINE KPI BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

def _build_headline_kpis(cache) -> List[HeadlineKPI]:
    """
    Extract the five headline metrics shown in the Intelligence Hub KPI bar.

    KPI keys (production):
        current_mrr       — portfolio MRR at the most-recent snapshot period
        mrr_delta_30d     — MRR change vs the prior snapshot period
        gross_churn       — churned MRR ÷ prior-period MRR  (0–1 fraction)
        nrr               — Net Revenue Retention (expansion + contraction)
        win_rate          — closed-won ÷ total closed deals (0–1 fraction)

    Dual-mode month parsing:
        • Numeric month column (month_number, period_number…): compare integers
        • Date-like column (snapshot_month, snapshot_date, date…): parse to datetime
    """
    kpis: List[HeadlineKPI] = []

    # ── helpers ───────────────────────────────────────────────────────────────
    def _period_sort_key(series: pd.Series) -> pd.Series:
        """Return a sortable series regardless of whether it is numeric or date."""
        numeric = pd.to_numeric(series, errors="coerce")
        if numeric.notna().mean() >= 0.8:          # ≥80 % parse as numbers → numeric
            return numeric
        return pd.to_datetime(series, errors="coerce")   # else parse as dates

    # ── 1. Current MRR & 30-day MRR Δ ────────────────────────────────────────
    mrr_current     = 0.0
    mrr_delta       = None
    mrr_trend       = "flat"
    mrr_delta_label = None

    snap = cache.snapshots_df
    if snap is not None and not snap.empty:
        mrr_col   = _detect_col(snap, ["mrr_at_snapshot", "mrr", "monthly_recurring_revenue"])
        month_col = _detect_col(snap, [
            "month_number", "period_number",                     # numeric first
            "snapshot_month", "snapshot_date", "month", "date", "period",
        ])

        if mrr_col:
            mrr_vals = pd.to_numeric(snap[mrr_col], errors="coerce").dropna()

            if month_col:
                try:
                    snap2 = snap.copy()
                    snap2["_period"] = _period_sort_key(snap2[month_col])
                    snap2 = snap2.dropna(subset=["_period"]).sort_values("_period")

                    last_period = snap2["_period"].max()
                    last_mask   = snap2["_period"] == last_period
                    prev_mask   = snap2["_period"] < last_period

                    curr_mrr = _safe_float(
                        snap2.loc[last_mask, mrr_col]
                        .pipe(pd.to_numeric, errors="coerce").sum()
                    )

                    if prev_mask.any():
                        prev_period = snap2.loc[prev_mask, "_period"].max()
                        prev_snap   = snap2[snap2["_period"] == prev_period]
                        prev_mrr    = _safe_float(
                            prev_snap[mrr_col].pipe(pd.to_numeric, errors="coerce").sum()
                        )
                        mrr_delta = round(curr_mrr - prev_mrr, 2)
                        mrr_trend = "up" if mrr_delta > 0 else ("down" if mrr_delta < 0 else "flat")
                        sign = "+" if mrr_delta >= 0 else ""
                        mrr_delta_label = f"{sign}${mrr_delta:,.0f} vs last month"

                    mrr_current = curr_mrr
                except Exception as exc:
                    log.warning("MRR time-series extraction failed: %s", exc)
                    mrr_current = _safe_float(mrr_vals.sum())
            else:
                # No time column — cannot pick a period; sum everything as fallback
                mrr_current = _safe_float(mrr_vals.sum())

    kpis.append(HeadlineKPI(
        key="current_mrr",
        label="Current MRR",
        value=round(mrr_current, 2),
        unit="currency",
        delta=mrr_delta,
        delta_label=mrr_delta_label,
        trend=mrr_trend,
    ))

    kpis.append(HeadlineKPI(
        key="mrr_delta_30d",
        label="MRR Growth",
        value=round(mrr_delta or 0.0, 2),
        unit="currency",
        delta=None,
        delta_label=None,
        trend=mrr_trend,
    ))

    # ── 2. Gross Churn (churned MRR / starting MRR) ───────────────────────────
    gross_churn       = 0.0
    gross_churn_trend = "flat"

    if snap is not None and not snap.empty and mrr_col and month_col:
        try:
            snap2 = snap.copy()
            snap2["_period"] = _period_sort_key(snap2[month_col])
            snap2 = snap2.dropna(subset=["_period"]).sort_values("_period")

            last_period = snap2["_period"].max()
            prev_mask   = snap2["_period"] < last_period

            if prev_mask.any():
                prev_period = snap2.loc[prev_mask, "_period"].max()
                prev_df     = snap2[snap2["_period"] == prev_period].copy()
                curr_df     = snap2[snap2["_period"] == last_period].copy()

                prev_cust = set(
                    prev_df[_detect_col(prev_df, ["customer_id", "account_id", "cust_id"]) or "customer_id"]
                    .astype(str)
                )
                curr_cust = set(
                    curr_df[_detect_col(curr_df, ["customer_id", "account_id", "cust_id"]) or "customer_id"]
                    .astype(str)
                )
                churned_ids = prev_cust - curr_cust

                start_mrr    = _safe_float(
                    prev_df[mrr_col].pipe(pd.to_numeric, errors="coerce").sum()
                )
                churned_mrr  = _safe_float(
                    prev_df[prev_df[_detect_col(prev_df, ["customer_id", "account_id", "cust_id"]) or "customer_id"]
                            .astype(str)
                            .isin(churned_ids)][mrr_col]
                    .pipe(pd.to_numeric, errors="coerce").sum()
                )
                if start_mrr > 0:
                    gross_churn = round(churned_mrr / start_mrr, 4)
                    gross_churn_trend = "up" if gross_churn > 0.05 else "down"
        except Exception as exc:
            log.warning("Gross churn calculation failed: %s", exc)

    # Emit as true percentage (e.g. 4.2 for 4.2%), NOT decimal fraction (0.042).
    # Frontend formatter: `baseVal < 1 → baseVal*100` would mishandle 0.042 as 4.2
    # correctly, but a bare 0.0 hits the "—" branch. To be safe, always pre-multiply.
    kpis.append(HeadlineKPI(
        key="gross_churn",
        label="Gross Churn",
        value=round(gross_churn * 100, 2),   # e.g. 4.2 means 4.2%
        unit="percent",
        delta=None,
        delta_label=None,
        trend=gross_churn_trend,
    ))

    # ── 3. NRR (Net Revenue Retention) ────────────────────────────────────────
    nrr       = 0.0
    nrr_trend = "flat"

    if snap is not None and not snap.empty and mrr_col and month_col:
        try:
            snap2 = snap.copy()
            snap2["_period"] = _period_sort_key(snap2[month_col])
            snap2 = snap2.dropna(subset=["_period"]).sort_values("_period")

            last_period  = snap2["_period"].max()
            prev_mask    = snap2["_period"] < last_period

            if prev_mask.any():
                prev_period = snap2.loc[prev_mask, "_period"].max()
                cust_col    = _detect_col(snap2, ["customer_id", "account_id", "cust_id"]) or "customer_id"

                prev_df = snap2[snap2["_period"] == prev_period].set_index(cust_col)[mrr_col]
                curr_df = snap2[snap2["_period"] == last_period].set_index(cust_col)[mrr_col]

                # Cohort = customers present in both periods
                cohort   = prev_df.index.intersection(curr_df.index)
                start_m  = _safe_float(pd.to_numeric(prev_df.loc[cohort], errors="coerce").sum())
                end_m    = _safe_float(pd.to_numeric(curr_df.loc[cohort], errors="coerce").sum())

                if start_m > 0:
                    nrr = round(end_m / start_m, 4)
                    nrr_trend = "up" if nrr >= 1.0 else "down"
        except Exception as exc:
            log.warning("NRR calculation failed: %s", exc)

    # Emit as true percentage (e.g. 101.7 for 101.7%), NOT a ratio (1.017).
    # Frontend formatter: `baseVal >= 1 → baseVal.toFixed(1)` = "1.0%" (wrong).
    # Pre-multiply here so the formatter just appends "%" to the right number.
    nrr_pct = round(nrr * 100, 1) if nrr > 0 else 0.0
    nrr_delta_label = None
    if nrr_pct > 0:
        sign = "+" if (nrr_pct - 100) >= 0 else ""
        nrr_delta_label = f"{sign}{nrr_pct - 100:.1f}pp vs prior cohort"

    kpis.append(HeadlineKPI(
        key="nrr",
        label="NRR",
        value=nrr_pct,            # e.g. 101.7 means 101.7%
        unit="percent",
        delta=None,
        delta_label=nrr_delta_label,
        trend=nrr_trend,
    ))

    # ── 4. Win Rate ───────────────────────────────────────────────────────────
    win_rate       = 0.0
    win_rate_trend = "flat"

    sales = cache.sales_df
    if sales is not None and not sales.empty:
        wl_col = _detect_col(sales, ["win_loss_status", "deal_status", "outcome"])
        if wl_col:
            try:
                statuses = sales[wl_col].astype(str).str.lower()
                won_mask = statuses.isin({"closed_won", "won", "win", "closed won"})
                lost_mask = statuses.isin({"closed_lost", "lost", "lose", "closed lost"})
                closed   = won_mask | lost_mask
                if closed.sum() > 0:
                    win_rate = round(won_mask.sum() / closed.sum(), 4)
                    win_rate_trend = "up" if win_rate >= 0.30 else "down"
            except Exception as exc:
                log.warning("Win-rate calculation failed: %s", exc)

    # Emit as true percentage (e.g. 31.3 for 31.3%), NOT a fraction (0.313).
    kpis.append(HeadlineKPI(
        key="win_rate",
        label="Win Rate",
        value=round(win_rate * 100, 1),   # e.g. 31.3 means 31.3%
        unit="percent",
        delta=None,
        delta_label=None,
        trend=win_rate_trend,
    ))

    return kpis




# ─────────────────────────────────────────────────────────────────────────────
# REVENUE RISK SUMMARY BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def _build_revenue_risk_summary(cache) -> List[RevenueRiskItem]:
    """
    Identify the top 3 at-risk customers by ARR × churn_risk composite.

    Falls back gracefully when no churn scores are available.
    """
    risks: List[RevenueRiskItem] = []

    # Prefer engineered_df; fall back to snapshots
    for source_df, source_name in [
        (cache.engineered_df, "engineered_df"),
        (cache.snapshots_df,  "snapshots_df"),
    ]:
        if source_df is None or source_df.empty:
            continue

        cust_col  = _detect_col(source_df, ["customer_id", "account_id", "cust_id", "id"])
        name_col  = _detect_col(source_df, ["customer_name", "company_name", "account_name", "name"])
        arr_col   = _detect_col(source_df, ["arr", "annual_recurring_revenue", "mrr_at_snapshot", "mrr"])
        risk_col  = _detect_col(source_df, ["churn_risk_score", "churn_risk", "churn_probability", "predicted_churn"])
        edi_col   = _detect_col(source_df, ["edi", "engagement_decay_index"])
        sbs_col   = _detect_col(source_df, ["sbs", "support_burden_score"])
        orc_col   = _detect_col(source_df, ["orc", "onboarding_risk_coefficient"])

        if not (cust_col and (arr_col or risk_col)):
            log.debug("Risk summary: insufficient columns in %s — skipping.", source_name)
            continue

        df = source_df.copy()

        # Aggregate to one row per customer (take latest/mean)
        if cust_col and risk_col and arr_col:
            try:
                agg = {
                    risk_col: "mean",
                    arr_col:  "sum",
                }
                if edi_col: agg[edi_col] = "mean"
                if sbs_col: agg[sbs_col] = "mean"
                if orc_col: agg[orc_col] = "mean"
                if name_col: agg[name_col] = "first"

                grouped = (
                    df.groupby(cust_col)
                    .agg(agg)
                    .reset_index()
                )
            except Exception:
                grouped = df.drop_duplicates(subset=[cust_col])

            # Composite risk = risk × arr (higher ARR at risk = more urgent)
            grouped["_risk"] = pd.to_numeric(grouped[risk_col], errors="coerce").fillna(0).clip(0, 1)
            grouped["_arr"]  = pd.to_numeric(grouped[arr_col],  errors="coerce").fillna(0)
            grouped["_composite"] = grouped["_risk"] * grouped["_arr"]
            top3 = grouped.nlargest(3, "_composite")

            for _, row in top3.iterrows():
                cust_id   = str(row[cust_col])
                cust_name = str(row[name_col]) if name_col and name_col in row and pd.notna(row[name_col]) else cust_id
                arr       = _safe_float(row["_arr"])
                risk      = _safe_float(row["_risk"])

                # Determine primary risk signal (whichever KPI is most out of range)
                risk_reason, top_kpi, action = _derive_risk_narrative(
                    risk=risk,
                    edi=_safe_float(row[edi_col]) if edi_col and edi_col in row else None,
                    sbs=_safe_float(row[sbs_col]) if sbs_col and sbs_col in row else None,
                    orc=_safe_float(row[orc_col]) if orc_col and orc_col in row else None,
                    arr=arr,
                    customer_name=cust_name,
                )

                risks.append(RevenueRiskItem(
                    customer_id=cust_id,
                    customer_name=cust_name,
                    arr=round(arr, 2),
                    risk_score=round(risk, 4),
                    risk_reason=risk_reason,
                    top_kpi_signal=top_kpi,
                    recommended_action=action,
                ))

            log.debug("Revenue risk summary built from %s (%d items).", source_name, len(risks))
            break  # stop at first successful source

    if not risks:
        log.warning("Revenue risk summary: no data available — returning empty list.")

    return risks[:3]


def _derive_risk_narrative(
    risk: float,
    edi: Optional[float],
    sbs: Optional[float],
    orc: Optional[float],
    arr: float,
    customer_name: str,
) -> tuple:
    """
    Pick the most out-of-range KPI and generate a plain-English risk narrative.
    Returns (risk_reason, top_kpi_signal, recommended_action).
    """
    arr_k = round(arr / 1000, 1) if arr >= 1000 else arr

    # EDI > 0.30 is the strongest churn precursor
    if edi is not None and edi > 0.30:
        pct = round(edi * 100, 1)
        return (
            f"Engagement decay at {pct}% — feature usage dropped sharply. "
            f"Historically precedes churn by 6-8 weeks. ${arr_k}K ARR at risk.",
            "Engagement Decay Index (EDI)",
            "Schedule QBR with CSM and product champion within 5 business days",
        )

    # SBS > 0.15 = 2.3× churn likelihood
    if sbs is not None and sbs > 0.15:
        return (
            f"Support burden score {round(sbs, 2)} exceeds safe threshold (0.15). "
            f"High-ticket volume correlates with 2.3× churn likelihood. "
            f"${arr_k}K ARR exposure.",
            "Support Burden Score (SBS)",
            "Escalate to senior CSM — investigate root cause of ticket spike",
        )

    # ORC > 0.35 = onboarding risk
    if orc is not None and orc > 0.35:
        return (
            f"Onboarding risk coefficient {round(orc, 2)} — customer is not fully onboarded. "
            f"Early disengagement pattern detected. ${arr_k}K ARR at risk.",
            "Onboarding Risk Coefficient (ORC)",
            "Assign dedicated onboarding specialist and run 30-day health check",
        )

    # Generic churn risk
    risk_pct = round(risk * 100, 1)
    return (
        f"Model churn probability {risk_pct}% — composite risk signal elevated. "
        f"${arr_k}K ARR flagged for proactive outreach.",
        "Churn Risk Score",
        "Initiate proactive outreach within this week",
    )


# ─────────────────────────────────────────────────────────────────────────────
# ACTION QUEUE BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def _build_action_queue(cache, deal_response) -> List[ActionQueueItem]:
    """
    Build three Action Queue cards — one per AI Innovation.

    Innovation 1 — Deal Priority Scorer
    Innovation 2 — Competitive Churn Early Warning
    Innovation 3 — Revenue Expansion Recommender

    Each card degrades gracefully to a stub if the underlying data is absent.
    """
    queue: List[ActionQueueItem] = []

    # ── AI Innovation 1: Deal Priority Scorer ─────────────────────────────────
    if deal_response.deals:
        top_deal = deal_response.deals[0]
        queue.append(ActionQueueItem(
            innovation=AIInnovation.DEAL_PRIORITY,
            priority_rank=1,
            title=f"Close: {top_deal.deal_name}",
            description=(
                f"Priority score {top_deal.priority_score:.0f}/100. "
                f"{top_deal.top_signal}. ARR: ${top_deal.arr:,.0f}. Rep: {top_deal.rep}."
            ),
            entity_id=top_deal.deal_id,
            entity_name=top_deal.deal_name,
            metric_value=top_deal.priority_score,
            metric_label="Priority Score",
            cta_label="View Deal →",
        ))
    else:
        queue.append(ActionQueueItem(
            innovation=AIInnovation.DEAL_PRIORITY,
            priority_rank=1,
            title="No open deals scored yet",
            description="Upload a sales table to activate Deal Priority Scoring.",
            entity_id="N/A",
            entity_name="N/A",
            metric_value=0.0,
            metric_label="Priority Score",
            cta_label="Upload Sales Data →",
        ))

    # ── AI Innovation 2: Competitive Churn Early Warning ─────────────────────
    churn_item = _build_churn_action(cache)
    queue.append(churn_item)

    # ── AI Innovation 3: Revenue Expansion Recommender ───────────────────────
    expansion_item = _build_expansion_action(cache)
    queue.append(expansion_item)

    return queue


def _build_churn_action(cache) -> ActionQueueItem:
    """Extract the highest-risk competitive churn signal for the action queue."""
    # Look for competitive churn outputs (produced by CompetitiveChurnPredictor)
    for source_df in [cache.engineered_df, cache.snapshots_df]:
        if source_df is None or source_df.empty:
            continue

        risk_col  = _detect_col(source_df, ["competitive_churn_risk", "comp_churn_risk", "churn_risk_score", "churn_probability"])
        cust_col  = _detect_col(source_df, ["customer_id", "account_id", "cust_id"])
        name_col  = _detect_col(source_df, ["customer_name", "company_name", "account_name"])
        arr_col   = _detect_col(source_df, ["arr", "mrr_at_snapshot", "mrr"])

        if not (risk_col and cust_col):
            continue

        try:
            df = source_df.copy()
            df["_risk"] = pd.to_numeric(df[risk_col], errors="coerce").fillna(0).clip(0, 1)
            top_idx = df["_risk"].idxmax()
            top_row = df.loc[top_idx]
            cust_id   = str(top_row[cust_col])
            cust_name = str(top_row[name_col]) if name_col and pd.notna(top_row.get(name_col)) else cust_id
            risk      = _safe_float(top_row["_risk"])
            arr       = _safe_float(top_row[arr_col]) if arr_col else 0.0
            risk_pct  = round(risk * 100, 1)
            arr_k     = round(arr / 1000, 1)

            return ActionQueueItem(
                innovation=AIInnovation.CHURN_WARNING,
                priority_rank=2,
                title=f"Warn: {cust_name} — competitive churn risk",
                description=(
                    f"Churn probability {risk_pct}%. ${arr_k}K ARR at risk. "
                    "Engage CSM for immediate account review."
                ),
                entity_id=cust_id,
                entity_name=cust_name,
                metric_value=round(risk, 4),
                metric_label="Churn Risk",
                cta_label="View Customer →",
            )
        except Exception as exc:
            log.warning("Churn action build failed: %s", exc)
            continue

    return ActionQueueItem(
        innovation=AIInnovation.CHURN_WARNING,
        priority_rank=2,
        title="Churn Early Warning module offline",
        description="Upload snapshots + product table to activate competitive churn detection.",
        entity_id="N/A",
        entity_name="N/A",
        metric_value=0.0,
        metric_label="Churn Risk",
        cta_label="Upload Data →",
    )


def _build_expansion_action(cache) -> ActionQueueItem:
    """Extract the top expansion opportunity for the action queue."""
    for source_df in [cache.engineered_df, cache.snapshots_df]:
        if source_df is None or source_df.empty:
            continue

        exp_col  = _detect_col(source_df, ["predicted_expansion_arr", "expansion_arr", "expansion_opportunity"])
        cust_col = _detect_col(source_df, ["customer_id", "account_id", "cust_id"])
        name_col = _detect_col(source_df, ["customer_name", "company_name", "account_name"])
        clust_col = _detect_col(source_df, ["cluster", "cluster_label", "customer_cluster"])

        if not (exp_col and cust_col):
            continue

        try:
            df = source_df.copy()
            df["_exp"] = pd.to_numeric(df[exp_col], errors="coerce").fillna(0)
            top_idx   = df["_exp"].idxmax()
            top_row   = df.loc[top_idx]
            cust_id   = str(top_row[cust_col])
            cust_name = str(top_row[name_col]) if name_col and pd.notna(top_row.get(name_col)) else cust_id
            exp_arr   = _safe_float(top_row["_exp"])
            cluster   = str(top_row[clust_col]) if clust_col and pd.notna(top_row.get(clust_col)) else "Growth"
            exp_k     = round(exp_arr / 1000, 1)

            return ActionQueueItem(
                innovation=AIInnovation.EXPANSION,
                priority_rank=3,
                title=f"Expand: {cust_name} — ${exp_k}K ARR opportunity",
                description=(
                    f"Cluster: {cluster}. Predicted expansion ARR ${exp_k}K. "
                    "Run the recommended campaign playbook to capture upsell."
                ),
                entity_id=cust_id,
                entity_name=cust_name,
                metric_value=round(exp_arr, 2),
                metric_label="Expansion ARR",
                cta_label="View Expansion Plan →",
            )
        except Exception as exc:
            log.warning("Expansion action build failed: %s", exc)
            continue

    return ActionQueueItem(
        innovation=AIInnovation.EXPANSION,
        priority_rank=3,
        title="Expansion Recommender not yet available",
        description="Upload all 5 data tables to unlock the Revenue Expansion Recommender.",
        entity_id="N/A",
        entity_name="N/A",
        metric_value=0.0,
        metric_label="Expansion ARR",
        cta_label="Upload Attribution Data →",
    )


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/revops/kpis",
    response_model=RevOpsKPIResponse,
    summary="Portfolio RevOps KPIs",
    description=(
        "Returns portfolio-wide averages for the 7 core RevOps KPIs: "
        "FAV, RER, EDI, SBS, ORC, CQS, RSFS. "
        "Always returns HTTP 200; missing tables yield LOW-confidence KPIs with value 0.0."
    ),
)
async def get_revops_kpis() -> RevOpsKPIResponse:
    log.info("GET /api/v2/revops/kpis called")

    cache = predicto_cache_v2
    if not cache.is_ready and cache.ingestion_error:
        log.error("Cache in error state: %s", cache.ingestion_error)
        raise HTTPException(
            status_code=503,
            detail=(
                f"Data pipeline is unavailable: {cache.ingestion_error}. "
                "Please re-ingest your data."
            ),
        )

    try:
        result = calculate_revops_kpis()
        log.info(
            "RevOps KPIs returned: %d KPIs, health=%d, tables=%s",
            len(result.kpis), result.overall_health_score, result.tables_loaded,
        )
        return result
    except Exception as exc:
        log.error("Unexpected error in /revops/kpis: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="KPI calculation failed unexpectedly. Check server logs.",
        )


@router.get(
    "/intelligence/hub",
    response_model=IntelligenceHubResponse,
    summary="Intelligence Hub — Executive Dashboard",
    description=(
        "Master endpoint powering the Intelligence Hub tab. Returns: "
        "Headline KPIs (MRR, Churn Risk, Expansion ARR), "
        "Revenue Risk Summary (top 3 at-risk customers), and "
        "Action Queue (3 cards, one per AI Innovation). "
        "Degrades gracefully when tables are missing."
    ),
)
async def get_intelligence_hub() -> IntelligenceHubResponse:
    log.info("GET /api/v2/intelligence/hub called")

    cache = predicto_cache_v2

    if not cache.is_ready and cache.ingestion_error:
        log.error("Cache in error state: %s", cache.ingestion_error)
        raise HTTPException(
            status_code=503,
            detail=(
                f"Data pipeline unavailable: {cache.ingestion_error}. "
                "Re-ingest data to restore the Intelligence Hub."
            ),
        )

    try:
        # ── Compute sub-components ────────────────────────────────────────────
        log.debug("Building headline KPIs...")
        headline_kpis = _build_headline_kpis(cache)

        log.debug("Building revenue risk summary...")
        risk_summary = _build_revenue_risk_summary(cache)

        log.debug("Scoring deals for action queue...")
        deal_response = score_deals()

        log.debug("Building action queue...")
        action_queue = _build_action_queue(cache, deal_response)

        # ── Determine overall availability ────────────────────────────────────
        n_tables = len(cache.tables_loaded)
        if n_tables == 0:
            availability = FeatureAvailability.OFFLINE
        elif n_tables >= 3:
            availability = FeatureAvailability.ACTIVE
        else:
            availability = FeatureAvailability.PARTIAL

        is_fast_mode = cache.active_model == "lite"

        response = IntelligenceHubResponse(
            headline_kpis=headline_kpis,
            revenue_risk_summary=risk_summary,
            action_queue=action_queue,
            overall_health_score=cache.health_score,
            active_model=cache.active_model,
            tables_loaded=cache.tables_loaded,
            is_fast_mode=is_fast_mode,
            data_availability=availability,
            root_cause_narrative=cache.root_cause_narrative,
        )

        log.info(
            "Intelligence Hub response assembled: health=%d, tables=%s, "
            "risks=%d, actions=%d, fast_mode=%s",
            cache.health_score,
            cache.tables_loaded,
            len(risk_summary),
            len(action_queue),
            is_fast_mode,
        )

        return response

    except HTTPException:
        raise
    except Exception as exc:
        log.error("Unexpected error in /intelligence/hub: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Intelligence Hub assembly failed. Check server logs.",
        )
