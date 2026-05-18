"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/services/roi_decomposer_service.py                                     ║
║  Predicto V2 — Multi-Touch Campaign ROI Decomposer (Feature 05)            ║
║                                                                              ║
║  Reads exclusively from `predicto_cache_v2`.  No I/O, no external calls.   ║
║                                                                              ║
║  Degradation contract:                                                       ║
║    OFFLINE  — attribution_df or sales_df absent / empty.                   ║
║    PARTIAL  — marketing_df absent; ROI computed with cost = 0 (Shapley     ║
║               values still valid).                                           ║
║    ACTIVE   — all three tables present; full Monte Carlo Shapley + golden  ║
║               sequence EV ranking computed.                                  ║
║                                                                              ║
║  Shapley estimation: Monte Carlo approximation, n=500 permutations.        ║
║  Golden sequences:   EV = Win Rate × Mean ARR of Won Deals.                ║
║  Zero-crash guarantee: every numeric output defaults to 0.0.                ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging
from itertools import permutations
from typing import Dict, List, Optional, Set, Tuple

import numpy as np
import pandas as pd

from app.core.cache import predicto_cache_v2  # type: ignore[import]
from app.models.response_models import ConfidenceLevel, FeatureAvailability
from app.models.response_models import (
    CampaignROIResponse,
    CampaignShapleyRecord,
    GoldenSequenceRecord,
    ROIStatus,
)

log = logging.getLogger("predicto.v2.roi_decomposer")

# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

COL_DEAL_ID        = "deal_id"
COL_CAMPAIGN_ID    = "campaign_id"
COL_CAMPAIGN_TYPE  = "campaign_type"
COL_TOUCHPOINT_ORD = "touchpoint_order"
COL_ARR            = "arr"
COL_WIN_LOSS       = "win_loss_status"
COL_SEGMENT        = "segment"
COL_COST           = "cost"

WIN_STATUS = "Won"

# Monte Carlo permutations (sub-second for typical B2B deal volumes ≤ 10k)
MONTE_CARLO_N = 500

# Random seed for reproducibility
MC_SEED = 42

# Maximum sequence length to consider for golden sequences
MAX_SEQ_LENGTH = 4

# Top N golden sequences to return
TOP_GOLDEN_SEQUENCES = 10

# Minimum deals for a sequence to qualify as a golden sequence candidate
MIN_DEALS_FOR_SEQUENCE = 2


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def compute_campaign_roi() -> CampaignROIResponse:
    """
    Main entry point for Feature 05.

    Steps:
      1. Validate cache readiness.
      2. Build deal × campaign touch sequences from attribution_df + sales_df.
      3. Run Monte Carlo Shapley estimation (n=500) per campaign.
      4. Join campaign costs from marketing_df; compute ROI (graceful skip if absent).
      5. Identify golden sequences via EV = Win Rate × Mean ARR of Won Deals.
      6. Assemble and return CampaignROIResponse.
    """

    warnings: List[str] = []

    # ── Step 1: Validate cache ────────────────────────────────────────────────
    roi_status, availability, warnings = _assess_cache_readiness(warnings)
    if roi_status == ROIStatus.OFFLINE:
        return _offline_response(warnings)

    # ── Step 2: Build deal touch sequences ────────────────────────────────────
    deal_sequences, campaign_meta, seq_warnings = _build_deal_sequences()
    warnings.extend(seq_warnings)

    if not deal_sequences:
        warnings.append("No deal touch sequences could be built — returning OFFLINE.")
        return _offline_response(warnings)

    # ── Step 3: Monte Carlo Shapley estimation ────────────────────────────────
    shapley_values, shapley_warnings = _monte_carlo_shapley(deal_sequences, campaign_meta)
    warnings.extend(shapley_warnings)

    # ── Step 4: Enrich with campaign costs + ROI ──────────────────────────────
    campaign_records, cost_warnings = _enrich_with_costs(shapley_values, campaign_meta)
    warnings.extend(cost_warnings)

    # ── Step 5: Identify golden sequences ────────────────────────────────────
    golden_sequences, gs_warnings = _identify_golden_sequences(deal_sequences)
    warnings.extend(gs_warnings)

    # ── Step 6: Assemble response ─────────────────────────────────────────────
    # Sort campaign_records by shapley_value descending
    campaign_records.sort(key=lambda c: c.shapley_value, reverse=True)

    total_attributed  = sum(c.shapley_value for c in campaign_records)
    total_cost        = sum(c.total_cost for c in campaign_records)
    portfolio_roi     = (
        (total_attributed - total_cost) / total_cost
        if total_cost > 0.0
        else 0.0
    )

    top_camp = campaign_records[0] if campaign_records else None

    # Derive confidence
    n_deals = len(deal_sequences)
    overall_confidence = _derive_confidence(n_deals, roi_status)

    return CampaignROIResponse(
        campaign_attributions=campaign_records,
        golden_sequences=golden_sequences,
        total_campaigns_analysed=len(campaign_records),
        total_attributed_arr=round(total_attributed, 2),
        total_marketing_cost=round(total_cost, 2),
        portfolio_roi=round(portfolio_roi, 4),
        monte_carlo_permutations=MONTE_CARLO_N,
        top_campaign_id=top_camp.campaign_id if top_camp else None,
        top_campaign_type=top_camp.campaign_type if top_camp else None,
        roi_status=roi_status,
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
) -> Tuple[ROIStatus, FeatureAvailability, List[str]]:
    cache = predicto_cache_v2

    if not cache.is_ready:
        warnings.append("Cache not ready — ingestion has not completed.")
        return ROIStatus.OFFLINE, FeatureAvailability.OFFLINE, warnings

    if cache.attribution_df is None or cache.attribution_df.empty:
        warnings.append("attribution_df is absent — campaign ROI requires touchpoint data.")
        return ROIStatus.OFFLINE, FeatureAvailability.OFFLINE, warnings

    if cache.sales_df is None or cache.sales_df.empty:
        warnings.append("sales_df is absent — campaign ROI requires deal outcomes.")
        return ROIStatus.OFFLINE, FeatureAvailability.OFFLINE, warnings

    if cache.marketing_df is None or cache.marketing_df.empty:
        warnings.append("marketing_df absent — ROI will use cost = 0 for all campaigns.")
        return ROIStatus.PARTIAL, FeatureAvailability.PARTIAL, warnings

    return ROIStatus.ACTIVE, FeatureAvailability.ACTIVE, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — BUILD DEAL TOUCH SEQUENCES
# ─────────────────────────────────────────────────────────────────────────────

def _build_deal_sequences() -> Tuple[
    Dict[str, dict],     # {deal_id → {campaigns: List[str], won: bool, arr: float, segment: str}}
    Dict[str, dict],     # {campaign_id → {campaign_type, touch_count, deal_set}}
    List[str],           # warnings
]:
    """
    Joins attribution_df with sales_df to produce per-deal ordered campaign sequences.

    deal_sequences:
        {deal_id → {campaigns: ordered List[campaign_id], won: bool, arr: float, segment: str}}

    campaign_meta:
        {campaign_id → {campaign_type: str, touch_count: int, deals: Set[str]}}
    """
    warnings: List[str] = []
    attr_df  = predicto_cache_v2.attribution_df.copy()
    sales_df = predicto_cache_v2.sales_df.copy()

    # Validate required columns in attribution_df
    required_attr = [COL_DEAL_ID, COL_CAMPAIGN_ID]
    missing_attr  = [c for c in required_attr if c not in attr_df.columns]
    if missing_attr:
        warnings.append(f"attribution_df missing columns: {missing_attr}")
        return {}, {}, warnings

    # Validate required columns in sales_df
    if COL_DEAL_ID not in sales_df.columns:
        warnings.append("deal_id absent from sales_df — cannot build sequences.")
        return {}, {}, warnings

    if COL_WIN_LOSS not in sales_df.columns:
        sales_df[COL_WIN_LOSS] = "Unknown"
        warnings.append("win_loss_status absent — all deals treated as Unknown.")

    if COL_ARR not in sales_df.columns:
        sales_df[COL_ARR] = 0.0
        warnings.append("arr absent from sales_df — ARR defaulted to 0.")

    if COL_SEGMENT not in sales_df.columns:
        sales_df[COL_SEGMENT] = "Unknown"

    # Sort by touchpoint_order if present, else by insertion order
    if COL_TOUCHPOINT_ORD in attr_df.columns:
        attr_df = attr_df.sort_values([COL_DEAL_ID, COL_TOUCHPOINT_ORD])
    else:
        warnings.append("touchpoint_order absent — campaigns ordered by row position.")

    # Build deal_sequences
    deal_sequences: Dict[str, dict] = {}
    for deal_id, grp in attr_df.groupby(COL_DEAL_ID):
        deal_id_str = str(deal_id)
        # Ordered list of campaign_ids for this deal
        campaigns = grp[COL_CAMPAIGN_ID].astype(str).tolist()

        # Lookup deal outcome from sales_df
        deal_row = sales_df[sales_df[COL_DEAL_ID] == deal_id]
        won      = bool((deal_row[COL_WIN_LOSS] == WIN_STATUS).any()) if not deal_row.empty else False
        arr      = float(deal_row[COL_ARR].iloc[0]) if not deal_row.empty else 0.0
        segment  = str(deal_row[COL_SEGMENT].iloc[0]) if not deal_row.empty else "Unknown"

        deal_sequences[deal_id_str] = {
            "campaigns": campaigns,
            "won":       won,
            "arr":       arr,
            "segment":   segment,
        }

    # Build campaign_meta (campaign_type from attribution_df if present, else "Unknown")
    campaign_meta: Dict[str, dict] = {}
    for _, row in attr_df.iterrows():
        cid   = str(row[COL_CAMPAIGN_ID])
        ctype = str(row[COL_CAMPAIGN_TYPE]) if COL_CAMPAIGN_TYPE in attr_df.columns else "Unknown"
        if cid not in campaign_meta:
            campaign_meta[cid] = {"campaign_type": ctype, "touch_count": 0, "deals": set()}
        campaign_meta[cid]["touch_count"] += 1
        campaign_meta[cid]["deals"].add(str(row[COL_DEAL_ID]))

    return deal_sequences, campaign_meta, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — MONTE CARLO SHAPLEY ESTIMATION
# ─────────────────────────────────────────────────────────────────────────────

def _monte_carlo_shapley(
    deal_sequences: Dict[str, dict],
    campaign_meta: Dict[str, dict],
) -> Tuple[Dict[str, float], List[str]]:
    """
    Estimates Shapley values for each campaign using Monte Carlo permutation sampling.

    Algorithm:
      For each of N=500 random permutation samples:
        1. Shuffle all campaigns in a random order.
        2. Compute the marginal contribution of each campaign by measuring
           the change in total won ARR when it is added to the coalition
           of campaigns that precede it in this permutation.
      Average marginal contributions across all samples.

    Returns {campaign_id → shapley_value_in_arr}.
    """
    warnings: List[str] = []
    rng        = np.random.default_rng(MC_SEED)
    all_camps  = list(campaign_meta.keys())
    n_camps    = len(all_camps)

    if n_camps == 0:
        warnings.append("No campaigns found in attribution data.")
        return {}, warnings

    # Pre-compute: for every campaign, which deals does it appear in?
    camp_to_deals: Dict[str, Set[str]] = {cid: meta["deals"] for cid, meta in campaign_meta.items()}

    # Characteristic function: given a coalition (set) of campaign_ids,
    # what is the total ARR of Won deals where ALL campaigns in the coalition appear?
    def v(coalition: List[str]) -> float:
        if not coalition:
            return 0.0
        coalition_set = set(coalition)
        total = 0.0
        for deal_id, deal in deal_sequences.items():
            if not deal["won"]:
                continue
            deal_camps = set(deal["campaigns"])
            if coalition_set.issubset(deal_camps):
                total += deal["arr"]
        return total

    # Monte Carlo Shapley
    shapley: Dict[str, float] = {cid: 0.0 for cid in all_camps}

    for _ in range(MONTE_CARLO_N):
        perm = rng.permutation(n_camps).tolist()
        permuted_camps = [all_camps[i] for i in perm]

        coalition: List[str] = []
        v_prev = 0.0
        for camp in permuted_camps:
            coalition.append(camp)
            v_curr = v(coalition)
            shapley[camp] += v_curr - v_prev
            v_prev = v_curr

    # Average over permutations
    for cid in shapley:
        shapley[cid] = round(shapley[cid] / MONTE_CARLO_N, 2)

    return shapley, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — ENRICH WITH COSTS + ROI
# ─────────────────────────────────────────────────────────────────────────────

def _enrich_with_costs(
    shapley_values: Dict[str, float],
    campaign_meta: Dict[str, dict],
) -> Tuple[List[CampaignShapleyRecord], List[str]]:
    """
    Joins campaign costs from marketing_df and builds CampaignShapleyRecord list.
    """
    warnings:   List[str] = []
    mkt_df      = predicto_cache_v2.marketing_df
    cost_map:   Dict[str, float] = {}

    if mkt_df is not None and not mkt_df.empty:
        if COL_CAMPAIGN_ID in mkt_df.columns and COL_COST in mkt_df.columns:
            for _, row in mkt_df.iterrows():
                cid = str(row[COL_CAMPAIGN_ID])
                cost_map[cid] = float(row[COL_COST]) if pd.notna(row[COL_COST]) else 0.0
        else:
            warnings.append(
                "marketing_df is missing campaign_id or cost column — cost = 0 for all campaigns."
            )
    else:
        warnings.append("marketing_df absent — cost = 0 for all campaigns.")

    total_shapley = sum(shapley_values.values())

    records: List[CampaignShapleyRecord] = []
    for cid, sv in shapley_values.items():
        meta       = campaign_meta.get(cid, {})
        ctype      = meta.get("campaign_type", "Unknown")
        touch_cnt  = meta.get("touch_count", 0)
        n_deals    = len(meta.get("deals", set()))
        total_cost = cost_map.get(cid, 0.0)

        roi = (
            (sv - total_cost) / total_cost
            if total_cost > 0.0
            else 0.0
        )
        shapley_pct = sv / total_shapley if total_shapley > 0 else 0.0

        # Compute mean touchpoint order for this campaign
        attr_df = predicto_cache_v2.attribution_df
        mean_tp_order = 0.0
        if attr_df is not None and COL_TOUCHPOINT_ORD in attr_df.columns and COL_CAMPAIGN_ID in attr_df.columns:
            camp_rows = attr_df[attr_df[COL_CAMPAIGN_ID].astype(str) == cid]
            if not camp_rows.empty:
                mean_tp_order = float(camp_rows[COL_TOUCHPOINT_ORD].mean())

        records.append(
            CampaignShapleyRecord(
                campaign_id=cid,
                campaign_type=ctype,
                shapley_value=sv,
                shapley_pct=round(shapley_pct, 4),
                total_cost=round(total_cost, 2),
                roi=round(roi, 4),
                touch_count=touch_cnt,
                mean_touchpoint_order=round(mean_tp_order, 2),
                deals_influenced=n_deals,
            )
        )

    return records, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — GOLDEN SEQUENCES (EV MAXIMISATION)
# ─────────────────────────────────────────────────────────────────────────────

def _identify_golden_sequences(
    deal_sequences: Dict[str, dict],
) -> Tuple[List[GoldenSequenceRecord], List[str]]:
    """
    Identifies high-value campaign type sequences using Expected Value Maximisation.

    EV Score = Win Rate × Mean ARR of Won Deals (for deals with this sequence).

    Only considers sequences of length 1 to MAX_SEQ_LENGTH composed of
    campaign_type values (not campaign_ids) to allow generalisation across
    specific campaign instances.

    Returns sorted list of top TOP_GOLDEN_SEQUENCES sequences.
    """
    warnings: List[str] = []

    attr_df = predicto_cache_v2.attribution_df
    if attr_df is None or COL_CAMPAIGN_TYPE not in attr_df.columns:
        warnings.append("campaign_type absent from attribution_df — golden sequences skipped.")
        return [], warnings

    # Build deal → ordered campaign_type sequence
    deal_type_sequences: Dict[str, dict] = {}
    for deal_id, deal in deal_sequences.items():
        # Lookup campaign types for each campaign_id in this deal's sequence
        camp_types: List[str] = []
        for cid in deal["campaigns"]:
            camp_rows = attr_df[attr_df[COL_CAMPAIGN_ID].astype(str) == cid]
            if not camp_rows.empty and COL_CAMPAIGN_TYPE in camp_rows.columns:
                ctype = str(camp_rows[COL_CAMPAIGN_TYPE].iloc[0])
            else:
                ctype = "Unknown"
            camp_types.append(ctype)

        deal_type_sequences[deal_id] = {
            "type_sequence": camp_types,
            "won":           deal["won"],
            "arr":           deal["arr"],
            "segment":       deal["segment"],
        }

    # Build a frequency map for every sub-sequence of length 1..MAX_SEQ_LENGTH
    # Key = tuple(campaign_type sequence), value = {deals: [...], won: [...], arr_won: [...]}
    seq_stats: Dict[tuple, dict] = {}

    for deal_id, deal in deal_type_sequences.items():
        full_seq = deal["type_sequence"]
        # Deduplicate consecutive repeats to avoid trivial sequences like (A,A,A)
        deduped: List[str] = []
        for ct in full_seq:
            if not deduped or deduped[-1] != ct:
                deduped.append(ct)

        n = len(deduped)
        for length in range(1, min(MAX_SEQ_LENGTH, n) + 1):
            # Use the first `length` campaigns (ordered prefix) as the sequence
            seq_key = tuple(deduped[:length])
            if seq_key not in seq_stats:
                seq_stats[seq_key] = {"deal_count": 0, "won_arr": [], "segment_list": []}
            seq_stats[seq_key]["deal_count"] += 1
            if deal["won"]:
                seq_stats[seq_key]["won_arr"].append(deal["arr"])
            seq_stats[seq_key]["segment_list"].append(deal["segment"])

    # Filter to sequences with MIN_DEALS_FOR_SEQUENCE deals and compute EV
    ev_candidates: List[dict] = []
    for seq_key, stats in seq_stats.items():
        n_total = stats["deal_count"]
        if n_total < MIN_DEALS_FOR_SEQUENCE:
            continue
        n_won        = len(stats["won_arr"])
        win_rate     = n_won / n_total
        mean_arr_won = float(np.mean(stats["won_arr"])) if stats["won_arr"] else 0.0
        ev_score     = win_rate * mean_arr_won

        segs = stats["segment_list"]
        dominant_seg = max(set(segs), key=segs.count) if segs else "Unknown"

        ev_candidates.append({
            "seq_key":        seq_key,
            "win_rate":       win_rate,
            "mean_arr_won":   mean_arr_won,
            "ev_score":       ev_score,
            "deal_count":     n_total,
            "dominant_seg":   dominant_seg,
        })

    # Sort by ev_score descending, take top N
    ev_candidates.sort(key=lambda x: x["ev_score"], reverse=True)
    top_candidates = ev_candidates[:TOP_GOLDEN_SEQUENCES]

    golden_sequences: List[GoldenSequenceRecord] = []
    for rank, cand in enumerate(top_candidates):
        seq_list = list(cand["seq_key"])
        seq_key_str = " → ".join(seq_list)
        golden_sequences.append(
            GoldenSequenceRecord(
                sequence_id=rank,
                campaign_sequence=seq_list,
                sequence_key=seq_key_str,
                win_rate=round(cand["win_rate"], 4),
                mean_arr_won=round(cand["mean_arr_won"], 2),
                ev_score=round(cand["ev_score"], 2),
                deal_count=cand["deal_count"],
                dominant_segment=cand["dominant_seg"],
            )
        )

    return golden_sequences, warnings


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _detect_missing_columns() -> List[str]:
    missing: List[str] = []
    attr_df  = predicto_cache_v2.attribution_df
    sales_df = predicto_cache_v2.sales_df
    mkt_df   = predicto_cache_v2.marketing_df

    if attr_df is None:
        missing.extend([COL_DEAL_ID, COL_CAMPAIGN_ID, COL_CAMPAIGN_TYPE, COL_TOUCHPOINT_ORD])
    else:
        for col in [COL_DEAL_ID, COL_CAMPAIGN_ID, COL_CAMPAIGN_TYPE, COL_TOUCHPOINT_ORD]:
            if col not in attr_df.columns:
                missing.append(col)

    if sales_df is None:
        missing.extend([COL_ARR, COL_WIN_LOSS, COL_SEGMENT])
    else:
        for col in [COL_ARR, COL_WIN_LOSS, COL_SEGMENT]:
            if col not in sales_df.columns:
                missing.append(col)

    if mkt_df is None:
        missing.extend([COL_COST])
    elif COL_COST not in mkt_df.columns:
        missing.append(COL_COST)

    return list(dict.fromkeys(missing))   # deduplicate preserving order


def _derive_confidence(n_deals: int, roi_status: ROIStatus) -> ConfidenceLevel:
    if roi_status == ROIStatus.OFFLINE:
        return ConfidenceLevel.LOW
    if roi_status == ROIStatus.PARTIAL or n_deals < 50:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.HIGH


def _offline_response(warnings: List[str]) -> CampaignROIResponse:
    return CampaignROIResponse(
        campaign_attributions=[],
        golden_sequences=[],
        total_campaigns_analysed=0,
        total_attributed_arr=0.0,
        total_marketing_cost=0.0,
        portfolio_roi=0.0,
        monte_carlo_permutations=MONTE_CARLO_N,
        top_campaign_id=None,
        top_campaign_type=None,
        roi_status=ROIStatus.OFFLINE,
        data_availability=FeatureAvailability.OFFLINE,
        overall_confidence=ConfidenceLevel.LOW,
        missing_columns=_detect_missing_columns(),
        warnings=warnings,
    )
