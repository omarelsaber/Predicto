"""
app/models/schemas.py
─────────────────────────────────────────────────────────────────────────────
All Pydantic v2 request and response models for the Predicto API.

Organisation (by endpoint family)
───────────────────────────────────
  § 1  Shared primitives
  § 2  Health check          GET  /health
  § 3  Ingestion             POST /api/v1/ingest
  § 4  Synthesis (LLM)       POST /api/v1/synthesise
  § 5  Deal scoring (What-If) POST /api/v1/deals/score
  § 6  Forecast              GET  /api/v1/forecast
  § 7  Personas              GET  /api/v1/personas
  § 8  Error envelope        (used by all routers)

Conventions
───────────
• Response models: `model_config = ConfigDict(frozen=True)` — immutable after
  construction; safe to cache and serialise concurrently.
• Request models: mutable (default) — FastAPI mutates them during validation.
• Every public field has a `Field(description=...)` for OpenAPI/Swagger docs.
• Validators that protect the ML layer are marked # ← ML GUARD.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ─────────────────────────────────────────────────────────────────────────────
# § 1  Shared primitives
# ─────────────────────────────────────────────────────────────────────────────

# Reusable annotated types — keeps Field() definitions DRY across schemas.
SegmentName = Annotated[
    str,
    Field(
        description="Business segment (e.g. 'Enterprise', 'SMB', 'Strategic').",
        min_length=1,
        max_length=64,
    ),
]

RegionName = Annotated[
    str,
    Field(
        description="Geographic sales region (e.g. 'EMEA', 'AMER', 'APAC').",
        min_length=1,
        max_length=64,
    ),
]

MarginRating = Literal["healthy", "at_risk", "critical"]
"""
Derived from predicted_margin_rate:
  healthy  → margin_rate ≥ 0.15
  at_risk  → 0.05 ≤ margin_rate < 0.15
  critical → margin_rate < 0.05
"""


def _classify_margin(rate: float) -> MarginRating:
    """Shared classification logic used by DealScoreResponse."""
    if rate >= 0.15:
        return "healthy"
    if rate >= 0.05:
        return "at_risk"
    return "critical"


# ─────────────────────────────────────────────────────────────────────────────
# § 2  Health check
# ─────────────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    """
    Response for ``GET /health``.

    ``status`` is ``ready`` once the FastAPI lifespan has finished (the process
    accepts HTTP traffic). Use ``models_ready`` for ML artifacts and
    ``data_loaded`` for transaction rows in cache (typically after upload).
    """

    model_config = ConfigDict(frozen=True)

    status: Literal["booting", "ready"] = Field(
        description=(
            "'ready' after startup lifespan completes; "
            "'booting' reserved for future use while the app is still starting."
        )
    )
    models_ready: bool = Field(
        description="True when all three pillar models are trained and cached."
    )
    data_loaded: bool = Field(
        description=(
            "True when raw transaction data is present (CSV ingested). "
            "False on a clean slate until the user uploads."
        )
    )
    uptime_seconds: float = Field(
        description="Seconds elapsed since the FastAPI process started.",
        ge=0.0,
    )


# ─────────────────────────────────────────────────────────────────────────────
# § 3  Ingestion
# ─────────────────────────────────────────────────────────────────────────────

class IngestResponse(BaseModel):
    """
    Response for ``POST /api/v1/ingest``.

    Returned after a successful CSV ingest.  ``file_hash`` is the SHA-256
    of the raw file content — use it to detect whether a re-upload is a
    duplicate without re-processing.

    ``validation_errors`` contains per-rule details of any data quality issues
    found during the strict validation layer (non-fatal; rows were dropped).
    """

    model_config = ConfigDict(frozen=True)

    status: str = Field(
        description="Human-readable result, e.g. 'ok' or 'duplicate_skipped'.",
        examples=["ok"],
    )
    rows_raw: int = Field(
        description="Number of transaction-level rows after cleaning.",
        ge=0,
    )
    rows_monthly: int = Field(
        description="Number of month-segment aggregated rows.",
        ge=0,
    )
    rows_dropped: int = Field(
        default=0,
        description="Number of rows removed during validation and cleaning.",
        ge=0,
    )
    file_hash: str = Field(
        description="SHA-256 hex digest of the uploaded file.",
        min_length=64,
        max_length=64,
    )
    validation_errors: list[str] = Field(
        default_factory=list,
        description=(
            "Per-rule validation issue details. Each entry describes rows "
            "that were dropped due to type enforcement, logical constraints, "
            "or date parsing failures."
        ),
    )
    warnings: list[str] = Field(
        default_factory=list,
        description=(
            "Non-fatal warnings about the data (e.g. missing optional columns, "
            "all-null Profit column)."
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# § 4  Synthesis (LLM streaming)
# ─────────────────────────────────────────────────────────────────────────────

class SynthesisRequest(BaseModel):
    """
    Request body for ``POST /api/v1/synthesise``.

    The frontend sends only the analyst's question.  The router assembles
    all ML pillar data from ``predicto_cache`` internally before calling
    ``synthesis_service.stream_executive_summary``.
    """

    query: str = Field(
        description="The analyst's free-text question to Predicto.",
        min_length=3,
        max_length=1_000,
        examples=[
            "Which segment is at the highest margin risk this quarter?",
            "Where can we safely increase discounts without hurting profit?",
        ],
    )

    @field_validator("query")
    @classmethod
    def query_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("query must not be blank or whitespace-only.")
        return v.strip()


class SynthesisMetaEvent(BaseModel):
    """
    Shape of the ``meta`` SSE event emitted by ``synthesis_service``.
    Not sent over HTTP directly — documented here for frontend contract clarity.
    """

    model_config = ConfigDict(frozen=True)

    type: Literal["meta"] = "meta"
    token_estimate: int = Field(description="Estimated tokens in the context packet.")
    budget_pct: float = Field(description="Percentage of the 600-token budget used.")
    pruning_log: list[str] = Field(
        description="Human-readable record of what context was trimmed."
    )


class SynthesisChunkEvent(BaseModel):
    """Shape of each ``chunk`` SSE event — one per Groq delta."""

    model_config = ConfigDict(frozen=True)

    type: Literal["chunk"] = "chunk"
    text: str = Field(description="Incremental text fragment from the LLM.")


class SynthesisErrorEvent(BaseModel):
    """Shape of the ``error`` SSE event."""

    model_config = ConfigDict(frozen=True)

    type: Literal["error"] = "error"
    message: str = Field(description="Human-readable error description.")
    code: str = Field(description="Machine-readable error code.")


class SynthesisDoneEvent(BaseModel):
    """Shape of the terminal ``done`` SSE event."""

    model_config = ConfigDict(frozen=True)

    type: Literal["done"] = "done"


# ─────────────────────────────────────────────────────────────────────────────
# § 5  Deal scoring (What-If)
# ─────────────────────────────────────────────────────────────────────────────

class DealScoreRequest(BaseModel):
    """
    Request body for ``POST /api/v1/deals/score``.

    Represents a hypothetical deal configuration submitted for margin
    prediction.  All fields are validated before reaching the ML layer
    so the model never receives nonsensical inputs.
    """

    segment: SegmentName
    region: RegionName

    industry: str = Field(
        description="Customer industry vertical.",
        min_length=1,
        max_length=64,
        examples=["Technology", "Finance", "Healthcare"],
    )
    product: str = Field(
        description="Product SKU or product-line name.",
        min_length=1,
        max_length=128,
        examples=["Platform Pro", "Analytics Suite"],
    )
    quantity: int = Field(
        description="Number of units / seats in the deal.",
        ge=1,
        le=100_000,
    )
    sales: float = Field(
        description="Total deal value in USD before discount.",
        gt=0.0,
        le=50_000_000.0,
    )
    discount: float = Field(
        description=(
            "Proposed discount as a decimal fraction (0.0 = no discount, "
            "1.0 = 100 % off).  Values above 0.9 are rejected."
        ),
        ge=0.0,
        le=0.9,   # ← ML GUARD: prevents degenerate edge-case predictions
    )

    @model_validator(mode="after")
    def revenue_per_unit_is_positive(self) -> "DealScoreRequest":
        """  # ← ML GUARD: feature `revenue_per_unit` = sales/quantity must be > 0."""
        if self.sales / self.quantity <= 0:
            raise ValueError(
                "Effective revenue per unit must be positive. "
                "Check that 'sales' and 'quantity' are both greater than zero."
            )
        return self


class DealScoreResponse(BaseModel):
    """
    Response for ``POST /api/v1/deals/score``.

    ``margin_rating`` is a derived label; use ``predicted_margin_rate`` for
    precise numerical comparisons.
    ``max_safe_discount`` is sourced from the precomputed discount ceiling
    matrix (Segment × Region) stored in ``MarginModels``.
    """

    model_config = ConfigDict(frozen=True)

    segment: str = Field(description="Segment echoed from the request.")
    region: str = Field(description="Region echoed from the request.")
    predicted_margin_rate: float = Field(
        description=(
            "Model-predicted margin rate for this deal configuration. "
            "Range: roughly –1.0 to 1.0 (clipped by ingestion to [–1, 1])."
        )
    )
    margin_rating: MarginRating = Field(
        description=(
            "Categorical margin health: 'healthy' (≥15 %), "
            "'at_risk' (5–15 %), 'critical' (<5 %)."
        )
    )
    is_profitable: bool = Field(
        description="True when predicted_margin_rate > 0."
    )
    max_safe_discount: float = Field(
        description=(
            "Maximum discount (decimal fraction) at which the model predicts "
            "Margin_Rate > 0.05 for this Segment × Region combination. "
            "Sourced from the precomputed discount ceiling matrix."
        ),
        ge=0.0,
        le=1.0,
    )
    recommendation: str = Field(
        description=(
            "Plain-language action recommendation generated by the margin engine, "
            "e.g. 'Reduce discount to 18 % to maintain healthy margin.'"
        )
    )

    @classmethod
    def build(
        cls,
        segment: str,
        region: str,
        predicted_margin_rate: float,
        max_safe_discount: float,
        recommendation: str,
    ) -> "DealScoreResponse":
        """
        Factory method — derives ``margin_rating`` and ``is_profitable``
        automatically so routers never compute them inline.
        """
        return cls(
            segment=segment,
            region=region,
            predicted_margin_rate=round(predicted_margin_rate, 4),
            margin_rating=_classify_margin(predicted_margin_rate),
            is_profitable=predicted_margin_rate > 0.0,
            max_safe_discount=round(max_safe_discount, 4),
            recommendation=recommendation,
        )


# ─────────────────────────────────────────────────────────────────────────────
# § 6  Forecast
# ─────────────────────────────────────────────────────────────────────────────

class ForecastSegmentResponse(BaseModel):
    """
    Single-segment forecast result for ``GET /api/v1/forecast``.
    The router returns a list of these — one per business segment.
    """

    model_config = ConfigDict(frozen=True)

    segment: str = Field(description="Business segment name.")
    next_period_revenue: float = Field(
        description="Predicted revenue for the next calendar month (USD)."
    )
    confidence_lower: float = Field(
        description="Lower bound of the 95 % prediction interval."
    )
    confidence_upper: float = Field(
        description="Upper bound of the 95 % prediction interval."
    )
    pct_change_vs_current: str = Field(
        description="Percentage change vs. current period, formatted as '±X.X%'.",
        examples=["+4.2%", "-1.8%"],
    )
    trend_direction: Literal["up", "down", "flat"] = Field(
        description="Qualitative trend direction derived from the Ridge trend component."
    )
    r2_validation: float = Field(
        description=(
            "Walk-forward R² on the last 6 months. "
            "SMB segments may show low R² due to high intrinsic variance — "
            "this is expected, not a model defect."
        )
    )


class ForecastResponse(BaseModel):
    """Response envelope for ``GET /api/v1/forecast``."""

    model_config = ConfigDict(frozen=True)

    segments: list[ForecastSegmentResponse] = Field(
        description="Forecast results for all available business segments."
    )
    periods_ahead: int = Field(
        description="Number of months ahead that were forecast.",
        ge=1,
    )


# ─────────────────────────────────────────────────────────────────────────────
# § 7  Personas (Segmentation)
# ─────────────────────────────────────────────────────────────────────────────

class PersonaResponse(BaseModel):
    """
    Single K-Means cluster persona for ``GET /api/v1/personas``.
    """

    model_config = ConfigDict(frozen=True)

    segment: str = Field(description="Business segment this persona belongs to.")
    persona_label: str = Field(
        description="Human-readable cluster label (e.g. 'Champion', 'Value Seeker')."
    )
    avg_deal_value: float = Field(
        description="Mean deal value (USD) for customers in this cluster."
    )
    avg_discount: str = Field(
        description="Mean discount rate, formatted as 'X.X%'.",
        examples=["12.4%"],
    )
    avg_margin: str = Field(
        description="Mean margin rate, formatted as 'X.X%'.",
        examples=["22.1%"],
    )
    churn_risk: Literal["low", "medium", "high"] = Field(
        description="Estimated churn risk category derived from cluster behaviour."
    )
    top_region: str = Field(
        description="Geographic region with the highest customer concentration."
    )
    cluster_size: int = Field(
        description="Number of distinct customers assigned to this cluster.",
        ge=1,
    )


class PersonasResponse(BaseModel):
    """Response envelope for ``GET /api/v1/personas``."""

    model_config = ConfigDict(frozen=True)

    personas: list[PersonaResponse] = Field(
        description="All K-Means cluster personas derived from customer transaction history."
    )
    n_clusters: int = Field(
        description="Total number of K-Means clusters (0 when no data / not trained).",
        ge=0,
    )
    silhouette_score: float = Field(
        description=(
            "Silhouette coefficient for the K-Means solution "
            "(range –1 to 1; higher is better cluster separation)."
        )
    )


# ─────────────────────────────────────────────────────────────────────────────
# § 8  Error envelope
# ─────────────────────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    """
    Standardised error body returned by all Predicto API endpoints on
    non-2xx responses.

    FastAPI's default 422 Unprocessable Entity responses use a different
    shape — routers that need to homogenise 422s into this schema should
    override the ``request_validation_exception_handler``.

    Usage in a router:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail=ErrorResponse(
                error="models_not_ready",
                message="ML models are still training. Retry in a few seconds.",
            ).model_dump(),
        )
    """

    model_config = ConfigDict(frozen=True)

    error: str = Field(
        description="Machine-readable error code (snake_case).",
        examples=["models_not_ready", "ingest_failed", "groq_unavailable"],
    )
    message: str = Field(
        description="Human-readable explanation safe to surface in the UI.",
    )
    detail: str | None = Field(
        default=None,
        description=(
            "Optional technical detail for logging/debugging. "
            "Omit in production responses to external clients."
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# § 9  Data Explorer Preview
# ─────────────────────────────────────────────────────────────────────────────

class DataPreviewRecord(BaseModel):
    """
    Single row for the Data Explorer preview.
    Uses aliases to match the exact CSV header names.
    JSON responses use those aliases when ``serialize_by_alias`` is enabled.
    """
    model_config = ConfigDict(frozen=True, populate_by_name=True, serialize_by_alias=True)

    order_id: str = Field(alias="Order ID")
    order_date: str = Field(alias="Order Date")
    customer: str = Field(alias="Customer")
    segment: str = Field(alias="Segment")
    region: str = Field(alias="Region")
    product: str = Field(alias="Product")
    sales: float = Field(alias="Sales")
    margin: str = Field(alias="Margin", description="Formatted margin (e.g. percentage of Sales).")


class DataPreviewResponse(BaseModel):
    """
    Response envelope for ``GET /api/v1/preview`` (and legacy ``/api/v1/data/preview``).

    ``count`` is the total number of rows in the cached dataset; ``data`` holds
    at most 100 preview rows.
    """
    model_config = ConfigDict(frozen=True)

    status: str = Field(description="'success' or 'error'.")
    count: int = Field(
        description="Total rows in the cached dataset.",
        ge=0,
    )
    data: list[DataPreviewRecord] = Field(
        description="Up to 100 preview rows for the Data Explorer.",
    )
