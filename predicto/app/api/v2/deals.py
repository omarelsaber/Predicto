"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/api/v2/deals.py                                                        ║
║  Predicto V2 — FastAPI router for Deal Intelligence (AI Innovation 1).     ║
║                                                                              ║
║  Routes                                                                     ║
║  ──────                                                                     ║
║  GET /api/v2/deals/priority    Ranked deal list (0-100 DealPriorityScorer) ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from app.core.cache import predicto_cache_v2
from app.models.response_models import DealPriorityResponse, FeatureAvailability
from app.services.deal_priority_service import score_deals

log = logging.getLogger("predicto.v2.deals")

router = APIRouter(prefix="/api/v2", tags=["deals"])


@router.get(
    "/deals/priority",
    response_model=DealPriorityResponse,
    summary="Deal Priority Ranked List",
    description=(
        "Runs the DealPriorityScorer on all deals in the sales table and returns "
        "a ranked list (0-100 score, descending). Each deal includes ARR, Rep, "
        "Segment, and the top signal driving the score in plain English "
        "(e.g. 'Discount 28% — approaching margin cliff'). "
        "\n\n"
        "Scoring uses the cached ML model if available; falls back to the "
        "heuristic scorer (scorer_mode='mock') when the model is not fitted. "
        "\n\n"
        "Returns HTTP 200 with an empty deals list when the sales table is absent — "
        "never returns a 404 or 500 for missing data."
    ),
)
async def get_deal_priority(
    limit: int = Query(
        default=50,
        ge=1,
        le=500,
        description="Maximum number of deals to return. Default 50.",
    ),
    min_score: float = Query(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Filter out deals with priority_score below this threshold.",
    ),
    segment: str = Query(
        default="",
        description=(
            "Optional case-insensitive segment filter "
            "(e.g. 'Enterprise', 'Mid-Market', 'SMB'). "
            "Leave blank to return all segments."
        ),
    ),
) -> DealPriorityResponse:
    log.info(
        "GET /api/v2/deals/priority called (limit=%d, min_score=%.1f, segment=%r)",
        limit, min_score, segment,
    )

    cache = predicto_cache_v2

    # ── Cache error guard ─────────────────────────────────────────────────────
    if not cache.is_ready and cache.ingestion_error:
        log.error("Cache in error state: %s", cache.ingestion_error)
        raise HTTPException(
            status_code=503,
            detail=(
                f"Data pipeline unavailable: {cache.ingestion_error}. "
                "Re-ingest your data to activate Deal Priority Scoring."
            ),
        )

    # ── Cache miss (not yet ready — no error, just no data) ───────────────────
    if not cache.is_ready:
        log.warning("Cache not ready — returning empty deal priority response.")
        return DealPriorityResponse(
            deals=[],
            total_deals=0,
            total_arr_at_stake=0.0,
            high_discount_threshold=0.30,
            safe_margin_floor=0.05,
            scorer_mode="mock",
            data_availability=FeatureAvailability.OFFLINE,
        )

    try:
        result = score_deals()

        # ── Apply query-time filters ──────────────────────────────────────────
        filtered = result.deals

        if min_score > 0.0:
            before = len(filtered)
            filtered = [d for d in filtered if d.priority_score >= min_score]
            log.debug("min_score filter: %d → %d deals", before, len(filtered))

        if segment.strip():
            seg_lower = segment.strip().lower()
            before = len(filtered)
            filtered = [
                d for d in filtered
                if d.segment.lower() == seg_lower
            ]
            log.debug("segment filter '%s': %d → %d deals", seg_lower, before, len(filtered))

        # Apply limit after filters
        filtered = filtered[:limit]

        log.info(
            "Deal priority response: %d deals (scorer_mode=%s, availability=%s)",
            len(filtered), result.scorer_mode, result.data_availability,
        )

        # Return a new response with the filtered/limited deal list but
        # preserve aggregate stats from the full scoring pass.
        return DealPriorityResponse(
            deals=filtered,
            total_deals=result.total_deals,          # full count before filter
            total_arr_at_stake=result.total_arr_at_stake,
            high_discount_threshold=result.high_discount_threshold,
            safe_margin_floor=result.safe_margin_floor,
            scorer_mode=result.scorer_mode,
            data_availability=result.data_availability,
        )

    except HTTPException:
        raise
    except Exception as exc:
        log.error("Unexpected error in /deals/priority: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Deal scoring failed unexpectedly. Check server logs.",
        )
