"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/services/rep_playbook_service.py                                       ║
║  Predicto V2 — Rep-Level Win-Rate Decomposition & Playbook Generator       ║
║                (Feature 03)                                                 ║
║                                                                              ║
║  Reads exclusively from `predicto_cache_v2`.  External call: Groq API      ║
║  (Llama-3.3-70b-versatile) with full graceful degradation.                 ║
║                                                                              ║
║  Degradation contract:                                                       ║
║    OFFLINE   — sales_df absent / empty.                                     ║
║    PARTIAL   — engineered_df or attribution_df absent; RSFS / routing      ║
║                skipped gracefully.                                           ║
║    ACTIVE    — all tables present; Llama playbooks generated.               ║
║    fallback  — Groq API unreachable; deterministic playbook template used.  ║
║                                                                              ║
║  Zero-crash guarantee: every numeric output defaults to 0.0.                ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging
import os
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from app.core.cache import predicto_cache_v2  # type: ignore[import]
from app.models.response_models import ConfidenceLevel, FeatureAvailability
from app.models.response_models import (
    PlaybookStatus,
    RepPlaybookRecord,
    RepPlaybookResponse,
    RepRoutingEntry,
    RepSegmentBreakdown,
)

log = logging.getLogger("predicto.v2.rep_playbook")

# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

COL_DEAL_ID       = "deal_id"
COL_CUSTOMER_ID   = "customer_id"
COL_REP_ID        = "rep_id"
COL_REP_NAME      = "rep_name"
COL_SEGMENT       = "segment"
COL_ARR           = "arr"
COL_DISCOUNT      = "discount_pct"
COL_WIN_LOSS      = "win_loss_status"
COL_DAYS_PIPELINE = "days_in_pipeline"
COL_CAMPAIGN_ID   = "campaign_id"
COL_CAMPAIGN_TYPE = "campaign_type"
COL_RSFS          = "RSFS"
COL_TOUCHPOINT    = "touchpoint_order"

WIN_STATUS  = "Won"
LOSS_STATUS = "Lost"

# Minimum days-in-pipeline denominator to avoid division by zero
MIN_PIPELINE_DAYS = 1.0

# Groq model identifier
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_API_TIMEOUT = 10  # seconds

# Max reps to generate LLM playbooks for (controls latency)
MAX_LLM_REPS = 10


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def compute_rep_playbooks() -> RepPlaybookResponse:
    """
    Main entry point for Feature 03.

    Steps:
      1. Validate cache readiness.
      2. Build rep × segment win-rate and velocity matrix from sales_df.
      3. Enrich with RSFS from engineered_df (graceful skip if absent).
      4. Build campaign routing matrix from attribution_df (graceful skip if absent).
      5. Generate per-rep Llama-3.3 playbooks via Groq SDK (fallback on failure).
      6. Assemble and return RepPlaybookResponse.
    """

    warnings: List[str] = []

    # ── Step 1: Validate cache ────────────────────────────────────────────────
    availability, warnings = _assess_cache_readiness(warnings)
    if availability == FeatureAvailability.OFFLINE:
        return _offline_response(warnings)

    # ── Step 2: Build win-rate matrix ─────────────────────────────────────────
    rep_stats, portfolio_warnings = _build_rep_win_matrix()
    warnings.extend(portfolio_warnings)

    if not rep_stats:
        warnings.append("No rep statistics could be computed — returning OFFLINE.")
        return _offline_response(warnings)

    # ── Step 3: Enrich with RSFS ──────────────────────────────────────────────
    rep_stats, rsfs_warnings = _enrich_with_rsfs(rep_stats)
    warnings.extend(rsfs_warnings)

    # ── Step 4: Build campaign routing matrix ─────────────────────────────────
    routing_matrix, rep_campaign_map, routing_warnings = _build_routing_matrix(rep_stats)
    warnings.extend(routing_warnings)

    # ── Step 5: Generate playbooks ────────────────────────────────────────────
    rep_records, llm_status, playbook_warnings = _generate_playbooks(
        rep_stats, rep_campaign_map, routing_matrix
    )
    warnings.extend(playbook_warnings)

    # ── Step 6: Assemble response ─────────────────────────────────────────────
    sales_df     = predicto_cache_v2.sales_df
    total_won    = int((sales_df[COL_WIN_LOSS] == WIN_STATUS).sum()) if sales_df is not None else 0
    total_closed = int(sales_df[COL_WIN_LOSS].isin([WIN_STATUS, LOSS_STATUS]).sum()) if sales_df is not None else 0
    portfolio_wr = round(total_won / total_closed, 4) if total_closed > 0 else 0.0

    # Top performer by velocity-adjusted win score
    if rep_records:
        top_rep = max(
            rep_records,
            key=lambda r: max(
                (s.velocity_adjusted_win_score for s in r.segment_breakdown), default=0.0
            ),
        )
        top_rep_id   = top_rep.rep_id
        top_rep_name = top_rep.rep_name
    else:
        top_rep_id = top_rep_name = None

    # Sort by overall_win_rate descending
    rep_records.sort(key=lambda r: r.overall_win_rate, reverse=True)

    n_reps = len(rep_records)
    overall_confidence = _derive_confidence(n_reps, availability)

    return RepPlaybookResponse(
        rep_playbooks=rep_records,
        routing_matrix=routing_matrix,
        total_reps=n_reps,
        portfolio_win_rate=portfolio_wr,
        top_performing_rep_id=top_rep_id,
        top_performing_rep_name=top_rep_name,
        llm_status=llm_status,
        data_availability=availability,
        overall_confidence=overall_confidence,
        missing_columns=_detect_missing_columns(),
        warnings=warnings,
    )


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — CACHE READINESS
# ─────────────────────────────────────────────────────────────────────────────

def _assess_cache_readiness(
    warnings: List[str],
) -> Tuple[FeatureAvailability, List[str]]:
    cache = predicto_cache_v2

    if not cache.is_ready:
        warnings.append("Cache not ready — ingestion has not completed.")
        return FeatureAvailability.OFFLINE, warnings

    if cache.sales_df is None or cache.sales_df.empty:
        warnings.append("sales_df is absent — rep playbook requires deal history.")
        return FeatureAvailability.OFFLINE, warnings

    if cache.engineered_df is None or cache.engineered_df.empty:
        warnings.append("engineered_df absent — RSFS enrichment will be skipped.")

    if cache.attribution_df is None or cache.attribution_df.empty:
        warnings.append("attribution_df absent — campaign routing matrix will be skipped.")

    return FeatureAvailability.ACTIVE, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — WIN-RATE MATRIX
# ─────────────────────────────────────────────────────────────────────────────

def _build_rep_win_matrix() -> Tuple[Dict[str, dict], List[str]]:
    """
    Groups sales_df by rep and segment to produce velocity-adjusted win scores.

    Returns:
        rep_stats : {rep_id → {rep_name, segment_breakdowns, overall win stats}}
        warnings  : diagnostic messages
    """
    warnings:  List[str] = []
    sales_df = predicto_cache_v2.sales_df.copy()

    # Normalise required columns with safe fallbacks
    if COL_REP_ID not in sales_df.columns:
        if COL_REP_NAME in sales_df.columns:
            sales_df[COL_REP_ID] = sales_df[COL_REP_NAME]
            warnings.append("rep_id absent — using rep_name as rep_id.")
        else:
            warnings.append("Neither rep_id nor rep_name found in sales_df — returning empty.")
            return {}, warnings

    if COL_REP_NAME not in sales_df.columns:
        sales_df[COL_REP_NAME] = sales_df[COL_REP_ID]

    if COL_SEGMENT not in sales_df.columns:
        sales_df[COL_SEGMENT] = "Unknown"
        warnings.append("segment column absent — all deals labelled 'Unknown'.")

    if COL_WIN_LOSS not in sales_df.columns:
        warnings.append("win_loss_status absent — cannot compute win rates. Returning empty.")
        return {}, warnings

    if COL_DAYS_PIPELINE not in sales_df.columns:
        sales_df[COL_DAYS_PIPELINE] = 30
        warnings.append("days_in_pipeline absent — defaulting to 30 days.")

    if COL_ARR not in sales_df.columns:
        sales_df[COL_ARR] = 0.0
        warnings.append("arr absent in sales_df — ARR metrics will be 0.")

    if COL_DISCOUNT not in sales_df.columns:
        sales_df[COL_DISCOUNT] = 0.0

    # Only consider Won + Lost for win rate (exclude Pipeline)
    closed_df = sales_df[sales_df[COL_WIN_LOSS].isin([WIN_STATUS, LOSS_STATUS])].copy()

    rep_stats: Dict[str, dict] = {}

    for rep_id, rep_group in sales_df.groupby(COL_REP_ID):
        rep_id_str   = str(rep_id)
        rep_name_str = str(rep_group[COL_REP_NAME].iloc[0])
        closed_rep   = closed_df[closed_df[COL_REP_ID] == rep_id]

        # Per-segment breakdown
        segment_breakdowns: List[RepSegmentBreakdown] = []
        for seg, seg_group in rep_group.groupby(COL_SEGMENT):
            closed_seg  = closed_rep[closed_rep[COL_SEGMENT] == seg]
            won_seg     = closed_seg[closed_seg[COL_WIN_LOSS] == WIN_STATUS]
            n_closed    = len(closed_seg)
            n_won       = len(won_seg)
            win_rate    = n_won / n_closed if n_closed > 0 else 0.0
            mean_arr    = float(won_seg[COL_ARR].mean()) if not won_seg.empty else 0.0
            mean_disc   = float(seg_group[COL_DISCOUNT].mean())
            mean_days   = float(seg_group[COL_DAYS_PIPELINE].mean())
            vel_score   = win_rate / max(mean_days, MIN_PIPELINE_DAYS)

            segment_breakdowns.append(
                RepSegmentBreakdown(
                    segment=str(seg),
                    total_deals=len(seg_group),
                    won_deals=n_won,
                    win_rate=round(win_rate, 4),
                    mean_arr=round(mean_arr, 2),
                    mean_discount_pct=round(mean_disc, 4),
                    mean_days_in_pipeline=round(mean_days, 1),
                    velocity_adjusted_win_score=round(vel_score, 6),
                )
            )

        # Overall win rate across all segments
        closed_all = closed_rep
        won_all    = closed_all[closed_all[COL_WIN_LOSS] == WIN_STATUS]
        overall_wr = len(won_all) / len(closed_all) if len(closed_all) > 0 else 0.0

        rep_stats[rep_id_str] = {
            "rep_id":             rep_id_str,
            "rep_name":           rep_name_str,
            "total_deals":        len(rep_group),
            "overall_win_rate":   round(overall_wr, 4),
            "segment_breakdown":  segment_breakdowns,
            "mean_rsfs":          0.0,   # filled in Step 3
            "customer_ids":       rep_group[COL_CUSTOMER_ID].dropna().unique().tolist()
                                  if COL_CUSTOMER_ID in rep_group.columns else [],
            "deal_ids":           rep_group[COL_DEAL_ID].dropna().unique().tolist()
                                  if COL_DEAL_ID in rep_group.columns else [],
        }

    return rep_stats, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — RSFS ENRICHMENT
# ─────────────────────────────────────────────────────────────────────────────

def _enrich_with_rsfs(
    rep_stats: Dict[str, dict],
) -> Tuple[Dict[str, dict], List[str]]:
    """Joins mean RSFS from engineered_df per rep's customer base."""
    warnings: List[str] = []
    eng_df = predicto_cache_v2.engineered_df

    if eng_df is None or COL_RSFS not in eng_df.columns:
        warnings.append("RSFS column absent from engineered_df — skipping enrichment.")
        return rep_stats, warnings

    for rep_id, stats in rep_stats.items():
        cids = stats.get("customer_ids", [])
        if not cids:
            continue
        mask = eng_df["customer_id"].isin(cids)
        if mask.any():
            stats["mean_rsfs"] = round(float(eng_df.loc[mask, COL_RSFS].mean()), 4)

    return rep_stats, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — CAMPAIGN ROUTING MATRIX
# ─────────────────────────────────────────────────────────────────────────────

def _build_routing_matrix(
    rep_stats: Dict[str, dict],
) -> Tuple[List[RepRoutingEntry], Dict[str, List[str]], List[str]]:
    """
    Builds deal routing matrix and per-rep top campaign types from attribution_df.

    Returns:
        routing_matrix   : List[RepRoutingEntry] sorted by routing_score desc
        rep_campaign_map : {rep_id → [top campaign_type strings]}
        warnings
    """
    warnings: List[str]          = []
    routing_matrix: List[RepRoutingEntry] = []
    rep_campaign_map: Dict[str, List[str]] = {rid: [] for rid in rep_stats}

    attr_df   = predicto_cache_v2.attribution_df
    sales_df  = predicto_cache_v2.sales_df

    if attr_df is None or attr_df.empty or sales_df is None or sales_df.empty:
        warnings.append("attribution_df or sales_df absent — routing matrix skipped.")
        # Still build routing entries from segment win rates
        for rep_id, stats in rep_stats.items():
            if not stats["segment_breakdown"]:
                continue
            best_seg = max(stats["segment_breakdown"], key=lambda s: s.velocity_adjusted_win_score)
            # Normalise RSFS (0-1) × velocity score (0-some small float) × 1000 → readable score
            routing_score = round(
                best_seg.velocity_adjusted_win_score * 1000 * (1.0 + stats["mean_rsfs"]), 2
            )
            routing_matrix.append(
                RepRoutingEntry(
                    rep_id=rep_id,
                    rep_name=stats["rep_name"],
                    recommended_segment=best_seg.segment,
                    routing_score=routing_score,
                    top_campaign_types=[],
                )
            )
        routing_matrix.sort(key=lambda r: r.routing_score, reverse=True)
        return routing_matrix, rep_campaign_map, warnings

    # Join attribution_df with sales_df on deal_id to get rep_id
    try:
        attr_enriched = attr_df.merge(
            sales_df[[COL_DEAL_ID, COL_REP_ID, COL_WIN_LOSS]].drop_duplicates(COL_DEAL_ID),
            on=COL_DEAL_ID,
            how="left",
        )
    except Exception as exc:
        warnings.append(f"attribution_df × sales_df merge failed: {exc} — routing skipped.")
        return routing_matrix, rep_campaign_map, warnings

    for rep_id, stats in rep_stats.items():
        rep_attr = attr_enriched[attr_enriched[COL_REP_ID] == rep_id]
        if rep_attr.empty or COL_CAMPAIGN_TYPE not in rep_attr.columns:
            continue

        # Won deals only for campaign affinity
        won_attr = rep_attr[rep_attr[COL_WIN_LOSS] == WIN_STATUS]
        if not won_attr.empty:
            top_camp_types = (
                won_attr[COL_CAMPAIGN_TYPE]
                .value_counts()
                .head(3)
                .index.tolist()
            )
        else:
            top_camp_types = []

        rep_campaign_map[rep_id] = top_camp_types

        if not stats["segment_breakdown"]:
            continue

        best_seg      = max(stats["segment_breakdown"], key=lambda s: s.velocity_adjusted_win_score)
        routing_score = round(
            best_seg.velocity_adjusted_win_score * 1000 * (1.0 + stats["mean_rsfs"]), 2
        )
        routing_matrix.append(
            RepRoutingEntry(
                rep_id=rep_id,
                rep_name=stats["rep_name"],
                recommended_segment=best_seg.segment,
                routing_score=routing_score,
                top_campaign_types=top_camp_types,
            )
        )

    routing_matrix.sort(key=lambda r: r.routing_score, reverse=True)
    return routing_matrix, rep_campaign_map, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — PLAYBOOK GENERATION (GROQ / LLAMA-3.3)
# ─────────────────────────────────────────────────────────────────────────────

def _generate_playbooks(
    rep_stats: Dict[str, dict],
    rep_campaign_map: Dict[str, List[str]],
    routing_matrix: List[RepRoutingEntry],
) -> Tuple[List[RepPlaybookRecord], PlaybookStatus, List[str]]:
    """
    Generates RepPlaybookRecord for every rep.
    Attempts Llama-3.3 via Groq for each rep; degrades to deterministic template on failure.
    """
    warnings:       List[str]             = []
    rep_records:    List[RepPlaybookRecord] = []
    groq_available: Optional[bool]         = None   # None = not yet tried

    routing_by_rep = {r.rep_id: r for r in routing_matrix}

    # Sort reps: top win-rate first for LLM budget allocation
    sorted_rep_ids = sorted(
        rep_stats.keys(),
        key=lambda r: rep_stats[r]["overall_win_rate"],
        reverse=True,
    )

    llm_used   = False
    llm_failed = False

    for i, rep_id in enumerate(sorted_rep_ids):
        stats     = rep_stats[rep_id]
        top_camps = rep_campaign_map.get(rep_id, [])
        routing   = routing_by_rep.get(rep_id)

        # Attempt LLM playbook only for top MAX_LLM_REPS reps
        if i < MAX_LLM_REPS and groq_available is not False:
            playbook_text, pb_status = _call_groq_playbook(
                rep_id=rep_id,
                rep_name=stats["rep_name"],
                overall_win_rate=stats["overall_win_rate"],
                segment_breakdown=stats["segment_breakdown"],
                mean_rsfs=stats["mean_rsfs"],
                top_campaign_types=top_camps,
            )
            if pb_status == PlaybookStatus.ACTIVE:
                groq_available = True
                llm_used       = True
            else:
                groq_available = False   # stop trying for subsequent reps
                llm_failed     = True
                if i == 0:
                    warnings.append("Groq API unreachable — all playbooks using deterministic fallback.")
        else:
            # Deterministic fallback for reps beyond LLM budget or when Groq is down
            playbook_text, pb_status = _deterministic_playbook(
                rep_id=rep_id,
                rep_name=stats["rep_name"],
                overall_win_rate=stats["overall_win_rate"],
                segment_breakdown=stats["segment_breakdown"],
                mean_rsfs=stats["mean_rsfs"],
                top_campaign_types=top_camps,
            )

        rep_records.append(
            RepPlaybookRecord(
                rep_id=rep_id,
                rep_name=stats["rep_name"],
                total_deals=stats["total_deals"],
                overall_win_rate=stats["overall_win_rate"],
                segment_breakdown=stats["segment_breakdown"],
                mean_rsfs=stats["mean_rsfs"],
                routing_recommendation=routing,
                playbook_text=playbook_text,
                playbook_status=pb_status,
            )
        )

    # Determine top-level LLM status
    if llm_used:
        llm_status = PlaybookStatus.ACTIVE
    elif not rep_records:
        llm_status = PlaybookStatus.OFFLINE
    else:
        llm_status = PlaybookStatus.FALLBACK

    return rep_records, llm_status, warnings


def _call_groq_playbook(
    rep_id: str,
    rep_name: str,
    overall_win_rate: float,
    segment_breakdown: List[RepSegmentBreakdown],
    mean_rsfs: float,
    top_campaign_types: List[str],
) -> Tuple[str, PlaybookStatus]:
    """
    Calls Groq Llama-3.3 to generate a personalised playbook for one rep.

    Graceful degradation contract:
    - Any exception (connection error, timeout, auth failure, unexpected schema)
      returns (deterministic_fallback_string, PlaybookStatus.fallback).
    - Never raises; never returns a 500.
    """
    try:
        from groq import Groq  # type: ignore[import]
    except ImportError:
        log.warning("groq SDK not installed — using deterministic fallback.")
        return _deterministic_playbook(
            rep_id, rep_name, overall_win_rate, segment_breakdown, mean_rsfs, top_campaign_types
        )

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        log.warning("GROQ_API_KEY not set — using deterministic fallback.")
        return _deterministic_playbook(
            rep_id, rep_name, overall_win_rate, segment_breakdown, mean_rsfs, top_campaign_types
        )

    # Build a concise data summary for the prompt
    seg_summary = "; ".join(
        f"{s.segment}: win_rate={s.win_rate:.1%}, velocity={s.velocity_adjusted_win_score:.5f}, "
        f"mean_arr=${s.mean_arr:,.0f}, avg_discount={s.mean_discount_pct:.1%}"
        for s in segment_breakdown
    )
    camp_str = ", ".join(top_campaign_types) if top_campaign_types else "None identified"

    prompt = (
        f"You are a B2B RevOps coach generating a concise sales playbook.\n\n"
        f"Rep: {rep_name} (ID: {rep_id})\n"
        f"Overall Win Rate: {overall_win_rate:.1%}\n"
        f"Revenue Sensitivity to Feature Set (RSFS): {mean_rsfs:.2f}\n"
        f"Segment Performance: {seg_summary}\n"
        f"Top Campaign Types Preceding Wins: {camp_str}\n\n"
        f"Generate a 3-paragraph personalised playbook:\n"
        f"1. Strengths and best-fit segments.\n"
        f"2. Specific tactics to improve win rate in weaker segments.\n"
        f"3. Campaign sequencing recommendations based on top campaign types.\n"
        f"Be direct, data-driven, and actionable. Max 200 words."
    )

    try:
        client   = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=400,
            temperature=0.3,
            timeout=GROQ_API_TIMEOUT,
        )
        playbook_text = response.choices[0].message.content.strip()
        log.info("Llama-3.3 playbook generated for rep %s (%d chars).", rep_id, len(playbook_text))
        return playbook_text, PlaybookStatus.ACTIVE

    except Exception as exc:
        log.warning("Groq API call failed for rep %s: %s — using deterministic fallback.", rep_id, exc)
        return _deterministic_playbook(
            rep_id, rep_name, overall_win_rate, segment_breakdown, mean_rsfs, top_campaign_types
        )


def _deterministic_playbook(
    rep_id: str,
    rep_name: str,
    overall_win_rate: float,
    segment_breakdown: List[RepSegmentBreakdown],
    mean_rsfs: float,
    top_campaign_types: List[str],
) -> Tuple[str, PlaybookStatus]:
    """
    Deterministic template playbook.  Always succeeds; never raises.
    Used when Groq API is unavailable or LLM budget exhausted.
    """
    try:
        best_seg = max(segment_breakdown, key=lambda s: s.velocity_adjusted_win_score) if segment_breakdown else None
        worst_seg = min(segment_breakdown, key=lambda s: s.win_rate) if segment_breakdown else None
        camp_str  = ", ".join(top_campaign_types[:3]) if top_campaign_types else "no campaigns identified"

        strength_line = (
            f"{rep_name} achieves a {overall_win_rate:.1%} overall win rate"
            + (f", with strongest velocity in {best_seg.segment} deals" if best_seg else "")
            + "."
        )
        improvement_line = (
            f"Focus improvement efforts on "
            + (f"{worst_seg.segment} deals (current win rate: {worst_seg.win_rate:.1%})" if worst_seg else "lower-performing segments")
            + f" by reducing average discount depth and shortening pipeline cycles."
        )
        campaign_line = (
            f"Prioritise campaign sequences anchored by {camp_str} to replicate "
            f"the high-conversion patterns seen in top-performing deals. "
            f"RSFS score of {mean_rsfs:.2f} suggests {'strong' if mean_rsfs >= 0.5 else 'moderate'} "
            f"feature-to-revenue sensitivity — emphasise product capability demonstrations."
        )

        playbook_text = f"{strength_line}\n\n{improvement_line}\n\n{campaign_line}"
    except Exception:
        playbook_text = (
            f"Playbook for {rep_name}: Focus on top-performing segments, "
            f"reduce discount depth, and align campaign sequencing with proven win patterns."
        )

    return playbook_text, PlaybookStatus.FALLBACK


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _detect_missing_columns() -> List[str]:
    missing: List[str] = []
    sales_df = predicto_cache_v2.sales_df
    if sales_df is None:
        return [COL_DEAL_ID, COL_REP_ID, COL_SEGMENT, COL_ARR, COL_DISCOUNT,
                COL_WIN_LOSS, COL_DAYS_PIPELINE]
    for col in [COL_DEAL_ID, COL_REP_ID, COL_REP_NAME, COL_SEGMENT, COL_ARR,
                COL_DISCOUNT, COL_WIN_LOSS, COL_DAYS_PIPELINE]:
        if col not in sales_df.columns:
            missing.append(col)
    return missing


def _derive_confidence(n_reps: int, availability: FeatureAvailability) -> ConfidenceLevel:
    if availability == FeatureAvailability.OFFLINE:
        return ConfidenceLevel.LOW
    if availability == FeatureAvailability.PARTIAL or n_reps < 5:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.HIGH


def _offline_response(warnings: List[str]) -> RepPlaybookResponse:
    return RepPlaybookResponse(
        rep_playbooks=[],
        routing_matrix=[],
        total_reps=0,
        portfolio_win_rate=0.0,
        top_performing_rep_id=None,
        top_performing_rep_name=None,
        llm_status=PlaybookStatus.OFFLINE,
        data_availability=FeatureAvailability.OFFLINE,
        overall_confidence=ConfidenceLevel.LOW,
        missing_columns=_detect_missing_columns(),
        warnings=warnings,
    )
