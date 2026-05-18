"""
app/services/playbook_service.py
Predicto V2 — Rep-Level Win-Rate Decomposition & Playbook Generator

Analyzes sales rep performance and generates LLM-based coaching playbooks.
"""

import logging
import pandas as pd
from typing import List, Optional
import httpx

from app.core.cache import predicto_cache_v2
from app.core.config import get_settings
from app.models.response_models import (
    RepPlaybookResponse,
    WinRateFactor,
    FeatureAvailability,
)

log = logging.getLogger("predicto.v2.playbook")

async def generate_rep_playbook(sales_rep: str) -> RepPlaybookResponse:
    """
    Analyze performance for a specific rep and generate an AI playbook.
    """
    df = predicto_cache_v2.sales_df
    
    if predicto_cache_v2.sales_df is None or predicto_cache_v2.sales_df.empty or "sales_rep" not in predicto_cache_v2.sales_df.columns:
        return RepPlaybookResponse(
            sales_rep=sales_rep,
            win_rate=0,
            avg_deal_size=0,
            avg_cycle_days=0,
            velocity_score=0,
            strength_factors=[],
            gap_factors=[],
            ai_playbook="No sales data available.",
            data_availability=FeatureAvailability.OFFLINE
        )

    rep_data = df[df["sales_rep"] == sales_rep]
    if rep_data.empty:
         return RepPlaybookResponse(
            sales_rep=sales_rep,
            win_rate=0,
            avg_deal_size=0,
            avg_cycle_days=0,
            velocity_score=0,
            strength_factors=[],
            gap_factors=[],
            ai_playbook=f"Rep '{sales_rep}' not found in data.",
            data_availability=FeatureAvailability.PARTIAL
        )

    # Basic stats
    total_deals = len(rep_data)
    won_deals = len(rep_data[rep_data["win_loss_status"].str.upper() == "WON"])
    win_rate = won_deals / total_deals if total_deals > 0 else 0
    avg_deal_size = rep_data["arr"].mean() if "arr" in rep_data else 0
    avg_cycle = rep_data["days_to_close"].mean() if "days_to_close" in rep_data else 30
    
    # Velocity: ARR / Days
    velocity = (won_deals * avg_deal_size) / (total_deals * avg_cycle) if total_deals > 0 and avg_cycle > 0 else 0

    # Factors
    strength_factors = []
    gap_factors = []
    
    if win_rate > df["win_rate"].mean() if "win_rate" in df else 0.3:
        strength_factors.append(WinRateFactor(factor="Win Rate", impact=0.8, description="Consistently closing deals above team average."))
    else:
        gap_factors.append(WinRateFactor(factor="Win Rate", impact=-0.6, description="Closing fewer deals than baseline performance."))

    if avg_deal_size > df["arr"].mean() if "arr" in df else 50000:
        strength_factors.append(WinRateFactor(factor="Deal Size", impact=0.7, description="Targeting high-value enterprise accounts."))
    
    # AI Playbook Generation
    settings = get_settings()
    ai_playbook = "Strategy: Focus on high-velocity segments and reduce cycle time by 15%."
    
    if settings.groq_api_key:
        try:
            prompt = f"""
            Analyze Sales Rep: {sales_rep}
            Win Rate: {win_rate:.1%}
            Avg Deal: ${avg_deal_size:,.0f}
            Cycle: {avg_cycle:.1f} days
            
            Generate a 3-sentence high-impact sales coaching playbook.
            """
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{settings.groq_base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                    json={
                        "model": settings.groq_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.2,
                        "max_tokens": 150
                    },
                    timeout=5.0
                )
                if resp.status_code == 200:
                    ai_playbook = resp.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            log.warning(f"AI Playbook generation failed: {e}")

    return RepPlaybookResponse(
        sales_rep=sales_rep,
        win_rate=win_rate,
        avg_deal_size=avg_deal_size,
        avg_cycle_days=avg_cycle,
        velocity_score=velocity,
        strength_factors=strength_factors,
        gap_factors=gap_factors,
        ai_playbook=ai_playbook,
        data_availability=FeatureAvailability.ACTIVE
    )
