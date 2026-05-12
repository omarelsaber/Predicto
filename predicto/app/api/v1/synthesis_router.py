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

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.cache import predicto_cache
from app.models.schemas import (
    ErrorResponse,
    SynthesisRequest,
)
from app.services.deal_service import get_margin_input
from app.services.forecast_service import get_forecast_inputs
from app.services.persona_service import get_segmentation_input
from app.services.synthesis_service import stream_executive_summary

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


async def _synthesis_stream(query: str) -> AsyncGenerator[str, None]:
    """
    Full pipeline generator — yields SSE-formatted strings.

    Catches exceptions at each stage and emits a typed `error` event so the
    client always receives a well-formed stream termination rather than a
    silent TCP close.
    """
    # ── Stage 1: build three-pillar context inputs ────────────────────────────
    try:
        forecast_inputs    = get_forecast_inputs(periods=3)
        margin_input       = get_margin_input()
        segmentation_input = get_segmentation_input()
    except Exception as exc:  # noqa: BLE001
        logger.error("Context build failed: %s", exc, exc_info=True)
        yield _sse({"type": "error", "message": "Failed to assemble ML context.", "code": "context_build_error"})
        yield _sse({"type": "done"})
        return

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
    if not predicto_cache.models_ready():
        logger.warning("Synthesis requested before models are ready.")
        return _error_503()

    logger.info("Synthesis request: query_len=%d", len(request.query))
    return StreamingResponse(
        content=_synthesis_stream(request.query),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering for SSE
        },
    )