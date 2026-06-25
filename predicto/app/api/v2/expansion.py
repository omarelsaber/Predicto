"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/api/v2/expansion.py                                                    ║
║  Predicto V2 — GET /api/v2/expansion/candidates router                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from app.models.response_models import ExpansionCandidatesResponse
from app.services.churn_expansion_service import get_expansion_candidates

log = logging.getLogger("predicto.v2.api.expansion")

router = APIRouter(prefix="/api/v2/expansion", tags=["Intelligence"])


@router.get("/candidates", response_model=ExpansionCandidatesResponse)
async def get_expansion_candidates_api(exclude_at_risk: bool = True):
    """
    AI Innovation 3: Revenue Expansion Recommender.
    Identifies high-potential upsell candidates using K-Means clustering.
    Always returns a valid response — never raises a 500.
  """
    log.info(
        "GET /api/v2/expansion/candidates  exclude_at_risk=%s",
        exclude_at_risk,
    )
    return get_expansion_candidates(exclude_at_risk=exclude_at_risk)
