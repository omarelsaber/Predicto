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


"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/core/cache.py                                                          ║
║  Predicto V2 — Global In-Memory Cache Singleton                             ║
║                                                                              ║
║  Stores all artefacts produced during data ingestion so that every          ║
║  downstream API endpoint can access pre-computed state without re-running   ║
║  the ML pipeline on every request.                                          ║
║                                                                              ║
║  Thread-safety: a threading.Lock protects every write; reads are           ║
║  intentionally lockless for performance (Python GIL guarantees atomicity    ║
║  of individual attribute access on CPython).                                ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""


import threading
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import pandas as pd

# Forward-reference only — avoids importing the heavy ML module at cache init
# time; the actual ColdStartRouter instance is stored as `object` and cast
# by callers who know the type.
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.ml.hybrid_engine import ColdStartRouter  # noqa: F401

log = logging.getLogger("predicto.v2.cache")


# ─────────────────────────────────────────────────────────────────────────────
# CACHE SCHEMA
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PredictoCacheV2:
    """
    Central in-memory store for all Predicto V2 runtime artefacts.

    Fields
    ------
    Raw DataFrames (5 tables)
        snapshots_df    : Monthly customer health snapshots
        product_df      : Product adoption + churn risk per customer
        sales_df        : CRM deal records
        marketing_df    : Campaign performance metrics
        attribution_df  : Campaign-to-deal attribution links

    Engineered artefacts
        engineered_df   : Output of engineer_revops_features() — the join of
                          all 5 tables with 7 RevOps KPIs computed.

    ML artefacts
        router          : Fitted ColdStartRouter instance (lite or full model).
                          Typed as Optional[object] to avoid a hard import here;
                          use cast(ColdStartRouter, cache.router) where needed.

    Diagnostics
        degradation_log : List of dicts appended by apply_schema_degradation().
                          Schema: {table, column, strategy, n_affected}
        health_score    : Integer 0-100.  100 = all 5 tables present and clean.
                          Decremented by the ingestion service per penalty rule.
        is_ready        : True once at least one successful ingestion completes.
        active_model    : "lite" | "full" | None — mirrors router.active_model
                          for quick health endpoint access without casting.
        ingestion_error : Last error message if ingestion failed; None otherwise.
    """

    # ── Raw tables ────────────────────────────────────────────────────────────
    snapshots_df:   Optional[pd.DataFrame] = None
    product_df:     Optional[pd.DataFrame] = None
    sales_df:       Optional[pd.DataFrame] = None
    marketing_df:   Optional[pd.DataFrame] = None
    attribution_df: Optional[pd.DataFrame] = None

    # ── Engineered feature matrix ─────────────────────────────────────────────
    engineered_df:  Optional[pd.DataFrame] = None

    # ── Trained ML router ─────────────────────────────────────────────────────
    router:         Optional[object]        = None   # ColdStartRouter at runtime

    # ── Diagnostics ───────────────────────────────────────────────────────────
    degradation_log:  list[dict]  = field(default_factory=list)
    health_score:     int         = 0
    is_ready:         bool        = False
    active_model:     Optional[str] = None           # "lite" | "full" | None
    ingestion_error:  Optional[str] = None
    root_cause_narrative: Any        = None  # Stores RootCauseNarrative object
    contagion_graph: Optional[object] = None

    # ── Internal write lock (not serialised; excluded from __repr__) ──────────
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    # ─────────────────────────────────────────────────────────────────────────
    # Public helpers
    # ─────────────────────────────────────────────────────────────────────────

    def reset(self) -> None:
        """
        Atomically wipe all cached artefacts back to their zero-state defaults.
        Called at the start of a new ingestion to prevent stale data from leaking
        into a partially-failed pipeline run.
        """
        with self._lock:
            self.snapshots_df    = None
            self.product_df      = None
            self.sales_df        = None
            self.marketing_df    = None
            self.attribution_df  = None
            self.engineered_df   = None
            self.router          = None
            self.degradation_log = []
            self.health_score    = 0
            self.is_ready        = False
            self.active_model    = None
            self.ingestion_error = None
            self.root_cause_narrative = None
            self.contagion_graph = None
        log.info("Cache reset to zero-state.")

    def update(self, **kwargs) -> None:
        """
        Atomically update one or more cache fields.

        Usage
        -----
        cache.update(snapshots_df=df, health_score=85)

        Raises
        ------
        AttributeError if a key is not a valid cache field (guards against typos).
        """
        with self._lock:
            for key, value in kwargs.items():
                if not hasattr(self, key):
                    raise AttributeError(
                        f"PredictoCacheV2 has no field '{key}'. "
                        f"Valid fields: {[f for f in self.__dataclass_fields__]}"  # type: ignore[attr-defined]
                    )
                setattr(self, key, value)
        log.debug("Cache updated: %s", list(kwargs.keys()))

    # ── Convenience read-only properties ─────────────────────────────────────

    @property
    def table_map(self) -> dict[str, Optional[pd.DataFrame]]:
        """Return the 5 raw tables keyed by their canonical names."""
        return {
            "snapshots":   self.snapshots_df,
            "product":     self.product_df,
            "sales":       self.sales_df,
            "marketing":   self.marketing_df,
            "attribution": self.attribution_df,
        }

    @property
    def tables_loaded(self) -> list[str]:
        """Names of raw tables that are currently non-None and non-empty."""
        return [
            name
            for name, df in self.table_map.items()
            if df is not None and not df.empty
        ]

    @property
    def tables_missing(self) -> list[str]:
        """Names of raw tables that are None or empty."""
        return [
            name
            for name, df in self.table_map.items()
            if df is None or df.empty
        ]

    def __repr__(self) -> str:
        loaded = self.tables_loaded
        return (
            f"PredictoCacheV2("
            f"tables_loaded={loaded}, "
            f"health_score={self.health_score}, "
            f"is_ready={self.is_ready}, "
            f"active_model={self.active_model!r}, "
            f"degradation_events={len(self.degradation_log)}"
            f")"
        )


# ─────────────────────────────────────────────────────────────────────────────
# SINGLETON
# ─────────────────────────────────────────────────────────────────────────────

# Import this object everywhere; never instantiate PredictoCacheV2 directly.
predicto_cache_v2: PredictoCacheV2 = PredictoCacheV2()

log.info("predicto_cache_v2 singleton initialised (zero-state).")