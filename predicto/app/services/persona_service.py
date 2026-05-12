"""
app/services/persona_service.py
─────────────────────────────────────────────────────────────────────────────
Thin wiring layer between predicto_cache (SegmentationResult) and the
context_builder / routers (SegmentationInput).
"""

from __future__ import annotations

import logging
from typing import List

from app.core.cache import predicto_cache
from app.ml.context_builder import SegmentationInput, PersonaTrait

logger = logging.getLogger(__name__)


def _derive_persona_label(avg_deal_value: float, avg_discount: float, avg_margin: float) -> str:
    """
    5-tier heuristic based on avg_deal_value >= 5000 and avg_discount >= 20%
    and avg_margin >= 15% breakpoints.
    """
    if avg_deal_value >= 5000:
        if avg_margin >= 0.15:
            return "Champion"
        if avg_discount >= 0.20:
            return "Value Seeker"
        return "High Value"
    else:
        if avg_margin >= 0.15:
            return "Steady SMB"
        if avg_discount >= 0.20 and avg_margin < 0.15:
            return "At Risk"
        return "Standard"


def _derive_churn_risk(avg_discount: float, avg_margin: float) -> str:
    """
    3-tier (low / medium / high) based on discount pressure and margin floor.
    """
    if avg_margin < 0.10 or avg_discount >= 0.25:
        return "high"
    if avg_margin < 0.15 or avg_discount >= 0.15:
        return "medium"
    return "low"


def get_segmentation_input() -> SegmentationInput:
    """
    Maps SegmentationResult.stats to a list of PersonaTrait objects,
    and returns a fully-populated SegmentationInput.
    """
    seg_result = predicto_cache.get_segmentation_result()
    if seg_result is None or not seg_result.stats:
        raise RuntimeError(
            "Segmentation models are not loaded. "
            "Ensure lifespan startup completed successfully."
        )
        
    traits: List[PersonaTrait] = []
    for idx, stat in enumerate(seg_result.stats):
        adv = float(stat.avg_sales)
        adisc = float(stat.avg_discount)
        amarg = float(stat.avg_margin)
        
        segment = stat.name if stat.name else f"Cluster-{idx}"
        
        traits.append(PersonaTrait(
            segment=segment,
            persona_label=_derive_persona_label(adv, adisc, amarg),
            avg_deal_value=round(adv, 2),
            avg_discount=round(adisc, 4),
            avg_margin=round(amarg, 4),
            churn_risk=_derive_churn_risk(adisc, amarg),
            top_region="Global",
            cluster_size=stat.count
        ))
        
    return SegmentationInput(
        personas=traits,
        silhouette_score=round(seg_result.silhouette, 4),
        n_clusters=len(seg_result.stats)
    )
