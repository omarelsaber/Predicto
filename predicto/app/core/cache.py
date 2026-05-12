"""
app/core/cache.py
Predicto — Global In-Memory Cache.
Stores processed DataFrames and trained ML models to avoid redundant computations.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Optional

if TYPE_CHECKING:
    # Imported only by the type checker — never executed at runtime.
    # This breaks the core → ml → core circular import.
    from app.ml.forecasting import ForecastModels
    from app.ml.margin_engine import MarginModels
    from app.ml.segmentation import SegmentationResult
import pandas as pd


class PredictoCache:
    """
    In-memory storage for the application's state.
    This includes the raw and processed DataFrames and the trained ML models.
    """

    def __init__(self):
        # Metadata
        self.current_file_hash: Optional[str] = None
        self.is_trained: bool = False

        # DataFrames
        self.raw_df: Optional[pd.DataFrame] = None
        self.monthly_df: Optional[pd.DataFrame] = None

        # ML Models
        self.models: Dict[str, Any] = {
            "prophet": {},      # Dictionary for hierarchical segment models
            "margin_engine": None,  # XGBoost model
            "segmentation": None    # K-Means model
        }

        # Shared Encoders & Scalers
        self.artifacts: Dict[str, Any] = {}

    def set_data(self, raw_df: pd.DataFrame, monthly_df: pd.DataFrame, file_hash: str):
        """Stores the primary dataframes and updates the hash."""
        self.raw_df = raw_df
        self.monthly_df = monthly_df
        self.current_file_hash = file_hash

    def get_raw_data(self) -> Optional[pd.DataFrame]:
        """Retrieves the raw transaction DataFrame."""
        return self.raw_df

    def get_monthly_data(self) -> Optional[pd.DataFrame]:
        """
        Retrieves the monthly aggregated DataFrame from the cache.
        Used primarily by Pillar 1 (Forecasting).
        """
        return self.monthly_df

    def has_transaction_data(self) -> bool:
        """True when raw transaction rows are loaded (post-ingestion)."""
        df = self.raw_df
        return df is not None and not df.empty

    # ── Model storage (typed Any at runtime; typed precisely for checker) ──

    def set_models(
        self,
        forecast: "ForecastModels",
        margin: "MarginModels",
        segmentation: "SegmentationResult",
    ) -> None:
        """Store all three trained model containers atomically."""
        self._forecast_models: Any = forecast
        self._margin_models: Any = margin
        self._segmentation_result: Any = segmentation

    def get_forecast_models(self) -> "ForecastModels":
        """
        Returns the trained ForecastModels container.
        Raises RuntimeError if called before lifespan training completes.
        """
        try:
            return self._forecast_models
        except AttributeError:
            raise RuntimeError(
                "ForecastModels not yet trained. "
                "Ensure lifespan startup completed successfully."
            )

    def get_margin_models(self) -> "MarginModels":
        """
        Returns the trained MarginModels container.
        Raises RuntimeError if called before lifespan training completes.
        """
        try:
            return self._margin_models
        except AttributeError:
            raise RuntimeError(
                "MarginModels not yet trained. "
                "Ensure lifespan startup completed successfully."
            )

    def get_segmentation_result(self) -> "SegmentationResult":
        """
        Returns the trained SegmentationResult container.
        Raises RuntimeError if called before lifespan training completes.
        """
        try:
            return self._segmentation_result
        except AttributeError:
            raise RuntimeError(
                "SegmentationResult not yet trained. "
                "Ensure lifespan startup completed successfully."
            )

    def models_ready(self) -> bool:
        """
        Lightweight liveness check — used by the /health endpoint to
        distinguish 'booting' from 'ready' without raising.
        """
        return all(
            hasattr(self, attr)
            for attr in (
                "_forecast_models",
                "_margin_models",
                "_segmentation_result",
            )
        )

    def set_model(self, model_key: str, model_instance: Any, sub_key: Optional[str] = None):
        """
        Stores a trained model instance. 
        Use sub_key for hierarchical models (e.g., specific Prophet segments).
        """
        if sub_key:
            self.models[model_key][sub_key] = model_instance
        else:
            self.models[model_key] = model_instance

    def get_model(self, model_key: str, sub_key: Optional[str] = None) -> Any:
        """Retrieves a specific model instance from the cache."""
        if sub_key:
            return self.models.get(model_key, {}).get(sub_key)
        return self.models.get(model_key)

    def clear(self):
        """Full cache reset for new ingestion sessions."""
        self.raw_df = None
        self.monthly_df = None
        self.models = {"prophet": {}, "margin_engine": None, "segmentation": None}
        self.artifacts = {}
        self.is_trained = False
        self.current_file_hash = None
        # Clear private model attributes so models_ready() returns False
        for attr in ("_forecast_models", "_margin_models", "_segmentation_result"):
            if hasattr(self, attr):
                delattr(self, attr)


# Global Singleton Instance
# Import this instance in other services: from app.core.cache import predicto_cache
predicto_cache = PredictoCache()

# Alias used in docs / parity with ``data_cache`` naming
data_cache = predicto_cache
