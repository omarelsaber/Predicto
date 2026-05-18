"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/models/response_models_phase5.py                                       ║
║  Predicto V2 — Pydantic response contracts for Phase 5 God-Tier endpoints.  ║
║                                                                              ║
║  Feature 09: Autonomous Revenue Topology Optimizer                          ║
║    POST /api/v2/godtier/optimization/topology                               ║
║                                                                              ║
║  Feature 10: Causal Revenue Counterfactual Engine                           ║
║    GET  /api/v2/godtier/causal/counterfactual                               ║
║                                                                              ║
║  All models use Pydantic v2 syntax (model_config, Field with description).  ║
║  All numeric fields default to 0.0 — never null.                            ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from app.models.response_models import ConfidenceLevel, FeatureAvailability


# ─────────────────────────────────────────────────────────────────────────────
# SHARED ENUMS — PHASE 5
# ─────────────────────────────────────────────────────────────────────────────

class InterventionType(str, Enum):
    """Available resource-allocation levers in the topology optimizer."""
    REP_HOURS           = "REP_HOURS"
    CSM_INTERVENTION    = "CSM_INTERVENTION"
    CAMPAIGN_SPEND      = "CAMPAIGN_SPEND"
    DISCOUNT_OFFER      = "DISCOUNT_OFFER"
    EXECUTIVE_TOUCHPOINT = "EXECUTIVE_TOUCHPOINT"


class OptimizationStatus(str, Enum):
    """MILP solver termination status."""
    OPTIMAL      = "OPTIMAL"       # Solver found the global optimum
    FEASIBLE     = "FEASIBLE"      # Feasible but not proven optimal (time-limited)
    INFEASIBLE   = "INFEASIBLE"    # Budget constraints too tight; partial plan returned
    DEGRADED     = "DEGRADED"      # Heuristic fallback used (solver unavailable)


class TreatmentType(str, Enum):
    """Binary treatment types recorded in sales_df / marketing_df."""
    DISCOUNT_APPLIED    = "DISCOUNT_APPLIED"
    CAMPAIGN_EXPOSED    = "CAMPAIGN_EXPOSED"
    CSM_ASSIGNED        = "CSM_ASSIGNED"
    REP_OUTREACH        = "REP_OUTREACH"
    EXECUTIVE_SPONSOR   = "EXECUTIVE_SPONSOR"


class CausalEngineMode(str, Enum):
    """Double-ML estimation mode selected at runtime."""
    FULL_DML        = "FULL_DML"         # Full Double ML with cross-fitting
    RIDGE_DML       = "RIDGE_DML"        # Ridge-regularised DML (data-scarce fallback)
    OLS_BASELINE    = "OLS_BASELINE"     # Naïve OLS (minimal data fallback)


class HeterogeneitySegment(str, Enum):
    """Segments identified in the causal heterogeneity map."""
    HIGH_RESPONDERS     = "HIGH_RESPONDERS"
    LOW_RESPONDERS      = "LOW_RESPONDERS"
    NEGATIVE_RESPONDERS = "NEGATIVE_RESPONDERS"   # Treatment backfired
    UNCERTAIN           = "UNCERTAIN"


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 09 — TOPOLOGY OPTIMIZER
# POST /api/v2/godtier/optimization/topology
# ─────────────────────────────────────────────────────────────────────────────

class CustomerIntervention(BaseModel):
    """
    Optimal resource allocation assigned to a single customer by the MILP solver.
    Represents one row of the Revenue Operations Master Schedule.
    """

    customer_id: str = Field(
        ...,
        description="Unique customer identifier from engineered_df.",
    )
    customer_name: str = Field(
        "Unknown",
        description="Human-readable customer name. Falls back to customer_id if absent.",
    )
    segment: str = Field(
        "Unknown",
        description="Customer segment (Enterprise / Mid-Market / SMB).",
    )
    churn_probability: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Pre-intervention churn probability from engineered_df.",
    )
    arr: float = Field(
        0.0,
        description="Customer's current Annual Recurring Revenue in base currency.",
    )
    intervention_type: InterventionType = Field(
        ...,
        description="Primary resource lever allocated to this customer.",
    )
    rep_hours_allocated: float = Field(
        0.0,
        ge=0.0,
        description="Sales-rep hours allocated to this customer in the planning period.",
    )
    csm_interventions_allocated: int = Field(
        0,
        ge=0,
        description="Number of CSM touch-points scheduled for this customer.",
    )
    campaign_spend_allocated: float = Field(
        0.0,
        ge=0.0,
        description="Marketing campaign budget allocated in base currency units.",
    )
    projected_churn_reduction: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description=(
            "Estimated absolute reduction in churn probability post-intervention "
            "(e.g. 0.12 means churn drops from 0.35 → 0.23)."
        ),
    )
    projected_arr_retained: float = Field(
        0.0,
        ge=0.0,
        description="Expected ARR retained as a result of this intervention (currency units).",
    )
    roi_score: float = Field(
        0.0,
        description=(
            "Return on investment for this allocation: "
            "projected_arr_retained / total_resource_cost. Higher = more efficient."
        ),
    )
    priority_rank: int = Field(
        0,
        ge=0,
        description="Rank in the master schedule (1 = highest ROI; act on this first).",
    )
    action_deadline_days: int = Field(
        30,
        ge=1,
        description="Recommended days within which the intervention should be initiated.",
    )
    rationale: str = Field(
        "",
        description="Plain-English explanation of why this allocation was selected by the solver.",
    )


class BudgetConstraintSummary(BaseModel):
    """Utilisation report for each resource pool after MILP optimisation."""

    resource: str = Field(..., description="Resource label (e.g. 'rep_hours', 'csm_interventions').")
    budget_total: float = Field(0.0, description="Total available budget for this resource.")
    budget_used: float = Field(0.0, description="Budget consumed by the optimal allocation.")
    budget_slack: float = Field(0.0, description="Remaining unused budget (total − used).")
    utilisation_pct: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Fraction of the resource pool consumed (0-1).",
    )


class SegmentAllocationSummary(BaseModel):
    """Aggregate allocation statistics broken down by customer segment."""

    segment: str = Field(..., description="Customer segment name.")
    n_customers: int = Field(0, description="Number of customers in this segment receiving allocations.")
    total_rep_hours: float = Field(0.0, description="Total rep hours allocated across this segment.")
    total_csm_interventions: int = Field(0, description="Total CSM interventions scheduled.")
    total_campaign_spend: float = Field(0.0, description="Total campaign spend allocated.")
    projected_arr_retained: float = Field(0.0, description="Aggregate projected ARR retained for this segment.")
    avg_churn_reduction: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Average absolute churn-probability reduction across customers in this segment.",
    )


class TopologyOptimizationRequest(BaseModel):
    """
    Request body for POST /api/v2/godtier/optimization/topology.
    All budget fields are optional; sensible defaults are derived from cache data
    when not provided.
    """

    max_rep_hours: Optional[float] = Field(
        None,
        ge=0.0,
        description=(
            "Total rep-hours budget across the portfolio for the planning period. "
            "Defaults to 200h if not provided."
        ),
    )
    max_csm_interventions: Optional[int] = Field(
        None,
        ge=0,
        description=(
            "Total CSM intervention slots available. "
            "Defaults to 50 if not provided."
        ),
    )
    max_campaign_spend: Optional[float] = Field(
        None,
        ge=0.0,
        description=(
            "Total marketing campaign budget in base currency. "
            "Defaults to 10,000 if not provided."
        ),
    )
    planning_period_days: int = Field(
        30,
        ge=7,
        le=365,
        description="Planning horizon in days. Defaults to a 30-day sprint.",
    )
    churn_weight: float = Field(
        0.7,
        ge=0.0,
        le=1.0,
        description=(
            "Weight applied to churn-reduction in the objective function "
            "(remainder applied to ARR-retention). Higher = more churn-focused."
        ),
    )
    top_n_customers: Optional[int] = Field(
        None,
        ge=1,
        le=500,
        description=(
            "Restrict optimisation to the top-N customers by ARR-at-risk. "
            "If None, all customers in engineered_df are considered."
        ),
    )


class TopologyOptimizationResponse(BaseModel):
    """
    Revenue Operations Master Schedule returned by
    POST /api/v2/godtier/optimization/topology.
    """

    master_schedule: List[CustomerIntervention] = Field(
        default_factory=list,
        description=(
            "Per-customer intervention assignments sorted ascending by priority_rank. "
            "Act on rank-1 first."
        ),
    )
    budget_utilisation: List[BudgetConstraintSummary] = Field(
        default_factory=list,
        description="Resource utilisation report for each budget pool.",
    )
    segment_breakdown: List[SegmentAllocationSummary] = Field(
        default_factory=list,
        description="Aggregate allocation statistics per customer segment.",
    )
    n_customers_optimized: int = Field(
        0,
        description="Total number of customers included in the optimisation.",
    )
    total_portfolio_arr_at_risk: float = Field(
        0.0,
        description="Sum of ARR for all at-risk customers (churn_probability > 0.5).",
    )
    total_arr_projected_retained: float = Field(
        0.0,
        description="Total ARR expected to be retained through the optimal allocation.",
    )
    total_resource_cost: float = Field(
        0.0,
        description="Estimated monetary cost of the full allocation plan.",
    )
    overall_portfolio_roi: float = Field(
        0.0,
        description="Portfolio-level ROI: total_arr_projected_retained / total_resource_cost.",
    )
    solver_status: OptimizationStatus = Field(
        OptimizationStatus.DEGRADED,
        description="MILP solver termination status.",
    )
    solver_objective_value: float = Field(
        0.0,
        description="Final objective function value returned by the MILP solver.",
    )
    n_decision_variables: int = Field(
        0,
        description="Total number of continuous decision variables in the MILP.",
    )
    n_constraints: int = Field(
        0,
        description="Total number of constraints (budget + per-customer bounds) in the MILP.",
    )
    optimality_gap_pct: float = Field(
        0.0,
        ge=0.0,
        description=(
            "Gap between the best found solution and the proven lower bound, "
            "as a percentage. 0.0 when status is OPTIMAL."
        ),
    )
    summary_narrative: str = Field(
        "",
        description=(
            "Board-ready 3-sentence summary of the optimal allocation plan, "
            "key resource bottlenecks, and projected ARR impact."
        ),
    )
    data_availability: FeatureAvailability = Field(
        FeatureAvailability.OFFLINE,
        description="ACTIVE/PARTIAL/OFFLINE reflecting engineered_df readiness.",
    )
    overall_confidence: ConfidenceLevel = Field(
        ConfidenceLevel.LOW,
        description="Confidence level based on data volume and solver convergence.",
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal diagnostic messages from the optimisation pipeline.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 10 — CAUSAL COUNTERFACTUAL ENGINE
# GET /api/v2/godtier/causal/counterfactual
# ─────────────────────────────────────────────────────────────────────────────

class CATEEstimate(BaseModel):
    """
    Conditional Average Treatment Effect estimate for a single customer,
    quantifying how much a specific treatment changed their churn probability.
    """

    customer_id: str = Field(..., description="Unique customer identifier.")
    customer_name: str = Field("Unknown", description="Customer display name.")
    segment: str = Field("Unknown", description="Customer segment.")
    treatment_type: TreatmentType = Field(
        ...,
        description="The intervention whose causal effect is being estimated.",
    )
    treatment_received: bool = Field(
        False,
        description="True if this customer actually received the treatment in the historical record.",
    )
    cate: float = Field(
        0.0,
        description=(
            "Estimated Conditional Average Treatment Effect on churn probability. "
            "Negative values mean the treatment reduced churn (beneficial). "
            "Units: absolute probability shift (e.g. −0.08 = 8 pp churn reduction)."
        ),
    )
    cate_lower_ci: float = Field(
        0.0,
        description="Lower bound of the 95% confidence interval for CATE.",
    )
    cate_upper_ci: float = Field(
        0.0,
        description="Upper bound of the 95% confidence interval for CATE.",
    )
    arr: float = Field(
        0.0,
        description="Customer's current ARR in base currency.",
    )
    counterfactual_arr_delta: float = Field(
        0.0,
        description=(
            "Estimated ARR impact of the treatment: arr × (−cate). "
            "Positive = revenue saved; negative = revenue lost due to backfire."
        ),
    )
    propensity_score: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description=(
            "Estimated probability of receiving the treatment given confounders "
            "(output of the nuisance propensity model in the DML framework)."
        ),
    )
    effect_heterogeneity: HeterogeneitySegment = Field(
        HeterogeneitySegment.UNCERTAIN,
        description="Cluster label indicating this customer's treatment-responsiveness group.",
    )


class HistoricalAuditRecord(BaseModel):
    """
    One row of the Historical Audit Report: a past intervention evaluated
    against what would have happened under the optimal counterfactual.
    """

    customer_id: str = Field(..., description="Customer identifier.")
    customer_name: str = Field("Unknown", description="Customer display name.")
    treatment_type: TreatmentType = Field(..., description="Treatment applied historically.")
    treatment_date: Optional[str] = Field(
        None,
        description="ISO-8601 date string when treatment was applied. None if unknown.",
    )
    actual_outcome_churn_delta: float = Field(
        0.0,
        description="Observed change in churn probability in the period following treatment.",
    )
    counterfactual_outcome_churn_delta: float = Field(
        0.0,
        description=(
            "Estimated counterfactual outcome: what churn delta would have been "
            "under the optimal treatment (from CATE estimates)."
        ),
    )
    foregone_arr: float = Field(
        0.0,
        description=(
            "ARR delta between counterfactual and actual outcome: "
            "positive means money was left on the table by not using the optimal intervention."
        ),
    )
    what_if_recommendation: str = Field(
        "",
        description=(
            "Plain-English 'what-if' recommendation: what intervention "
            "should have been applied and why."
        ),
    )
    confidence: ConfidenceLevel = Field(
        ConfidenceLevel.LOW,
        description="Confidence in the counterfactual estimate for this record.",
    )


class HeterogeneityMapEntry(BaseModel):
    """One cluster in the Causal Heterogeneity Map."""

    cluster_label: HeterogeneitySegment = Field(
        ...,
        description="Cluster identity: HIGH_RESPONDERS / LOW_RESPONDERS / NEGATIVE_RESPONDERS / UNCERTAIN.",
    )
    n_customers: int = Field(0, description="Number of customers in this cluster.")
    mean_cate: float = Field(
        0.0,
        description="Average CATE across customers in this cluster (absolute probability shift).",
    )
    mean_arr: float = Field(
        0.0,
        description="Average customer ARR in this cluster.",
    )
    total_arr: float = Field(
        0.0,
        description="Total ARR at stake in this cluster.",
    )
    recommended_treatment: Optional[TreatmentType] = Field(
        None,
        description="Treatment with highest average CATE for this cluster.",
    )
    segments_represented: List[str] = Field(
        default_factory=list,
        description="Customer segments (Enterprise / SMB / …) represented in this cluster.",
    )
    strategic_note: str = Field(
        "",
        description="Plain-English strategic guidance for this cluster.",
    )


class DMLNuisanceMetrics(BaseModel):
    """Cross-validation metrics for the two nuisance models in the DML framework."""

    outcome_model_r2: float = Field(
        0.0,
        description="Out-of-fold R² of the outcome nuisance model (Y ~ X).",
    )
    treatment_model_auroc: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Out-of-fold AUROC of the propensity/treatment nuisance model (T ~ X).",
    )
    n_cross_fit_folds: int = Field(
        5,
        description="Number of cross-fitting folds used in the DML procedure.",
    )
    n_confounders: int = Field(
        0,
        description="Number of confounder features (columns from engineered_df) used.",
    )
    regularisation_alpha: float = Field(
        0.0,
        description="Ridge / Lasso alpha used in RIDGE_DML mode. 0.0 in FULL_DML mode.",
    )


class CounterfactualResponse(BaseModel):
    """
    Historical Audit Report and Causal Heterogeneity Map returned by
    GET /api/v2/godtier/causal/counterfactual.
    """

    cate_estimates: List[CATEEstimate] = Field(
        default_factory=list,
        description=(
            "Per-customer CATE estimates, sorted descending by |cate| "
            "(largest absolute effect first)."
        ),
    )
    historical_audit: List[HistoricalAuditRecord] = Field(
        default_factory=list,
        description=(
            "Audit of past interventions comparing actual vs counterfactual outcomes. "
            "Sorted descending by foregone_arr."
        ),
    )
    heterogeneity_map: List[HeterogeneityMapEntry] = Field(
        default_factory=list,
        description=(
            "Causal Heterogeneity Map: customer clusters grouped by treatment responsiveness, "
            "with strategic recommendations per cluster."
        ),
    )
    nuisance_metrics: DMLNuisanceMetrics = Field(
        default_factory=DMLNuisanceMetrics,
        description="Cross-validation performance of the two DML nuisance models.",
    )
    engine_mode: CausalEngineMode = Field(
        CausalEngineMode.OLS_BASELINE,
        description=(
            "FULL_DML = proper cross-fitted Double ML; "
            "RIDGE_DML = regularised fallback (data-scarce); "
            "OLS_BASELINE = naïve OLS (minimal-data last-resort)."
        ),
    )
    treatment_analyzed: TreatmentType = Field(
        TreatmentType.DISCOUNT_APPLIED,
        description="The primary treatment whose causal effect was estimated in this run.",
    )
    n_treated_customers: int = Field(
        0,
        description="Number of customers who received the treatment historically.",
    )
    n_control_customers: int = Field(
        0,
        description="Number of customers who did not receive the treatment (control group).",
    )
    average_treatment_effect: float = Field(
        0.0,
        description=(
            "Portfolio-wide Average Treatment Effect (ATE): "
            "mean CATE across all customers. Negative = treatment reduces churn on average."
        ),
    )
    total_foregone_arr: float = Field(
        0.0,
        description=(
            "Total ARR foregone across all historical interventions: "
            "sum of positive foregone_arr entries in the audit report."
        ),
    )
    total_counterfactual_arr_gain: float = Field(
        0.0,
        description=(
            "Estimated total ARR that would have been retained had optimal "
            "interventions been applied historically."
        ),
    )
    summary_narrative: str = Field(
        "",
        description=(
            "Board-ready 3-sentence causal narrative: which treatment worked, "
            "for whom, and how much ARR was left on the table."
        ),
    )
    data_availability: FeatureAvailability = Field(
        FeatureAvailability.OFFLINE,
        description="ACTIVE/PARTIAL/OFFLINE reflecting availability of treatment + confounder data.",
    )
    overall_confidence: ConfidenceLevel = Field(
        ConfidenceLevel.LOW,
        description="Confidence based on sample size, overlap, and nuisance model quality.",
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal diagnostic warnings from the causal estimation pipeline.",
    )