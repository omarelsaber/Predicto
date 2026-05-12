"""
main.py
─────────────────────────────────────────────────────────────────────────────
Predicto — FastAPI application factory.

Entry point for Uvicorn:
    uvicorn main:app --reload --port 8000

Architecture
────────────
  lifespan  →  ingest CSV → train 3 ML pillars → hydrate cache
  /health   →  liveness + readiness probe (no auth required)
  /api/v1   →  synthesis_router + data_router (all guarded by models_ready)
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.data_router import router as data_router
from app.api.v1.synthesis_router import router as synthesis_router
from app.core.cache import predicto_cache
from app.core.config import get_settings
from app.core.lifespan import lifespan as _ml_lifespan
from app.models.schemas import ErrorResponse, HealthResponse

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("predicto.main")

# ─────────────────────────────────────────────────────────────────────────────
# Process-start timestamp (used by /health uptime_seconds)
# ─────────────────────────────────────────────────────────────────────────────

_START_TIME: float = time.monotonic()


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan — delegate fully to app/core/lifespan.py
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:  # noqa: ARG001
    """
    Thin shim: delegates to the ML lifespan context manager so startup logic
    stays in `app/core/lifespan.py` and this file stays clean.
    """
    logger.info("Predicto starting up…")
    async with _ml_lifespan(app):
        logger.info("Predicto ready.")
        yield
    logger.info("Predicto shut down.")


# ─────────────────────────────────────────────────────────────────────────────
# Application factory
# ─────────────────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Predicto",
        description=(
            "B2B SaaS Revenue Intelligence Platform — "
            "three ML pillars (forecast · margin · personas) "
            "synthesised by Groq/Llama-3 into streaming executive summaries."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Allow the React dashboard origin(s) defined in settings.
    # In development `settings.cors_origins` should include "http://localhost:5173".
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,   # list[str] from config
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Global exception handlers ─────────────────────────────────────────────

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception  # noqa: ARG001
    ) -> JSONResponse:
        logger.error("Unhandled exception on %s: %s", request.url.path, exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error="internal_server_error",
                message="An unexpected error occurred.",
                detail=str(exc),
            ).model_dump(),
        )

    # ── Health ────────────────────────────────────────────────────────────────

    @app.get(
        "/health",
        response_model=HealthResponse,
        tags=["Health"],
        summary="Liveness and readiness probe",
        responses={
            200: {"description": "Service status and model readiness"},
        },
    )
    async def health() -> HealthResponse:
        """
        Returns the current service status.

        - `status = "ready"`    → HTTP API is accepting requests.
        - `models_ready`        → ML pillars trained and cached.
        - `data_loaded`         → transaction CSV present in memory (upload / ingest).

        Safe to poll from load-balancer health checks and the React dashboard
        status banner without authentication.
        """
        models_ready = predicto_cache.models_ready()
        data_loaded = predicto_cache.has_transaction_data()
        return HealthResponse(
            status="ready",
            models_ready=models_ready,
            data_loaded=data_loaded,
            uptime_seconds=round(time.monotonic() - _START_TIME, 2),
        )

    # ── API routers ───────────────────────────────────────────────────────────

    app.include_router(synthesis_router, prefix="/api/v1")
    app.include_router(data_router,      prefix="/api/v1")

    logger.info(
        "Routers mounted. CORS origins: %s",
        settings.cors_origins,
    )

    return app


# ─────────────────────────────────────────────────────────────────────────────
# Module-level app instance (consumed by Uvicorn)
# ─────────────────────────────────────────────────────────────────────────────

app = create_app()