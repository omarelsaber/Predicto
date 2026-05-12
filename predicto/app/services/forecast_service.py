"""
app/services/forecast_service.py
─────────────────────────────────────────────────────────────────────────────
Thin wiring layer between predicto_cache (ForecastModels + monthly_df) and
the context_builder / routers (list[ForecastInput]).

No ML logic lives here — that belongs to app/ml/forecasting.py.
"""

from __future__ import annotations

import logging
from typing import List

from app.core.cache import predicto_cache
from app.ml.forecasting import get_forecast, ForecastResult, SegmentForecast
from app.ml.context_builder import ForecastInput

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _trend_direction(pct_change: float) -> str:
    """Map a percentage-change float to a human-readable trend label."""
    if pct_change >= 0.05:
        return "up"
    if pct_change <= -0.05:
        return "down"
    return "flat"


def _map_result_to_input(
    segment_forecast: SegmentForecast,
    segment: str,
    current_revenue: float
) -> ForecastInput:
    """
    Convert a SegmentForecast (ML layer) to a ForecastInput (context-builder layer).

    pct_change is computed as:
        (next_period_revenue - current_revenue) / current_revenue
    where current_revenue is the last known value in the historical data.
    Falls back to 0.0 if actuals are empty or current revenue is zero.
    """
    next_revenue = float(segment_forecast.yhat[0]) if segment_forecast.yhat else 0.0

    if current_revenue > 0:
        pct_change = (next_revenue - current_revenue) / current_revenue
    else:
        pct_change = 0.0

    return ForecastInput(
        segment=segment,
        periods_ahead=len(segment_forecast.yhat),
        yhat_next=round(next_revenue, 2),
        yhat_lower_next=round(float(segment_forecast.yhat_lower[0]), 2) if segment_forecast.yhat_lower else 0.0,
        yhat_upper_next=round(float(segment_forecast.yhat_upper[0]), 2) if segment_forecast.yhat_upper else 0.0,
        yhat_current=round(current_revenue, 2),
        r2_validation=round(float(segment_forecast.r2_validation), 4),
        trend_direction=_trend_direction(pct_change),
        pct_change=round(pct_change, 4),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def get_forecast_inputs(periods: int = 3) -> List[ForecastInput]:
    """
    Retrieve forecast models and monthly data from cache, run `get_forecast()`
    for every known segment, and return a list of ForecastInput objects ready
    for context_builder consumption or direct router serialisation.

    Parameters
    ----------
    periods : int
        Number of future periods to forecast (default: 3, per config).

    Returns
    -------
    list[ForecastInput]
        One entry per segment found in the monthly DataFrame.

    Raises
    ------
    RuntimeError
        If models or data are not yet loaded into cache (startup hasn't
        completed or failed silently).
    """
    forecast_models = predicto_cache.get_forecast_models()
    monthly_df = predicto_cache.get_monthly_data()

    if forecast_models is None or forecast_models.is_empty():
        raise RuntimeError(
            "Forecast models are not loaded. "
            "Ensure lifespan startup completed successfully."
        )
    if monthly_df is None or monthly_df.empty:
        raise RuntimeError(
            "Monthly DataFrame is not loaded. "
            "Ensure ingestion completed successfully."
        )

    segments: List[str] = monthly_df["Segment"].unique().tolist()
    logger.info(
        "Building forecast inputs for %d segment(s): %s",
        len(segments),
        segments,
    )

    results: List[ForecastInput] = []
    for seg in segments:
        try:
            fc_result: ForecastResult = get_forecast(
                models=forecast_models,
                periods=periods,
                segment=seg,
            )
            
            # Extract historical current revenue for the segment
            seg_df = monthly_df[monthly_df["Segment"] == seg]
            curr_rev = float(seg_df["Sales"].iloc[-1]) if not seg_df.empty else 0.0
            
            if seg in fc_result.per_segment:
                seg_fc = fc_result.per_segment[seg]
                results.append(_map_result_to_input(seg_fc, seg, curr_rev))
                logger.debug("Forecast mapped — segment=%s  trend=%s", seg, results[-1].trend_direction)
            else:
                logger.warning("Forecast result missing segment '%s'", seg)
                
        except Exception as exc:  # noqa: BLE001
            logger.warning("Forecast failed for segment '%s': %s", seg, exc)

    if not results:
        raise RuntimeError("Forecast produced no results across all segments.")

    return results