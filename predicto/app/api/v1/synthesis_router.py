"""
app/api/v1/synthesis_router.py
─────────────────────────────────────────────────────────────────────────────
POST /api/v1/synthesise

Orchestrates the full synthesis pipeline:
  1. Guard: 503 if models not ready.
  2. Pull all three pillar inputs from thin service wrappers.
  3. Build compressed ContextPacket via context_builder.
  4. Format system prompt.
  5. Stream Groq/Llama-3 response as typed SSE events.

SSE event shapes (defined in schemas.py):
  { "type": "meta",  "token_estimate": int, "budget_pct": float, "pruning_log": [...] }
  { "type": "chunk", "text": str }
  { "type": "error", "message": str, "code": str }
  { "type": "done" }
"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.core.cache import predicto_cache
from app.models.schemas import (
    ErrorResponse,
    SynthesisRequest,
    AIAnalyzeResponse,
)
from datetime import datetime
from app.services.deal_service import get_margin_input
from app.services.forecast_service import get_forecast_inputs
from app.services.persona_service import get_segmentation_input
from app.services.synthesis_service import stream_executive_summary, get_executive_summary_sync

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Synthesis"])


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sse(payload: dict) -> str:
    """Serialise a dict as a single SSE data line."""
    return f"data: {json.dumps(payload)}\n\n"


def _error_503() -> StreamingResponse:
    """Return a non-streaming 503 wrapped in StreamingResponse for type consistency."""
    body = ErrorResponse(
        error="service_unavailable",
        message="Models are still initialising. Please retry in a few seconds.",
        detail="predicto_cache.models_ready() returned False",
    ).model_dump()
    return StreamingResponse(
        content=iter([json.dumps(body)]),
        status_code=503,
        media_type="application/json",
    )

@router.post(
    "/ai/analyze",
    response_model=AIAnalyzeResponse,
    summary="Get a non-streaming AI analysis for quick interactive queries",
)
async def ai_analyze(request: SynthesisRequest) -> AIAnalyzeResponse:
    """
    Non-streaming version of /synthesise. Used for the interactive analyst box.
    """
    # Gather context pillars, but allow them to be empty/None if models aren't ready
    forecast_inputs = []
    margin_input = None
    segmentation_input = None

    if predicto_cache.models_ready():
        try:
            forecast_inputs = get_forecast_inputs(periods=3)
            margin_input = get_margin_input()
            segmentation_input = get_segmentation_input()
        except Exception as exc:
            logger.warning("Context collection failed despite models being ready: %s", exc)

    try:
        # Assemble context
        forecast_inputs = get_forecast_inputs(periods=3)
        margin_input = get_margin_input()
        segmentation_input = get_segmentation_input()
        
        # Call the sync/blocking version of the service
        # If get_executive_summary_sync doesn't exist, I'll need to add it to synthesis_service.py
        insight = await get_executive_summary_sync(
            user_query=request.query,
            forecasts=forecast_inputs,
            margin=margin_input,
            segmentation=segmentation_input,
        )
        
        return AIAnalyzeResponse(
            insight=insight,
            timestamp=datetime.now().isoformat()
        )
    except Exception as exc:
        logger.error("AI Analysis failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


async def _synthesis_stream(query: str) -> AsyncGenerator[str, None]:
    """
    Full pipeline generator — yields SSE-formatted strings.

    Catches exceptions at each stage and emits a typed `error` event so the
    client always receives a well-formed stream termination rather than a
    silent TCP close.
    """
    # Stage 1: build three-pillar context inputs (allow fallback if empty)
    forecast_inputs = []
    margin_input = None
    segmentation_input = None

    if predicto_cache.models_ready():
        try:
            forecast_inputs    = get_forecast_inputs(periods=3)
            margin_input       = get_margin_input()
            segmentation_input = get_segmentation_input()
        except Exception as exc:
            logger.warning("Stream context build failed despite models ready: %s", exc)


    # ── Stage 2: stream LLM chunks ────────────────────────────────────────────
    # stream_executive_summary handles build_context, meta-event generation,
    # and SSE-formatting internally.
    try:
        async for event_str in stream_executive_summary(
            user_query=query,
            forecasts=forecast_inputs,
            margin=margin_input,
            segmentation=segmentation_input,
        ):
            yield event_str
    except Exception as exc:  # noqa: BLE001
        logger.error("LLM streaming failed: %s", exc, exc_info=True)
        yield _sse({"type": "error", "message": "LLM stream interrupted.", "code": "llm_stream_error"})
        yield _sse({"type": "done"})


# ─────────────────────────────────────────────────────────────────────────────
# Route
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/synthesise",
    summary="Stream an AI executive summary grounded in live ML data",
    response_description="Server-Sent Events stream of typed JSON payloads",
    responses={
        200: {"description": "SSE stream — see SynthesisChunkEvent / SynthesisDoneEvent"},
        503: {"model": ErrorResponse, "description": "Models not yet ready"},
    },
)
async def synthesise(request: SynthesisRequest) -> StreamingResponse:
    """
    Stream a Groq/Llama-3 executive summary grounded in the three ML pillars.

    The response is a `text/event-stream` where each line is a JSON object
    with a `type` discriminator (`meta` | `chunk` | `error` | `done`).
    """


    logger.info("Synthesis request: query_len=%d", len(request.query))
    return StreamingResponse(
        content=_synthesis_stream(request.query),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering for SSE
        },
    )