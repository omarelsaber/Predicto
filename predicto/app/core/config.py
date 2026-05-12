"""
app/core/config.py
Predicto — centralized configuration via pydantic-settings.
All environment variables are read from .env at startup.
No other module should import os.environ directly.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# ---------------------------------------------------------------------------
# Base directory (project root = two levels above this file)
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # predicto/


class Settings(BaseSettings):
    """
    All settings are read from environment variables or .env file.
    Annotated types enforce validation at startup — a missing required
    value raises an immediate, descriptive error before any request is served.
    """

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",          # silently ignore unknown .env keys
    )

    # ------------------------------------------------------------------
    # Application
    # ------------------------------------------------------------------
    app_name: str = "Predicto"
    app_version: str = "0.1.0"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = Field(default=True)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # ------------------------------------------------------------------
    # API
    # ------------------------------------------------------------------
    api_v1_prefix: str = "/api/v1"
    # Comma-separated origins — loaded from .env, split in validator below
    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:5173"]
    )

    # ------------------------------------------------------------------
    # Data
    # ------------------------------------------------------------------
    data_dir: Path = BASE_DIR / "data"
    default_csv_filename: str = "SaaS-Sales.csv"

    @property
    def default_csv_path(self) -> Path:
        return self.data_dir / self.default_csv_filename

    load_default_csv_on_startup: bool = Field(
        default=False,
        description=(
            "If True, ingest default_csv_path and train all ML pillars at server startup. "
            "If False (default), the cache stays empty until the user uploads via POST /ingest."
        ),
    )

    # Expected CSV columns — ingestion validator checks these exist.
    # Industry and Profit are optional; their absence triggers a warning, not an error.
    required_csv_columns: list[str] = [
        "Order ID",
        "Order Date",
        "Customer",
        "Segment",
        "Region",
        "Product",
        "Sales",
        "Quantity",
        "Discount",
    ]

    # ------------------------------------------------------------------
    # ML — Prophet
    # ------------------------------------------------------------------
    prophet_forecast_periods: int = 3          # months ahead
    prophet_interval_width: float = 0.80       # confidence band
    prophet_changepoint_prior_scale: float = 0.45  # higher = tracks recent trend

    # ------------------------------------------------------------------
    # ML — XGBoost
    # ------------------------------------------------------------------
    xgb_n_estimators: int = 300
    xgb_max_depth: int = 5
    xgb_learning_rate: float = 0.05
    xgb_subsample: float = 0.8
    xgb_colsample_bytree: float = 0.8
    xgb_random_state: int = 42
    # Deals with discount above this threshold are flagged "high risk"
    high_discount_threshold: float = 0.30
    # Minimum predicted margin to consider a deal "safe"
    safe_margin_floor: float = 0.05

    # ------------------------------------------------------------------
    # ML — K-Means
    # ------------------------------------------------------------------
    kmeans_n_clusters: int = 4
    kmeans_n_init: int = 10
    kmeans_random_state: int = 42
    # Feature columns used for clustering (customer-level aggregates)
    kmeans_features: list[str] = ["Total_Sales", "Avg_Margin_Rate", "Avg_Discount"]

    # ------------------------------------------------------------------
    # LLM — Groq
    # ------------------------------------------------------------------
    groq_api_key: str = Field(default="", description="Required in production")
    groq_model: str = "llama-3.3-70b-versatile"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_max_tokens: int = 250          # tight budget for 3-bullet summary
    groq_temperature: float = 0.3       # low = deterministic, reduces hallucination
    groq_stream: bool = True
    # Hard token ceiling for the assembled context packet (prompt input)
    context_packet_max_tokens: int = 600

    # ------------------------------------------------------------------
    # Cache
    # ------------------------------------------------------------------
    # TTL in seconds for ML output cache (0 = never expire)
    cache_ttl_seconds: int = 0
    # Maximum number of cached file-hash entries (LRU eviction)
    cache_max_entries: int = 5

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------
    @field_validator("groq_api_key")
    @classmethod
    def warn_if_groq_key_missing(cls, v: str) -> str:
        if not v:
            import warnings
            warnings.warn(
                "GROQ_API_KEY is not set. The /synthesis/executive endpoint "
                "will return an error until a valid key is provided.",
                stacklevel=2,
            )
        return v

    @field_validator("data_dir")
    @classmethod
    def ensure_data_dir_exists(cls, v: Path) -> Path:
        v.mkdir(parents=True, exist_ok=True)
        return v


# ---------------------------------------------------------------------------
# Singleton accessor — use get_settings() everywhere, never Settings() directly
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Returns a cached Settings singleton.
    Import pattern in every other module:

        from app.core.config import get_settings
        settings = get_settings()
    """
    return Settings()
