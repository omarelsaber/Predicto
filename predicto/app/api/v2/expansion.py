"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/api/v2/expansion.py                                                    ║
║  Predicto V2 — GET /api/v2/expansion/candidates router                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from app.models.response_models import ExpansionCandidatesResponse
from app.services.churn_expansion_service import get_expansion_candidates

log = logging.getLogger("predicto.v2.api.expansion")

router = APIRouter(prefix="/api/v2/expansion", tags=["Intelligence"])

@router.get("/candidates", response_model=ExpansionCandidatesResponse)
async def get_expansion_candidates_api(exclude_at_risk: bool = True):
    """
    AI Innovation 3: Revenue Expansion Recommender.
    Identifies high-potential upsell candidates using K-Means clustering.
    """
    try:
        return get_expansion_candidates(exclude_at_risk=exclude_at_risk)
    except Exception as exc:
        log.error("GET /api/v2/expansion/candidates failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc)
        )
