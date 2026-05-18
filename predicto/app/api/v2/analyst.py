"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/api/v2/analyst.py                                                      ║
║  Predicto V2 — AI Analyst Router (Phase 4)                                  ║
║                                                                              ║
║  Endpoints                                                                  ║
║  ─────────                                                                  ║
║  1. POST /explain                                                           ║
║       Given an entity_id and type, returns a 2-4 sentence data-grounded     ║
║       root-cause narrative. Designed for side-drawers / "Why?" cards.       ║
║                                                                             ║
║  2. POST /chat                                                              ║
║       Stateless multi-turn chat interface with full portfolio context       ║
║       injection and optional focus entity.                                  ║
║                                                                             ║
║  3. POST /root-cause                                                        ║
║       Generates/refreshes the portfolio-level executive narrative.           ║
║       Automatically called by the Ingestion Service; can be manually        ║
║       triggered. Supports `background=true` for non-blocking UI.            ║
║                                                                             ║
║  Safety Guardrails                                                          ║
║  ─────────────────                                                          ║
║  • All endpoints return safe FALLBACK strings if Groq is unavailable.       ║
║  • 404 is returned if the requested entity_id is not found in cache.        ║
║  • Token budgeting is handled internally by the service layer.             ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
import textwrap
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, status

from app.core.cache import predicto_cache_v2
from app.models.response_models import (
    ChatRequest,
    ChatResponse,
    ExplanationRequest,
    ExplanationResponse,
    RootCauseNarrative,
)
from app.services.ai_analyst_service import (
    generate_chat_response,
    generate_explanation,
    generate_root_cause_narrative,
)

log = logging.getLogger("predicto.v2.analyst")

router = APIRouter(prefix="/analyst", tags=["AI Analyst"])


# ─────────────────────────────────────────────────────────────────────────────
# 1. EXPLAIN (Root-Cause Narrative for specific Entity)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/explain",
    response_model=ExplanationResponse,
    summary="Explain Entity (Root-Cause)",
    description=textwrap.dedent("""
        Generates a 2-4 sentence plain-English explanation for why a specific
        customer is at risk, why a deal is high-priority, or why a customer
        is an expansion candidate.
        
        The narrative is grounded strictly in the cached portfolio data.
        If the entity_id is not found in the cache, returns a 404.
    """),
)
async def explain_entity(request: ExplanationRequest):
    """
    POST handler for entity-level root-cause analysis.
    """
    # 1. Verify entity exists in cache before calling LLM
    # (We build the snapshot here just to check presence; the service does it again
    # but this prevents unnecessary LLM calls if the frontend sends a bad ID).
    from app.services.ai_analyst_service import _build_entity_snapshot
    snapshot, _ = _build_entity_snapshot(request.entity_id, request.context_type)
    
    # If no keys were found other than the defaults, the entity is missing
    if len(snapshot) <= 2:
        log.warning("explain_entity: ID %s not found in cache.", request.entity_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Entity '{request.entity_id}' of type '{request.context_type.value}' not found in portfolio cache."
        )

    # 2. Delegate to service layer (handling fallbacks internally)
    response = generate_explanation(
        entity_id=request.entity_id,
        context_type=request.context_type,
        max_tokens=request.max_tokens
    )
    
    return response


# ─────────────────────────────────────────────────────────────────────────────
# 2. CHAT (Portfolio Q&A)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Chat with Portfolio Context",
    description=textwrap.dedent("""
        Stateless multi-turn chat interface. Predicto acts as an expert
        analyst with access to the full portfolio context (Top churn risks,
        KPIs, priority deals).
        
        Supply 'history' to maintain conversation context.
        Supply 'focus_entity_id' to anchor the context to a specific account.
    """),
)
async def chat_with_analyst(request: ChatRequest):
    """
    POST handler for interactive data Q&A.
    """
    # 1. Verification for focus entity if provided
    if request.focus_entity_id:
        if not request.focus_context_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="focus_context_type is required when focus_entity_id is provided."
            )
        
        from app.services.ai_analyst_service import _build_entity_snapshot
        snapshot, _ = _build_entity_snapshot(request.focus_entity_id, request.focus_context_type)
        if len(snapshot) <= 2:
            log.warning("chat_with_analyst: focus ID %s not found.", request.focus_entity_id)
            # We don't 404 here, we just drop the focus and proceed with global context
            request.focus_entity_id = None
            request.focus_context_type = None

    # 2. Delegate to service layer
    response = generate_chat_response(
        message=request.message,
        history=request.history,
        max_tokens=request.max_tokens,
        focus_entity_id=request.focus_entity_id,
        focus_context_type=request.focus_context_type
    )
    
    return response


# ─────────────────────────────────────────────────────────────────────────────
# 3. ROOT-CAUSE (Portfolio executive summary)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/root-cause",
    response_model=RootCauseNarrative,
    summary="Generate Portfolio Root-Cause",
    description=textwrap.dedent("""
        Triggers the generation of the executive narrative for the portfolio.
        This summary appears on the Intelligence Hub.
        
        The result is stored in the cache singleton (`root_cause_narrative`).
        If `background=true`, returns the current cache (or a 'generating' state)
        immediately and runs the LLM call in a background task.
    """),
)
async def trigger_root_cause(
    background_tasks: BackgroundTasks,
    background: bool = False
):
    """
    POST handler to refresh the global executive summary.
    """
    # 1. Helper to run and store the result
    def _run_and_cache():
        narrative = generate_root_cause_narrative()
        predicto_cache_v2.update(root_cause_narrative=narrative)
        log.info("Portfolio root-cause narrative refreshed and cached.")

    # 2. Execution path
    if background:
        background_tasks.add_task(_run_and_cache)
        
        # Return existing cache or a placeholder if empty
        cached = predicto_cache_v2.root_cause_narrative
        if cached:
            return cached
        
        return RootCauseNarrative(
            narrative="Predicto is currently analysing your portfolio root causes. This will be ready in ~10 seconds.",
            status="success", # Using success here to avoid UI error states
            top_risk_entity_ids=[]
        )

    # 3. Synchronous execution
    _run_and_cache()
    return predicto_cache_v2.root_cause_narrative
