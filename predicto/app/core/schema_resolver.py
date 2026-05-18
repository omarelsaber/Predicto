import os
import logging
import json
import difflib
from typing import Dict, List, Optional
import pandas as pd

log = logging.getLogger("predicto.v2.schema_resolver")

CANONICAL_KEYS = [
    "FAV", "SBS", "EDI", "RER", "ORC", "CQS", "RSFS", 
    "mrr", "arr", "churn_probability", "health_score", "product_adoption_score",
    "customer_id", "customer_name", "segment", "sales_rep", "rep_id", "rep_name", 
    "discount_pct", "days_in_pipeline", "cluster_label"
]

def resolve_canonical_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    بتاخد أي DataFrame من اليوزر وتعمل خريطة محاذاة ذكية للأعمدة 
    عشان ترجع بـ DataFrame الخوارزميات تفهمه فوراً.
    """
    if df is None or df.empty:
        return df
        
    df_clean = df.copy()
    raw_columns = list(df_clean.columns)
    mapping: Dict[str, str] = {}
    
    PASSTHROUGH_COLUMNS = [
        # Product table columns
        "features_adopted_count", "time_to_first_value_days", "subscription_tier", "nps_score",
        "churn_risk_score", "support_tickets_opened", "active_users", "top_feature_used",
        "usage_frequency", "product_log_id",
        # Marketing table columns
        "mqls_generated", "sqls_generated", "cac", "actual_spend", "allocated_budget",
        "target_segment", "campaign_name", "campaign_id", "primary_campaign_id",
        "impressions", "clicks", "start_date", "end_date", "channel",
        # Sales table columns
        "close_date", "contract_term_months", "expansion_arr", "deal_size_tcv",
        "executive_sponsor_attached", "dedicated_csm_assigned", "deal_source", "deal_id",
        "contract_start_date", "sales_cycle_days", "win_loss_status", "discount_percentage",
        # Snapshot / telemetry columns
        "month_number", "snapshot_id", "snapshot_date", "created_at", "updated_at",
        "support_tickets_at_snapshot", "features_active_at_snapshot", "active_users_at_snapshot",
        "nps_at_snapshot", "churn_risk_at_snapshot", "mrr_at_snapshot",
        # Attribution columns
        "attribution_id", "attribution_model", "touchpoint_date", "touchpoint_order",
        # Core entity columns
        "customer_id", "arr", "mrr", "segment", "csm_owner_id", "sales_rep",
        # V1 compatibility columns
        "sales", "quantity", "region", "industry", "product", "margin_rate", "profit",
    ]
    
    # 1️⃣ المرحلة الأولى: التطابق السريع والـ Fuzzy Matching
    for raw_col in raw_columns:
        col_lower = str(raw_col).strip().lower()
        
        # Hardcoded short-circuit check
        is_passthrough = False
        for p_col in PASSTHROUGH_COLUMNS:
            if col_lower == p_col or p_col in col_lower:
                mapping[raw_col] = raw_col
                is_passthrough = True
                break
                
        if not is_passthrough:
            close_p = difflib.get_close_matches(col_lower, PASSTHROUGH_COLUMNS, n=1, cutoff=0.8)
            if close_p:
                mapping[raw_col] = raw_col
                is_passthrough = True
                
        if is_passthrough:
            continue
            
        normalized = col_lower.replace("_score", "").replace("_pct", "").replace("_", "")
        
        # تشيك مباشر
        matched = False
        for canonical in CANONICAL_KEYS:
            canon_norm = canonical.lower().replace("_", "")
            if normalized == canon_norm:
                mapping[raw_col] = canonical
                matched = True
                break
        
        if matched:
            continue

        # لو منجحتش، جرب الـ Close Matches الذكي
        matches = difflib.get_close_matches(col_lower, [k.lower() for k in CANONICAL_KEYS], n=1, cutoff=0.7)
        if matches:
            # ارجع للاسم الأصلي بـ الحروف الكبيرة بتاعها
            best_match = next(k for k in CANONICAL_KEYS if k.lower() == matches[0])
            mapping[raw_col] = best_match

    # 2️⃣ المرحلة الثانية: استدعاء جروك (Groq LLM) للأعمدة المستعصية سيمانتك
    unresolved = [c for c in raw_columns if c not in mapping]
    if unresolved:
        try:
            from groq import Groq
            api_key = os.environ.get("GROQ_API_KEY")
            if api_key:
                client = Groq(api_key=api_key)
                target_keys = [k for k in CANONICAL_KEYS if k not in mapping.values()]
                
                if not target_keys:
                    log.debug("All canonical keys already mapped via fuzzy logic.")
                else:
                    prompt = (
                        f"You are a data engineering schema mapper.\n"
                        f"We need to map these raw user columns: {unresolved}\n"
                        f"To our core missing canonical columns: {target_keys}\n\n"
                        f"Return ONLY a clean, valid JSON object mapping raw_column to canonical_column. "
                        f"If a column cannot be mapped, do not include it. No conversational text, no markdown code blocks."
                    )
                    response = client.chat.completions.create(
                        model="llama-3.3-70b-versatile",
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=200,
                        temperature=0.1,
                        timeout=3
                    )
                    llm_text = response.choices[0].message.content.strip()
                    # تنظيف الكود لو الـ LLM حط مارك داون
                    if "{" in llm_text and "}" in llm_text:
                        llm_text = llm_text[llm_text.find("{"):llm_text.rfind("}")+1]
                    llm_mapping = json.loads(llm_text)
                    
                    for k, v in llm_mapping.items():
                        if k in unresolved and v in CANONICAL_KEYS:
                            mapping[k] = v
                            log.info(f"[Groq Schema Match] Mapped raw '{k}' -> canonical '{v}'")
        except Exception as exc:
            log.warning(f"Groq schema resolver skipped or failed: {exc}")

    # إعادة تسمية الأعمدة في الجدول بناء على الخريطة الذكية
    if mapping:
        df_clean = df_clean.rename(columns=mapping)
        log.info(f"Schema Alignment Complete. Mapped columns: {mapping}")
        
    return df_clean
