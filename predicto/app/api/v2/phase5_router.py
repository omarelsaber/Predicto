"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/api/v2/phase5_router.py                                                ║
║  Predicto V2 — Phase 5 God-Tier Router                                      ║
║                                                                              ║
║  Mounts:                                                                     ║
║    POST /api/v2/godtier/optimization/topology   → Feature 09                ║
║    GET  /api/v2/godtier/causal/counterfactual   → Feature 10                ║
║                                                                              ║
║  Both endpoints apply the Predicto V2 safe-execution pattern:               ║
║    • All exceptions caught at the router layer (belt-and-suspenders)        ║
║    • Schema validated by Pydantic v2 before service dispatch                ║
║    • Graceful degradation responses always returned (no 500s)               ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import JSONResponse

from app.models.response_models import ConfidenceLevel, FeatureAvailability
from app.models.response_models import (
    CounterfactualResponse,
    TopologyOptimizationRequest,
    TopologyOptimizationResponse,
    TreatmentType,
)
from app.services.causal_counterfactual_service import run_causal_counterfactual
from app.services.optimization_service import run_topology_optimization

log = logging.getLogger("predicto.v2.phase5_router")

# ─────────────────────────────────────────────────────────────────────────────
# ROUTER SETUP
# ─────────────────────────────────────────────────────────────────────────────

router = APIRouter(
    prefix="/api/v2/godtier",
    tags=["Phase 5 — God-Tier Intelligence"],
)

# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 09 — AUTONOMOUS REVENUE TOPOLOGY OPTIMIZER
# POST /api/v2/godtier/optimization/topology
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/optimization/topology",
    response_model=TopologyOptimizationResponse,
    summary="Autonomous Revenue Topology Optimizer",
    description="""
## Feature 09 — Autonomous Revenue Topology Optimizer

Runs a **Multi-Objective Linear Program** (LP relaxation of MILP via SciPy HiGHS)
to optimally allocate three resource levers across at-risk customers:

| Lever | Unit | Default Budget |
|---|---|---|
| Rep Hours | hours | 200 h |
| CSM Interventions | sessions | 50 sessions |
| Campaign Spend | USD | $10,000 |

### Objective
Maximise a convex combination of:
- **Churn reduction** (weighted by `churn_weight`)
- **ARR retention** (weighted by `1 − churn_weight`)

subject to hard budget constraints on all three resource pools.

### Response
Returns a **Revenue Operations Master Schedule** — a ranked per-customer action
plan with projected churn reduction, ARR retained, and ROI scores.

### Graceful Degradation
- `engineered_df` absent → `OFFLINE / LOW` response (no 500).
- Solver infeasible → greedy heuristic with `DEGRADED` status.
- Any exception → safe OFFLINE response with diagnostic `warnings` list.
""",
    response_description="Revenue Operations Master Schedule with budget utilisation and segment breakdown.",
    status_code=status.HTTP_200_OK,
)
async def topology_optimizer(
    request: TopologyOptimizationRequest,
) -> TopologyOptimizationResponse:
    """
    Dispatch Feature 09 optimisation and return the master schedule.

    The endpoint never raises a 500; all runtime errors are caught and
    translated into a degraded-but-valid TopologyOptimizationResponse.
    """
    log.info(
        "[Phase5 Router] POST /optimization/topology — "
        "max_rep_hours=%s, max_csm=%s, max_campaign=%s, top_n=%s",
        request.max_rep_hours,
        request.max_csm_interventions,
        request.max_campaign_spend,
        request.top_n_customers,
    )

    try:
        result = run_topology_optimization(request)
        log.info(
            "[Phase5 Router] Topology optimizer completed — "
            "status=%s, n_customers=%d, arr_retained=%.2f",
            result.solver_status,
            result.n_customers_optimized,
            result.total_arr_projected_retained,
        )
        return result

    except Exception as exc:  # belt-and-suspenders: service layer should never raise
        log.exception("[Phase5 Router] Unhandled exception in topology_optimizer: %s", exc)
        return TopologyOptimizationResponse(
            data_availability=FeatureAvailability.OFFLINE,
            overall_confidence=ConfidenceLevel.LOW,
            warnings=[
                f"An unexpected error occurred in the optimisation pipeline: {exc}. "
                "Please verify that engineered_df is loaded and retry."
            ],
        )


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 10 — CAUSAL REVENUE COUNTERFACTUAL ENGINE
# GET /api/v2/godtier/causal/counterfactual
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/causal/counterfactual",
    response_model=CounterfactualResponse,
    summary="Causal Revenue Counterfactual Engine",
    description="""
## Feature 10 — Causal Revenue Counterfactual Engine

Estimates **Conditional Average Treatment Effects (CATEs)** using
**Double Machine Learning** (DML / Robinson 1988 / Chernozhukov et al. 2018).

### DML Pipeline
1. **Outcome nuisance** `m̂(X) = E[churn | confounders]` — Ridge regression with 5-fold cross-fitting.
2. **Treatment nuisance** `ê(X) = P(treatment | confounders)` — Logistic regression with 5-fold cross-fitting.
3. **Partial-out residuals**: `Ỹ = Y − m̂(X)`,  `T̃ = T − ê(X)`.
4. **CATE via residual-on-residual regression**: `Ỹ ~ θ(X) · T̃`.
5. **Heterogeneity clustering**: customers bucketed into `HIGH_RESPONDERS`, `LOW_RESPONDERS`,
   `NEGATIVE_RESPONDERS`, `UNCERTAIN` by CATE quartile.

### Engine Cascade (data-adaptive)
| Sample size | Engine mode |
|---|---|
| N ≥ 30 | `FULL_DML` (5-fold cross-fitting) |
| 10 ≤ N < 30 | `RIDGE_DML` (regularised, no cross-fitting) |
| N < 10 | `OLS_BASELINE` (naïve OLS, last resort) |

### Response
- **Per-customer CATE estimates** with 95% confidence intervals.
- **Historical Audit Report** — foregone ARR for past sub-optimal interventions.
- **Causal Heterogeneity Map** — which customer segments respond best to treatment.

### Query Parameters
- `treatment` — which intervention to analyse (default: `DISCOUNT_APPLIED`).

### Graceful Degradation
- Missing data → `OFFLINE / LOW` (no 500).
- No treatment column → synthetic heuristic fallback with `warnings`.
- Engine failure → safe OFFLINE response.
""",
    response_description="CATE estimates, historical audit, and causal heterogeneity map.",
    status_code=status.HTTP_200_OK,
)
async def causal_counterfactual(
    treatment: TreatmentType = Query(
        default=TreatmentType.DISCOUNT_APPLIED,
        description=(
            "The intervention whose causal effect on churn is estimated. "
            "Must match a treatment type recorded in sales_df or marketing_df."
        ),
    ),
) -> CounterfactualResponse:
    """
    Dispatch Feature 10 Double ML estimation and return counterfactual analysis.

    The endpoint never raises a 500; all runtime errors are translated into a
    degraded-but-valid CounterfactualResponse.
    """
    log.info("[Phase5 Router] GET /causal/counterfactual — treatment=%s", treatment)

    try:
        result = run_causal_counterfactual(treatment=treatment)
        log.info(
            "[Phase5 Router] Causal engine completed — "
            "mode=%s, n_cates=%d, ATE=%.4f, foregone_arr=%.2f",
            result.engine_mode,
            len(result.cate_estimates),
            result.average_treatment_effect,
            result.total_foregone_arr,
        )
        return result

    except Exception as exc:  # belt-and-suspenders: service layer should never raise
        log.exception("[Phase5 Router] Unhandled exception in causal_counterfactual: %s", exc)
        return CounterfactualResponse(
            treatment_analyzed=treatment,
            data_availability=FeatureAvailability.OFFLINE,
            overall_confidence=ConfidenceLevel.LOW,
            warnings=[
                f"An unexpected error occurred in the causal estimation pipeline: {exc}. "
                "Please verify that engineered_df, sales_df, and marketing_df are loaded and retry."
            ],
        )


# ─────────────────────────────────────────────────────────────────────────────
# HEALTH SUB-ENDPOINT  (lightweight; no service call)
# GET /api/v2/godtier/phase5/health
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/phase5/health",
    summary="Phase 5 Health Check",
    description="Returns readiness status of the Phase 5 endpoints without triggering computation.",
    status_code=status.HTTP_200_OK,
    include_in_schema=True,
)
async def phase5_health() -> JSONResponse:
    """
    Lightweight liveness probe for Phase 5.
    Reads cache state without invoking any ML computation.
    """
    from app.core.cache import predicto_cache_v2

    eng_loaded = (
        predicto_cache_v2.engineered_df is not None
        and not predicto_cache_v2.engineered_df.empty
    )
    sales_loaded = (
        predicto_cache_v2.sales_df is not None
        and not predicto_cache_v2.sales_df.empty
    )
    marketing_loaded = (
        predicto_cache_v2.marketing_df is not None
        and not predicto_cache_v2.marketing_df.empty
    )

    ready = eng_loaded
    detail = {
        "phase": 5,
        "ready": ready,
        "tables": {
            "engineered_df":  eng_loaded,
            "sales_df":       sales_loaded,
            "marketing_df":   marketing_loaded,
        },
        "endpoints": {
            "POST /optimization/topology": "READY" if eng_loaded else "WAITING_FOR_DATA",
            "GET  /causal/counterfactual":
                "READY" if (eng_loaded and (sales_loaded or marketing_loaded))
                else ("PARTIAL" if eng_loaded else "WAITING_FOR_DATA"),
        },
        "cache_health_score": predicto_cache_v2.health_score,
    }

    http_status = status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(content=detail, status_code=http_status)