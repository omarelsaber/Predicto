"""
app/core/lifespan.py
─────────────────────────────────────────────────────────────────────────────
FastAPI lifespan context manager — the Predicto startup engine.

Execution order at startup
──────────────────────────
  0. Resolve settings (validates env vars eagerly).
  1. Ingest CSV  → hydrates predicto_cache with raw_df + monthly_df.
  2. Pillar 1    → train_forecast_models(monthly_df) → ForecastModels.
  3. Pillar 2    → train_margin_engine(raw_df)       → MarginModels.
  4. Pillar 3    → train_segmentation(raw_df)         → SegmentationResult.
  5. Atomically store all three model containers in predicto_cache.
  6. Log per-pillar wall-clock time and signal "READY".

Failure policy
──────────────
Any failure in steps 1-5 is logged at CRITICAL level and re-raised as
RuntimeError. FastAPI propagates this to Uvicorn, which exits non-zero.
A Predicto instance with untrained models must never serve traffic.

Threading model
───────────────
All training functions are synchronous and CPU-bound.  They are dispatched
via asyncio.to_thread() so they run in the default ThreadPoolExecutor without
blocking the event loop.  This keeps FastAPI's own startup health-check
endpoint responsive during the training window (typically 5-15 s).

Wiring (in main.py)
────────────────────
  from app.core.lifespan import lifespan
  app = FastAPI(lifespan=lifespan)
"""

from __future__ import annotations

import logging
import time
from asyncio import to_thread
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI

from app.core.cache import predicto_cache
from app.core.config import get_settings
from app.ml.forecasting import train_forecast_models
from app.ml.margin_engine import train_margin_engine
from app.ml.segmentation import train_segmentation
from app.services.ingestion_service import ingest

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _log_pillar(name: str, elapsed: float, extra: str = "") -> None:
    """Emit a consistent one-line startup log per pillar."""
    suffix = f" | {extra}" if extra else ""
    logger.info("  ✓ %-30s  %.2f s%s", name, elapsed, suffix)


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:   # noqa: ARG001
    """
    FastAPI lifespan context manager.

    Pass to FastAPI at construction time:

        from app.core.lifespan import lifespan
        app = FastAPI(title="Predicto", lifespan=lifespan)

    Everything before `yield` runs at startup; everything after runs at
    graceful shutdown (currently a no-op — ML models are in-process memory).
    """

    # ── Step 0: Settings validation ───────────────────────────────────────
    settings = get_settings()
    logger.info("=" * 60)
    logger.info("Predicto startup sequence initiated")
    logger.info("  data path  : %s", settings.default_csv_path)
    logger.info("  groq model : %s", settings.groq_model)
    logger.info("=" * 60)

    total_start = time.perf_counter()

    if not settings.load_default_csv_on_startup:
        logger.info(
            "[clean slate] Skipping startup ingestion — "
            "API ready with empty cache until POST /api/v1/ingest uploads data."
        )
        logger.info("=" * 60)
        logger.info(
            "Predicto READY — empty state (%.2f s). Upload a CSV to train models.",
            time.perf_counter() - total_start,
        )
        logger.info("=" * 60)
        yield
        logger.info("Predicto shutdown — releasing resources.")
        return

    # ─────────────────────────────────────────────────────────────────────
    # Step 1 — CSV ingestion
    # ─────────────────────────────────────────────────────────────────────
    t0 = time.perf_counter()
    try:
        logger.info("[1/4] Ingesting CSV: %s", settings.default_csv_path)
        await to_thread(ingest, settings.default_csv_path)
    except Exception as exc:
        logger.critical(
            "STARTUP FAILED at ingestion — %s: %s",
            type(exc).__name__,
            exc,
            exc_info=True,
        )
        raise RuntimeError(
            f"Predicto cannot start: CSV ingestion failed — {exc}"
        ) from exc

    raw_df = predicto_cache.get_raw_data()
    monthly_df = predicto_cache.get_monthly_data()
    _log_pillar(
        "Ingestion",
        time.perf_counter() - t0,
        f"raw_df={len(raw_df):,} rows  monthly_df={len(monthly_df):,} rows",
    )

    # ─────────────────────────────────────────────────────────────────────
    # Step 2 — Pillar 1: Fourier + Ridge Forecasting
    # ─────────────────────────────────────────────────────────────────────
    t0 = time.perf_counter()
    try:
        logger.info("[2/4] Training Pillar 1 — Fourier+Ridge Forecasting …")
        forecast_models = await to_thread(train_forecast_models)
    except Exception as exc:
        logger.critical(
            "STARTUP FAILED at Pillar 1 (Forecasting) — %s: %s",
            type(exc).__name__,
            exc,
            exc_info=True,
        )
        raise RuntimeError(
            f"Predicto cannot start: Forecasting training failed — {exc}"
        ) from exc

    _log_pillar("Pillar 1 — Forecasting", time.perf_counter() - t0)

    # ─────────────────────────────────────────────────────────────────────
    # Step 3 — Pillar 2: XGBoost / GBR Margin Engine
    # ─────────────────────────────────────────────────────────────────────
    t0 = time.perf_counter()
    try:
        logger.info("[3/4] Training Pillar 2 — Margin Engine …")
        margin_models = await to_thread(train_margin_engine)
    except Exception as exc:
        logger.critical(
            "STARTUP FAILED at Pillar 2 (MarginEngine) — %s: %s",
            type(exc).__name__,
            exc,
            exc_info=True,
        )
        raise RuntimeError(
            f"Predicto cannot start: Margin engine training failed — {exc}"
        ) from exc

    _log_pillar("Pillar 2 — Margin Engine", time.perf_counter() - t0)

    # ─────────────────────────────────────────────────────────────────────
    # Step 4 — Pillar 3: K-Means Segmentation
    # ─────────────────────────────────────────────────────────────────────
    t0 = time.perf_counter()
    try:
        logger.info("[4/4] Training Pillar 3 — K-Means Segmentation …")
        segmentation_result = await to_thread(train_segmentation)
    except Exception as exc:
        logger.critical(
            "STARTUP FAILED at Pillar 3 (Segmentation) — %s: %s",
            type(exc).__name__,
            exc,
            exc_info=True,
        )
        raise RuntimeError(
            f"Predicto cannot start: Segmentation training failed — {exc}"
        ) from exc

    _log_pillar("Pillar 3 — Segmentation", time.perf_counter() - t0)

    # ─────────────────────────────────────────────────────────────────────
    # Step 5 — Atomic model commit to cache
    # ─────────────────────────────────────────────────────────────────────
    predicto_cache.set_models(
        forecast=forecast_models,
        margin=margin_models,
        segmentation=segmentation_result,
    )

    total_elapsed = time.perf_counter() - total_start
    logger.info("=" * 60)
    logger.info(
        "Predicto READY — all pillars trained in %.2f s total", total_elapsed
    )
    logger.info("=" * 60)

    # ── Hand control to FastAPI; server begins accepting requests ────────
    yield

    # ─────────────────────────────────────────────────────────────────────
    # Shutdown (graceful teardown — currently a no-op)
    # ML models live in process memory and are released automatically.
    # Add explicit cleanup here if external resources (DB pools, sockets)
    # are introduced in future sessions.
    # ─────────────────────────────────────────────────────────────────────
    logger.info("Predicto shutdown — releasing resources.")