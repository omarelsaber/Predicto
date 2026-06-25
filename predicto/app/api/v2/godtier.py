"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/api/v2/godtier.py                                                      ║
║  Predicto V2 — God-Tier Intelligence Router                                 ║
║                                                                              ║
║  Exposes high-level simulation and risk detection services.                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from app.models.response_models import (
    CliffDetectorResponse,
    SimulatorRequest,
    SimulatorResponse,
    LifecycleFingerprintResponse,
    RepPlaybookResponse,
    CampaignROIResponse,
)
from app.services.cliff_detector_service import run_cliff_detection
from app.services.simulator_service import run_scenario_simulation
from app.services.fingerprint_service import compute_lifecycle_fingerprint
from app.services.rep_playbook_service import compute_rep_playbooks
from app.services.roi_decomposer_service import compute_campaign_roi

log = logging.getLogger("predicto.v2.godtier")

router = APIRouter(prefix="/v2", tags=["God-Tier Intelligence"])


# ── Feature 01: Revenue Scenario Simulator ────────────────────────────────────

@router.post(
    "/forecast/revenue-simulator",
    response_model=SimulatorResponse,
    summary="Simulate Revenue Scenarios",
    description=(
        "Compute a 9-month MRR projection based on custom levers: "
        "discount ceilings, churn interventions, and expansion cluster outreach."
    ),
)
async def post_revenue_simulator(request: SimulatorRequest) -> SimulatorResponse:
    """
    POST /api/v2/forecast/revenue-simulator
    """
    try:
        return run_scenario_simulation(request)
    except Exception as exc:
        log.error("Simulation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Revenue simulation failed: {str(exc)}"
        )


# ── Feature 04: Cascading Revenue Cliff Detector ──────────────────────────────

@router.get(
    "/risk/revenue-cliff-detector",
    response_model=CliffDetectorResponse,
    summary="Detect Revenue Cliffs",
    description=(
        "Identify concentrated renewal risk windows over the next 9 months. "
        "Isolates compounding drivers (EDI, SBS) for the highest-risk cliff."
    ),
)
async def get_revenue_cliff_detector(
    forecast_months: int = Query(9, ge=1, le=9)
) -> CliffDetectorResponse:
    """
    GET /api/v2/risk/revenue-cliff-detector
    """
    try:
        return run_cliff_detection(forecast_months=forecast_months)
    except Exception as exc:
        log.error("Cliff detection failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Revenue cliff detection failed: {str(exc)}"
        )


# ── Feature 02: Revenue Cohort Lifecycle Fingerprinting ────────────────────────

@router.get(
    "/intelligence/lifecycle-fingerprint",
    response_model=LifecycleFingerprintResponse,
    summary="Fingerprint Revenue Cohorts",
)
async def get_lifecycle_fingerprint() -> LifecycleFingerprintResponse:
    try:
        return compute_lifecycle_fingerprint()
    except Exception as exc:
        log.error("Fingerprinting failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Fingerprinting failed: {str(exc)}")


# ── Feature 03: Rep-Level Win-Rate Decomposition ──────────────────────────────

@router.get(
    "/intelligence/rep-playbooks",
    response_model=RepPlaybookResponse,
    summary="Generate Rep Playbooks",
)
async def get_rep_playbook() -> RepPlaybookResponse:
    try:
        return compute_rep_playbooks()
    except Exception as exc:
        log.error("Playbook generation failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Playbook generation failed: {str(exc)}")


# ── Feature 05: Multi-Touch Campaign ROI Decomposer ───────────────────────────

@router.get(
    "/intelligence/campaign-roi",
    response_model=CampaignROIResponse,
    summary="Decompose Campaign ROI",
)
async def get_campaign_roi() -> CampaignROIResponse:
    try:
        return compute_campaign_roi()
    except Exception as exc:
        log.error("Attribution failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Attribution failed: {str(exc)}")
