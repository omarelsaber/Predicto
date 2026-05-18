"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/models/response_models.py                                              ║
║  Predicto V2 — Pydantic response contracts for Phase 2 API endpoints.      ║
║                                                                              ║
║  All models use Pydantic v2 syntax (model_config, Field with description). ║
║  Frontend should treat every numeric field as nullable — a 0.0 return      ║
║  always means "no data" not "zero revenue".                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ─────────────────────────────────────────────────────────────────────────────
# SHARED ENUMS
# ─────────────────────────────────────────────────────────────────────────────

class FeatureAvailability(str, Enum):
    ACTIVE  = "ACTIVE"
    PARTIAL = "PARTIAL"
    OFFLINE = "OFFLINE"


class ConfidenceLevel(str, Enum):
    HIGH    = "HIGH"    # all required columns present, N ≥ 50
    MEDIUM  = "MEDIUM"  # some columns degraded OR N < 50
    LOW     = "LOW"     # table absent or < 10 rows; fallback value returned


class AIInnovation(str, Enum):
    DEAL_PRIORITY   = "DEAL_PRIORITY_SCORER"
    CHURN_WARNING   = "COMPETITIVE_CHURN_WARNING"
    EXPANSION       = "REVENUE_EXPANSION_RECOMMENDER"


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v2/revops/kpis
# ─────────────────────────────────────────────────────────────────────────────

class KPIValue(BaseModel):
    """A single portfolio-wide RevOps KPI with its computed value and metadata."""

    key: str = Field(
        ...,
        description="Machine-readable KPI identifier (e.g. 'FAV', 'RER').",
    )
    label: str = Field(
        ...,
        description="Human-readable KPI name for frontend display.",
    )
    description: str = Field(
        ...,
        description="Plain-English explanation of what this KPI measures.",
    )
    value: float = Field(
        ...,
        description=(
            "Portfolio-wide average. Returns 0.0 when the underlying table "
            "is missing or degraded — never null."
        ),
    )
    unit: str = Field(
        ...,
        description="Display unit hint: 'ratio', 'percent', 'score', 'currency'.",
    )
    benchmark: Optional[float] = Field(
        None,
        description="Target / healthy benchmark value for this KPI, if defined.",
    )
    is_healthy: Optional[bool] = Field(
        None,
        description=(
            "True if value meets or exceeds benchmark, False if below. "
            "None when no benchmark is defined."
        ),
    )
    confidence: ConfidenceLevel = Field(
        ...,
        description=(
            "Calculation confidence: HIGH = full data, MEDIUM = degraded, "
            "LOW = missing table (fallback value returned)."
        ),
    )
    n_customers: int = Field(
        0,
        description="Number of customers contributing to this KPI average.",
    )


class RevOpsKPIResponse(BaseModel):
    """Portfolio-wide RevOps KPI bundle returned by GET /api/v2/revops/kpis."""

    kpis: List[KPIValue] = Field(
        ...,
        description="Ordered list of the 7 core RevOps KPIs.",
    )
    overall_health_score: int = Field(
        ...,
        description="Cache health score (0-100) at time of calculation.",
    )
    tables_loaded: List[str] = Field(
        ...,
        description="Raw table names currently in cache.",
    )
    active_model: Optional[str] = Field(
        None,
        description="'full' (GRU+XGBoost hybrid) or 'lite' (XGBoost cold-start).",
    )
    degradation_events: int = Field(
        0,
        description="Total schema degradation events recorded during ingestion.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v2/deals/priority
# ─────────────────────────────────────────────────────────────────────────────

class DealSignalType(str, Enum):
    DISCOUNT_CLIFF   = "DISCOUNT_CLIFF"
    MARGIN_PRESSURE  = "MARGIN_PRESSURE"
    SEGMENT_MISMATCH = "SEGMENT_MISMATCH"
    HIGH_PRIORITY    = "HIGH_PRIORITY"
    LONG_CYCLE       = "LONG_CYCLE"
    HIGH_ARR         = "HIGH_ARR"
    CHURN_RISK       = "CHURN_RISK"
    GENERIC          = "GENERIC"


class DealRecord(BaseModel):
    """A single deal row in the priority-ranked list."""

    deal_id: str = Field(
        ...,
        description="Unique deal / opportunity identifier from the sales table.",
    )
    deal_name: str = Field(
        ...,
        description="Deal or company name. Falls back to deal_id if absent.",
    )
    priority_score: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description=(
            "DealPriorityScorer output (0-100). Higher = work this deal first. "
            "Scored on: ARR magnitude, discount depth, RSFS, segment fit, "
            "sales cycle velocity."
        ),
    )
    arr: float = Field(
        0.0,
        description="Annual Recurring Revenue for this deal in base currency units.",
    )
    rep: str = Field(
        "Unknown",
        description="Sales rep or owner name assigned to this deal.",
    )
    segment: str = Field(
        "Unknown",
        description="Customer segment (e.g. 'Enterprise', 'Mid-Market', 'SMB').",
    )
    discount_pct: float = Field(
        0.0,
        description="Discount percentage applied to this deal (0-1 range).",
    )
    days_in_pipeline: int = Field(
        0,
        description="Number of days this deal has been in the pipeline.",
    )
    top_signal: str = Field(
        ...,
        description=(
            "Plain-English explanation of the single most impactful signal "
            "driving this deal's score (e.g. 'Discount 28% — approaching margin cliff')."
        ),
    )
    top_signal_type: DealSignalType = Field(
        DealSignalType.GENERIC,
        description="Machine-readable enum of the top signal for badge colouring.",
    )
    recommended_action: str = Field(
        ...,
        description="Short action label for the frontend CTA button.",
    )
    win_probability: Optional[float] = Field(
        None,
        description="ML-estimated win probability (0-1). None if model unavailable.",
    )


class DealPriorityResponse(BaseModel):
    """Ranked deal list returned by GET /api/v2/deals/priority."""

    deals: List[DealRecord] = Field(
        ...,
        description="Deals sorted descending by priority_score.",
    )
    total_deals: int = Field(
        ...,
        description="Total number of open deals evaluated.",
    )
    total_arr_at_stake: float = Field(
        0.0,
        description="Sum of ARR across all deals in the list.",
    )
    high_discount_threshold: float = Field(
        0.30,
        description="Discount percentage above which a deal enters the 'margin cliff' zone.",
    )
    safe_margin_floor: float = Field(
        0.05,
        description="Minimum margin below which deal profitability is at risk.",
    )
    scorer_mode: str = Field(
        "mock",
        description="'ml' if cached ML model was used; 'mock' if heuristic fallback.",
    )
    data_availability: FeatureAvailability = Field(
        ...,
        description="ACTIVE/PARTIAL/OFFLINE reflecting sales table state.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v2/intelligence/hub
# ─────────────────────────────────────────────────────────────────────────────

class HeadlineKPI(BaseModel):
    """A single headline metric in the Intelligence Hub KPI bar."""

    key: str = Field(..., description="Metric identifier.")
    label: str = Field(..., description="Display label.")
    value: float = Field(..., description="Numeric value.")
    unit: str = Field(..., description="'currency', 'percent', 'ratio', 'count'.")
    delta: Optional[float] = Field(
        None,
        description="Period-over-period change. Positive = improvement.",
    )
    delta_label: Optional[str] = Field(
        None,
        description="Human-readable delta label, e.g. '+$4.2K vs last month'.",
    )
    trend: Optional[str] = Field(
        None,
        description="'up', 'down', or 'flat'.",
    )


class RevenueRiskItem(BaseModel):
    """A single at-risk customer in the Revenue Risk Summary."""

    customer_id: str = Field(..., description="Customer identifier.")
    customer_name: str = Field(..., description="Customer display name.")
    arr: float = Field(0.0, description="ARR at risk for this customer.")
    risk_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Churn or revenue risk probability (0-1).",
    )
    risk_reason: str = Field(
        ...,
        description=(
            "Plain-English explanation of the primary risk driver, "
            "e.g. 'Feature adoption dropped 40% in month 2 — churn precursor pattern'."
        ),
    )
    top_kpi_signal: str = Field(
        ...,
        description="The specific KPI that is most out of range for this customer.",
    )
    recommended_action: str = Field(
        ...,
        description="Suggested next step for the CSM or AE.",
    )


class ActionQueueItem(BaseModel):
    """A single card in the Intelligence Hub Action Queue (one per AI Innovation)."""

    innovation: AIInnovation = Field(
        ...,
        description="Which AI Innovation module generated this action.",
    )
    priority_rank: int = Field(
        ...,
        description="1 = most urgent. Cards should be sorted ascending by this field.",
    )
    title: str = Field(
        ...,
        description="Short headline for the action card (≤ 60 chars).",
    )
    description: str = Field(
        ...,
        description="One-sentence supporting detail with specific data points.",
    )
    entity_id: str = Field(
        ...,
        description="The deal, customer, or campaign ID this action references.",
    )
    entity_name: str = Field(
        ...,
        description="Human-readable name of the entity.",
    )
    metric_value: float = Field(
        ...,
        description=(
            "The key metric driving urgency "
            "(score 0-100, risk probability, or ARR opportunity)."
        ),
    )
    metric_label: str = Field(
        ...,
        description="Label for metric_value (e.g. 'Priority Score', 'Churn Risk', 'Expansion ARR').",
    )
    cta_label: str = Field(
        ...,
        description="Call-to-action button label.",
    )


class IntelligenceHubResponse(BaseModel):
    """Master response for GET /api/v2/intelligence/hub — powers the executive landing page."""

    # ── Headline KPI bar ──────────────────────────────────────────────────────
    headline_kpis: List[HeadlineKPI] = Field(
        ...,
        description=(
            "Ordered KPI bar: Current MRR, 30-day MRR Δ, Avg Churn Risk, "
            "Expansion ARR Opportunity."
        ),
    )

    # ── Revenue Risk Summary ──────────────────────────────────────────────────
    revenue_risk_summary: List[RevenueRiskItem] = Field(
        ...,
        description="Top 3 at-risk customers ranked by ARR × risk_score.",
    )

    # ── Action Queue ──────────────────────────────────────────────────────────
    action_queue: List[ActionQueueItem] = Field(
        ...,
        description=(
            "Three action cards, one per AI Innovation, ranked by business impact. "
            "Always length 3 — stubs are returned if data is insufficient."
        ),
    )

    # ── AI Analyst (Phase 4) ──────────────────────────────────────────────────
    root_cause_narrative: Optional[RootCauseNarrative] = Field(
        None,
        description=(
            "Executive 2-3 sentence AI narrative of portfolio risk. "
            "None if LLM analysis is skipped or failed."
        ),
    )

    # ── Data state ────────────────────────────────────────────────────────────
    overall_health_score: int = Field(
        ...,
        description="Cache health score (0-100).",
    )
    active_model: Optional[str] = Field(
        None,
        description="'full' or 'lite'.",
    )
    tables_loaded: List[str] = Field(
        ...,
        description="Tables currently in cache.",
    )
    is_fast_mode: bool = Field(
        ...,
        description="True when the lite (cold-start) model is active.",
    )
    data_availability: FeatureAvailability = Field(
        ...,
        description="Overall feature availability status for this hub response.",
    )

# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v2/churn/competitive
# ─────────────────────────────────────────────────────────────────────────────

class ChurnAlertLevel(str, Enum):
    CRITICAL = "CRITICAL"   # churn_probability > 0.70
    WARNING  = "WARNING"    # churn_probability > 0.50
    MONITOR  = "MONITOR"    # churn_probability <= 0.50


class ChurnScorerMode(str, Enum):
    ML   = "ml"    # ColdStartRouter / HybridFusionModel used
    HEURISTIC = "heuristic"  # rule-based fallback


class ChurnCustomerRecord(BaseModel):
    """A single customer row in the competitive churn warning list."""

    customer_id: str = Field(
        ...,
        description="Unique customer identifier from snapshots or engineered_df.",
    )
    customer_name: str = Field(
        ...,
        description="Customer display name. Falls back to customer_id if absent.",
    )
    arr: float = Field(
        0.0,
        description="Current Annual Recurring Revenue for this customer.",
    )
    churn_probability: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description=(
            "Estimated probability that this customer will churn. "
            "Source: HybridFusionModel churn_risk_score when available, "
            "heuristic fallback otherwise."
        ),
    )
    alert_level: ChurnAlertLevel = Field(
        ...,
        description=(
            "CRITICAL if churn_probability > 0.70, "
            "WARNING if > 0.50, MONITOR otherwise."
        ),
    )
    top_risk_signal: str = Field(
        ...,
        description=(
            "Plain-English explanation of the primary churn driver, e.g. "
            "'Feature adoption dropped 40% over 3 months — churn precursor pattern'."
        ),
    )
    recommended_action: str = Field(
        ...,
        description="Suggested next step for the CSM or AE.",
    )
    months_since_last_expansion: Optional[int] = Field(
        None,
        description="Months since the customer last expanded. None if unknown.",
    )
    support_ticket_trend: Optional[str] = Field(
        None,
        description="'rising', 'stable', or 'falling' — derived from last 3 snapshots.",
    )
    feature_adoption_score: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Normalised feature adoption ratio at last snapshot. None if absent.",
    )


class CompetitiveChurnResponse(BaseModel):
    """Ranked churn warning list returned by GET /api/v2/churn/competitive."""

    customers: List[ChurnCustomerRecord] = Field(
        ...,
        description="Customers sorted descending by churn_probability.",
    )
    total_customers: int = Field(
        ...,
        description="Total number of customers evaluated.",
    )
    critical_count: int = Field(
        0,
        description="Number of customers at CRITICAL alert level.",
    )
    warning_count: int = Field(
        0,
        description="Number of customers at WARNING alert level.",
    )
    total_arr_at_risk: float = Field(
        0.0,
        description=(
            "Sum of ARR for customers with alert_level CRITICAL or WARNING. "
            "Represents the maximum revenue exposure from near-term churn."
        ),
    )
    scorer_mode: ChurnScorerMode = Field(
        ...,
        description="'ml' if HybridFusionModel/ColdStartRouter was used; 'heuristic' otherwise.",
    )
    data_availability: FeatureAvailability = Field(
        ...,
        description="ACTIVE/PARTIAL/OFFLINE reflecting snapshots + engineered_df state.",
    )
    active_model: Optional[str] = Field(
        None,
        description="'full' (GRU+XGBoost) or 'lite' (XGBoost cold-start) or None.",
    )
    missing_features: List[str] = Field(
        default_factory=list,
        description=(
            "Columns absent from the source data that would improve prediction accuracy, "
            "e.g. ['nps_at_snapshot', 'support_tickets_at_snapshot']."
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v2/expansion/candidates
# ─────────────────────────────────────────────────────────────────────────────

class ExpansionCluster(str, Enum):
    CHAMPION  = "Champion"   # 30% expansion multiplier
    GROWTH    = "Growth"     # 18% expansion multiplier
    STABLE    = "Stable"     # 5%  expansion multiplier
    AT_RISK   = "At-Risk"    # 0%  expansion multiplier


class ExpansionCandidateRecord(BaseModel):
    """A single customer row in the expansion candidate list."""

    customer_id: str = Field(
        ...,
        description="Unique customer identifier.",
    )
    customer_name: str = Field(
        ...,
        description="Customer display name. Falls back to customer_id if absent.",
    )
    cluster: ExpansionCluster = Field(
        ...,
        description="K-Means cluster assignment: Champion, Growth, Stable, or At-Risk.",
    )
    arr: float = Field(
        0.0,
        description="Current ARR for this customer.",
    )
    expansion_multiplier: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description=(
            "Cluster-derived expansion multiplier: "
            "Champion=0.30, Growth=0.18, Stable=0.05, At-Risk=0.00."
        ),
    )
    predicted_expansion_arr: float = Field(
        ...,
        ge=0.0,
        description="Predicted incremental ARR: current_arr × expansion_multiplier.",
    )
    recommended_campaign_action: str = Field(
        ...,
        description=(
            "Specific campaign or outreach recommendation, e.g. "
            "'Executive Business Review + multi-year upsell offer'. "
            "Falls back to 'Upload attribution data to unlock playbook' when "
            "attribution_df is absent."
        ),
    )
    nps_at_last_snapshot: Optional[float] = Field(
        None,
        description="NPS score at the most recent snapshot. None if absent.",
    )
    feature_adoption_score: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Normalised feature adoption ratio. None if absent.",
    )
    months_as_customer: Optional[int] = Field(
        None,
        description="Tenure in months. None if first_seen date is unavailable.",
    )


class ExpansionCandidatesResponse(BaseModel):
    """Ranked expansion candidate list returned by GET /api/v2/expansion/candidates."""

    candidates: List[ExpansionCandidateRecord] = Field(
        ...,
        description=(
            "Customers sorted descending by predicted_expansion_arr. "
            "At-Risk customers (multiplier=0) are excluded by default."
        ),
    )
    total_candidates: int = Field(
        ...,
        description="Number of expansion candidates returned (At-Risk excluded).",
    )
    total_expansion_opportunity: float = Field(
        0.0,
        description="Sum of predicted_expansion_arr across all returned candidates.",
    )
    cluster_distribution: dict = Field(
        default_factory=dict,
        description=(
            "Count of customers per cluster across the full portfolio, including At-Risk. "
            "Keys: 'Champion', 'Growth', 'Stable', 'At-Risk'."
        ),
    )
    attribution_data_available: bool = Field(
        False,
        description=(
            "True when attribution_df is loaded; controls whether campaign playbook "
            "recommendations are data-driven or show the 'upload to unlock' stub."
        ),
    )
    clustering_feature_count: int = Field(
        ...,
        description=(
            "Number of features used to fit K-Means. Full model uses 4 features; "
            "degraded model uses 2 when NPS/support tickets are absent."
        ),
    )
    data_availability: FeatureAvailability = Field(
        ...,
        description="ACTIVE/PARTIAL/OFFLINE reflecting snapshots + engineered_df state.",
    )
    missing_features: List[str] = Field(
        default_factory=list,
        description=(
            "Columns absent that would improve cluster accuracy, "
            "e.g. ['nps_at_snapshot', 'support_tickets_at_snapshot']."
        ),
    )
# ─────────────────────────────────────────────────────────────────────────────
# SHARED ENUMS — Phase 4
# ─────────────────────────────────────────────────────────────────────────────

class ExplainContextType(str, Enum):
    """What kind of entity are we explaining?"""
    CHURN_CUSTOMER  = "churn_customer"    # Why is this customer at risk?
    DEAL_PRIORITY   = "deal_priority"     # Why is this deal high-priority?
    EXPANSION       = "expansion"         # Why is this customer an expansion candidate?
    GENERAL         = "general"           # Free-form entity explanation


class AnalystResponseStatus(str, Enum):
    """Whether the LLM call succeeded, partially degraded, or fully fell back."""
    SUCCESS  = "success"   # Full LLM response returned
    FALLBACK = "fallback"  # LLM unavailable — deterministic fallback string returned
    ERROR    = "error"     # Unexpected failure; safe error message returned


# ─────────────────────────────────────────────────────────────────────────────
# CHAT HISTORY (shared between explain and chat endpoints)
# ─────────────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    """A single turn in a multi-turn conversation history."""

    role: Literal["user", "assistant"] = Field(
        ...,
        description="Message author: 'user' or 'assistant'.",
    )
    content: str = Field(
        ...,
        min_length=1,
        max_length=8000,
        description="Message text. Max 8 000 chars to stay within Groq context limits.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/v2/analyst/explain
# ─────────────────────────────────────────────────────────────────────────────

class ExplanationRequest(BaseModel):
    """
    Request body for POST /api/v2/analyst/explain.

    The endpoint retrieves the entity's data from the cache automatically —
    the caller only needs to supply the entity identifier and type.
    """

    entity_id: str = Field(
        ...,
        min_length=1,
        max_length=256,
        description=(
            "The deal_id, customer_id, or opportunity_id to explain. "
            "Must exist in the relevant cached table."
        ),
    )
    context_type: ExplainContextType = Field(
        ...,
        description=(
            "Category of entity being explained. Controls which cache tables "
            "are pulled and which system prompt template is used."
        ),
    )
    max_tokens: int = Field(
        400,
        ge=100,
        le=800,
        description=(
            "Max tokens for the LLM response. Keep low (300-500) for the "
            "'Why?' drawer so the response appears quickly."
        ),
    )


class ExplanationResponse(BaseModel):
    """
    Response from POST /api/v2/analyst/explain.

    Always returns a narrative string — either LLM-generated or a
    deterministic fallback. Never 500s.
    """

    entity_id: str = Field(
        ...,
        description="The entity identifier that was explained.",
    )
    context_type: ExplainContextType = Field(
        ...,
        description="The context type that was used.",
    )
    narrative: str = Field(
        ...,
        description=(
            "2-4 sentence plain-English root-cause narrative, grounded strictly "
            "in the entity's cached data. Safe fallback text is returned when "
            "the LLM is unavailable."
        ),
    )
    data_snapshot: dict = Field(
        default_factory=dict,
        description=(
            "Key data points injected into the LLM context for this entity. "
            "Returned so the frontend can render supporting metric chips "
            "alongside the narrative without a second API call."
        ),
    )
    status: AnalystResponseStatus = Field(
        ...,
        description="SUCCESS / FALLBACK / ERROR — indicates LLM availability.",
    )
    tokens_used: Optional[int] = Field(
        None,
        description="Prompt + completion tokens consumed. None when LLM was not called.",
    )
    model_used: Optional[str] = Field(
        None,
        description="LLM model identifier. None when fallback was used.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/v2/analyst/chat
# ─────────────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """
    Request body for POST /api/v2/analyst/chat.

    Stateless: the caller is responsible for including the full conversation
    history on each turn. The backend injects the global portfolio context
    as a system prompt prefix — callers never need to send it themselves.
    """

    message: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description="The user's latest message / question.",
    )
    history: List[ChatMessage] = Field(
        default_factory=list,
        max_items=20,
        description=(
            "Full conversation history (alternating user/assistant turns). "
            "Capped at 20 turns. Older turns are truncated by the service "
            "to stay within the 8K Groq context window."
        ),
    )
    max_tokens: int = Field(
        600,
        ge=100,
        le=1200,
        description="Max tokens for the assistant's reply. Default 600.",
    )
    focus_entity_id: Optional[str] = Field(
        None,
        description=(
            "Optional entity ID to anchor the conversation. When provided, "
            "the service enriches the system prompt with that entity's specific "
            "data snapshot in addition to the global portfolio context."
        ),
    )
    focus_context_type: Optional[ExplainContextType] = Field(
        None,
        description=(
            "Required when focus_entity_id is provided. Tells the service "
            "which cache table to pull the entity snapshot from."
        ),
    )


class ChatResponse(BaseModel):
    """
    Response from POST /api/v2/analyst/chat.

    Always returns a reply string. Never 500s.
    """

    reply: str = Field(
        ...,
        description=(
            "The assistant's response, grounded in the injected portfolio context. "
            "Safe fallback text returned when LLM is unavailable."
        ),
    )
    updated_history: List[ChatMessage] = Field(
        ...,
        description=(
            "Full conversation history including the new user message and "
            "assistant reply. Pass this back on the next turn as `history`."
        ),
    )
    context_token_count: int = Field(
        0,
        description=(
            "Approximate token count of the system prompt context injected "
            "for this turn. Use to monitor proximity to Groq's 8K limit."
        ),
    )
    status: AnalystResponseStatus = Field(
        ...,
        description="SUCCESS / FALLBACK / ERROR.",
    )
    tokens_used: Optional[int] = Field(
        None,
        description="Prompt + completion tokens consumed by Groq.",
    )
    model_used: Optional[str] = Field(
        None,
        description="LLM model identifier. None when fallback was used.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# ROOT-CAUSE NARRATIVE (used in /intelligence/hub and cached at hydration)
# ─────────────────────────────────────────────────────────────────────────────

class RootCauseNarrative(BaseModel):
    """
    A pre-generated 2-3 sentence LLM narrative summarising the portfolio's
    top revenue risk. Cached at hydration time; served from cache on request.
    Included as an optional field in IntelligenceHubResponse.
    """

    narrative: str = Field(
        ...,
        description=(
            "2-3 sentence executive summary of the top revenue risk driver. "
            "Example: 'Three Enterprise accounts representing $420K ARR show "
            "accelerating feature adoption decline over the past 90 days — "
            "a leading indicator of churn 60 days ahead of renewal. "
            "Prioritise CSM outreach to Acme Corp, Initech, and Globodyne "
            "before the Q3 renewal window opens.'"
        ),
    )
    generated_at: Optional[str] = Field(
        None,
        description="ISO-8601 timestamp when this narrative was generated.",
    )
    status: AnalystResponseStatus = Field(
        AnalystResponseStatus.FALLBACK,
        description="Whether the narrative is LLM-generated (SUCCESS) or a deterministic fallback.",
    )
    top_risk_entity_ids: List[str] = Field(
        default_factory=list,
        description="Customer / deal IDs referenced in the narrative, for frontend deep-linking.",
    )

# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 01 — REVENUE SCENARIO SIMULATOR
# POST /api/v2/forecast/revenue-simulator
# ─────────────────────────────────────────────────────────────────────────────

class SimulatorRequest(BaseModel):
    """
    Input levers for the scenario simulator.

    All parameters are optional — omitting a lever keeps it at its current
    portfolio-wide value (the 'neutral' baseline).  The service clamps every
    input to a safe physiological range before computation.
    """

    discount_ceiling: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description=(
            "Maximum allowable discount fraction (0-1). "
            "Deals above this ceiling are re-scored with a boosted churn risk. "
            "Example: 0.20 = no deal may exceed 20% discount."
        ),
    )
    churn_intervention_threshold: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description=(
            "Churn probability above which a customer is actively intervened on. "
            "Lowering this threshold catches more customers earlier but signals "
            "more aggressive (costlier) CS investment."
        ),
    )
    expansion_activation_clusters: Optional[List[str]] = Field(
        None,
        description=(
            "List of K-Means cluster labels to activate for expansion outreach. "
            "Valid values: ['Champion', 'Growth', 'Stable', 'At-Risk']. "
            "Only customers in these clusters receive expansion ARR uplift."
        ),
    )
    forecast_months: int = Field(
        9,
        ge=1,
        le=9,
        description=(
            "Number of forward months to simulate (1–9). "
            "Months beyond the GRU trajectory depth are marked LOW_CONFIDENCE."
        ),
    )

    @field_validator("expansion_activation_clusters")
    @classmethod
    def validate_clusters(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        """Reject cluster labels that don't exist in the K-Means taxonomy."""
        valid = {"Champion", "Growth", "Stable", "At-Risk"}
        if v is not None:
            invalid = set(v) - valid
            if invalid:
                raise ValueError(
                    f"Unknown cluster label(s): {invalid}. "
                    f"Valid values: {valid}"
                )
        return v


# ── Per-month projection record ───────────────────────────────────────────────

class MonthlyProjection(BaseModel):
    """A single month in the simulated 9-month MRR forecast."""

    month: int = Field(
        ...,
        ge=1,
        le=9,
        description="Month index relative to today (1 = next month).",
    )
    projected_mrr: float = Field(
        0.0,
        description="Scenario MRR for this month (base currency units).",
    )
    baseline_mrr: float = Field(
        0.0,
        description="Baseline MRR for this month with no lever changes applied.",
    )
    mrr_delta: float = Field(
        0.0,
        description=(
            "projected_mrr − baseline_mrr.  Positive = scenario beats baseline."
        ),
    )
    confidence_lower: float = Field(
        0.0,
        description="Lower bound of the ±1σ confidence band for projected_mrr.",
    )
    confidence_upper: float = Field(
        0.0,
        description="Upper bound of the ±1σ confidence band for projected_mrr.",
    )
    confidence: ConfidenceLevel = Field(
        ConfidenceLevel.HIGH,
        description=(
            "HIGH  — GRU trajectory available for this month. "
            "MEDIUM — cold-start model active. "
            "LOW    — beyond trajectory depth; linear extrapolation used."
        ),
    )
    churn_arr_saved: float = Field(
        0.0,
        description="Estimated ARR retained vs. baseline due to intervention policy.",
    )
    expansion_arr_added: float = Field(
        0.0,
        description="Estimated incremental expansion ARR unlocked this month.",
    )


# ── Segment-level impact breakdown ────────────────────────────────────────────

class SegmentImpact(BaseModel):
    """Per-segment breakdown of the scenario delta."""

    segment: str = Field(..., description="Customer segment label (e.g. 'Enterprise').")
    baseline_arr: float = Field(0.0, description="Segment ARR under neutral scenario.")
    scenario_arr: float = Field(0.0, description="Segment ARR under this scenario.")
    arr_delta: float = Field(0.0, description="Absolute ARR change vs. baseline.")
    customers_affected: int = Field(
        0,
        description="Number of customers in this segment whose scores changed.",
    )


# ── Lever echo — validates and exposes the clamped input levers ───────────────

class AppliedLevers(BaseModel):
    """
    The actual lever values used in computation after clamping.
    Returned so the frontend can display 'Simulation ran with these settings.'
    """

    discount_ceiling: Optional[float] = Field(
        None,
        description="Discount ceiling applied (null = baseline discount distribution used).",
    )
    churn_intervention_threshold: Optional[float] = Field(
        None,
        description="Churn intervention threshold applied (null = no threshold shift).",
    )
    expansion_activation_clusters: List[str] = Field(
        default_factory=list,
        description="Cluster labels activated for expansion.",
    )
    forecast_months: int = Field(9, description="Months simulated.")
    discount_affected_deals: int = Field(
        0,
        description="Number of open deals re-scored due to discount ceiling.",
    )
    expansion_activated_customers: int = Field(
        0,
        description="Number of customers activated for expansion outreach.",
    )


# ── Master simulator response ─────────────────────────────────────────────────

class SimulatorResponse(BaseModel):
    """
    Full scenario simulation result.
    Returned by POST /api/v2/forecast/revenue-simulator.
    """

    # ── Month-by-month projection ─────────────────────────────────────────────
    monthly_projections: List[MonthlyProjection] = Field(
        ...,
        description="Ordered list of MonthlyProjection records, month 1 through forecast_months.",
    )

    # ── Scenario summary ──────────────────────────────────────────────────────
    total_projected_mrr_gain: float = Field(
        0.0,
        description=(
            "Sum of mrr_delta across all forecast months. "
            "Represents total additional MRR generated by the scenario vs. baseline."
        ),
    )
    total_churn_arr_saved: float = Field(
        0.0,
        description="Total ARR retained over the forecast horizon vs. baseline.",
    )
    total_expansion_arr_added: float = Field(
        0.0,
        description="Total incremental expansion ARR unlocked over the forecast horizon.",
    )
    net_arr_delta: float = Field(
        0.0,
        description=(
            "total_churn_arr_saved + total_expansion_arr_added − cost_of_intervention. "
            "Net revenue impact of the scenario."
        ),
    )

    # ── Segment breakdown ─────────────────────────────────────────────────────
    segment_impacts: List[SegmentImpact] = Field(
        default_factory=list,
        description="Per-segment ARR delta breakdown. Empty list if sales_df is absent.",
    )

    # ── Applied levers ────────────────────────────────────────────────────────
    applied_levers: AppliedLevers = Field(
        ...,
        description="Echo of the input levers as actually applied (post-clamping).",
    )

    # ── AI narrative ─────────────────────────────────────────────────────────
    scenario_narrative: str = Field(
        "",
        description=(
            "2-sentence plain-English summary of the scenario's revenue impact, "
            "generated deterministically when LLM is unavailable."
        ),
    )

    # ── Metadata ──────────────────────────────────────────────────────────────
    trajectory_mode: str = Field(
        "linear_fallback",
        description=(
            "'gru_full'     — full 9-month GRU trajectory used. "
            "'gru_coldstart' — XGBoost cold-start trajectory used. "
            "'linear_fallback' — no model output; linear extrapolation from snapshots."
        ),
    )
    data_availability: FeatureAvailability = Field(
        FeatureAvailability.OFFLINE,
        description="ACTIVE / PARTIAL / OFFLINE reflecting cache readiness.",
    )
    overall_confidence: ConfidenceLevel = Field(
        ConfidenceLevel.LOW,
        description="Lowest confidence level across all monthly projections.",
    )
    customers_in_simulation: int = Field(
        0,
        description="Number of customers included in this simulation.",
    )
    missing_columns: List[str] = Field(
        default_factory=list,
        description="Column names absent from source data that would improve accuracy.",
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal warnings surfaced during simulation (e.g. lever clamping).",
    )


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 04 — CASCADING REVENUE CLIFF DETECTOR
# GET /api/v2/risk/revenue-cliff-detector
# ─────────────────────────────────────────────────────────────────────────────

class CliffAlertLevel(str, Enum):
    CLIFF_ALERT = "CLIFF_ALERT"  # severity_score > 0.25 AND high_risk_arr > 5% MRR
    ELEVATED    = "ELEVATED"     # severity_score 0.10–0.25
    NORMAL      = "NORMAL"       # severity_score < 0.10


class RenewalSource(str, Enum):
    KNOWN     = "KNOWN"      # contract_renewal_month present in snapshots_df
    ESTIMATED = "ESTIMATED"  # inferred from first_seen + contract_tenure heuristic


# ── Per-month cliff window ─────────────────────────────────────────────────────

class CliffMonthWindow(BaseModel):
    """
    Revenue concentration and risk profile for a single forward month.
    One record per month 1–9 in the forecast horizon.
    """

    month: int = Field(
        ...,
        ge=1,
        le=9,
        description="Month index relative to today.",
    )
    total_renewing_arr: float = Field(
        0.0,
        description="Sum of ARR for all customers whose contract renews in this month.",
    )
    high_risk_arr: float = Field(
        0.0,
        description=(
            "ARR attributed to customers with churn_probability > HIGH_RISK_THRESHOLD "
            "(default 0.65) renewing this month."
        ),
    )
    medium_risk_arr: float = Field(
        0.0,
        description="ARR for customers with churn_probability in [0.40, 0.65) renewing this month.",
    )
    low_risk_arr: float = Field(
        0.0,
        description="ARR for customers with churn_probability < 0.40 renewing this month.",
    )
    cliff_severity_score: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description=(
            "high_risk_arr / total_renewing_arr. "
            "0.0 when no renewals in this month."
        ),
    )
    renewing_customer_count: int = Field(
        0,
        description="Total number of customers renewing in this month.",
    )
    high_risk_customer_count: int = Field(
        0,
        description="Number of high-risk customers renewing this month.",
    )
    alert_level: CliffAlertLevel = Field(
        CliffAlertLevel.NORMAL,
        description="CLIFF_ALERT / ELEVATED / NORMAL based on severity_score and ARR thresholds.",
    )
    confidence: ConfidenceLevel = Field(
        ConfidenceLevel.HIGH,
        description=(
            "HIGH  — GRU trajectory covers this month. "
            "LOW   — beyond GRU depth (cold-start: months 4-9)."
        ),
    )
    renewal_source: RenewalSource = Field(
        RenewalSource.ESTIMATED,
        description="Whether renewal dates in this window are known or estimated.",
    )
    top_risk_customer_ids: List[str] = Field(
        default_factory=list,
        description="Up to 5 customer IDs with highest ARR × churn_probability in this window.",
    )


# ── Per-customer renewal record ────────────────────────────────────────────────

class CustomerRenewalRecord(BaseModel):
    """
    One customer's renewal risk profile — used in the detailed per-cliff drill-down.
    """

    customer_id: str = Field(..., description="Unique customer identifier.")
    customer_name: str = Field(
        "Unknown",
        description="Customer display name. Falls back to customer_id.",
    )
    renewal_month: int = Field(
        ...,
        ge=1,
        le=9,
        description="Month index when this customer's contract renews.",
    )
    arr: float = Field(0.0, description="Annual Recurring Revenue for this customer.")
    churn_probability_at_renewal: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="GRU (or fallback) churn probability at the customer's renewal month.",
    )
    arr_at_risk: float = Field(
        0.0,
        description="arr × churn_probability_at_renewal.",
    )
    edi_score: float = Field(
        0.0,
        description="Engagement Decay Index from engineered_df (higher = more decay).",
    )
    sbs_score: float = Field(
        0.0,
        description="Support Burden Score from engineered_df.",
    )
    fav_score: float = Field(
        0.0,
        description="Feature Adoption Velocity from engineered_df.",
    )
    renewal_source: RenewalSource = Field(
        RenewalSource.ESTIMATED,
        description="KNOWN or ESTIMATED renewal date.",
    )
    driver_kpis: List[str] = Field(
        default_factory=list,
        description=(
            "Top 1-3 KPI names with the largest deviation from healthy benchmark "
            "for this customer (e.g. ['EDI', 'SBS'])."
        ),
    )


# ── Compounding risk drivers (portfolio-level signal for the top cliff) ────────

class CliffDriverKPI(BaseModel):
    """
    A KPI identified as a primary driver of the top cliff month.
    Derived from ANOVA across at-risk customers in the cliff window.
    """

    kpi_name: str = Field(
        ...,
        description="KPI identifier (e.g. 'EDI', 'SBS', 'FAV').",
    )
    kpi_label: str = Field(
        ...,
        description="Human-readable KPI name (e.g. 'Engagement Decay Index').",
    )
    mean_value_at_risk: float = Field(
        0.0,
        description="Mean KPI value across high-risk customers in the cliff window.",
    )
    healthy_benchmark: float = Field(
        0.0,
        description="Target / healthy benchmark for this KPI.",
    )
    deviation_z_score: float = Field(
        0.0,
        description="Z-score of mean_value_at_risk vs. portfolio distribution.",
    )
    f_statistic: float = Field(
        0.0,
        description=(
            "ANOVA F-statistic separating high-risk from low-risk customers "
            "on this KPI. Higher = stronger discriminator."
        ),
    )


# ── Master cliff detector response ────────────────────────────────────────────

class CliffDetectorResponse(BaseModel):
    """
    Full revenue cliff analysis.
    Returned by GET /api/v2/risk/revenue-cliff-detector.
    """

    # ── Monthly cliff calendar ─────────────────────────────────────────────────
    cliff_calendar: List[CliffMonthWindow] = Field(
        ...,
        description=(
            "Ordered list of CliffMonthWindow records, month 1 through "
            "forecast_horizon_months.  Always at least 1 entry; "
            "empty-month stubs returned when no renewals fall in that window."
        ),
    )

    # ── Alert summary ─────────────────────────────────────────────────────────
    cliff_alert_months: List[int] = Field(
        default_factory=list,
        description="Month indices that triggered CLIFF_ALERT. Empty = no cliffs detected.",
    )
    elevated_months: List[int] = Field(
        default_factory=list,
        description="Month indices at ELEVATED risk.",
    )
    total_arr_at_risk: float = Field(
        0.0,
        description=(
            "Portfolio-wide sum of arr_at_risk across all cliff-alert and elevated months. "
            "Maximum revenue exposure from near-term concentrated churn."
        ),
    )
    peak_cliff_month: Optional[int] = Field(
        None,
        description=(
            "Month index with the highest cliff_severity_score. "
            "None when no renewals are found in the forecast window."
        ),
    )
    peak_cliff_arr_at_risk: float = Field(
        0.0,
        description="total_renewing high_risk_arr in the peak cliff month.",
    )

    # ── Compounding drivers ────────────────────────────────────────────────────
    cliff_driver_kpis: List[CliffDriverKPI] = Field(
        default_factory=list,
        description=(
            "Top 3 KPIs (by F-statistic) driving risk concentration in the "
            "peak cliff month. Empty if peak cliff has < 5 customers."
        ),
    )

    # ── Per-customer drill-down for the peak cliff month ──────────────────────
    peak_cliff_customers: List[CustomerRenewalRecord] = Field(
        default_factory=list,
        description=(
            "Ranked list of customers (by arr_at_risk) contributing to the "
            "peak cliff month. Max 10 records. "
            "Empty when no cliff month is detected."
        ),
    )

    # ── Portfolio-wide renewal metadata ───────────────────────────────────────
    total_customers_with_renewals: int = Field(
        0,
        description="Customers with a renewal falling within the forecast horizon.",
    )
    estimated_renewal_fraction: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description=(
            "Fraction of renewal dates that were ESTIMATED (not from contract data). "
            "High values signal that the renewal calendar should be treated cautiously."
        ),
    )

    # ── AI narrative ──────────────────────────────────────────────────────────
    cliff_narrative: str = Field(
        "",
        description=(
            "3-sentence board-ready risk statement. Deterministic when LLM is absent."
        ),
    )

    # ── Thresholds used ───────────────────────────────────────────────────────
    high_risk_threshold: float = Field(
        0.65,
        description="Churn probability cutoff above which a customer is 'high risk'.",
    )
    cliff_severity_cutoff: float = Field(
        0.25,
        description=(
            "cliff_severity_score above which a month is flagged CLIFF_ALERT. "
            "25% of renewing ARR must be high-risk to trigger the alert."
        ),
    )
    cliff_mrr_floor: float = Field(
        0.05,
        description=(
            "Secondary cliff condition: high_risk_arr must also exceed this "
            "fraction of portfolio MRR before a CLIFF_ALERT is raised. "
            "Prevents spurious alerts in very small renewal windows."
        ),
    )

    # ── Data state ────────────────────────────────────────────────────────────
    forecast_horizon_months: int = Field(
        9,
        description="Number of months in the cliff calendar.",
    )
    trajectory_mode: str = Field(
        "linear_fallback",
        description=(
            "'gru_full'      — GRU 9-month per-customer trajectory used. "
            "'gru_coldstart' — XGBoost cold-start trajectory used (months 4-9 LOW_CONFIDENCE). "
            "'linear_fallback' — No model output; current churn score held flat."
        ),
    )
    data_availability: FeatureAvailability = Field(
        FeatureAvailability.OFFLINE,
        description="ACTIVE / PARTIAL / OFFLINE reflecting cache readiness.",
    )
    overall_confidence: ConfidenceLevel = Field(
        ConfidenceLevel.LOW,
        description="Lowest confidence level across all cliff calendar entries.",
    )
    missing_columns: List[str] = Field(
        default_factory=list,
        description="Absent columns that would improve renewal or risk accuracy.",
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal diagnostic warnings from the cliff computation.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 02 — REVENUE COHORT LIFECYCLE FINGERPRINTING
# GET /api/v2/intelligence/lifecycle-fingerprint
# ─────────────────────────────────────────────────────────────────────────────

class LifecycleArchetype(str, Enum):
    EXPANSION_READY = "EXPANSION_READY"  # High FAV, Low SBS
    STABLE          = "STABLE"           # Neutral
    AT_RISK         = "AT_RISK"          # High SBS, High EDI
    DECAYING        = "DECAYING"         # High EDI, Low FAV
    UNKNOWN         = "UNKNOWN"


class CohortFingerprint(BaseModel):
    """
    Characteristics of a specific customer lifecycle cohort.
    """
    archetype: LifecycleArchetype
    customer_count: int
    total_mrr: float
    avg_health_score: float
    avg_fav_score: float
    avg_sbs_score: float
    avg_edi_score: float
    primary_driver: str = Field(..., description="The KPI most responsible for this cluster's identity.")
    trajectory_slope: float = Field(0.0, description="Linear regression slope of MRR over last 3 months.")


class FingerprintMode(str, Enum):
    KMEANS   = "kmeans"    # Full K-Means on slope feature matrix (≥ 15 customers)
    DEGRADED = "degraded"  # Median-split fallback (< 15 customers)
    OFFLINE  = "offline"   # No data available


class PlaybookStatus(str, Enum):
    ACTIVE   = "ACTIVE"
    FALLBACK = "fallback"
    OFFLINE  = "OFFLINE"


class ROIStatus(str, Enum):
    ACTIVE  = "ACTIVE"
    PARTIAL = "PARTIAL"
    OFFLINE = "OFFLINE"


class KPITrajectory(BaseModel):
    kpi_name: str = Field(..., description="KPI identifier (e.g. 'FAV', 'RER', 'EDI').")
    slope: float = Field(0.0, description="linregress slope — rate of change per snapshot month.")
    intercept: float = Field(0.0, description="linregress intercept — estimated KPI value at month 0.")
    r_squared: float = Field(0.0, ge=0.0, le=1.0, description="Coefficient of determination. 1.0 = perfectly linear trajectory.")
    mean_value: float = Field(0.0, description="Mean KPI value across all observed snapshot months.")
    n_snapshots: int = Field(0, description="Number of snapshot months used to fit this trajectory.")


class CohortArchetype(BaseModel):
    archetype_id: int = Field(..., description="Zero-indexed cluster id (0-3 in KMEANS; 0-1 in DEGRADED).")
    archetype_label: str = Field(..., description="Human-readable archetype name.")
    customer_count: int = Field(0, description="Number of customers assigned to this archetype.")
    centroid_kpi_slopes: Dict[str, float] = Field(default_factory=dict, description="Mean KPI slope for each of the 7 KPIs at the cluster centroid.")
    mean_churn_probability: float = Field(0.0, ge=0.0, le=1.0, description="Average churn_probability across customers in this archetype.")
    mean_arr: float = Field(0.0, description="Average ARR across customers in this archetype.")
    top_risk_kpis: List[str] = Field(default_factory=list, description="Top 2 KPIs with the steepest negative slope in this archetype.")
    top_growth_kpis: List[str] = Field(default_factory=list, description="Top 2 KPIs with the steepest positive slope in this archetype.")
    health_label: str = Field("unknown", description="High-level health category: 'healthy', 'at-risk', 'churning', 'expanding'.")


class CustomerFingerprintRecord(BaseModel):
    customer_id: str = Field(..., description="Unique customer identifier.")
    customer_name: str = Field("Unknown", description="Customer display name. Falls back to customer_id.")
    archetype_id: int = Field(..., description="Assigned archetype id.")
    archetype_label: str = Field(..., description="Human-readable archetype label for this customer.")
    cosine_similarity: float = Field(0.0, ge=0.0, le=1.0, description="Cosine similarity between this customer's KPI slope vector and archetype centroid.")
    kpi_trajectories: List[KPITrajectory] = Field(default_factory=list, description="Per-KPI regression trajectory shape features for this customer.")
    cluster_label: str = Field("Unknown", description="Original K-Means cluster label from engineered_df.")
    arr: float = Field(0.0, description="Customer ARR.")
    churn_probability: float = Field(0.0, ge=0.0, le=1.0, description="Current churn probability from engineered_df.")


class LifecycleFingerprintResponse(BaseModel):
    """
    Full god-tier cohort lifecycle fingerprinting response.
    Replaces the legacy CohortFingerprint-based response with per-customer
    KPI trajectory regression and cosine-similarity archetype assignment.
    """
    archetypes: List[CohortArchetype] = Field(..., description="List of discovered lifecycle archetypes.")
    customer_assignments: List[CustomerFingerprintRecord] = Field(default_factory=list, description="Per-customer archetype assignments with cosine similarity scores.")
    total_customers_fingerprinted: int = Field(0, description="Total number of customers successfully fingerprinted.")
    dominant_archetype_id: Optional[int] = Field(None, description="Archetype id with the highest customer count.")
    dominant_archetype_label: Optional[str] = Field(None, description="Human-readable label for the dominant archetype.")
    portfolio_mean_arr: float = Field(0.0, description="Portfolio-wide mean ARR across all fingerprinted customers.")
    portfolio_mean_churn: float = Field(0.0, ge=0.0, le=1.0, description="Portfolio-wide mean churn_probability.")
    fingerprint_mode: FingerprintMode = Field(FingerprintMode.OFFLINE, description="KMEANS / DEGRADED / OFFLINE — reflects data sufficiency.")
    n_kpi_features_used: int = Field(0, description="Number of KPI slope features fed into clustering.")
    kmeans_inertia: Optional[float] = Field(None, description="K-Means inertia. None in DEGRADED/OFFLINE.")
    data_availability: FeatureAvailability = Field(FeatureAvailability.OFFLINE, description="ACTIVE / PARTIAL / OFFLINE reflecting cache readiness.")
    overall_confidence: ConfidenceLevel = Field(ConfidenceLevel.LOW, description="HIGH / MEDIUM / LOW confidence in clustering results.")
    missing_columns: List[str] = Field(default_factory=list, description="Absent columns that would improve fingerprinting accuracy.")
    warnings: List[str] = Field(default_factory=list, description="Non-fatal diagnostic warnings from the fingerprinting engine.")


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 03 — REP-LEVEL WIN-RATE DECOMPOSITION & PLAYBOOK GENERATOR
# GET /api/v2/intelligence/rep-playbooks
# ─────────────────────────────────────────────────────────────────────────────

class RepSegmentBreakdown(BaseModel):
    segment: str = Field(..., description="Deal segment (Enterprise / Mid-Market / SMB).")
    total_deals: int = Field(0, description="Total deals in this segment for this rep.")
    won_deals: int = Field(0, description="Won deals in this segment.")
    win_rate: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="won_deals / total_deals for Won+Lost deals.",
    )
    mean_arr: float = Field(0.0, description="Average ARR of won deals in this segment.")
    mean_discount_pct: float = Field(0.0, description="Average discount applied across all deals in this segment.")
    mean_days_in_pipeline: float = Field(0.0, description="Average pipeline velocity in days for this segment.")
    velocity_adjusted_win_score: float = Field(0.0, description="win_rate normalised by mean_days_in_pipeline. Higher = wins faster.")


class RepRoutingEntry(BaseModel):
    rep_id: str = Field(..., description="Rep identifier.")
    rep_name: str = Field("Unknown", description="Rep display name.")
    recommended_segment: str = Field(..., description="Segment this rep should be preferentially routed to.")
    routing_score: float = Field(0.0, description="Composite routing priority for this rep.")
    top_campaign_types: List[str] = Field(default_factory=list, description="Campaign types most frequently preceding this rep's won deals.")


class RepPlaybookRecord(BaseModel):
    rep_id: str = Field(..., description="Unique rep identifier.")
    rep_name: str = Field("Unknown", description="Rep display name.")
    total_deals: int = Field(0, description="Total deals attributed to this rep.")
    overall_win_rate: float = Field(0.0, ge=0.0, le=1.0, description="Overall win rate across all segments for this rep.")
    segment_breakdown: List[RepSegmentBreakdown] = Field(default_factory=list, description="Per-segment win-rate and velocity breakdown.")
    mean_rsfs: float = Field(0.0, description="Mean Revenue Sensitivity to Feature Set (RSFS) across this rep's customers.")
    routing_recommendation: Optional[RepRoutingEntry] = Field(None, description="Recommended routing entry for this rep.")
    playbook_text: str = Field("", description="Generated playbook narrative for this rep.")
    playbook_status: PlaybookStatus = Field(PlaybookStatus.OFFLINE, description="Playbook generation status.")


class RepPlaybookResponse(BaseModel):
    rep_playbooks: List[RepPlaybookRecord] = Field(default_factory=list, description="Generated playbooks for each rep.")
    routing_matrix: List[RepRoutingEntry] = Field(default_factory=list, description="Recommended routing matrix for reps.")
    total_reps: int = Field(0, description="Total number of reps analysed.")
    portfolio_win_rate: float = Field(0.0, description="Overall portfolio win rate.")
    top_performing_rep_id: Optional[str] = Field(None, description="Rep id of the top performing rep.")
    top_performing_rep_name: Optional[str] = Field(None, description="Rep name of the top performing rep.")
    llm_status: PlaybookStatus = Field(PlaybookStatus.OFFLINE, description="Status of LLM playbook generation.")
    data_availability: FeatureAvailability = Field(FeatureAvailability.OFFLINE, description="Data availability status.")
    overall_confidence: ConfidenceLevel = Field(ConfidenceLevel.LOW, description="Confidence level of the insights.")
    missing_columns: List[str] = Field(default_factory=list, description="Absent columns that would improve playbook accuracy.")
    warnings: List[str] = Field(default_factory=list, description="Diagnostic warnings from the rep playbook engine.")


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 05 — MULTI-TOUCH CAMPAIGN ROI DECOMPOSER
# GET /api/v2/intelligence/campaign-roi
# ─────────────────────────────────────────────────────────────────────────────

class CampaignShapleyRecord(BaseModel):
    campaign_id: str = Field(..., description="Unique campaign identifier.")
    campaign_type: str = Field("Unknown", description="Type of campaign.")
    shapley_value: float = Field(0.0, description="Shapley value attributed revenue.")
    shapley_pct: float = Field(0.0, description="Share of attributed revenue.")
    total_cost: float = Field(0.0, description="Total campaign cost.")
    roi: float = Field(0.0, description="Return on investment for this campaign.")
    touch_count: int = Field(0, description="Number of touchpoints observed for this campaign.")
    mean_touchpoint_order: float = Field(0.0, description="Average touchpoint order for this campaign.")
    deals_influenced: int = Field(0, description="Number of deals influenced by this campaign.")


class GoldenSequenceRecord(BaseModel):
    sequence_id: int = Field(..., description="Ranked sequence identifier.")
    campaign_sequence: List[str] = Field(default_factory=list, description="Ordered campaign type path.")
    sequence_key: str = Field(..., description="Human-readable sequence key.")
    win_rate: float = Field(0.0, ge=0.0, le=1.0, description="Win rate for the sequence.")
    mean_arr_won: float = Field(0.0, description="Mean ARR of won deals for this sequence.")
    ev_score: float = Field(0.0, description="Expected value (win rate × mean ARR) for this sequence.")
    deal_count: int = Field(0, description="Number of deals matching this sequence.")
    dominant_segment: str = Field("Unknown", description="Dominant segment for this sequence.")


class CampaignROIResponse(BaseModel):
    campaign_attributions: List[CampaignShapleyRecord] = Field(default_factory=list, description="Calculated Shapley values per campaign.")
    golden_sequences: List[GoldenSequenceRecord] = Field(default_factory=list, description="Top performing campaign sequences by expected value.")
    total_campaigns_analysed: int = Field(0, description="Total number of campaigns analysed.")
    total_attributed_arr: float = Field(0.0, description="Total attributed ARR.")
    total_marketing_cost: float = Field(0.0, description="Total campaign marketing cost.")
    portfolio_roi: float = Field(0.0, description="Portfolio ROI based on attributed revenue and cost.")
    monte_carlo_permutations: int = Field(0, description="Monte Carlo permutations used for Shapley estimation.")
    top_campaign_id: Optional[str] = Field(None, description="Top campaign identifier.")
    top_campaign_type: Optional[str] = Field(None, description="Top campaign type.")
    roi_status: ROIStatus = Field(ROIStatus.OFFLINE, description="Status of the ROI computation.")
    data_availability: FeatureAvailability = Field(FeatureAvailability.OFFLINE, description="Data availability status.")
    overall_confidence: ConfidenceLevel = Field(ConfidenceLevel.LOW, description="Confidence level of the ROI analysis.")
    missing_columns: List[str] = Field(default_factory=list, description="Absent columns that would improve ROI accuracy.")
    warnings: List[str] = Field(default_factory=list, description="Diagnostic warnings from the ROI engine.")


# ─────────────────────────────────────────────────────────────────────────────
# SHARED V3 ENUMS
# ─────────────────────────────────────────────────────────────────────────────

class GenomeArchetypeLabel(str, Enum):
    HEALTHY_CORE    = "HEALTHY_CORE"      # Low drift, high health
    GROWTH_FRONTIER = "GROWTH_FRONTIER"   # High FAV, expanding ARR
    DECAY_CLUSTER   = "DECAY_CLUSTER"     # High EDI drift, declining
    AT_RISK_ZONE    = "AT_RISK_ZONE"      # Elevated churn probability
    TRANSITIONAL    = "TRANSITIONAL"      # Ambiguous trajectory
    UNKNOWN         = "UNKNOWN"


class ContagionSeverity(str, Enum):
    CRITICAL  = "CRITICAL"    # contagion_risk >= 0.75
    HIGH      = "HIGH"        # 0.50 <= contagion_risk < 0.75
    ELEVATED  = "ELEVATED"    # 0.25 <= contagion_risk < 0.50
    NOMINAL   = "NOMINAL"     # < 0.25


class SellerAction(str, Enum):
    DISCOUNT_GUARD_5   = "DISCOUNT_GUARD_5"
    DISCOUNT_GUARD_10  = "DISCOUNT_GUARD_10"
    EXECUTIVE_TOUCH    = "EXECUTIVE_TOUCH"
    CSM_INTERVENTION   = "CSM_INTERVENTION"
    HOLD_LINE          = "HOLD_LINE"


class CompetitorAction(str, Enum):
    UNDER_CUT_PRICE    = "UNDER_CUT_PRICE"
    EXTEND_EVALUATION  = "EXTEND_EVALUATION"
    FUD_INJECTION      = "FUD_INJECTION"
    NO_ACTION          = "NO_ACTION"


class ShockScenario(str, Enum):
    LIQUIDITY_SHOCK     = "LIQUIDITY_SHOCK"
    DEMAND_CONTRACTION  = "DEMAND_CONTRACTION"
    COMPETITIVE_EVENT   = "COMPETITIVE_EVENT"


class StressTestMode(str, Enum):
    VAR_FULL            = "VAR_FULL"             # Full VAR on snapshots_df
    RIDGE_VAR           = "RIDGE_VAR"            # Ridge-regularised Bayesian VAR
    DETERMINISTIC_MACRO = "DETERMINISTIC_MACRO"  # Fallback sensitivity matrix


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 06 — REVENUE GENOME SEQUENCER
# GET /api/v2/godtier/portfolio/genome
# ─────────────────────────────────────────────────────────────────────────────

class GenomeClusterNode(BaseModel):
    """A single DBSCAN cluster node in the TDA Mapper topology."""

    node_id: int = Field(
        ...,
        description="Zero-indexed cluster node identifier within the genome graph.",
    )
    customer_ids: List[str] = Field(
        default_factory=list,
        description="Customer identifiers assigned to this node by DBSCAN.",
    )
    customer_count: int = Field(
        0,
        description="Number of customers in this node. 0 = noise node (DBSCAN label -1).",
    )
    archetype: GenomeArchetypeLabel = Field(
        GenomeArchetypeLabel.UNKNOWN,
        description="Heuristic archetype label derived from mean KPI profile of node members.",
    )
    avg_health_score: float = Field(
        0.0,
        description="Mean health_score across all customers in this node. 0.0 when absent.",
    )
    avg_churn_probability: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Mean churn_probability for node members. 0.0 when model unavailable.",
    )
    avg_mrr: float = Field(
        0.0,
        description="Mean MRR for node members in base currency units.",
    )
    genetic_drift_score: float = Field(
        0.0,
        ge=0.0,
        description=(
            "Distance from this node to the healthiest chromosome path in the genome graph. "
            "Higher = more drifted from optimal health trajectory."
        ),
    )
    cover_interval_index: int = Field(
        0,
        description="Which TDA Mapper interval cover (along the lifetime risk axis) this node belongs to.",
    )


class GenomeEdge(BaseModel):
    """A topological edge connecting two genome nodes that share customers."""

    source_node_id: int = Field(..., description="Source node identifier.")
    target_node_id: int = Field(..., description="Target node identifier.")
    shared_customer_count: int = Field(
        0,
        description="Number of customers shared between source and target nodes.",
    )
    edge_weight: float = Field(
        0.0,
        description=(
            "Normalised overlap coefficient: shared_count / min(|source|, |target|). "
            "1.0 = complete containment."
        ),
    )


class GenomeDriftMetrics(BaseModel):
    """Portfolio-level genetic drift summary."""

    max_drift_score: float = Field(
        0.0,
        description="Highest genetic drift score observed across all genome nodes.",
    )
    mean_drift_score: float = Field(
        0.0,
        description="Portfolio-wide mean genetic drift score.",
    )
    healthiest_node_id: Optional[int] = Field(
        None,
        description="Node ID identified as the healthiest chromosome anchor (drift = 0.0).",
    )
    most_drifted_node_id: Optional[int] = Field(
        None,
        description="Node ID with the highest genetic drift score.",
    )
    n_cover_intervals: int = Field(
        0,
        description="Number of interval covers used along the lifetime risk axis.",
    )
    n_dbscan_noise_points: int = Field(
        0,
        description="Customers assigned to DBSCAN noise cluster (label -1).",
    )


class RevenueGenomeResponse(BaseModel):
    """
    TDA Mapper genome topology returned by GET /api/v2/godtier/portfolio/genome.
    """

    nodes: List[GenomeClusterNode] = Field(
        default_factory=list,
        description="All genome cluster nodes in the topology graph.",
    )
    edges: List[GenomeEdge] = Field(
        default_factory=list,
        description="Topological edges between nodes that share customers.",
    )
    drift_metrics: GenomeDriftMetrics = Field(
        default_factory=GenomeDriftMetrics,
        description="Portfolio-wide genetic drift summary statistics.",
    )
    n_customers_analyzed: int = Field(
        0,
        description="Total customers included in the genome analysis.",
    )
    feature_columns_used: List[str] = Field(
        default_factory=list,
        description="Feature column names used to construct the 7-KPI feature space.",
    )
    summary_narrative: str = Field(
        "",
        description="Plain-English interpretation of the genome topology and drift patterns.",
    )
    data_availability: FeatureAvailability = Field(
        FeatureAvailability.OFFLINE,
        description="ACTIVE/PARTIAL/OFFLINE reflecting engineered_df readiness.",
    )
    overall_confidence: ConfidenceLevel = Field(
        ConfidenceLevel.LOW,
        description="Confidence level based on data completeness and cluster stability.",
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal diagnostic warnings from the TDA pipeline.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE V3-1 — GRAPH-BASED REVENUE CONTAGION NETWORK
# ─────────────────────────────────────────────────────────────────────────────

class ContagionNodeRisk(BaseModel):
    """Risk metrics for a single customer node in the contagion network."""

    customer_id: str = Field(..., description="Unique customer identifier.")
    arr: float = Field(
        0.0,
        description="Annual Recurring Revenue for this customer.",
    )
    churn_probability: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Base churn probability before contagion propagation.",
    )
    contagion_risk_factor: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description=(
            "Propagated contagion risk R_j after exponential-decay propagation "
            "from high-ARR anchor nodes. 0.0 = no contagion exposure."
        ),
    )
    is_anchor_node: bool = Field(
        False,
        description=(
            "True if this customer is a high-ARR anchor whose churn_probability > 0.7 "
            "and therefore acts as a contagion source."
        ),
    )
    severity: ContagionSeverity = Field(
        ContagionSeverity.NOMINAL,
        description="Severity bucket derived from contagion_risk_factor.",
    )
    neighbor_count: int = Field(
        0,
        description="Number of direct graph neighbors (shared-attribute edges).",
    )
    segment: str = Field(
        "Unknown",
        description="Customer segment (Enterprise / Mid-Market / SMB).",
    )


class ContagionPath(BaseModel):
    """A propagation chain from an anchor node to a downstream customer."""

    anchor_customer_id: str = Field(
        ...,
        description="High-ARR source node that initiated this contagion path.",
    )
    affected_customer_id: str = Field(
        ...,
        description="Downstream customer receiving contagion risk.",
    )
    n_hops: int = Field(
        ...,
        description="Graph distance (hops) between anchor and affected customer.",
    )
    path_risk: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Contagion risk delivered along this specific path after decay.",
    )
    path_customer_ids: List[str] = Field(
        default_factory=list,
        description="Ordered list of customer IDs traversed along this path.",
    )


class ContagionNetworkSummary(BaseModel):
    """Portfolio-wide contagion network statistics."""

    total_customers: int = Field(0, description="Total nodes in the contagion graph.")
    anchor_nodes: int = Field(
        0,
        description="High-ARR customers with churn_probability > 0.7 (contagion sources).",
    )
    critical_nodes: int = Field(
        0,
        description="Customers with contagion_risk_factor >= 0.75.",
    )
    total_arr_at_stake_contagion: float = Field(
        0.0,
        description="Sum of ARR for customers with severity >= ELEVATED.",
    )
    total_edges: int = Field(0, description="Total edges in the contagion graph.")
    avg_contagion_risk: float = Field(
        0.0,
        description="Portfolio-wide mean contagion_risk_factor.",
    )
    graph_density: float = Field(
        0.0,
        description="Edge density of the contagion graph (0.0 = fully sparse).",
    )


class ContagionNetworkResponse(BaseModel):
    """
    Revenue contagion network returned by GET /api/v2/godtier/portfolio/contagion-network.
    """

    nodes: List[ContagionNodeRisk] = Field(
        default_factory=list,
        description="Per-customer contagion risk metrics, sorted descending by contagion_risk_factor.",
    )
    contagion_paths: List[ContagionPath] = Field(
        default_factory=list,
        description="Top contagion propagation paths from anchor nodes to downstream customers.",
    )
    network_summary: ContagionNetworkSummary = Field(
        default_factory=ContagionNetworkSummary,
        description="Portfolio-wide contagion network statistics.",
    )
    summary_narrative: str = Field(
        "",
        description="Plain-English explanation of the highest-risk contagion clusters.",
    )
    data_availability: FeatureAvailability = Field(
        FeatureAvailability.OFFLINE,
        description="ACTIVE/PARTIAL/OFFLINE reflecting graph and engineered_df readiness.",
    )
    overall_confidence: ConfidenceLevel = Field(
        ConfidenceLevel.LOW,
        description="Confidence level based on graph completeness and data coverage.",
    )
    graph_precomputed: bool = Field(
        False,
        description=(
            "True if the graph topology was pre-computed during ingestion. "
            "False = topology was computed on-the-fly (higher latency, lower confidence)."
        ),
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal diagnostic warnings from contagion propagation.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 07 — ADVERSARIAL DEAL WAR ROOM
# ─────────────────────────────────────────────────────────────────────────────

class StrategyMixEntry(BaseModel):
    """One row in the epsilon-Nash equilibrium mixed strategy for seller actions."""

    action: SellerAction = Field(..., description="Seller action from the discrete action set.")
    probability: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="CFR-computed equilibrium probability of selecting this action.",
    )
    expected_win_rate: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Expected win probability when this action is played at equilibrium.",
    )
    expected_margin: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Expected gross margin (1 - discount_pct) when this action is played.",
    )
    expected_revenue: float = Field(
        0.0,
        description="E[R] = ARR * P_win for this action at equilibrium.",
    )
    is_pareto_efficient: bool = Field(
        False,
        description=(
            "True if this strategy is on the Pareto efficiency frontier — "
            "no alternative improves E[R] without decreasing margin."
        ),
    )


class CompetitorProfile(BaseModel):
    """Historical competitor behaviour profile used to compute the CFR game tree."""

    competitor_action: CompetitorAction = Field(
        ...,
        description="Competitor action from the discrete action set.",
    )
    historical_frequency: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Observed frequency of this action in historical lost deal data.",
    )


class DealWarRoomRecommendation(BaseModel):
    """Tactical recommendation for a specific deal."""

    deal_id: str = Field(..., description="Deal / opportunity identifier.")
    deal_name: str = Field("Unknown", description="Deal or company name.")
    arr: float = Field(0.0, description="ARR at stake for this deal.")
    recommended_action: SellerAction = Field(
        ...,
        description="Highest-probability CFR equilibrium action for this deal.",
    )
    action_probability: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Equilibrium probability of the recommended action.",
    )
    expected_win_rate: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Expected win probability under recommended action.",
    )
    expected_margin: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Expected gross margin under recommended action.",
    )
    confidence: ConfidenceLevel = Field(
        ConfidenceLevel.LOW,
        description="Confidence in the CFR recommendation for this deal.",
    )
    rationale: str = Field(
        "",
        description="Plain-English explanation of why this action is recommended.",
    )


class ParetoPoint(BaseModel):
    """One point on the Pareto efficiency frontier (win_rate vs gross_margin)."""

    action: SellerAction = Field(..., description="Seller action at this Pareto point.")
    expected_win_rate: float = Field(0.0, ge=0.0, le=1.0)
    expected_margin: float = Field(0.0, ge=0.0, le=1.0)
    expected_revenue: float = Field(0.0, description="E[R] = ARR * P_win.")


class DealWarRoomResponse(BaseModel):
    """
    CFR game theory recommendations returned by GET /api/v2/godtier/deals/war-room.
    """

    recommendations: List[DealWarRoomRecommendation] = Field(
        default_factory=list,
        description="Per-deal tactical action recommendations, sorted descending by ARR.",
    )
    portfolio_strategy_mix: List[StrategyMixEntry] = Field(
        default_factory=list,
        description="Aggregate epsilon-Nash equilibrium mix across all active deals.",
    )
    pareto_frontier: List[ParetoPoint] = Field(
        default_factory=list,
        description="Non-dominated Pareto points on the win-rate vs gross-margin frontier.",
    )
    competitor_profiles: List[CompetitorProfile] = Field(
        default_factory=list,
        description="Competitor behaviour profiles derived from historical lost deal analysis.",
    )
    n_deals_analyzed: int = Field(
        0,
        description="Total number of active pipeline deals included in CFR analysis.",
    )
    cfr_iterations: int = Field(
        0,
        description="Number of CFR iterations run to converge to epsilon-Nash equilibrium.",
    )
    tree_depth: int = Field(
        3,
        description="Game tree depth (stages). Fixed at 3 = 90-day quarter in 30-day increments.",
    )
    summary_narrative: str = Field(
        "",
        description="Plain-English strategic overview of recommended war-room posture.",
    )
    data_availability: FeatureAvailability = Field(
        FeatureAvailability.OFFLINE,
        description="ACTIVE/PARTIAL/OFFLINE reflecting sales table readiness.",
    )
    overall_confidence: ConfidenceLevel = Field(
        ConfidenceLevel.LOW,
        description="Confidence level based on deal count and historical lost-deal coverage.",
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal diagnostic warnings from the CFR computation.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE 08 — MACRO REVENUE STRESS-TEST ENGINE
# POST /api/v2/godtier/forecast/stress-test
# ─────────────────────────────────────────────────────────────────────────────

class MonteCarloPercentileBand(BaseModel):
    """Monthly percentile band from 500-iteration Monte Carlo simulation."""

    month: int = Field(..., description="Month index (1-9) in the 9-month survival curve.")
    p5: float = Field(0.0, description="5th-percentile ARR outcome (worst-case tail).")
    p25: float = Field(0.0, description="25th-percentile ARR outcome.")
    p50: float = Field(0.0, description="Median ARR outcome.")
    p75: float = Field(0.0, description="75th-percentile ARR outcome.")
    p95: float = Field(0.0, description="95th-percentile ARR outcome (best-case tail).")
    mean: float = Field(0.0, description="Mean ARR across all Monte Carlo iterations.")
    cvar_5: float = Field(
        0.0,
        description=(
            "Conditional Value at Risk at 5th percentile: expected ARR given that "
            "outcomes fall below the 5th-percentile threshold. CVaR captures fat-tail exposure."
        ),
    )


class SegmentStressResult(BaseModel):
    """Stress-test results broken down by customer segment."""

    segment: str = Field(..., description="Segment name (Enterprise, Mid-Market, SMB, etc.).")
    baseline_arr: float = Field(0.0, description="Current ARR for this segment.")
    shocked_arr_mean: float = Field(
        0.0,
        description="Mean simulated ARR after shock application across 500 iterations.",
    )
    arr_loss_pct: float = Field(
        0.0,
        description="Percentage ARR loss vs baseline: (baseline - shocked_mean) / baseline.",
    )
    cvar_5: float = Field(
        0.0,
        description="CVaR at 5th percentile for this segment.",
    )
    survival_probability: float = Field(
        0.0,
        ge=0.0,
        le=1.0,
        description="Fraction of Monte Carlo iterations where shocked ARR > 0.",
    )


class ShockScenarioResult(BaseModel):
    """Full simulation result for one shock scenario type."""

    scenario: ShockScenario = Field(..., description="Shock scenario type.")
    nu: float = Field(0.0, description="Student's t degrees-of-freedom used for fat-tail sampling.")
    mu: float = Field(0.0, description="Location parameter (mean shift) for the shock distribution.")
    sigma: float = Field(0.0, description="Scale parameter for the shock distribution.")
    portfolio_cvar_5: float = Field(
        0.0,
        description="Portfolio-wide CVaR at 5th percentile under this scenario.",
    )
    survival_curve: List[MonteCarloPercentileBand] = Field(
        default_factory=list,
        description="9-month ARR survival curve with percentile bands.",
    )
    segment_breakdown: List[SegmentStressResult] = Field(
        default_factory=list,
        description="Per-segment stress results for this shock scenario.",
    )
    worst_month: int = Field(
        0,
        description="Month index (1-9) with the lowest median ARR.",
    )
    arr_drawdown_pct: float = Field(
        0.0,
        description="Maximum peak-to-trough ARR decline across the 9-month horizon.",
    )


class StressTestRequest(BaseModel):
    """Request body for POST /api/v2/godtier/forecast/stress-test."""

    scenarios: List[ShockScenario] = Field(
        default_factory=lambda: list(ShockScenario),
        description="Shock scenarios to simulate. Defaults to all three if omitted.",
    )
    n_iterations: int = Field(
        500,
        ge=100,
        le=2000,
        description="Number of Monte Carlo iterations. Default 500 balances speed and accuracy.",
    )
    forecast_horizon_months: int = Field(
        9,
        ge=1,
        le=24,
        description="Survival curve horizon in months.",
    )


class StressTestResponse(BaseModel):
    """
    Macro stress-test results returned by POST /api/v2/godtier/forecast/stress-test.
    """

    scenario_results: List[ShockScenarioResult] = Field(
        default_factory=list,
        description="Full simulation results for each requested shock scenario.",
    )
    baseline_arr: float = Field(
        0.0,
        description="Portfolio-wide baseline ARR before shock application.",
    )
    model_mode: StressTestMode = Field(
        StressTestMode.DETERMINISTIC_MACRO,
        description=(
            "VAR_FULL = fitted VAR on snapshots_df; "
            "RIDGE_VAR = Ridge-regularised Bayesian VAR (data-scarce fallback); "
            "DETERMINISTIC_MACRO = sensitivity matrix fallback (zero-variance data)."
        ),
    )
    var_lag_order: int = Field(
        0,
        description="Lag order of the fitted VAR model. 0 when fallback mode is active.",
    )
    ridge_lambda: float = Field(
        0.0,
        description="Tikhonov regularisation lambda used in RIDGE_VAR mode. 0.0 otherwise.",
    )
    n_snapshot_rows: int = Field(
        0,
        description="Number of snapshot rows used to fit the VAR model.",
    )
    summary_narrative: str = Field(
        "",
        description="Board-ready 3-sentence summary of worst-case scenario exposure.",
    )
    data_availability: FeatureAvailability = Field(
        FeatureAvailability.OFFLINE,
        description="ACTIVE/PARTIAL/OFFLINE reflecting snapshots_df readiness.",
    )
    overall_confidence: ConfidenceLevel = Field(
        ConfidenceLevel.LOW,
        description="Confidence level based on data volume and model mode.",
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Non-fatal diagnostic warnings from the stress-test pipeline.",
    )


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