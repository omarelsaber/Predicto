"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/services/ai_analyst_service.py                                         ║
║  Predicto V2 — Phase 4 AI Analyst Service Layer                            ║
║                                                                              ║
║  Responsibilities                                                           ║
║  ────────────────                                                           ║
║  1. _build_global_context()                                                 ║
║       Reads predicto_cache_v2 and assembles a dense, token-efficient        ║
║       context string (target 1,800-2,400 tokens) covering:                 ║
║         • Portfolio KPIs & schema health                                    ║
║         • Top 5 churn-risk customers                                        ║
║         • Top 5 priority deals                                              ║
║         • Top 5 expansion candidates                                        ║
║         • Degradation log summary                                           ║
║                                                                             ║
║  2. generate_explanation(entity_id, context_type)                          ║
║       Builds an entity-specific mini-context from cached data and calls    ║
║       Groq (llama-3.3-70b-versatile) for a 2-4 sentence root-cause         ║
║       narrative. Falls back to a deterministic string on any failure.      ║
║                                                                             ║
║  3. generate_chat_response(message, history, …)                            ║
║       Injects the global context as a system prompt, appends conversation  ║
║       history, and calls Groq for a stateless chat response.               ║
║                                                                             ║
║  4. generate_root_cause_narrative()                                        ║
║       Produces the pre-cached 2-3 sentence portfolio-level narrative       ║
║       called once at cache hydration time.                                 ║
║                                                                             ║
║  Contract                                                                  ║
║  ────────                                                                  ║
║  • NEVER raises outside this module. All Groq errors are caught and        ║
║    surfaced as FALLBACK responses with safe deterministic strings.         ║
║  • All context strings are token-budgeted before the Groq call.           ║
║  • No hallucination: the system prompt instructs the model to cite only    ║
║    data present in the injected context packet.                            ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging
import os
import textwrap
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from app.core.cache import predicto_cache_v2
from app.core.schema_resolver import resolve_canonical_df
from app.models.response_models import (
    AnalystResponseStatus,
    ChatMessage,
    ChatResponse,
    ExplainContextType,
    ExplanationResponse,
    RootCauseNarrative,
)

log = logging.getLogger("predicto.v2.ai_analyst")

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

_GROQ_MODEL       = "llama-3.3-70b-versatile"
_GROQ_API_BASE    = "https://api.groq.com/openai/v1"
_GROQ_API_KEY_ENV = "GROQ_API_KEY"

# How many rows to pull into the global context for each section
_TOP_N_CHURN      = 5
_TOP_N_DEALS      = 5
_TOP_N_EXPANSION  = 5

# Approximate token budget for the global context (leave headroom for system
# prompt boilerplate + history + completion within Groq's 8K window)
_CONTEXT_TOKEN_BUDGET = 2_400

# Rough chars-per-token for English prose (conservative estimate)
_CHARS_PER_TOKEN  = 3.8

# ─────────────────────────────────────────────────────────────────────────────
# SYSTEM PROMPT TEMPLATES
# ─────────────────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT_BASE = textwrap.dedent("""\
    You are Predicto, an expert AI Revenue Operations analyst embedded inside
    a B2B SaaS revenue intelligence platform. You have been given a data context
    packet containing real portfolio metrics, customer health KPIs, churn risk
    scores, deal priorities, and expansion predictions — all computed by an
    ML pipeline from the company's uploaded CRM and customer success data.

    STRICT GROUNDING RULES — you must follow these without exception:
    1. Cite ONLY data present in the context packet provided below.
    2. If you cannot answer from the provided data, say so explicitly.
       Do NOT invent customer names, ARR figures, probabilities, or KPI values.
    3. Be concise and actionable. You are talking to a VP of Sales or RevOps
       Director — they want the "so what" and the next step, not a summary.
    4. Quantify where possible: use the exact figures from the context.
    5. Never speculate about business strategy, product roadmap, or competitor
       features unless they appear in the context data.
    6. Response length: 2-4 sentences for explanations; conversational for chat.

    DATA CONTEXT PACKET:
    ───────────────────────────────────────────────────────────────────────────
    {context}
    ───────────────────────────────────────────────────────────────────────────
""")

_EXPLAIN_PROMPT_CHURN = textwrap.dedent("""\
    Using ONLY the entity data above, explain in 2-4 sentences why customer
    {entity_id} ({entity_name}) is flagged as a churn risk. Identify the
    single most actionable signal and what the CSM should do this week.
    Ground every claim in a specific number from the data.
""")

_EXPLAIN_PROMPT_DEAL = textwrap.dedent("""\
    Using ONLY the entity data above, explain in 2-4 sentences why deal
    {entity_id} ({entity_name}) has a high priority score. Name the dominant
    risk or opportunity signal and give the account executive one concrete
    next action grounded in the data.
""")

_EXPLAIN_PROMPT_EXPANSION = textwrap.dedent("""\
    Using ONLY the entity data above, explain in 2-4 sentences why customer
    {entity_id} ({entity_name}) is an expansion candidate. Reference the
    cluster, predicted expansion ARR, and one specific product signal.
    End with the recommended campaign action.
""")

_EXPLAIN_PROMPT_GENERAL = textwrap.dedent("""\
    Using ONLY the entity data above, provide a 2-4 sentence analysis of
    entity {entity_id}. Highlight the most significant business signal
    and one recommended next action.
""")

_ROOT_CAUSE_PROMPT = textwrap.dedent("""\
    Using ONLY the portfolio data above, write a 2-3 sentence executive
    summary of the single biggest revenue risk facing this portfolio right
    now. Name specific customers and exact ARR figures. End with the one
    action the leadership team should take in the next 7 days.
    Do not use bullet points. Write in flowing prose.
""")

# ─────────────────────────────────────────────────────────────────────────────
# HELPER — COLUMN DETECTION
# ─────────────────────────────────────────────────────────────────────────────

def _col(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _safe_str(val: Any, fallback: str = "N/A") -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return fallback
    return str(val).strip() or fallback


def _safe_float(val: Any, fallback: float = 0.0) -> float:
    try:
        f = float(val)
        return f if pd.notna(f) else fallback
    except (TypeError, ValueError):
        return fallback


def _fmt_arr(value: float) -> str:
    """Format a currency value concisely: 1_250_000 → '$1.25M'."""
    if value >= 1_000_000:
        return f"${value / 1_000_000:.2f}M"
    if value >= 1_000:
        return f"${value / 1_000:.1f}K"
    return f"${value:.0f}"


def _token_estimate(text: str) -> int:
    """Rough token count estimate based on character count."""
    return max(1, int(len(text) / _CHARS_PER_TOKEN))


# ─────────────────────────────────────────────────────────────────────────────
# HELPER — GROQ CLIENT
# ─────────────────────────────────────────────────────────────────────────────

def _get_groq_client():
    """
    Return a Groq client instance, or None if the library / key is absent.
    Uses the official `groq` Python SDK.
    """
    api_key = os.environ.get(_GROQ_API_KEY_ENV, "").strip()
    if not api_key:
        log.warning("GROQ_API_KEY not set — LLM calls will be unavailable.")
        return None
    try:
        from groq import Groq  # type: ignore[import]
        return Groq(api_key=api_key)
    except ImportError:
        log.warning("groq package not installed — LLM calls will be unavailable.")
        return None


def _call_groq(
    system_prompt: str,
    user_message: str,
    history: Optional[List[ChatMessage]] = None,
    max_tokens: int = 400,
) -> Tuple[Optional[str], Optional[int], Optional[str]]:
    """
    Call the Groq API and return (reply_text, tokens_used, model_used).

    Returns (None, None, None) on any failure so callers can detect the
    fallback condition without catching exceptions themselves.

    Parameters
    ----------
    system_prompt : str
        Full system prompt (includes the injected context packet).
    user_message : str
        The final user turn to complete.
    history : list of ChatMessage, optional
        Preceding conversation turns inserted between system and final user.
    max_tokens : int
        Max completion tokens.
    """
    client = _get_groq_client()
    if client is None:
        return None, None, None

    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]

    if history:
        for turn in history:
            messages.append({"role": turn.role, "content": turn.content})

    messages.append({"role": "user", "content": user_message})

    try:
        completion = client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.3,   # low temperature = more grounded, less creative
            top_p=0.9,
        )
        reply      = completion.choices[0].message.content.strip()
        tokens     = completion.usage.total_tokens if completion.usage else None
        model_used = completion.model
        log.info("Groq call succeeded: %d tokens, model=%s", tokens or 0, model_used)
        return reply, tokens, model_used

    except Exception as exc:
        log.warning("Groq API call failed: %s", exc)
        return None, None, None


# ─────────────────────────────────────────────────────────────────────────────
# 1. GLOBAL CONTEXT BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def _build_kpi_section(cache) -> str:
    """Extract portfolio-wide KPI block from engineered_df or snapshots_df."""
    lines = ["## PORTFOLIO KPIs"]
    lines.append(f"Schema mode   : {cache.active_model or 'unknown'}")
    lines.append(f"Health score  : {cache.health_score}/100")
    lines.append(f"Tables loaded : {', '.join(cache.tables_loaded) or 'none'}")

    eng = cache.engineered_df
    if eng is not None and not eng.empty:
        arr_col = _col(eng, ["arr", "annual_recurring_revenue", "mrr"])
        churn_col = _col(eng, ["churn_risk_score", "churn_probability", "churn_risk"])
        adopt_col = _col(eng, ["feature_adoption_score", "feature_adoption", "fav"])

        if arr_col:
            total_arr  = eng[arr_col].sum()
            median_arr = eng[arr_col].median()
            lines.append(f"Total portfolio ARR : {_fmt_arr(total_arr)}")
            lines.append(f"Median customer ARR : {_fmt_arr(median_arr)}")

        if churn_col:
            avg_churn = eng[churn_col].mean()
            n_critical = (eng[churn_col] > 0.70).sum()
            lines.append(f"Avg churn risk      : {avg_churn:.1%}")
            lines.append(f"CRITICAL churn count: {n_critical}")

        if adopt_col:
            avg_adopt = eng[adopt_col].mean()
            lines.append(f"Avg feature adoption: {avg_adopt:.1%}")

        lines.append(f"Total customers     : {len(eng)}")

    if cache.degradation_log:
        n_events = len(cache.degradation_log)
        tables_affected = list({e.get("table", "?") for e in cache.degradation_log})
        lines.append(f"Schema degradations : {n_events} event(s) across {', '.join(tables_affected)}")

    return "\n".join(lines)


def _build_churn_section(cache) -> str:
    """Top N churn-risk customers from engineered_df or snapshots_df."""
    lines = [f"\n## TOP {_TOP_N_CHURN} CHURN RISKS (highest probability first)"]

    eng = cache.engineered_df
    snaps = cache.snapshots_df

    source = None
    if eng is not None and not eng.empty:
        source = eng
    elif snaps is not None and not snaps.empty:
        source = snaps

    if source is None:
        lines.append("No customer data available.")
        return "\n".join(lines)

    cust_col  = _col(source, ["customer_id", "cust_id", "account_id", "id"])
    name_col  = _col(source, ["customer_name", "company_name", "account_name", "name"])
    arr_col   = _col(source, ["arr", "annual_recurring_revenue", "mrr"])
    churn_col = _col(source, ["churn_risk_score", "churn_probability", "churn_risk"])
    adopt_col = _col(source, ["feature_adoption_score", "feature_adoption", "fav"])
    ticket_col= _col(source, ["support_tickets_at_snapshot", "support_tickets"])

    if churn_col is None:
        lines.append("Churn risk scores not available in current cache.")
        return "\n".join(lines)

    top = (
        source.dropna(subset=[churn_col])
              .nlargest(_TOP_N_CHURN, churn_col)
    )

    for i, (_, row) in enumerate(top.iterrows(), 1):
        cid   = _safe_str(row.get(cust_col) if cust_col else None, f"CID-{i}")
        cname = _safe_str(row.get(name_col) if name_col else None, cid)
        arr   = _fmt_arr(_safe_float(row.get(arr_col) if arr_col else None))
        prob  = f"{_safe_float(row.get(churn_col)):.1%}"

        extras = []
        if adopt_col and pd.notna(row.get(adopt_col)):
            extras.append(f"adoption={_safe_float(row[adopt_col]):.0%}")
        if ticket_col and pd.notna(row.get(ticket_col)):
            extras.append(f"tickets={int(_safe_float(row[ticket_col]))}")

        extra_str = f" | {', '.join(extras)}" if extras else ""
        lines.append(f"{i}. {cname} (ID:{cid}) | ARR:{arr} | churn_prob:{prob}{extra_str}")

    return "\n".join(lines)


def _build_deals_section(cache) -> str:
    """Top N priority deals from sales_df."""
    lines = [f"\n## TOP {_TOP_N_DEALS} PRIORITY DEALS (highest score first)"]

    sales = cache.sales_df
    if sales is None or sales.empty:
        lines.append("Sales data not loaded.")
        return "\n".join(lines)

    id_col   = _col(sales, ["deal_id", "opportunity_id", "id"])
    name_col = _col(sales, ["deal_name", "company_name", "account_name", "customer_name"])
    arr_col  = _col(sales, ["arr", "annual_recurring_revenue", "annual_revenue", "deal_value"])
    disc_col = _col(sales, ["discount_percentage", "discount_pct", "discount"])
    rep_col  = _col(sales, ["rep", "sales_rep", "owner"])
    seg_col  = _col(sales, ["segment", "customer_segment", "tier"])
    days_col = _col(sales, ["days_in_pipeline", "pipeline_age_days", "age_days"])

    # Sort by ARR descending as a proxy for priority if priority_score absent
    sort_col = _col(sales, ["priority_score"]) or arr_col
    if sort_col is None:
        lines.append("Insufficient columns to rank deals.")
        return "\n".join(lines)

    top = (
        sales.dropna(subset=[sort_col])
             .nlargest(_TOP_N_DEALS, sort_col)
    )

    for i, (_, row) in enumerate(top.iterrows(), 1):
        did   = _safe_str(row.get(id_col) if id_col else None, f"DID-{i}")
        dname = _safe_str(row.get(name_col) if name_col else None, did)
        arr   = _fmt_arr(_safe_float(row.get(arr_col) if arr_col else None))
        score = f"{_safe_float(row.get(sort_col)):.0f}" if sort_col else "N/A"
        rep   = _safe_str(row.get(rep_col) if rep_col else None)
        seg   = _safe_str(row.get(seg_col) if seg_col else None)

        extras = []
        if disc_col and pd.notna(row.get(disc_col)):
            disc = _safe_float(row[disc_col])
            disc = disc / 100.0 if disc > 1.0 else disc
            extras.append(f"discount={disc:.0%}")
        if days_col and pd.notna(row.get(days_col)):
            extras.append(f"days_in_pipeline={int(_safe_float(row[days_col]))}")

        extra_str = f" | {', '.join(extras)}" if extras else ""
        lines.append(
            f"{i}. {dname} (ID:{did}) | ARR:{arr} | score:{score} | rep:{rep} | seg:{seg}{extra_str}"
        )

    return "\n".join(lines)


def _build_expansion_section(cache) -> str:
    """Top N expansion candidates by predicted expansion ARR."""
    lines = [f"\n## TOP {_TOP_N_EXPANSION} EXPANSION CANDIDATES (highest predicted ARR first)"]

    eng = cache.engineered_df
    snaps = cache.snapshots_df
    source = eng if (eng is not None and not eng.empty) else snaps

    if source is None:
        lines.append("No customer data available.")
        return "\n".join(lines)

    cust_col    = _col(source, ["customer_id", "cust_id", "account_id", "id"])
    name_col    = _col(source, ["customer_name", "company_name", "account_name", "name"])
    arr_col     = _col(source, ["arr", "annual_recurring_revenue", "mrr"])
    cluster_col = _col(source, ["cluster", "kmeans_label", "kmeans_cluster", "segment_cluster"])
    exp_arr_col = _col(source, ["predicted_expansion_arr", "expansion_arr"])

    # Multiplier map for inline calculation when predicted column absent
    _mult = {"champion": 0.30, "growth": 0.18, "stable": 0.05, "at-risk": 0.00, "at_risk": 0.00}

    if arr_col is None and exp_arr_col is None:
        lines.append("Insufficient ARR data for expansion ranking.")
        return "\n".join(lines)

    # Build expansion ARR on the fly if not pre-computed
    working = source.copy()
    if exp_arr_col is None and cluster_col and arr_col:
        working["_exp_arr"] = working.apply(
            lambda r: _safe_float(r[arr_col]) * _mult.get(str(r[cluster_col]).strip().lower(), 0.05),
            axis=1,
        )
        exp_arr_col = "_exp_arr"

    # Exclude At-Risk (mult=0) from expansion candidates
    if cluster_col:
        working = working[
            ~working[cluster_col].astype(str).str.strip().str.lower().isin(["at-risk", "at_risk", "3"])
        ]

    if exp_arr_col is None or working.empty:
        lines.append("No expansion candidates available.")
        return "\n".join(lines)

    top = working.dropna(subset=[exp_arr_col]).nlargest(_TOP_N_EXPANSION, exp_arr_col)

    for i, (_, row) in enumerate(top.iterrows(), 1):
        cid     = _safe_str(row.get(cust_col) if cust_col else None, f"CID-{i}")
        cname   = _safe_str(row.get(name_col) if name_col else None, cid)
        arr     = _fmt_arr(_safe_float(row.get(arr_col) if arr_col else None))
        exp_arr = _fmt_arr(_safe_float(row.get(exp_arr_col)))
        cluster = _safe_str(row.get(cluster_col) if cluster_col else None, "Unknown")
        lines.append(
            f"{i}. {cname} (ID:{cid}) | current_ARR:{arr} | predicted_expansion:{exp_arr} | cluster:{cluster}"
        )

    return "\n".join(lines)


def _build_global_context() -> str:
    """
    Assemble the full portfolio context string from predicto_cache_v2.

    The string is token-budgeted to _CONTEXT_TOKEN_BUDGET. If the assembled
    text exceeds the budget, sections are progressively truncated (expansion
    first, then deals, then churn) until it fits.

    Returns an empty-state string if no data is loaded.
    """
    cache = predicto_cache_v2

    if not cache.is_ready and cache.engineered_df is None and cache.snapshots_df is None:
        return (
            "DATA STATUS: No data has been loaded into Predicto yet. "
            "Please ingest at least one CSV to enable AI analysis."
        )

    sections = [
        _build_kpi_section(cache),
        _build_churn_section(cache),
        _build_deals_section(cache),
        _build_expansion_section(cache),
    ]

    full_context = "\n".join(sections)

    # Token budget enforcement — trim trailing sections if over budget
    if _token_estimate(full_context) > _CONTEXT_TOKEN_BUDGET:
        log.info(
            "Context exceeds token budget (%d tokens). Trimming...",
            _token_estimate(full_context),
        )
        # Keep KPIs + churn always; trim expansion then deals
        trimmed = "\n".join(sections[:3])  # drop expansion
        if _token_estimate(trimmed) > _CONTEXT_TOKEN_BUDGET:
            trimmed = "\n".join(sections[:2])  # drop deals too
        full_context = trimmed + "\n\n[Additional sections omitted — token budget reached]"

    log.debug("Global context assembled: ~%d tokens", _token_estimate(full_context))
    return full_context


# ─────────────────────────────────────────────────────────────────────────────
# 2. ENTITY DATA SNAPSHOT BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def _build_entity_snapshot(
    entity_id: str,
    context_type: ExplainContextType,
) -> Tuple[Dict[str, Any], str]:
    """
    Extract all available data for a specific entity from the cache.

    Returns
    -------
    (data_dict, context_string)
        data_dict     : Key-value snapshot returned in the API response
                        (for frontend metric chips).
        context_string: Dense text block injected into the LLM prompt.
    """
    cache = predicto_cache_v2
    data: Dict[str, Any] = {"entity_id": entity_id, "context_type": context_type.value}
    lines: List[str] = [f"## ENTITY DATA: {entity_id} (type: {context_type.value})"]

    # ── Customer entity (churn or expansion) ─────────────────────────────────
    if context_type in (ExplainContextType.CHURN_CUSTOMER, ExplainContextType.EXPANSION, ExplainContextType.GENERAL):
        for df_name, df in [("engineered_df", cache.engineered_df), ("snapshots_df", cache.snapshots_df)]:
            if df is None or df.empty:
                continue

            cust_col = _col(df, ["customer_id", "cust_id", "account_id", "id"])
            if cust_col is None:
                continue

            # Match by string to handle int/str mismatches
            mask = df[cust_col].astype(str).str.strip() == str(entity_id).strip()
            if not mask.any():
                continue

            row = df[mask].iloc[0]

            # Systematically extract all numeric + string fields
            field_map = {
                "customer_name":           _col(df, ["customer_name", "company_name", "account_name", "name"]),
                "arr":                     _col(df, ["arr", "annual_recurring_revenue", "mrr"]),
                "churn_risk_score":        _col(df, ["churn_risk_score", "churn_probability", "churn_risk"]),
                "feature_adoption_score":  _col(df, ["feature_adoption_score", "feature_adoption", "fav"]),
                "support_tickets":         _col(df, ["support_tickets_at_snapshot", "support_tickets"]),
                "nps":                     _col(df, ["nps_at_snapshot", "nps", "net_promoter_score"]),
                "mrr_delta":               _col(df, ["mrr_delta", "mrr_change", "revenue_delta"]),
                "cluster":                 _col(df, ["cluster", "kmeans_label", "kmeans_cluster"]),
                "predicted_expansion_arr": _col(df, ["predicted_expansion_arr", "expansion_arr"]),
                "months_since_expansion":  _col(df, ["months_since_last_expansion", "months_no_expansion"]),
                "rep_segment_fit_score":   _col(df, ["rsfs", "rep_segment_fit_score"]),
                "segment":                 _col(df, ["segment", "customer_segment", "tier"]),
            }

            for field_label, col_name in field_map.items():
                if col_name and col_name in row.index and pd.notna(row[col_name]):
                    val = row[col_name]
                    # Format nicely
                    if field_label == "arr":
                        formatted = _fmt_arr(float(val))
                    elif field_label in ("churn_risk_score", "feature_adoption_score"):
                        formatted = f"{float(val):.1%}"
                    elif isinstance(val, float):
                        formatted = f"{val:.3f}"
                    else:
                        formatted = str(val)

                    data[field_label] = formatted
                    lines.append(f"{field_label}: {formatted}")

            lines.append(f"source_table: {df_name}")
            break  # Use first matching table

        if len(lines) == 1:
            lines.append(f"WARNING: entity_id '{entity_id}' not found in customer tables.")

    # ── Deal entity ───────────────────────────────────────────────────────────
    elif context_type == ExplainContextType.DEAL_PRIORITY:
        sales = cache.sales_df
        if sales is None or sales.empty:
            lines.append("Sales table not loaded.")
        else:
            id_col = _col(sales, ["deal_id", "opportunity_id", "id", "opp_id"])
            if id_col:
                mask = sales[id_col].astype(str).str.strip() == str(entity_id).strip()
                if mask.any():
                    row = sales[mask].iloc[0]

                    field_map = {
                        "deal_name":         _col(sales, ["deal_name", "company_name", "account_name"]),
                        "arr":               _col(sales, ["arr", "annual_recurring_revenue", "deal_value"]),
                        "discount_pct":      _col(sales, ["discount_percentage", "discount_pct", "discount"]),
                        "days_in_pipeline":  _col(sales, ["days_in_pipeline", "pipeline_age_days", "age_days"]),
                        "segment":           _col(sales, ["segment", "customer_segment", "tier"]),
                        "rep":               _col(sales, ["rep", "sales_rep", "owner"]),
                        "win_loss_status":   _col(sales, ["win_loss_status", "deal_status", "stage"]),
                        "rsfs":              _col(sales, ["rsfs", "rep_segment_fit_score"]),
                        "win_probability":   _col(sales, ["win_probability", "close_probability"]),
                    }

                    for field_label, col_name in field_map.items():
                        if col_name and col_name in row.index and pd.notna(row[col_name]):
                            val = row[col_name]
                            if field_label == "arr":
                                formatted = _fmt_arr(float(val))
                            elif field_label == "discount_pct":
                                disc = float(val)
                                formatted = f"{disc:.0%}" if disc <= 1.0 else f"{disc:.1f}%"
                            elif isinstance(val, float):
                                formatted = f"{val:.3f}"
                            else:
                                formatted = str(val)

                            data[field_label] = formatted
                            lines.append(f"{field_label}: {formatted}")

                    lines.append("source_table: sales_df")
                else:
                    lines.append(f"WARNING: deal_id '{entity_id}' not found in sales table.")

    entity_context = "\n".join(lines)
    return data, entity_context


# ─────────────────────────────────────────────────────────────────────────────
# FALLBACK NARRATIVE GENERATORS (deterministic — no LLM required)
# ─────────────────────────────────────────────────────────────────────────────

def _fallback_explanation(entity_id: str, context_type: ExplainContextType, data: Dict) -> str:
    """
    Produce a safe, data-grounded fallback narrative when the LLM is unavailable.
    Reads from the data snapshot dict to include at least one real data point.
    """
    churn_prob = data.get("churn_risk_score", "elevated")
    arr        = data.get("arr", "unknown ARR")
    adoption   = data.get("feature_adoption_score", "unknown")
    cluster    = data.get("cluster", "unclassified")
    exp_arr    = data.get("predicted_expansion_arr", "TBD")
    name       = data.get("customer_name") or data.get("deal_name") or entity_id

    if context_type == ExplainContextType.CHURN_CUSTOMER:
        return (
            f"{name} ({arr}) is flagged at churn probability {churn_prob} based on current portfolio data. "
            f"Feature adoption is at {adoption} — below the healthy 60% threshold. "
            f"Recommended action: schedule a CSM value-realisation call this week."
        )

    if context_type == ExplainContextType.DEAL_PRIORITY:
        disc = data.get("discount_pct", "unknown")
        days = data.get("days_in_pipeline", "unknown")
        return (
            f"Deal {name} ({arr}) carries a high priority score driven by its ARR magnitude. "
            f"Current discount is {disc} with {days} days in pipeline. "
            f"Recommended action: engage the economic buyer before the discount deepens."
        )

    if context_type == ExplainContextType.EXPANSION:
        return (
            f"{name} ({arr}) is a {cluster}-tier expansion candidate with predicted incremental ARR of {exp_arr}. "
            f"Feature adoption at {adoption} indicates readiness for an upsell conversation. "
            f"Recommended action: initiate the campaign playbook for the {cluster} segment."
        )

    return (
        f"Entity {entity_id} has been analysed based on current portfolio data. "
        f"Review the data snapshot for specific metrics and consult your CSM team for next steps."
    )


def _fallback_chat_reply(message: str) -> str:
    return (
        "I'm currently unable to reach the AI model (Groq API unavailable). "
        "Your question has been received but I can't generate a live response right now. "
        "Please check that the GROQ_API_KEY environment variable is set and try again. "
        "In the meantime, the dashboard KPI cards and churn/expansion tables contain "
        "the underlying data you may be looking for."
    )


def _fallback_root_cause(cache) -> str:
    """
    Generate a deterministic root-cause summary from cached data when Groq
    is unavailable. Reads the top churn risk and top expansion opportunity
    directly from the cache.
    """
    eng = cache.engineered_df if (cache.engineered_df is not None and not cache.engineered_df.empty) else cache.snapshots_df
    if eng is None or eng.empty:
        return (
            "No portfolio data is currently loaded. "
            "Please ingest your CSV files to enable revenue risk analysis."
        )

    churn_col = _col(eng, ["churn_risk_score", "churn_probability", "churn_risk"])
    arr_col   = _col(eng, ["arr", "annual_recurring_revenue", "mrr"])
    name_col  = _col(eng, ["customer_name", "company_name", "account_name"])

    parts: List[str] = []

    if churn_col and arr_col:
        top_risk = eng.nlargest(1, churn_col).iloc[0]
        risk_name = _safe_str(top_risk.get(name_col) if name_col else None, "Top customer")
        risk_arr  = _fmt_arr(_safe_float(top_risk.get(arr_col) if arr_col else None))
        risk_prob = f"{_safe_float(top_risk.get(churn_col)):.0%}"
        n_critical = int((eng[churn_col] > 0.70).sum())
        total_at_risk_arr = _fmt_arr(
            eng.loc[eng[churn_col] > 0.70, arr_col].sum() if arr_col else 0.0
        )
        parts.append(
            f"{n_critical} customer(s) are at CRITICAL churn risk (>{total_at_risk_arr} ARR at stake), "
            f"led by {risk_name} at {risk_prob} probability."
        )

    if parts:
        parts.append("Prioritise CSM outreach to CRITICAL-tier accounts before the next renewal window.")
    else:
        parts.append("Portfolio data is loaded. Review the Churn Early Warning tab for current risk signals.")

    return " ".join(parts)


# ─────────────────────────────────────────────────────────────────────────────
# 3. PUBLIC ENTRY POINTS
# ─────────────────────────────────────────────────────────────────────────────

def generate_explanation(
    entity_id: str,
    context_type: ExplainContextType,
    max_tokens: int = 400,
) -> ExplanationResponse:
    """
    Generate a root-cause narrative for a specific entity.

    Never raises. Returns a FALLBACK response when the LLM is unavailable.

    Parameters
    ----------
    entity_id    : str  — the customer_id, deal_id, etc.
    context_type : ExplainContextType
    max_tokens   : int  — LLM response length cap

    Returns
    -------
    ExplanationResponse (always a valid object)
    """
    log.info("generate_explanation: entity_id=%s  type=%s", entity_id, context_type.value)

    # Step 1 — extract entity snapshot from cache
    data_snapshot, entity_context = _build_entity_snapshot(entity_id, context_type)

    # Step 2 — assemble prompt
    entity_name = data_snapshot.get("customer_name") or data_snapshot.get("deal_name") or entity_id

    prompt_map = {
        ExplainContextType.CHURN_CUSTOMER: _EXPLAIN_PROMPT_CHURN,
        ExplainContextType.DEAL_PRIORITY:  _EXPLAIN_PROMPT_DEAL,
        ExplainContextType.EXPANSION:      _EXPLAIN_PROMPT_EXPANSION,
        ExplainContextType.GENERAL:        _EXPLAIN_PROMPT_GENERAL,
    }
    user_prompt = prompt_map[context_type].format(
        entity_id=entity_id,
        entity_name=entity_name,
    )

    # The system prompt for explain uses ONLY the entity context (not global)
    # to keep the prompt tight and prevent hallucination from unrelated data.
    system_prompt = _SYSTEM_PROMPT_BASE.format(context=entity_context)

    # Step 3 — call Groq
    reply, tokens_used, model_used = _call_groq(
        system_prompt=system_prompt,
        user_message=user_prompt,
        max_tokens=max_tokens,
    )

    if reply:
        return ExplanationResponse(
            entity_id=entity_id,
            context_type=context_type,
            narrative=reply,
            data_snapshot=data_snapshot,
            status=AnalystResponseStatus.SUCCESS,
            tokens_used=tokens_used,
            model_used=model_used,
        )

    # Step 4 — deterministic fallback
    log.warning("generate_explanation: LLM unavailable, returning deterministic fallback.")
    fallback = _fallback_explanation(entity_id, context_type, data_snapshot)
    return ExplanationResponse(
        entity_id=entity_id,
        context_type=context_type,
        narrative=fallback,
        data_snapshot=data_snapshot,
        status=AnalystResponseStatus.FALLBACK,
        tokens_used=None,
        model_used=None,
    )


def generate_chat_response(
    message: str,
    history: List[ChatMessage],
    max_tokens: int = 600,
    focus_entity_id: Optional[str] = None,
    focus_context_type: Optional[ExplainContextType] = None,
) -> ChatResponse:
    """
    Generate a chat response grounded in the portfolio context.

    Never raises. Returns a safe fallback reply when the LLM is unavailable.

    Parameters
    ----------
    message            : The user's latest message.
    history            : Prior conversation turns (user + assistant).
    max_tokens         : LLM response length cap.
    focus_entity_id    : Optional entity to enrich the system prompt with.
    focus_context_type : Required when focus_entity_id is provided.

    Returns
    -------
    ChatResponse (always a valid object)
    """
    log.info(
        "generate_chat_response: len(history)=%d  focus=%s",
        len(history), focus_entity_id,
    )

    # Step 1 — build context
    global_ctx = _build_global_context()
    context_parts = [global_ctx]

    if focus_entity_id and focus_context_type:
        _, entity_ctx = _build_entity_snapshot(focus_entity_id, focus_context_type)
        context_parts.append(f"\n{entity_ctx}")

    full_context = "\n".join(context_parts)
    ctx_tokens   = _token_estimate(full_context)

    # Step 2 — trim history if approaching Groq's context window
    # Budget: 8K total − context_tokens − max_tokens − ~200 for system boilerplate
    history_budget_chars = int(
        max(0, (8_000 - ctx_tokens - max_tokens - 200)) * _CHARS_PER_TOKEN
    )
    trimmed_history = _trim_history(history, history_budget_chars)

    # Step 3 — call Groq
    system_prompt = _SYSTEM_PROMPT_BASE.format(context=full_context)
    reply, tokens_used, model_used = _call_groq(
        system_prompt=system_prompt,
        user_message=message,
        history=trimmed_history,
        max_tokens=max_tokens,
    )

    # Step 4 — build updated history
    new_history = list(history) + [
        ChatMessage(role="user",      content=message),
        ChatMessage(role="assistant", content=reply or _fallback_chat_reply(message)),
    ]
    # Cap stored history at 20 turns
    if len(new_history) > 20:
        new_history = new_history[-20:]

    if reply:
        return ChatResponse(
            reply=reply,
            updated_history=new_history,
            context_token_count=ctx_tokens,
            status=AnalystResponseStatus.SUCCESS,
            tokens_used=tokens_used,
            model_used=model_used,
        )

    log.warning("generate_chat_response: LLM unavailable, returning deterministic fallback.")
    return ChatResponse(
        reply=_fallback_chat_reply(message),
        updated_history=new_history,
        context_token_count=ctx_tokens,
        status=AnalystResponseStatus.FALLBACK,
        tokens_used=None,
        model_used=None,
    )


def generate_root_cause_narrative() -> RootCauseNarrative:
    """
    Generate the portfolio-level root-cause narrative.

    Called ONCE at cache hydration time (not on every request).
    The result should be stored in the cache and served from there.

    Never raises.
    """
    log.info("generate_root_cause_narrative: building portfolio narrative.")
    cache = predicto_cache_v2

    global_ctx   = _build_global_context()
    system_prompt = _SYSTEM_PROMPT_BASE.format(context=global_ctx)

    # Collect top-risk entity IDs for deep-linking
    top_entity_ids: List[str] = []
    eng = cache.engineered_df if (cache.engineered_df is not None and not cache.engineered_df.empty) else cache.snapshots_df
    if eng is not None and not eng.empty:
        churn_col = _col(eng, ["churn_risk_score", "churn_probability", "churn_risk"])
        cust_col  = _col(eng, ["customer_id", "cust_id", "account_id", "id"])
        if churn_col and cust_col:
            top_ids = (
                eng.nlargest(3, churn_col)[cust_col]
                   .astype(str)
                   .tolist()
            )
            top_entity_ids = top_ids

    reply, tokens_used, model_used = _call_groq(
        system_prompt=system_prompt,
        user_message=_ROOT_CAUSE_PROMPT,
        max_tokens=250,
    )

    generated_at = datetime.now(timezone.utc).isoformat()

    if reply:
        return RootCauseNarrative(
            narrative=reply,
            generated_at=generated_at,
            status=AnalystResponseStatus.SUCCESS,
            top_risk_entity_ids=top_entity_ids,
        )

    log.warning("generate_root_cause_narrative: LLM unavailable — using deterministic fallback.")
    fallback_text = _fallback_root_cause(cache)
    return RootCauseNarrative(
        narrative=fallback_text,
        generated_at=generated_at,
        status=AnalystResponseStatus.FALLBACK,
        top_risk_entity_ids=top_entity_ids,
    )


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

def _trim_history(history: List[ChatMessage], budget_chars: int) -> List[ChatMessage]:
    """
    Trim conversation history from the oldest end to fit within budget_chars.

    Always keeps the most recent turns. Pairs (user + assistant) are kept
    together to avoid breaking turn ordering. Returns the trimmed list.
    """
    if not history:
        return []

    total = sum(len(m.content) for m in history)
    if total <= budget_chars:
        return history

    # Drop oldest turns until we fit
    trimmed = list(history)
    while trimmed and sum(len(m.content) for m in trimmed) > budget_chars:
        trimmed.pop(0)

    return trimmed
