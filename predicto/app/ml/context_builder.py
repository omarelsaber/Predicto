"""
app/ml/context_builder.py
─────────────────────────────────────────────────────────────────────────────
Bridge layer: consumes raw outputs from all three ML pillars and emits a
single, deterministic, token-budgeted JSON string that synthesis_service
injects verbatim into the Groq/Llama-3 system prompt.

Design contract
───────────────
• Input   : typed dataclasses mirroring each pillar's return objects.
             Avoids importing from sibling ml/ modules to prevent circular
             dependency chains when all three are wired up in lifespan.py.
• Output  : ContextPacket  — Pydantic model exposing both the serialised
             JSON string (for prompt injection) and a token count (for
             downstream budget accounting).
• Budget  : TOKEN_BUDGET = 600 (adjustable via settings).
             Token estimate = ceil(len(json_str) / CHARS_PER_TOKEN).
             CHARS_PER_TOKEN = 4  (±5 % accurate for English/numeric JSON).
• Pruning : Per-pillar priority queues. Higher-signal facts are kept first;
             lower-signal arrays are trimmed to maintain budget.
             Order of precedence inside each pillar:
               Pillar 1 — segment-level forecast summary (next-period delta,
                           r2, trend direction) > raw date arrays (dropped).
               Pillar 2 — discount ceiling matrix > at-risk deal summaries
                           > raw per-deal scores (dropped).
               Pillar 3 — persona label + top 3 behavioural traits > full
                           cluster centroid vectors (dropped).
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

TOKEN_BUDGET: int = 600
CHARS_PER_TOKEN: int = 4          # heuristic: 1 token ≈ 4 chars (GPT/Llama)
_RESERVE_TOKENS: int = 40         # headroom for JSON envelope characters


# ─────────────────────────────────────────────────────────────────────────────
# Input dataclasses  (mirrors each pillar's public return types without
#                     importing from them — avoids circular imports)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ForecastInput:
    """Subset of forecasting.ForecastResult consumed by context_builder."""
    segment: str
    periods_ahead: int
    yhat_next: float            # predicted revenue next period
    yhat_lower_next: float
    yhat_upper_next: float
    yhat_current: float         # most-recent actual/predicted (baseline)
    r2_validation: float
    trend_direction: str        # "up" | "down" | "flat"  (pre-computed)
    pct_change: float           # (yhat_next - yhat_current) / yhat_current


@dataclass
class DealRisk:
    """Summarised high-risk deal from margin_engine.DealScore."""
    deal_id: str
    segment: str
    region: str
    predicted_margin: float
    discount: float
    recommendation: str         # e.g. "Reduce discount to 18 %"


@dataclass
class MarginInput:
    """Subset of margin_engine.MarginModels consumed by context_builder."""
    # discount_ceiling_matrix:  {segment: {region: max_safe_discount}}
    discount_ceiling_matrix: dict[str, dict[str, float]]
    at_risk_deals: list[DealRisk]       # pre-filtered: margin_rate < 0.05
    model_r2: float                     # hold-out R² of the GBR/XGB model
    avg_margin_by_segment: dict[str, float]


@dataclass
class PersonaTrait:
    segment: str
    persona_label: str                  # e.g. "Champion", "Value Seeker"
    avg_deal_value: float
    avg_discount: float
    avg_margin: float
    churn_risk: str                     # "low" | "medium" | "high"
    top_region: str
    cluster_size: int                   # number of customers in cluster


@dataclass
class SegmentationInput:
    """Subset of segmentation.SegmentationResult consumed by context_builder."""
    personas: list[PersonaTrait]
    silhouette_score: float
    n_clusters: int


# ─────────────────────────────────────────────────────────────────────────────
# Output model
# ─────────────────────────────────────────────────────────────────────────────

class ContextPacket(BaseModel):
    """
    Final output of build_context().  synthesis_service injects
    `json_payload` into the LLM system prompt and uses `token_estimate`
    for budget accounting.
    """
    json_payload: str = Field(
        description="Compact JSON string; inject verbatim into LLM prompt."
    )
    token_estimate: int = Field(
        description="Estimated token count of json_payload (chars / 4)."
    )
    budget_used_pct: float = Field(
        description="token_estimate / TOKEN_BUDGET as a percentage."
    )
    pruning_log: list[str] = Field(
        default_factory=list,
        description="Human-readable record of what was trimmed and why."
    )

    class Config:
        frozen = True


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / CHARS_PER_TOKEN)


def _budget_chars() -> int:
    return (TOKEN_BUDGET - _RESERVE_TOKENS) * CHARS_PER_TOKEN


def _round2(v: float) -> float:
    """Round to 2 d.p. — halves JSON length vs. full float repr."""
    return round(v, 2)


def _pct(v: float) -> str:
    """Format a ratio as a percentage string, e.g. 0.183 → '18.3%'."""
    return f"{v * 100:.1f}%"


def _trend_arrow(direction: str) -> str:
    return {"up": "↑", "down": "↓", "flat": "→"}.get(direction, "→")


# ─────────────────────────────────────────────────────────────────────────────
# Per-pillar pruners
# ─────────────────────────────────────────────────────────────────────────────

def _prune_forecast(
    forecasts: list[ForecastInput],
    pruning_log: list[str],
) -> dict[str, Any]:
    """
    Pillar 1 — keep only the highest-signal scalar facts per segment.
    Drops raw date/yhat arrays entirely (already summarised).
    """
    segments_out = []
    total_yhat_next = 0.0
    total_yhat_current = 0.0
    
    for f in forecasts:
        segments_out.append({
            "segment": f.segment,
            "next_period_revenue": _round2(f.yhat_next),
            "confidence_interval": [
                _round2(f.yhat_lower_next),
                _round2(f.yhat_upper_next),
            ],
            "pct_change_vs_current": _pct(f.pct_change),
            "trend": _trend_arrow(f.trend_direction),
            "r2": _round2(f.r2_validation),
        })
        total_yhat_next += f.yhat_next
        total_yhat_current += f.yhat_current

    global_pct_change = (total_yhat_next - total_yhat_current) / total_yhat_current if total_yhat_current > 0 else 0.0
    global_trend = "up" if global_pct_change >= 0.05 else ("down" if global_pct_change <= -0.05 else "flat")

    pruning_log.append(
        f"Pillar-1: retained {len(segments_out)} segment summaries + global aggregate; "
        "dropped raw date/yhat arrays."
    )
    return {
        "forecast": {
            "global_summary": {
                # Explicit aggregate forecast (global_yhat) — LLM must cite this, not claim missing forecast data.
                "global_yhat": _round2(total_yhat_next),
                "total_next_period_revenue": _round2(total_yhat_next),
                "aggregate_pct_change": _pct(global_pct_change),
                "aggregate_trend": _trend_arrow(global_trend),
            },
            "segments": segments_out,
        },
    }


def _prune_margin(
    margin: MarginInput,
    max_deals: int,
    pruning_log: list[str],
) -> dict[str, Any]:
    """
    Pillar 2 — keep ceiling matrix + top-N at-risk deals (sorted by
    predicted_margin ASC so worst offenders appear first).
    Drops per-deal feature vectors; keeps only human-readable fields.
    """
    # Flatten discount ceiling matrix: {segment__region: max_pct}
    ceiling_flat: dict[str, str] = {}
    for seg, regions in margin.discount_ceiling_matrix.items():
        for region, ceiling in regions.items():
            ceiling_flat[f"{seg}/{region}"] = _pct(ceiling)

    # Sort at-risk deals worst-first, cap at max_deals
    sorted_deals = sorted(
        margin.at_risk_deals,
        key=lambda d: d.predicted_margin
    )[:max_deals]

    deals_out = [
        {
            "id": d.deal_id,
            "segment": d.segment,
            "region": d.region,
            "predicted_margin": _pct(d.predicted_margin),
            "discount": _pct(d.discount),
            "action": d.recommendation,
        }
        for d in sorted_deals
    ]

    dropped = len(margin.at_risk_deals) - len(deals_out)
    pruning_log.append(
        f"Pillar-2: kept {len(deals_out)} at-risk deals "
        f"(dropped {dropped}); retained ceiling matrix "
        f"({len(ceiling_flat)} seg/region pairs)."
    )

    return {
        "margin": {
            "model_r2": _round2(margin.model_r2),
            "avg_margin_by_segment": {
                k: _pct(v) for k, v in margin.avg_margin_by_segment.items()
            },
            "discount_ceiling": ceiling_flat,
            "at_risk_deals": deals_out,
        }
    }


def _prune_segmentation(
    segmentation: SegmentationInput,
    pruning_log: list[str],
) -> dict[str, Any]:
    """
    Pillar 3 — keep persona label + scalar behavioural summary per cluster.
    Drops centroid coordinate vectors; keeps only interpretable fields.
    """
    personas_out = [
        {
            "segment": p.segment,
            "persona": p.persona_label,
            "avg_deal_value": _round2(p.avg_deal_value),
            "avg_discount": _pct(p.avg_discount),
            "avg_margin": _pct(p.avg_margin),
            "churn_risk": p.churn_risk,
            "top_region": p.top_region,
            "n_customers": p.cluster_size,
        }
        for p in segmentation.personas
    ]

    pruning_log.append(
        f"Pillar-3: retained {len(personas_out)} persona profiles "
        f"(silhouette={_round2(segmentation.silhouette_score)}); "
        "dropped cluster centroid vectors."
    )
    return {
        "segmentation": {
            "n_clusters": segmentation.n_clusters,
            "silhouette": _round2(segmentation.silhouette_score),
            "personas": personas_out,
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# Budget-aware assembler
# ─────────────────────────────────────────────────────────────────────────────

def _assemble_and_trim(
    pillar_chunks: list[dict[str, Any]],
    pruning_log: list[str],
) -> str:
    """
    Merges pillar dicts and iteratively trims the lowest-priority content
    (at-risk deals, then personas, then forecast segments) until the payload
    fits within TOKEN_BUDGET.

    Priority order (kept longest):
      1. discount_ceiling_matrix  — highest actionability
      2. forecast segment summaries
      3. persona profiles
      4. at-risk deals            — trimmed first (individually droppable)
    """
    merged: dict[str, Any] = {}
    for chunk in pillar_chunks:
        merged.update(chunk)

    payload = json.dumps(merged, separators=(",", ":"))
    if _estimate_tokens(payload) <= TOKEN_BUDGET:
        return payload

    # ── Trim pass 1: at-risk deals (drop one at a time from the end) ──
    deals: list[dict] = merged.get("margin", {}).get("at_risk_deals", [])
    while deals and _estimate_tokens(payload) > TOKEN_BUDGET:
        deals.pop()
        merged["margin"]["at_risk_deals"] = deals
        payload = json.dumps(merged, separators=(",", ":"))
    if not deals:
        pruning_log.append("Budget trim: all at-risk deals dropped.")

    if _estimate_tokens(payload) <= TOKEN_BUDGET:
        return payload

    # ── Trim pass 2: persona profiles (drop one at a time from the end) ──
    personas: list[dict] = merged.get("segmentation", {}).get("personas", [])
    while personas and _estimate_tokens(payload) > TOKEN_BUDGET:
        personas.pop()
        merged["segmentation"]["personas"] = personas
        payload = json.dumps(merged, separators=(",", ":"))
    if not personas:
        pruning_log.append("Budget trim: all persona profiles dropped.")

    if _estimate_tokens(payload) <= TOKEN_BUDGET:
        return payload

    # ── Trim pass 3: forecast segments (drop one at a time from the end) ──
    fc_segs: list[dict] = merged.get("forecast", [])
    while fc_segs and _estimate_tokens(payload) > TOKEN_BUDGET:
        fc_segs.pop()
        merged["forecast"] = fc_segs
        payload = json.dumps(merged, separators=(",", ":"))
    if not fc_segs:
        pruning_log.append("Budget trim: all forecast segments dropped — "
                           "only margin ceiling matrix retained.")

    # Final hard-truncate if somehow still over (should never happen with
    # realistic pillar outputs, but guards against mis-configuration).
    max_chars = _budget_chars()
    if len(payload) > max_chars:
        payload = payload[:max_chars]
        pruning_log.append(
            f"Budget trim: hard character truncation to {max_chars} chars."
        )

    return payload


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def build_context(
    forecasts: list[ForecastInput],
    margin: MarginInput,
    segmentation: SegmentationInput,
    *,
    max_at_risk_deals: int = 5,
) -> ContextPacket:
    """
    Entry point called by synthesis_service (and indirectly by the API
    layer when assembling a streaming response).

    Parameters
    ──────────
    forecasts         : one ForecastInput per business segment.
    margin            : full MarginInput from margin_engine.
    segmentation      : full SegmentationInput from segmentation.
    max_at_risk_deals : initial cap on at-risk deals before budget trimming
                        (default 5 — roughly 180 chars each).

    Returns
    ───────
    ContextPacket with json_payload ready for prompt injection.

    Raises
    ──────
    ValueError : if all three pillar inputs are empty (nothing to build).
    """
    # Guard against None or empty inputs to prevent crashes
    has_forecasts = bool(forecasts)
    has_margin = margin is not None and bool(margin.at_risk_deals)
    has_segmentation = segmentation is not None and bool(segmentation.personas)

    if not has_forecasts and not has_margin and not has_segmentation:
        raise ValueError(
            "build_context received empty outputs from all three pillars. "
            "Analytical context is currently unavailable."
        )

    pruning_log: list[str] = []

    # ── Per-pillar pruning ────────────────────────────────────────────────
    pillar_chunks: list[dict[str, Any]] = []

    if forecasts:
        pillar_chunks.append(_prune_forecast(forecasts, pruning_log))

    if margin is not None:
        pillar_chunks.append(
            _prune_margin(margin, max_at_risk_deals, pruning_log)
        )

    if segmentation is not None and segmentation.personas:
        pillar_chunks.append(_prune_segmentation(segmentation, pruning_log))

    # ── Budget-aware assembly ─────────────────────────────────────────────
    payload = _assemble_and_trim(pillar_chunks, pruning_log)

    token_estimate = _estimate_tokens(payload)
    budget_pct = round((token_estimate / TOKEN_BUDGET) * 100, 1)

    return ContextPacket(
        json_payload=payload,
        token_estimate=token_estimate,
        budget_used_pct=budget_pct,
        pruning_log=pruning_log,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Prompt-ready formatter
# ─────────────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT_TEMPLATE = """\
You are Predicto, an AI revenue-intelligence co-pilot for B2B SaaS finance \
teams. You have access to the following real-time analytical context derived \
from the company's own transaction data. Use it to answer the user's question \
with precise, actionable insight. Cite specific numbers from the context. \
Do not speculate beyond the data provided.

### Live Analytics Context (JSON)
{context_json}

### Instructions
- Respond in concise paragraphs (no bullet dumps unless the user asks).
- If asked about a specific deal or segment, prioritise the matching entry.
- If the data does not cover the user's question, say so clearly.
- Revenue forecasting is ALWAYS present when `forecast` appears in the JSON. \
Reference `forecast.global_summary.global_yhat` (aggregate predicted next-period \
revenue in USD) and each segment's `next_period_revenue` when discussing outlook. \
Never state that forecast or yhat information is unavailable when those fields \
are present in the context.
"""


def format_system_prompt(packet: ContextPacket) -> str:
    """
    Wraps the JSON payload in the Predicto system-prompt template.
    synthesis_service passes the return value as the `system` argument
    to the Groq streaming call.

    Parameters
    ──────────
    packet : ContextPacket returned by build_context().

    Returns
    ───────
    Fully-formed system prompt string ready for Groq API injection.
    """
    return _SYSTEM_PROMPT_TEMPLATE.format(context_json=packet.json_payload)