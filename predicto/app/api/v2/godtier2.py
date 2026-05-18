"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/api/v2/godtier2.py                                                     ║
║  Predicto V2 — God-Tier Intelligence Router (Phase 2)                      ║
║                                                                              ║
║  Exposes three advanced intelligence services:                              ║
║    Feature 02 — Revenue Cohort Lifecycle Fingerprinting                    ║
║    Feature 03 — Rep-Level Win-Rate Decomposition & Playbook Generator      ║
║    Feature 05 — Multi-Touch Campaign ROI Decomposer                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.models.response_models import (
    CampaignROIResponse,
    LifecycleFingerprintResponse,
    RepPlaybookResponse,
)
from app.services.fingerprint_service import compute_lifecycle_fingerprint
from app.services.rep_playbook_service import compute_rep_playbooks
from app.services.roi_decomposer_service import compute_campaign_roi

log = logging.getLogger("predicto.v2.godtier2")

router = APIRouter(prefix="/v2", tags=["God-Tier Intelligence"])


# ── Feature 02: Revenue Cohort Lifecycle Fingerprinting ───────────────────────

@router.get(
    "/cohorts/lifecycle-fingerprint",
    response_model=LifecycleFingerprintResponse,
    summary="Revenue Cohort Lifecycle Fingerprinting",
    description=(
        "Extract 7-KPI trajectory shapes per customer using linregress, "
        "then cluster into 4 lifecycle archetypes via K-Means (k=4, k-means++). "
        "Degrades to a 2-archetype FAV/SBS fallback when the portfolio contains "
        "fewer than 15 valid customers.  Returns OFFLINE when required tables "
        "are absent — never a 500 error."
    ),
)
async def get_lifecycle_fingerprint() -> LifecycleFingerprintResponse:
    """
    GET /api/v2/cohorts/lifecycle-fingerprint
    """
    try:
        return compute_lifecycle_fingerprint()
    except Exception as exc:
        log.error("Lifecycle fingerprinting failed unexpectedly: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Lifecycle fingerprinting failed: {str(exc)}"
        )


# ── Feature 03: Rep-Level Win-Rate Decomposition & Playbook Generator ─────────

@router.get(
    "/attribution/rep-playbook",
    response_model=RepPlaybookResponse,
    summary="Rep-Level Win-Rate Decomposition & Playbook Generator",
    description=(
        "Decompose win rates by rep, segment, and discount depth. "
        "Compute velocity-adjusted win scores (win_rate / days_in_pipeline). "
        "Enrich with RSFS from engineered_df and campaign affinity from attribution_df. "
        "Generate personalised playbooks via Llama-3.3-70b-versatile (Groq); "
        "degrades to a deterministic template if the Groq API is unreachable."
    ),
)
async def get_rep_playbook() -> RepPlaybookResponse:
    """
    GET /api/v2/attribution/rep-playbook
    """
    try:
        return compute_rep_playbooks()
    except Exception as exc:
        log.error("Rep playbook generation failed unexpectedly: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Rep playbook generation failed: {str(exc)}"
        )


# ── Feature 05: Multi-Touch Campaign ROI Decomposer ──────────────────────────

@router.get(
    "/attribution/campaign-roi-decomposer",
    response_model=CampaignROIResponse,
    summary="Multi-Touch Campaign ROI Decomposer",
    description=(
        "Build deal touchpoint sequences from attribution_df and sales_df. "
        "Compute per-campaign Shapley values via Monte Carlo approximation "
        "(n=500 permutations, sub-second for typical B2B deal volumes). "
        "Rank golden campaign sequences by Expected Value = Win Rate × Mean ARR. "
        "Degrades to PARTIAL when marketing_df is absent (Shapley values remain valid; "
        "cost and ROI default to 0).  Returns OFFLINE when attribution or sales data "
        "is missing — never a 500 error."
    ),
)
async def get_campaign_roi_decomposer() -> CampaignROIResponse:
    """
    GET /api/v2/attribution/campaign-roi-decomposer
    """
    try:
        return compute_campaign_roi()
    except Exception as exc:
        log.error("Campaign ROI decomposition failed unexpectedly: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Campaign ROI decomposition failed: {str(exc)}"
        )
