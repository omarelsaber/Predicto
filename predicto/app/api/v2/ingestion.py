"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/api/v2/ingestion.py                                                    ║
║  Predicto V2 — Data Ingestion API Router                                    ║
║                                                                              ║
║  Endpoints                                                                  ║
║    POST /api/v2/data/ingest   Accept a ZIP file and run the full           ║
║                                ingestion pipeline.                          ║
║    GET  /api/v2/data/health   Return health_score, degradation_log, and    ║
║                                an AI-module status map.                     ║
║                                                                              ║
║  Design principles                                                          ║
║    • No ML logic lives here — all heavy lifting delegated to the service.   ║
║    • Clear HTTP 400 responses with actionable messages for bad uploads.     ║
║    • The health endpoint is always callable even before any data is         ║
║      uploaded (returns is_ready=False, health_score=0).                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import json
import logging
import zipfile
from typing import Literal, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.core.cache import predicto_cache_v2
from app.services.ingestion_service_v2 import ingest_data_files, _extract_files_raw
from app.services.classifier import classify_zip_contents, classify_with_llm
from app.services.ai_analyst_service import generate_root_cause_narrative
from app.services.contagion_service import build_contagion_graph

log = logging.getLogger("predicto.v2.api.ingestion")

router = APIRouter(
    prefix="/api/v2/data",
    tags=["Data Ingestion"],
)

# ─────────────────────────────────────────────────────────────────────────────
# RESPONSE SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

# Module status literals used in the health response
ModuleStatus = Literal["ACTIVE", "PARTIAL", "OFFLINE"]


class DegradationEvent(BaseModel):
    """A single schema repair event recorded by apply_schema_degradation()."""
    table:      str = Field(..., description="Table that was repaired (e.g. 'snapshots')")
    column:     str = Field(..., description="Column that triggered the repair")
    strategy:   str = Field(..., description="Repair strategy applied")
    n_affected: int = Field(..., description="Number of rows or cells affected")


class IngestResponse(BaseModel):
    """Returned by POST /ingest on success."""
    status:          str                  = Field(..., description="'ok' on success")
    health_score:    int                  = Field(..., ge=0, le=100)
    tables_loaded:   list[str]            = Field(..., description="Tables successfully parsed")
    tables_missing:  list[str]            = Field(..., description="Tables absent from ZIP")
    active_model:    Optional[str]        = Field(None, description="'lite' | 'full' | null")
    degradation_events: int               = Field(..., description="Total schema repair events")
    message:         str                  = Field(..., description="Human-readable summary")


class AIModuleStatus(BaseModel):
    """Status of a single AI innovation module."""
    status:  ModuleStatus = Field(..., description="ACTIVE | PARTIAL | OFFLINE")
    reason:  str          = Field(..., description="One-line explanation of the status")


class HealthResponse(BaseModel):
    """Returned by GET /health."""
    is_ready:        bool                          = Field(...)
    health_score:    int                           = Field(..., ge=0, le=100)
    active_model:    Optional[str]                 = Field(None)
    tables_loaded:   list[str]                     = Field(...)
    tables_missing:  list[str]                     = Field(...)
    degradation_log: list[DegradationEvent]        = Field(...)
    ai_modules:      dict[str, AIModuleStatus]     = Field(
        ...,
        description="Status map for all 4 AI modules: ChurnRouter, DealPriority, CompChurn, Expansion",
    )
    ingestion_error: Optional[str]                 = Field(None)


# ─────────────────────────────────────────────────────────────────────────────
# MODULE STATUS LOGIC
# ─────────────────────────────────────────────────────────────────────────────

def _evaluate_module_statuses() -> dict[str, AIModuleStatus]:
    """
    Determine the operational status of each AI module based solely on what is
    currently in the cache.  This is a pure read — no ML is executed.

    Module definitions
    ------------------
    ChurnRouter      (ColdStartRouter)
        ACTIVE   — router fitted, active_model set
        PARTIAL  — engineered_df exists but router not fitted
        OFFLINE  — no engineered data

    DealPriorityScorer  (AI Innovation 1)
        ACTIVE   — sales table present with ≥ 10 rows and win_loss_status col
        PARTIAL  — sales table present but < 10 rows or missing win_loss_status
        OFFLINE  — no sales table

    CompetitiveChurnPredictor  (AI Innovation 2)
        ACTIVE   — product + snapshots both present, product ≥ 20 rows
        PARTIAL  — product or snapshots present but product < 20 rows
        OFFLINE  — both absent

    RevenueExpansionRecommender  (AI Innovation 3)
        ACTIVE   — snapshots has nps_at_snapshot + support_tickets_at_snapshot;
                   product has mrr
        PARTIAL  — snapshots present but one of the two NPS/ticket cols absent
        OFFLINE  — no snapshots table
    """
    c = predicto_cache_v2  # alias for brevity

    statuses: dict[str, AIModuleStatus] = {}

    # ── ChurnRouter ───────────────────────────────────────────────────────────
    if c.router is not None and c.active_model is not None:
        statuses["ChurnRouter"] = AIModuleStatus(
            status="ACTIVE",
            reason=f"ColdStartRouter fitted — model='{c.active_model}'",
        )
    elif c.engineered_df is not None and not c.engineered_df.empty:
        statuses["ChurnRouter"] = AIModuleStatus(
            status="PARTIAL",
            reason="Engineered features available but model training failed or was skipped.",
        )
    else:
        statuses["ChurnRouter"] = AIModuleStatus(
            status="OFFLINE",
            reason="No engineered data — upload 'snapshots' and 'product' tables to activate.",
        )

    # ── DealPriorityScorer ────────────────────────────────────────────────────
    sales_df = c.sales_df
    if sales_df is not None and not sales_df.empty:
        has_wl_col = "win_loss_status" in sales_df.columns
        enough_rows = len(sales_df) >= 10
        if has_wl_col and enough_rows:
            statuses["DealPriorityScorer"] = AIModuleStatus(
                status="ACTIVE",
                reason=f"Sales table loaded ({len(sales_df)} rows, win_loss_status present).",
            )
        elif has_wl_col and not enough_rows:
            statuses["DealPriorityScorer"] = AIModuleStatus(
                status="PARTIAL",
                reason=(
                    f"Sales table has only {len(sales_df)} rows (≥ 10 required for XGBoost fit). "
                    "Scorer will return 0.5 baseline probability."
                ),
            )
        else:
            statuses["DealPriorityScorer"] = AIModuleStatus(
                status="PARTIAL",
                reason="Sales table loaded but 'win_loss_status' column is missing — cannot train.",
            )
    else:
        statuses["DealPriorityScorer"] = AIModuleStatus(
            status="OFFLINE",
            reason="Sales table absent from upload.",
        )

    # ── CompetitiveChurnPredictor ─────────────────────────────────────────────
    product_df   = c.product_df
    snapshots_df = c.snapshots_df
    product_ok   = product_df   is not None and not product_df.empty
    snaps_ok     = snapshots_df is not None and not snapshots_df.empty

    if product_ok and snaps_ok:
        if len(product_df) >= 20:  # type: ignore[arg-type]
            statuses["CompetitiveChurnPredictor"] = AIModuleStatus(
                status="ACTIVE",
                reason=(
                    f"Product ({len(product_df)} rows) and snapshots "  # type: ignore[arg-type]
                    f"({len(snapshots_df)} rows) both loaded."  # type: ignore[arg-type]
                ),
            )
        else:
            statuses["CompetitiveChurnPredictor"] = AIModuleStatus(
                status="PARTIAL",
                reason=(
                    f"Product table has only {len(product_df)} rows "  # type: ignore[arg-type]
                    "(≥ 20 required). Predictor will return 0.5 baseline probability."
                ),
            )
    elif product_ok or snaps_ok:
        missing = "snapshots" if not snaps_ok else "product"
        statuses["CompetitiveChurnPredictor"] = AIModuleStatus(
            status="PARTIAL",
            reason=f"'{missing}' table absent — predictor requires both tables.",
        )
    else:
        statuses["CompetitiveChurnPredictor"] = AIModuleStatus(
            status="OFFLINE",
            reason="Both 'product' and 'snapshots' tables absent.",
        )

    # ── RevenueExpansionRecommender ───────────────────────────────────────────
    if snaps_ok:
        snap_cols         = set(snapshots_df.columns)  # type: ignore[union-attr]
        has_nps           = "nps_at_snapshot"            in snap_cols
        has_tickets       = "support_tickets_at_snapshot" in snap_cols
        has_mrr           = (
            product_ok and "mrr" in set(product_df.columns)  # type: ignore[union-attr]
        )

        if has_nps and has_tickets and has_mrr:
            statuses["RevenueExpansionRecommender"] = AIModuleStatus(
                status="ACTIVE",
                reason="All cluster features present (NPS, tickets, MRR, feature velocity).",
            )
        elif has_nps or has_tickets:
            missing_cols = []
            if not has_nps:     missing_cols.append("nps_at_snapshot")
            if not has_tickets: missing_cols.append("support_tickets_at_snapshot")
            if not has_mrr:     missing_cols.append("product.mrr")
            statuses["RevenueExpansionRecommender"] = AIModuleStatus(
                status="PARTIAL",
                reason=(
                    f"Missing columns: {missing_cols}. "
                    "Cluster accuracy reduced — K-Means will operate on available features only."
                ),
            )
        else:
            statuses["RevenueExpansionRecommender"] = AIModuleStatus(
                status="PARTIAL",
                reason=(
                    "Snapshots loaded but 'nps_at_snapshot' and "
                    "'support_tickets_at_snapshot' are absent. "
                    "Clusters will be based on MRR and feature velocity only."
                ),
            )
    else:
        statuses["RevenueExpansionRecommender"] = AIModuleStatus(
            status="OFFLINE",
            reason="Snapshots table absent — required as the clustering backbone.",
        )

    return statuses


# ─────────────────────────────────────────────────────────────────────────────
# PREVIEW RESPONSE SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────

class PreviewFileResult(BaseModel):
    """Classification result for a single CSV inside the ZIP."""
    filename:            str            = Field(..., description="Original CSV filename")
    table:               Optional[str]  = Field(None, description="Best-match table key")
    confidence:          float          = Field(..., ge=0.0, le=1.0)
    collision:           bool           = Field(False)
    collision_candidates: list[str]     = Field(default_factory=list)
    needs_user_input:    bool           = Field(...)
    all_scores:          dict[str, float] = Field(default_factory=dict)
    columns_found:       list[str]      = Field(default_factory=list)
    is_ai_suggestion:    bool           = Field(False, description="True if LLM guessed the table")


class PreviewResponse(BaseModel):
    """Returned by POST /preview."""
    files: list[PreviewFileResult] = Field(..., description="Per-file classification results")


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/preview",
    response_model=PreviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload a ZIP and preview file-to-table classification",
    description=(
        "Phase 1 of two-phase ingestion. Extracts CSVs from the ZIP, "
        "classifies each by column fingerprinting, and returns results "
        "so the user can review or override assignments before ingesting."
    ),
)
async def preview_data(
    files: list[UploadFile] = File(
        ...,
        description="One or more CSV or ZIP files.",
    ),
) -> PreviewResponse:
    """
    POST /api/v2/data/preview

    Extracts CSVs from the uploaded files, classifies each by column
    fingerprinting, and returns per-file results. No ML is executed.
    """
    log.info(
        "POST /preview — received %d files",
        len(files)
    )

    # ── Read bytes ────────────────────────────────────────────────────────────
    files_data = []
    for f in files:
        try:
            data = await f.read()
            if not data:
                continue
            files_data.append((f.filename, data))
        except Exception as read_exc:
            log.error("Failed to read upload bytes for %s: %s", f.filename, read_exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not read uploaded file {f.filename}: {read_exc}",
            )

    if not files_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded files are empty.",
        )

    # ── Extract + classify ────────────────────────────────────────────────────
    try:
        raw_tables = _extract_files_raw(files_data)
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is not a valid ZIP archive.",
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )

    classifications = classify_zip_contents(raw_tables)

    files: list[PreviewFileResult] = []
    for fname, result in classifications.items():
        is_ai_suggestion = False
        table = result.table
        
        # If needs user input, use LLM
        if result.needs_user_input:
            llm_table = await classify_with_llm(result.columns_found)
            if llm_table != "unknown":
                table = llm_table
                is_ai_suggestion = True

        files.append(PreviewFileResult(
            filename=fname,
            table=table,
            confidence=round(result.confidence, 3),
            collision=result.collision,
            collision_candidates=result.collision_candidates,
            needs_user_input=result.needs_user_input,
            all_scores={k: round(v, 3) for k, v in result.all_scores.items()},
            columns_found=result.columns_found,
            is_ai_suggestion=is_ai_suggestion,
        ))

    log.info("Preview complete — %d files classified.", len(files))
    return PreviewResponse(files=files)


@router.post(
    "/ingest",
    response_model=IngestResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload a ZIP of CSVs and run the V2 ingestion pipeline",
    description=(
        "Phase 2 of two-phase ingestion. Accepts a ZIP file and an optional "
        "JSON mapping (filename → table key). If no mapping is provided, "
        "files are auto-classified by column fingerprinting."
    ),
)
async def ingest_data(
    files: list[UploadFile] = File(
        ...,
        description="One or more CSV or ZIP files.",
    ),
    mapping: Optional[str] = Form(
        None,
        description=(
            'Optional raw JSON string mapping filenames to canonical tables. '
            'Example: {"mappings": {"sales.csv": "sales", "snapshots.csv": "snapshots"}}. '
            "Invalid or empty text defaults to auto-classification."
        ),
    ),
) -> IngestResponse:
    """
    POST /api/v2/data/ingest

    Accepts multiple file uploads and an optional user-confirmed mapping,
    runs the full ingestion pipeline, and returns a structured summary.
    """
    log.info(
        "POST /ingest — received %d files",
        len(files)
    )

    # ── Read bytes ────────────────────────────────────────────────────────────
    files_data = []
    for f in files:
        try:
            data = await f.read()
            if not data:
                continue
            files_data.append((f.filename, data))
        except Exception as read_exc:
            log.error("Failed to read upload bytes for %s: %s", f.filename, read_exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not read uploaded file {f.filename}: {read_exc}",
            )

    if not files_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded files are empty.",
        )

    # ── Parse optional mapping ────────────────────────────────────────────────
    user_mapping: dict[str, str] = {}
    if mapping:
        try:
            parsed = json.loads(mapping)
            if isinstance(parsed, dict):
                candidate = parsed.get("mappings")
                if isinstance(candidate, dict):
                    user_mapping = {str(k): str(v) for k, v in candidate.items()}
                    log.info("User mapping received: %s", user_mapping)
                else:
                    log.warning(
                        "User mapping JSON did not contain a valid 'mappings' dict. "
                        "Falling back to auto-classification."
                    )
            else:
                log.warning(
                    "User mapping JSON is not an object. Falling back to auto-classification."
                )
        except (json.JSONDecodeError, TypeError) as parse_err:
            log.warning(
                "Invalid mapping JSON ignored: %s — falling back to auto-classification.",
                parse_err,
            )

    # ── Run ingestion pipeline ────────────────────────────────────────────────
    try:
        cache = await ingest_data_files(files_data, user_mapping=user_mapping)

    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "The uploaded file is not a valid ZIP archive. "
                "Please re-export your data as a .zip file and try again."
            ),
        )

    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    
    # ── Phase 4 — Hydrate Root-Cause Narrative ──────────────────────────────
    # We generate this once at the end of ingestion so it's ready for the Hub.
    try:
        if predicto_cache_v2.engineered_df is not None and not predicto_cache_v2.engineered_df.empty:
            narrative = generate_root_cause_narrative()
            cache.update(root_cause_narrative=narrative)
            log.info("Phase 4: Root-cause narrative hydrated.")
    except Exception as analyst_exc:
        log.warning("Failed to hydrate root-cause narrative: %s", analyst_exc)

    # ── Phase 5 — V3 Pre-computation ──────────────────────────────────────────
    try:
        if predicto_cache_v2.engineered_df is not None and not predicto_cache_v2.engineered_df.empty:
            log.info("Phase 5: Automatically building V3 contagion graph topology...")
            graph = build_contagion_graph(predicto_cache_v2.engineered_df)
            predicto_cache_v2.update(contagion_graph=graph)
            log.info("Phase 5: Contagion graph pre-computed.")
    except Exception as v3_exc:
        log.warning("Failed V3 pre-computation: %s", v3_exc)

    # ── Build response ────────────────────────────────────────────────────────
    n_loaded  = len(cache.tables_loaded)
    n_total   = 5
    n_missing = len(cache.tables_missing)

    if n_loaded == 0:
        message = (
            "No tables were successfully loaded. "
            "Check that your ZIP contains CSVs with recognisable columns."
        )
    elif n_missing == 0:
        message = (
            f"All {n_total} tables loaded successfully. "
            f"Health score: {cache.health_score}/100. "
            f"Active model: '{cache.active_model}'."
        )
    else:
        message = (
            f"{n_loaded} of {n_total} tables loaded. "
            f"Missing: {cache.tables_missing}. "
            f"Health score: {cache.health_score}/100. "
            f"Active model: '{cache.active_model}'."
        )

    log.info("Ingestion complete — %s", message)

    return IngestResponse(
        status           = "ok",
        health_score     = cache.health_score,
        tables_loaded    = cache.tables_loaded,
        tables_missing   = cache.tables_missing,
        active_model     = cache.active_model,
        degradation_events = len(cache.degradation_log),
        message          = message,
    )



@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Return data health, degradation log, and AI module readiness",
    description=(
        "Always callable — returns a zero-state response before any data is "
        "uploaded.  After ingestion, returns the health score, every schema "
        "repair event, and a status map for all 4 AI modules."
    ),
)
async def get_data_health() -> HealthResponse:
    """
    GET /api/v2/data/health

    Reads directly from predicto_cache_v2.  Never triggers any computation.

    AI module statuses
    ------------------
    ACTIVE   — module has all data it needs; will produce full-quality output.
    PARTIAL  — module is functional but degraded (e.g. < 20 rows, missing col).
    OFFLINE  — required table(s) entirely absent; module will return defaults.
    """
    log.debug("GET /health — cache is_ready=%s", predicto_cache_v2.is_ready)

    # Evaluate module statuses from current cache state
    ai_modules = _evaluate_module_statuses()

    # Coerce degradation_log entries to validated Pydantic models
    degradation_log = [
        DegradationEvent(**entry) for entry in predicto_cache_v2.degradation_log
    ]

    return HealthResponse(
        is_ready        = predicto_cache_v2.is_ready,
        health_score    = predicto_cache_v2.health_score,
        active_model    = predicto_cache_v2.active_model,
        tables_loaded   = predicto_cache_v2.tables_loaded,
        tables_missing  = predicto_cache_v2.tables_missing,
        degradation_log = degradation_log,
        ai_modules      = ai_modules,
        ingestion_error = predicto_cache_v2.ingestion_error,
    )