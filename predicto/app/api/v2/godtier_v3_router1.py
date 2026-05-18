import logging
import traceback

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.models.response_models import (
    RevenueGenomeResponse,
    ContagionNetworkResponse,
    DealWarRoomResponse,
    StressTestRequest,
    StressTestResponse,
    FeatureAvailability,
    ConfidenceLevel,
)
from app.services.genome_service       import calculate_genome
from app.services.contagion_service    import calculate_contagion_network
from app.services.war_room_service     import calculate_war_room
from app.services.stress_test_service  import calculate_stress_test

log = logging.getLogger("predicto.v2.godtier_router")

router = APIRouter(
    prefix="/api/v2/godtier",
    tags=["god-tier-v3"],
)


def _safe_call(service_fn, *args, fallback_model, **kwargs):
    """
    Call service_fn(*args, **kwargs).
    On unexpected exception, log traceback and return fallback_model gracefully.
    Guarantees HTTP 200 with diagnostic OFFLINE payload instead of 500.
    """
    try:
        return service_fn(*args, **kwargs)
    except Exception:
        log.error(
            "Unhandled exception in %s:\n%s",
            service_fn.__name__,
            traceback.format_exc(),
        )
        return fallback_model


@router.get(
    "/portfolio/genome",
    response_model=RevenueGenomeResponse,
    summary="Revenue Genome Sequencer",
    description=(
        "Runs a Topological Data Analysis (TDA) Mapper pipeline over the customer portfolio. "
        "Applies DBSCAN clustering within interval covers along the lifetime risk (churn) axis, "
        "constructs a network of shared-customer cluster nodes, and assigns genetic drift scores. "
        "Returns the full genome topology, cluster assignments, and drift metrics."
    ),
)
async def get_revenue_genome() -> RevenueGenomeResponse:
    log.info("GET /portfolio/genome — starting genome calculation.")
    fallback = RevenueGenomeResponse(
        summary_narrative=(
            "An unexpected error occurred during genome sequencing. "
            "The service has degraded gracefully. Please retry or contact support."
        ),
        data_availability=FeatureAvailability.OFFLINE,
        overall_confidence=ConfidenceLevel.LOW,
        warnings=["Internal error — see server logs for details."],
    )
    result = _safe_call(calculate_genome, fallback_model=fallback)
    return result


@router.get(
    "/portfolio/contagion-network",
    response_model=ContagionNetworkResponse,
    summary="Graph-Based Revenue Contagion Network",
    description=(
        "Performs a fast contagion risk propagation pass over the pre-computed customer graph. "
        "Anchor nodes (high-ARR customers with churn_probability > 0.7) seed exponential-decay "
        "propagation: R_j = min(1.0, Σ R_i · γ_ij · exp(-α · h)) with α=0.5. "
        "Returns per-customer contagion risk factors, top propagation paths, and network summary."
    ),
)
async def get_contagion_network() -> ContagionNetworkResponse:
    log.info("GET /portfolio/contagion-network — starting propagation pass.")
    fallback = ContagionNetworkResponse(
        summary_narrative=(
            "An unexpected error occurred during contagion network analysis. "
            "The service has degraded gracefully."
        ),
        data_availability=FeatureAvailability.OFFLINE,
        overall_confidence=ConfidenceLevel.LOW,
        warnings=["Internal error — see server logs for details."],
    )
    result = _safe_call(calculate_contagion_network, fallback_model=fallback)
    return result


@router.get(
    "/deals/war-room",
    response_model=DealWarRoomResponse,
    summary="Adversarial Deal War Room (CFR Game Theory)",
    description=(
        "Models the sales pipeline as an Extensive-Form Game with Incomplete Information. "
        "Applies Counterfactual Regret Minimisation (CFR) over a 3-stage game tree "
        "to compute an epsilon-Nash equilibrium mix across 5 seller actions vs 4 competitor action profiles. "
        "Returns per-deal tactical recommendations and a Pareto efficiency frontier."
    ),
)
async def get_deal_war_room() -> DealWarRoomResponse:
    log.info("GET /deals/war-room — starting CFR analysis.")
    fallback = DealWarRoomResponse(
        summary_narrative=(
            "An unexpected error occurred during war-room CFR analysis. "
            "The service has degraded gracefully."
        ),
        data_availability=FeatureAvailability.OFFLINE,
        overall_confidence=ConfidenceLevel.LOW,
        warnings=["Internal error — see server logs for details."],
    )
    result = _safe_call(calculate_war_room, fallback_model=fallback)
    return result


@router.post(
    "/forecast/stress-test",
    response_model=StressTestResponse,
    summary="Macro Revenue Stress-Test Engine (VAR + Monte Carlo)",
    description=(
        "Fits a Ridge-Regularised Vector Autoregression (Bayesian VAR) on snapshots_df "
        "with Tikhonov regularisation (λ=1e-4). "
        "Runs N Monte Carlo iterations (default 500) using Student's t-distribution "
        "fat-tail shocks per scenario (Liquidity, Demand Contraction, Competitive Event). "
        "Returns CVaR at the 5th percentile and a 9-month ARR survival curve with percentile bands."
    ),
)
async def post_stress_test(request: StressTestRequest) -> StressTestResponse:
    log.info(
        "POST /forecast/stress-test — scenarios=%s, n_iter=%d, horizon=%d",
        [s.value for s in request.scenarios],
        request.n_iterations,
        request.forecast_horizon_months,
    )
    fallback = StressTestResponse(
        summary_narrative=(
            "An unexpected error occurred during stress-test simulation. "
            "The service has degraded gracefully."
        ),
        data_availability=FeatureAvailability.OFFLINE,
        overall_confidence=ConfidenceLevel.LOW,
        warnings=["Internal error — see server logs for details."],
    )
    result = _safe_call(calculate_stress_test, request, fallback_model=fallback)
    return result
