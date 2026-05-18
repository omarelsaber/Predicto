"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/api/v2/churn.py                                                        ║
║  Predicto V2 — GET /api/v2/churn/competitive router                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query

from app.models.response_models import CompetitiveChurnResponse
from app.services.churn_expansion_service import get_churn_warnings

log = logging.getLogger("predicto.v2.router.churn")

router = APIRouter(prefix="/api/v2/churn", tags=["AI Innovation 2 — Competitive Churn Warning"])


@router.get(
    "/competitive",
    response_model=CompetitiveChurnResponse,
    summary="Competitive Churn Early Warning",
    description=(
        "Returns a ranked list of customers ordered by churn probability (highest first). "
        "Uses the HybridFusionModel / ColdStartRouter when available; degrades gracefully "
        "to a heuristic rule-based scorer when the ML model is not ready. "
        "Always returns a valid response — never raises a 500. "
        "data_availability = OFFLINE means no source data is loaded; the customer list will be empty."
    ),
    response_description=(
        "CompetitiveChurnResponse: ranked customer churn list with alert levels, "
        "plain-English risk signals, and recommended CSM actions."
    ),
)
async def competitive_churn_warning(
    min_alert_level: str = Query(
        default="MONITOR",
        description=(
            "Filter results to customers at or above this alert level. "
            "Accepted values: 'MONITOR' (all), 'WARNING' (warning + critical), 'CRITICAL' (critical only). "
            "Case-insensitive."
        ),
        regex="^(?i)(MONITOR|WARNING|CRITICAL)$",
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=500,
        description="Maximum number of customer rows to return. Defaults to 50.",
    ),
) -> CompetitiveChurnResponse:
    """
    Competitive Churn Early Warning endpoint.

    Query parameters
    ----------------
    min_alert_level : str, default "MONITOR"
        "MONITOR" → return all customers.
        "WARNING"  → return WARNING + CRITICAL customers only.
        "CRITICAL" → return CRITICAL customers only.
    limit : int, default 50
        Hard cap on the number of rows returned.  Aggregate counts (critical_count,
        warning_count, total_arr_at_risk) reflect the FULL dataset, not the
        filtered slice, so the frontend KPI bar is always accurate.
    """
    log.info("GET /churn/competitive  min_alert_level=%s  limit=%d", min_alert_level, limit)

    result = get_churn_warnings()

    # ── Post-fetch filtering (applied after aggregates are already computed) ──
    level = min_alert_level.upper()
    if level == "CRITICAL":
        result.customers = [c for c in result.customers if c.alert_level.value == "CRITICAL"]
    elif level == "WARNING":
        result.customers = [c for c in result.customers if c.alert_level.value in ("CRITICAL", "WARNING")]
    # "MONITOR" = no filter

    # Apply row limit
    result.customers = result.customers[:limit]

    log.info(
        "GET /churn/competitive → %d rows returned (filter=%s, availability=%s)",
        len(result.customers), level, result.data_availability.value,
    )
    return result