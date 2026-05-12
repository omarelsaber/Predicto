"""
app/services/deal_service.py
─────────────────────────────────────────────────────────────────────────────
Thin wiring layer between predicto_cache (MarginModels + raw_df) and the
context_builder / routers (MarginInput).

Responsibilities:
  1. Pull raw_df + MarginModels from cache.
  2. Filter raw_df for historically at-risk deals to prevent scoring all rows.
  3. Score the sample via score_deals() -> list[DealScore].
  4. Aggregate avg_margin_by_segment from the full raw_df.
  5. Return a fully-populated MarginInput for context_builder / routers.
"""

from __future__ import annotations

import logging
from typing import Dict, List
import pandas as pd

from app.core.cache import predicto_cache
from app.ml.margin_engine import score_deals, DealScore, DealInput
from app.ml.context_builder import MarginInput, DealRisk

logger = logging.getLogger(__name__)

# Default threshold below which a deal is flagged as "at risk"
_DEFAULT_AT_RISK_THRESHOLD: float = 0.05


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_avg_margin_by_segment(raw_df: pd.DataFrame) -> Dict[str, float]:
    """
    Compute the mean predicted margin rate grouped by Segment.
    Returns a dict of { segment_name: mean_margin_rate }.
    """
    return raw_df.groupby("Segment")["Margin_Rate"].mean().round(4).to_dict()


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def get_margin_input(
    at_risk_threshold: float = _DEFAULT_AT_RISK_THRESHOLD,
) -> MarginInput:
    """
    Score a sample of at-risk deals and build a MarginInput object for
    the context_builder / API layer.

    Parameters
    ----------
    at_risk_threshold : float
        Deals with a predicted margin rate below this value are included in
        the at_risk_deals list. Default: 0.05 (5 %).

    Returns
    -------
    MarginInput
        Fully populated margin context ready for synthesis or direct response.

    Raises
    ------
    RuntimeError
        If margin models or raw data are absent from the cache.
    """
    margin_models = predicto_cache.get_margin_models()
    raw_df = predicto_cache.get_raw_data()

    if margin_models is None or margin_models.is_empty():
        raise RuntimeError(
            "Margin models are not loaded. "
            "Ensure lifespan startup completed successfully."
        )
    if raw_df is None or raw_df.empty:
        raise RuntimeError(
            "Raw DataFrame is not loaded. "
            "Ensure ingestion completed successfully."
        )

    # ── Aggregate averages from historical data ───────────────────────────────
    avg_margin_by_segment = _build_avg_margin_by_segment(raw_df)

    # ── Filter at-risk deals directly from raw_df ─────────────────────────────
    # We filter historical deals that were low margin to pass to the LLM
    at_risk_df = raw_df[raw_df["Margin_Rate"] < at_risk_threshold].copy()
    
    # Sort by Sales to surface the largest financial risks and take top 50 
    # to avoid slow Python loops when scoring
    at_risk_df = at_risk_df.sort_values(by="Sales", ascending=False).head(50)

    logger.info("Scoring top %d at-risk deals for margin recommendation analysis…", len(at_risk_df))
    
    deal_inputs: List[DealInput] = []
    for _, row in at_risk_df.iterrows():
        deal_inputs.append(
            DealInput(
                quantity=int(row["Quantity"]),
                discount=float(row["Discount"]),
                segment=str(row["Segment"]),
                industry=str(row.get("Industry", "Unknown")),
                region=str(row["Region"]),
                product=str(row.get("Product", "Unknown")),
                revenue_per_unit=float(row["Sales"]) / float(row["Quantity"]) if float(row["Quantity"]) > 0 else 0.0,
            )
        )
        
    all_scores: List[DealScore] = score_deals(margin_models, deal_inputs)

    at_risk_deals: List[DealRisk] = []
    for row_tuple, score in zip(at_risk_df.itertuples(), all_scores):
        row = row_tuple._asdict()
        at_risk_deals.append(
            DealRisk(
                deal_id=str(row.get("Order ID", "Unknown")),
                segment=str(row["Segment"]),
                region=str(row["Region"]),
                predicted_margin=round(score.predicted_margin_rate, 4),
                discount=round(float(row["Discount"]), 4),
                recommendation=score.recommendation,
            )
        )

    return MarginInput(
        discount_ceiling_matrix=margin_models.ceiling_matrix.matrix,
        at_risk_deals=at_risk_deals,
        model_r2=round(float(margin_models.model_r2), 4),
        avg_margin_by_segment=avg_margin_by_segment,
    )