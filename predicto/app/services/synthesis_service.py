"""
app/services/synthesis_service.py
─────────────────────────────────────────────────────────────────────────────
LLM synthesis layer for Predicto.

Responsibilities
────────────────
1. Accept typed pillar outputs (ForecastInput, MarginInput, SegmentationInput)
   and a free-text user query.
2. Call context_builder.build_context() → prune to ≤600-token JSON packet.
3. Format the Groq/Llama-3 system prompt via ``build_system_prompt`` (pillar summaries).
4. Open a streaming chat-completion request against the Groq API.
5. Yield Server-Sent Event (SSE) formatted strings so FastAPI can stream them
   directly to the React frontend via StreamingResponse.

SSE envelope schema (all events are JSON-encoded inside `data: ...`)
─────────────────────────────────────────────────────────────────────
  { "type": "meta",  "token_estimate": int, "budget_pct": float,
                     "pruning_log": list[str] }
  { "type": "chunk", "text": str }
  { "type": "done"  }
  { "type": "error", "message": str, "code": str }

The `meta` event is always the first event emitted.
The `done` event is always the last event emitted (even after an error).
This invariant lets the frontend close its EventSource reliably.

Imports from context_builder
─────────────────────────────
All input dataclasses live in context_builder to prevent circular imports.
synthesis_service re-exports them via __all__ so callers need only one import.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from groq import AsyncGroq, APIConnectionError, APIStatusError, AuthenticationError

from app.core.config import get_settings
from app.ml.context_builder import (
    ContextPacket,
    ForecastInput,
    MarginInput,
    SegmentationInput,
    build_context,
)

# ── Re-export input types so API layer has a single import target ─────────────
__all__ = [
    "ForecastInput",
    "MarginInput",
    "SegmentationInput",
    "DealRisk",
    "PersonaTrait",
    "PersonaTrait",
    "stream_executive_summary",
    "get_executive_summary_sync",
    "build_system_prompt",
    "SynthesisError",
]

# Re-export ancillary dataclasses used when constructing MarginInput /
# SegmentationInput at the API layer.
from app.ml.context_builder import DealRisk, PersonaTrait  # noqa: E402

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Exceptions
# ─────────────────────────────────────────────────────────────────────────────

class SynthesisError(Exception):
    """
    Raised for unrecoverable synthesis failures that occur *before* the
    stream opens (e.g. missing API key at startup validation).

    Once the generator is running, errors are yielded as SSE `error` events
    rather than raised, because HTTP 200 is already in flight.
    """
    def __init__(self, message: str, code: str = "SYNTHESIS_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


# ─────────────────────────────────────────────────────────────────────────────
# Groq client singleton
# ─────────────────────────────────────────────────────────────────────────────

def _build_groq_client() -> AsyncGroq:
    """
    Instantiate AsyncGroq from settings (via `_get_groq_client()` lazy singleton).

    Raises
    ──────
    SynthesisError : if GROQ_API_KEY is absent from settings.
    """
    settings = get_settings()
    api_key: str | None = getattr(settings, "groq_api_key", None)
    if not api_key:
        raise SynthesisError(
            "GROQ_API_KEY is not set. Add it to your .env file and restart.",
            code="MISSING_API_KEY",
        )
    logger.debug("AsyncGroq client initialised (model=%s).", settings.groq_model)
    return AsyncGroq(api_key=api_key)


_groq_client: AsyncGroq | None = None


def _get_groq_client() -> AsyncGroq:
    """Lazy singleton so the API process can boot without GROQ_API_KEY until synthesis runs."""
    global _groq_client
    if _groq_client is None:
        _groq_client = _build_groq_client()
    return _groq_client


# ─────────────────────────────────────────────────────────────────────────────
# SSE helpers
# ─────────────────────────────────────────────────────────────────────────────

def _sse(payload: dict) -> str:
    """Serialize *payload* as a single SSE `data:` line with double newline."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _meta_event(token_estimate: int, budget_pct: float, pruning_log: list[str]) -> str:
    return _sse({
        "type": "meta",
        "token_estimate": token_estimate,
        "budget_pct": budget_pct,
        "pruning_log": pruning_log,
    })


def _chunk_event(text: str) -> str:
    return _sse({"type": "chunk", "text": text})


def _done_event() -> str:
    return _sse({"type": "done"})


def _error_event(message: str, code: str = "GROQ_ERROR") -> str:
    return _sse({"type": "error", "message": message, "code": code})


def build_system_prompt(
    forecast_summary: str,
    persona_summary: str,
    margin_summary: str = "",
) -> str:
    """
    Arabic-forward system instructions so the model treats forecast and persona
    context as authoritative — avoiding claims that forecast data is missing.
    """
    margin_block = ""
    if margin_summary.strip():
        margin_block = (
            "\nسياق الهامش والمخاطر (Margin / discounts):\n"
            f"{margin_summary}\n"
        )

    return f"""أنت الآن "محلل الإيرادات الذكي". مهمتك تقديم توصيات استراتيجية بناءً على البيانات الفعلية المعروضة أدناه، ومساعدة الإدارة العليا على اتخاذ قرارات أوضح.

سياق التوقعات الحالية (Forecasts):
{forecast_summary}

سياق شرائح العملاء (Personas):
{persona_summary}
{margin_block}
يجب أن تكون إجاباتك محددة وقابلة للتنفيذ، وأن تستند إلى الحقول أعلاه — بما فيها global_yhat وتوقعات القطاعات عند وجودها. لا تقل إن بيانات التوقعات غير متوفرة إذا ظهرت في السياق.

أجب بلغة سؤال المستخدم (عربي أو إنجليزي أو غيرهما)."""


def _system_prompt_from_packet(packet: ContextPacket) -> str:
    """Split the budgeted JSON packet into pillar summaries for ``build_system_prompt``."""
    try:
        blob = json.loads(packet.json_payload)
    except json.JSONDecodeError:
        blob = {}

    fc = json.dumps(blob.get("forecast", {}), ensure_ascii=False)
    seg = json.dumps(blob.get("segmentation", {}), ensure_ascii=False)
    marg = json.dumps(blob.get("margin", {}), ensure_ascii=False)

    return build_system_prompt(fc, seg, marg)


# ─────────────────────────────────────────────────────────────────────────────
# Public streaming entry point
# ─────────────────────────────────────────────────────────────────────────────

async def stream_executive_summary(
    user_query: str,
    forecasts: list[ForecastInput],
    margin: MarginInput,
    segmentation: SegmentationInput,
    *,
    max_at_risk_deals: int = 5,
    temperature: float = 0.4,
    max_tokens: int = 512,
) -> AsyncGenerator[str, None]:
    """
    Async generator that streams an LLM-generated executive summary as SSE.

    Designed to be passed directly to FastAPI's ``StreamingResponse``:

        from fastapi.responses import StreamingResponse

        @router.post("/synthesise")
        async def synthesise(req: SynthesisRequest):
            return StreamingResponse(
                stream_executive_summary(
                    user_query=req.query,
                    forecasts=req.forecasts,
                    margin=req.margin,
                    segmentation=req.segmentation,
                ),
                media_type="text/event-stream",
                headers={"X-Accel-Buffering": "no"},   # disable Nginx buffering
            )

    Parameters
    ──────────
    user_query        : Free-text question from the frontend.
    forecasts         : List of ForecastInput (one per business segment).
    margin            : MarginInput from margin_engine.
    segmentation      : SegmentationInput from segmentation.
    max_at_risk_deals : Initial cap before budget trimming (default 5).
    temperature       : Groq sampling temperature (default 0.4 — factual/precise).
    max_tokens        : Max tokens in the LLM completion (default 512).

    Yields
    ──────
    SSE-formatted strings: meta → chunk* → done  (or meta → error → done).

    Invariant
    ─────────
    ``done`` is ALWAYS the final yielded event, regardless of success/failure.
    """
    settings = get_settings()

    try:
        groq = _get_groq_client()
    except SynthesisError as exc:
        yield _error_event(exc.message, code=exc.code)
        yield _done_event()
        return

    # ── Step 1: Build token-budgeted context packet ───────────────────────
    try:
        packet = build_context(
            forecasts=forecasts,
            margin=margin,
            segmentation=segmentation,
            max_at_risk_deals=max_at_risk_deals,
        )
        # ── Step 2: Log pruning decisions at DEBUG ────────────────────────────
        for entry in packet.pruning_log:
            logger.debug("[context_builder] %s", entry)

        logger.info(
            "Context packet built | tokens=%d | budget=%.1f%%",
            packet.token_estimate,
            packet.budget_used_pct,
        )

        # ── Step 3: Emit meta event immediately (frontend can show spinner) ───
        yield _meta_event(
            token_estimate=packet.token_estimate,
            budget_pct=packet.budget_used_pct,
            pruning_log=packet.pruning_log,
        )

        # ── Step 4: Format system prompt (Arabic analyst framing + pillar JSON summaries)
        system_prompt = _system_prompt_from_packet(packet)

    except ValueError:
        logger.info("Context empty or conversational query detected; using natural language fallback.")
        # Step 3 (Fallback): Emit meta event for consistency
        yield _meta_event(
            token_estimate=0,
            budget_pct=0.0,
            pruning_log=["Analytical context unavailable - switching to conversational mode."]
        )
        system_prompt = "You are Predicto AI. The user hasn't uploaded their revenue data yet. Chat with them normally, introduce yourself, and politely ask them to upload their CSV in the 'Upload Data' page to begin analysis."

    # ── Step 5: Stream Groq completion ───────────────────────────────────
    try:
        stream = await groq.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_query},
            ],
            stream=True,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        async for groq_chunk in stream:
            # Each chunk may carry zero, one, or multiple choices.
            # We only care about the first choice's delta text.
            choices = groq_chunk.choices
            if not choices:
                continue
            delta_text: str | None = choices[0].delta.content
            if delta_text:
                yield _chunk_event(delta_text)

        logger.info("Groq stream completed successfully for query=%r.", user_query[:80])

    except AuthenticationError as exc:
        # Hard failure — bad key. Unlikely post-startup, but handle anyway.
        logger.error("Groq AuthenticationError: %s", exc)
        yield _error_event(
            "Invalid or expired Groq API key. Contact your administrator.",
            code="AUTH_ERROR",
        )

    except APIConnectionError as exc:
        # Network-level failure (DNS, TLS, timeout).
        logger.error("Groq APIConnectionError: %s", exc)
        yield _error_event(
            "Could not reach the Groq API. Check network connectivity and retry.",
            code="CONNECTION_ERROR",
        )

    except APIStatusError as exc:
        # HTTP 4xx / 5xx from Groq (rate-limit, model not found, etc.)
        logger.error(
            "Groq APIStatusError status=%d body=%s", exc.status_code, exc.message
        )
        # Expose status code in the code field so frontend can handle 429 specifically.
        yield _error_event(
            f"Groq API error ({exc.status_code}): {exc.message}",
            code=f"HTTP_{exc.status_code}",
        )

    except Exception as exc:  # noqa: BLE001
        # Catch-all — never let an unhandled exception silently drop the stream.
        logger.exception("Unexpected error during Groq streaming: %s", exc)
        yield _error_event(
            "An unexpected error occurred during synthesis. Please try again.",
            code="UNEXPECTED_ERROR",
        )

    finally:
        # Invariant: `done` is always the last event.
        yield _done_event()

async def get_executive_summary_sync(
    user_query: str,
    forecasts: list[ForecastInput],
    margin: MarginInput,
    segmentation: SegmentationInput,
    *,
    temperature: float = 0.4,
    max_tokens: int = 512,
) -> str:
    """
    Non-streaming version of the executive summary.
    Returns the full textual response as a single string.
    """
    settings = get_settings()
    groq = _get_groq_client()

    # Reuse the same context building logic
    try:
        packet = build_context(
            forecasts=forecasts,
            margin=margin,
            segmentation=segmentation,
            max_at_risk_deals=5,
        )
        system_prompt = _system_prompt_from_packet(packet)
    except ValueError:
        system_prompt = "You are Predicto AI. The user hasn't uploaded their revenue data yet. Chat with them normally, introduce yourself, and politely ask them to upload their CSV in the 'Upload Data' page to begin analysis."

    try:
        completion = await groq.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_query},
            ],
            stream=False,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        
        return completion.choices[0].message.content or ""
        
    except Exception as exc:
        logger.error("Groq non-streaming request failed: %s", exc, exc_info=True)
        raise SynthesisError(f"Synthesis failed: {str(exc)}") from exc