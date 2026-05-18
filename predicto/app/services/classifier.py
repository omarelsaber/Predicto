"""
services/classifier.py
Predicto V2 — Column Fingerprinting Classifier

Replaces the fragile TABLE_KEYWORD_MAP / _classify_filename approach entirely.
Classifies uploaded CSVs by reading their headers and scoring them against
known column signatures for each of the 5 internal tables.

Usage:
    from services.classifier import classify_dataframe, ClassificationResult

    result = classify_dataframe(df, filename="salesforce_export_Q3_final.csv")
    if result.confidence >= 0.85 and not result.collision:
        # auto-assign
        table_type = result.table
    else:
        # send back to frontend for user disambiguation
        return result.to_dict()
"""

from __future__ import annotations

import re
import logging
import httpx
from dataclasses import dataclass, field
from typing import Optional
import pandas as pd

from app.core.config import get_settings

log = logging.getLogger("predicto.v2.services.classifier")


# ---------------------------------------------------------------------------
# Column signature registry
# Each table has:
#   - required: columns that MUST be present (any match scores heavily)
#   - strong:   highly diagnostic columns (present in ≤1 table)
#   - weak:     supporting columns (present in multiple tables, lower weight)
#
# Matching is case-insensitive and normalises common separators
# (spaces, hyphens, dots → underscores) before comparison.
# ---------------------------------------------------------------------------

COLUMN_SIGNATURES: dict[str, dict] = {
    "snapshots": {
        # customer_contract_snapshots — monthly health data per customer
        "required": [
            "customer_id",
            "snapshot_month",
        ],
        "strong": [
            "mrr",
            "active_users",
            "features_used",
            "support_tickets",
            "health_score",
            "contract_start",
            "contract_end",
            "nps_at_snapshot",
            "churn_risk_score",
            "support_tickets_at_snapshot",
        ],
        "weak": [
            "month",
            "date",
            "plan_type",
            "arr",
            "customer_name",
            "segment",
        ],
    },
    "product": {
        # product_table — product catalogue / SKU data
        "required": [
            "product_id",
        ],
        "strong": [
            "product_name",
            "sku",
            "category",
            "unit_price",
            "cogs",
            "gross_margin",
            "product_line",
            "is_active",
            "launch_date",
        ],
        "weak": [
            "price",
            "description",
            "revenue",
            "name",
        ],
    },
    "sales": {
        # sales_table — deal / opportunity data
        "required": [
            "deal_id",
        ],
        "strong": [
            "arr",
            "win_loss_status",
            "close_date",
            "sales_rep",
            "discount_percentage",
            "deal_stage",
            "opportunity_id",
            "account_executive",
            "days_to_close",
            "competitor",
        ],
        "weak": [
            "revenue",
            "customer_id",
            "region",
            "product_id",
            "amount",
            "value",
        ],
    },
    "marketing": {
        # marketing_table — campaign spend & performance
        "required": [
            "campaign_id",
        ],
        "strong": [
            "cac",
            "cpl",
            "spend",
            "impressions",
            "clicks",
            "conversion_rate",
            "channel",
            "roas",
            "pipeline_generated",
            "leads_generated",
            "mql",
            "sql",
            "campaign_type",
        ],
        "weak": [
            "date",
            "budget",
            "cost",
            "revenue",
            "campaign_name",
        ],
    },
    "attribution": {
        # campaign_deal_attribution — links campaigns to closed deals
        "required": [
            "attribution_id",
        ],
        "strong": [
            "deal_id",
            "campaign_id",
            "attribution_model",
            "attribution_weight",
            "first_touch",
            "last_touch",
            "multi_touch",
            "influenced_arr",
            "win_rate",
        ],
        "weak": [
            "customer_id",
            "channel",
            "date",
            "revenue",
        ],
    },
}

# Scoring weights
WEIGHT_REQUIRED = 3.0   # each required column match
WEIGHT_STRONG = 2.0     # each strong column match
WEIGHT_WEAK = 0.5       # each weak column match

# A match for a required column that is ABSENT penalises the score
PENALTY_MISSING_REQUIRED = -2.0

# Minimum score a table must reach to be considered a candidate at all
MIN_CANDIDATE_SCORE = 1.0

# Confidence threshold above which we auto-assign without asking the user
AUTO_ASSIGN_THRESHOLD = 0.85

# If the top two candidates are within this ratio of each other, it's a collision
COLLISION_MARGIN = 0.20


def _normalise_column(col: str) -> str:
    """Lowercase and replace separators with underscores."""
    col = col.strip().lower()
    col = re.sub(r"[\s\-\.]", "_", col)
    col = re.sub(r"_+", "_", col)
    return col


def _score_table(
    normalised_columns: set[str],
    table: str,
    sig: dict,
) -> float:
    """Return a raw score for how well a column set matches a table signature."""
    score = 0.0

    for col in sig.get("required", []):
        if col in normalised_columns:
            score += WEIGHT_REQUIRED
        else:
            score += PENALTY_MISSING_REQUIRED  # absence of required column hurts

    for col in sig.get("strong", []):
        if col in normalised_columns:
            score += WEIGHT_STRONG

    for col in sig.get("weak", []):
        if col in normalised_columns:
            score += WEIGHT_WEAK

    return score


@dataclass
class ClassificationResult:
    table: Optional[str]          # best-match table name, or None if no match
    confidence: float             # 0.0–1.0; proportion of max possible score
    collision: bool               # True if two tables score too similarly
    collision_candidates: list[str] = field(default_factory=list)
    all_scores: dict[str, float] = field(default_factory=dict)
    filename: str = ""
    columns_found: list[str] = field(default_factory=list)

    @property
    def needs_user_input(self) -> bool:
        return self.collision or self.confidence < AUTO_ASSIGN_THRESHOLD or self.table is None

    def to_dict(self) -> dict:
        return {
            "table": self.table,
            "confidence": round(self.confidence, 3),
            "collision": self.collision,
            "collision_candidates": self.collision_candidates,
            "all_scores": {k: round(v, 3) for k, v in self.all_scores.items()},
            "needs_user_input": self.needs_user_input,
            "filename": self.filename,
            "columns_found": self.columns_found,
        }


def classify_dataframe(
    df: pd.DataFrame,
    filename: str = "",
) -> ClassificationResult:
    """
    Classify a DataFrame to one of the 5 internal table types.

    Args:
        df:       The uploaded CSV loaded into a DataFrame (header only is fine).
        filename: Original filename — stored for reporting only, NOT used for classification.

    Returns:
        ClassificationResult with table, confidence, and collision flag.
    """
    raw_cols = list(df.columns)
    norm_cols = {_normalise_column(c) for c in raw_cols}

    raw_scores: dict[str, float] = {}
    for table, sig in COLUMN_SIGNATURES.items():
        raw_scores[table] = _score_table(norm_cols, table, sig)

    # Filter out tables that didn't reach minimum viability
    candidates = {t: s for t, s in raw_scores.items() if s >= MIN_CANDIDATE_SCORE}

    if not candidates:
        return ClassificationResult(
            table=None,
            confidence=0.0,
            collision=False,
            all_scores=raw_scores,
            filename=filename,
            columns_found=raw_cols,
        )

    # Normalise scores to 0–1 using the theoretical maximum for each table
    def max_score(sig: dict) -> float:
        return (
            len(sig.get("required", [])) * WEIGHT_REQUIRED
            + len(sig.get("strong", [])) * WEIGHT_STRONG
            + len(sig.get("weak", [])) * WEIGHT_WEAK
        )

    normalised: dict[str, float] = {}
    for table, score in candidates.items():
        sig = COLUMN_SIGNATURES[table]
        theoretical_max = max_score(sig)
        # Clamp between 0 and 1; a score can go negative due to missing-required penalty
        normalised[table] = max(0.0, min(1.0, score / theoretical_max))

    # Sort by normalised score descending
    ranked = sorted(normalised.items(), key=lambda x: x[1], reverse=True)
    best_table, best_score = ranked[0]

    # Check for collision: top two candidates too close to each other
    collision = False
    collision_candidates: list[str] = []
    if len(ranked) >= 2:
        second_table, second_score = ranked[1]
        if best_score > 0 and (best_score - second_score) / best_score <= COLLISION_MARGIN:
            collision = True
            collision_candidates = [best_table, second_table]

    return ClassificationResult(
        table=best_table,
        confidence=best_score,
        collision=collision,
        collision_candidates=collision_candidates,
        all_scores={t: normalised.get(t, 0.0) for t in COLUMN_SIGNATURES},
        filename=filename,
        columns_found=raw_cols,
    )


def classify_zip_contents(
    files: dict[str, pd.DataFrame],
) -> dict[str, ClassificationResult]:
    """
    Classify all CSVs extracted from a ZIP upload.

    Args:
        files: Dict of {filename: DataFrame} for each CSV in the ZIP.

    Returns:
        Dict of {filename: ClassificationResult}.

    Also detects slot collisions across files: if two files classify to the
    same table with high confidence, both are flagged for user disambiguation.
    """
    results: dict[str, ClassificationResult] = {}
    for fname, df in files.items():
        results[fname] = classify_dataframe(df, filename=fname)

    # Cross-file collision detection: same table claimed by two files
    table_claims: dict[str, list[str]] = {}
    for fname, result in results.items():
        if result.table and not result.collision:
            table_claims.setdefault(result.table, []).append(fname)

    for table, fnames in table_claims.items():
        if len(fnames) > 1:
            # Two files both confidently claim the same table slot — flag both
            for fname in fnames:
                results[fname].collision = True
                results[fname].collision_candidates = [table]

    return results


async def classify_with_llm(columns: list[str]) -> str:
    """
    Fallback LLM-based classification for when column fingerprinting is uncertain.
    Queries Groq to categorize the list of columns.
    """
    settings = get_settings()
    api_key = settings.groq_api_key
    if not api_key:
        log.warning("GROQ_API_KEY not set. Skipping LLM classification.")
        return "unknown"

    url = f"{settings.groq_base_url}/chat/completions"
    
    prompt = (
        "You are a data expert. Given these CSV column names, identify which of these 5 "
        "categories they belong to: snapshots, product, sales, marketing, attribution. "
        "Return ONLY the category name in lowercase."
    )
    
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"Columns: {', '.join(columns)}"}
        ],
        "temperature": 0.1,
        "max_tokens": 10,
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            result = data["choices"][0]["message"]["content"].strip().lower()
            
            valid_categories = {"snapshots", "product", "sales", "marketing", "attribution"}
            for cat in valid_categories:
                if cat in result:
                    return cat
            return "unknown"
    except Exception as e:
        log.error(f"LLM classification failed: {e}")
        return "unknown"