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
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI

from app.core.cache import predicto_cache_v2
from app.core.config import get_settings

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _log_pillar(name: str, elapsed: float, extra: str = "") -> None:
    """Emit a consistent one-line startup log per pillar."""
    suffix = f" | {extra}" if extra else ""
    logger.info("  ✓ %-30s  %.2f s%s", name, elapsed, suffix)


def _resolve_startup_zip_path() -> Path | None:
    """Resolve optional V2 startup ZIP from settings or env."""
    settings = get_settings()
    if settings.startup_zip_path is not None:
        return settings.startup_zip_path
    env_path = os.getenv("PREDICTO_STARTUP_ZIP_PATH", "").strip()
    if env_path:
        return Path(env_path)
    return None


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
    # Step 1 — V2 ZIP ingestion (optional)
    # ─────────────────────────────────────────────────────────────────────
    t0 = time.perf_counter()
    try:
        from app.services.ingestion_service_v2 import ingest_data_files

        zip_path = _resolve_startup_zip_path()
        if zip_path is not None and zip_path.exists():
            logger.info("[1/1] Auto-ingesting V2 zip file: %s", zip_path)
            with open(zip_path, "rb") as f:
                content = f.read()
            files_data = [(zip_path.name, content)]
            await ingest_data_files(files_data)
        else:
            logger.info(
                "[1/1] No auto-ingest zip configured or found%s",
                f" at {zip_path}" if zip_path is not None else "",
            )
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

    tables_loaded = list(predicto_cache_v2.tables_loaded or [])
    health_score = predicto_cache_v2.health_score
    _log_pillar(
        "V2 Ingestion",
        time.perf_counter() - t0,
        f"tables={tables_loaded}  health_score={health_score}",
    )

    # V1 ML pillar training is intentionally skipped at startup — models train on
    # POST /api/v1/ingest after the user uploads transaction CSV data.

    total_elapsed = time.perf_counter() - total_start
    logger.info("=" * 60)
    logger.info(
        "Predicto READY — V2 data ingested in %.2f s (V1 ML pillars deferred)",
        total_elapsed,
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
