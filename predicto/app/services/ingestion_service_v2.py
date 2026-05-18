"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/services/ingestion_service_v2.py                                       ║
║  Predicto V2 — Data Ingestion Business Logic                                ║
║                                                                              ║
║  Responsibilities                                                            ║
║    1. Accept an in-memory ZIP payload and extract + classify its CSVs       ║
║       against the 5 expected table keys.                                    ║
║    2. Apply apply_schema_degradation() to each table that can be matched    ║
║       against a CRITICAL_COLUMNS rule-set.                                  ║
║    3. Run engineer_revops_features() to produce the joint feature matrix.   ║
║    4. Build GRU sequences via build_sequences() and fit a ColdStartRouter.  ║
║    5. Calculate a 0-100 health_score reflecting data completeness.          ║
║    6. Persist all artefacts into predicto_cache_v2.                         ║
║                                                                              ║
║  No FastAPI request/response objects are referenced here — this layer is    ║
║  intentionally framework-agnostic so it can be unit-tested without an       ║
║  ASGI stack and reused by future CLI / batch pipelines.                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import io
import logging
import zipfile
from typing import Optional

import pandas as pd

from app.core.cache import predicto_cache_v2, PredictoCacheV2
from app.core.schema_resolver import resolve_canonical_df
from app.ml.hybrid_engine import (
    CRITICAL_COLUMNS,
    apply_schema_degradation,
    engineer_revops_features,
    build_sequences,
    ColdStartRouter,
)

log = logging.getLogger("predicto.v2.ingestion")


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

# Canonical table keys and the filename keywords used to auto-detect them.
# Order matters: more specific keywords should appear before generic ones.
TABLE_KEYWORD_MAP: dict[str, list[str]] = {
    "snapshots":   ["snapshot", "contract_snapshot", "customer_contract"],
    "product":     ["product"],
    "sales":       ["sales", "crm", "deal"],
    "marketing":   ["marketing", "campaign", "mkt"],
    "attribution": ["attribution", "attr", "deal_attribution"],
}

# Health score penalty weights (must sum ≤ 100)
PENALTY_MISSING_TABLE:    int = 12   # per missing table  (5 × 12 = 60 max)
PENALTY_DEGRADATION_EVENT: int = 2   # per degradation event (capped at 20)
PENALTY_EMPTY_ENGINEERED:  int = 20  # if feature engineering yields 0 rows


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _classify_filename(filename: str) -> Optional[str]:
    """
    Map a CSV filename to one of the 5 canonical table keys by keyword scan.

    Matching is case-insensitive.  The first keyword hit wins, so the
    TABLE_KEYWORD_MAP ordering acts as a priority list.

    Returns None if no keyword matches (file is ignored with a warning).
    """
    name_lower = filename.lower()
    for table_key, keywords in TABLE_KEYWORD_MAP.items():
        for kw in keywords:
            if kw in name_lower:
                log.info("  Mapped '%s' → '%s' (keyword='%s')", filename, table_key, kw)
                return table_key
    log.warning("  Could not classify '%s' — skipping.", filename)
    return None


def _read_csv_safe(data: bytes, filename: str) -> Optional[pd.DataFrame]:
    """
    Attempt to parse *data* as a CSV.  Returns None on parse failure rather
    than raising so the pipeline can continue with the remaining tables.
    """
    try:
        df = pd.read_csv(io.BytesIO(data))
        log.info("  Parsed '%s': %d rows × %d columns.", filename, len(df), df.shape[1])
        return df
    except Exception as exc:
        log.error("  Failed to parse '%s': %s", filename, exc)
        return None


def _extract_files_raw(files_data: list[tuple[str, bytes]]) -> dict[str, pd.DataFrame]:
    """
    Extract all CSVs from a list of files (either ZIPs or direct CSVs) into a 
    flat dict of {basename: DataFrame} — no classification is performed here.

    Raises
    ------
    ValueError if no valid CSV files can be parsed.
    """
    raw: dict[str, pd.DataFrame] = {}

    for filename, data in files_data:
        filename_lower = filename.lower()
        if filename_lower.endswith(".zip"):
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as zf:
                    csv_members = [
                        m.filename for m in zf.infolist()
                        if not m.is_dir() and m.filename.lower().endswith(".csv")
                    ]
                    for fname in csv_members:
                        basename = fname.replace("\\", "/").split("/")[-1]
                        csv_data = zf.read(fname)
                        df = _read_csv_safe(csv_data, basename)
                        if df is not None:
                            raw[basename] = df
            except zipfile.BadZipFile:
                log.error("Invalid ZIP file: %s", filename)
                raise ValueError(f"The uploaded file '{filename}' is not a valid ZIP archive.")
        elif filename_lower.endswith(".csv"):
            basename = filename.replace("\\", "/").split("/")[-1]
            df = _read_csv_safe(data, basename)
            if df is not None:
                raw[basename] = df
        else:
            log.warning("Ignoring unsupported file type: %s", filename)

    if not raw:
        raise ValueError(
            "None of the provided files could be parsed as CSVs. "
            "Check that they are valid UTF-8 CSV files or ZIP archives."
        )

    return raw


def _extract_zip(zip_bytes: bytes) -> dict[str, pd.DataFrame]:
    """
    Extract all CSVs from an in-memory ZIP payload.

    Returns a dict of {table_key: DataFrame} for every file that could be:
      (a) opened as a ZIP member,
      (b) parsed as a valid CSV, and
      (c) classified against a known table keyword.

    Raises
    ------
    zipfile.BadZipFile  if the bytes are not a valid ZIP archive.
    ValueError          if the ZIP contains zero recognisable CSV files.
    """
    tables: dict[str, pd.DataFrame] = {}
    duplicates: dict[str, list[str]] = {}  # table_key → [filenames] for conflict log

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        member_names = [
            m.filename for m in zf.infolist()
            if not m.is_dir() and m.filename.lower().endswith(".csv")
        ]

        if not member_names:
            raise ValueError(
                "The uploaded ZIP contains no CSV files. "
                "Please include at least the 'snapshots' and 'product' CSVs."
            )

        log.info("ZIP contains %d CSV member(s): %s", len(member_names), member_names)

        for fname in member_names:
            # Strip leading path components (e.g. "data/snapshots.csv" → "snapshots.csv")
            basename = fname.split("/")[-1]

            table_key = _classify_filename(basename)
            if table_key is None:
                continue

            raw_bytes = zf.read(fname)
            df = _read_csv_safe(raw_bytes, basename)
            if df is None:
                continue

            if table_key in tables:
                # Conflict: two files map to the same table key — keep the larger one
                duplicates.setdefault(table_key, [fname])
                if len(df) > len(tables[table_key]):
                    log.warning(
                        "Duplicate table '%s': '%s' has more rows than previous — replacing.",
                        table_key, basename,
                    )
                    tables[table_key] = df
                else:
                    log.warning(
                        "Duplicate table '%s': keeping earlier file (more rows).", table_key
                    )
            else:
                tables[table_key] = df

    if not tables:
        raise ValueError(
            "No CSV files in the ZIP matched the expected table names "
            f"({list(TABLE_KEYWORD_MAP.keys())}). "
            "Check your filenames contain keywords like 'snapshot', 'product', 'sales', etc."
        )

    return tables


def _apply_degradation_to_all(
    tables: dict[str, pd.DataFrame],
    degradation_log: list[dict],
) -> dict[str, pd.DataFrame]:
    """
    Run apply_schema_degradation() on every table that has a CRITICAL_COLUMNS
    entry.  Tables without an entry (e.g. 'attribution') are passed through
    unmodified — the engine does not define repair rules for them yet.
    """
    repaired: dict[str, pd.DataFrame] = {}
    for key, df in tables.items():
        if key in CRITICAL_COLUMNS:
            log.info("Applying schema degradation to table '%s'...", key)
            repaired[key] = apply_schema_degradation(df, key, degradation_log)
        else:
            log.info("No degradation rules for table '%s' — passing through.", key)
            repaired[key] = df
    return repaired


def _calculate_health_score(
    tables: dict[str, pd.DataFrame],
    engineered_df: pd.DataFrame,
    degradation_log: list[dict],
) -> int:
    """
    Compute a 0-100 health score.

    Penalty model
    -------------
    • -12 per expected table that is absent or empty   (max -60)
    • -2  per schema degradation event                 (capped at -20)
    • -20 if feature engineering produces 0 rows
    """
    score = 100

    # Penalty: missing tables
    for key in TABLE_KEYWORD_MAP:
        df = tables.get(key)
        if df is None or df.empty:
            score -= PENALTY_MISSING_TABLE
            log.debug("Health penalty: missing table '%s' (-%d)", key, PENALTY_MISSING_TABLE)

    # Penalty: degradation events (each event = 1 repaired column)
    n_events = len(degradation_log)
    degradation_penalty = min(n_events * PENALTY_DEGRADATION_EVENT, 20)
    score -= degradation_penalty
    if degradation_penalty:
        log.debug(
            "Health penalty: %d degradation event(s) → -%d",
            n_events, degradation_penalty,
        )

    # Penalty: empty feature matrix
    if engineered_df is None or engineered_df.empty:
        score -= PENALTY_EMPTY_ENGINEERED
        log.debug("Health penalty: empty engineered DataFrame (-%d)", PENALTY_EMPTY_ENGINEERED)

    final = max(0, score)
    log.info("Health score calculated: %d / 100", final)
    return final


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC SERVICE ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

async def ingest_data_files(files_data: list[tuple[str, bytes]], user_mapping: Optional[dict[str, str]] = None) -> PredictoCacheV2:
    """Full ingestion pipeline for file uploads.

    Parameters
    ----------
    files_data: List of tuples (filename, content_bytes).
    user_mapping: Optional dict mapping original filenames to canonical table keys.
                When provided, overrides automatic classification.
    """
    log.info("=== Ingestion pipeline START ===")

    # ── Step 1: Reset ─────────────────────────────────────────────────────────
    predicto_cache_v2.reset()
    degradation_log: list[dict] = []

    try:
        # ── Step 2: Extract Files (raw tables) ────────────────────────────────────
        log.info("Step 2: Extracting files (raw tables)...")
        raw_tables = _extract_files_raw(files_data)

        # Determine table mapping
        if user_mapping:
            # Use explicit user mapping
            tables: dict[str, pd.DataFrame] = {}
            for fname, df in raw_tables.items():
                key = user_mapping.get(fname)
                if key:
                    tables[key] = df
        else:
            # Auto-classify using column signatures
            from app.services.classifier import classify_zip_contents, AUTO_ASSIGN_THRESHOLD
            classifications = classify_zip_contents(raw_tables)
            tables = {}
            for fname, result in classifications.items():
                if result.table and result.confidence >= AUTO_ASSIGN_THRESHOLD and not result.collision:
                    tables[result.table] = raw_tables[fname]

        # ── Step 3: Normalize canonical schema names before degradation ──────
        log.info("Step 3: Resolving canonical schema names on loaded tables...")
        for key, df in list(tables.items()):
            try:
                tables[key] = resolve_canonical_df(df)
            except Exception as schema_exc:
                log.warning(
                    "Could not resolve canonical schema for table '%s': %s — keeping original columns.",
                    key,
                    schema_exc,
                )

        # ── Step 4: Schema degradation ────────────────────────────────────────
        log.info("Step 4: Applying schema degradation...")
        tables = _apply_degradation_to_all(tables, degradation_log)

        # ── Step 4: Feature engineering ────────────────────────────────────────
        log.info("Step 4: Running engineer_revops_features()...")
        engineered_df = engineer_revops_features(tables)

        if engineered_df.empty:
            log.warning(
                "Feature engineering returned an empty DataFrame. "
                "The 'snapshots' and 'product' tables are required for modelling."
            )

        # ── Step 5: Build sequences ────────────────────────────────────────────
        X_seq: object = None
        X_tab: object = None
        y:     object = None
        router = ColdStartRouter()

        if not engineered_df.empty:
            log.info("Step 5: Building GRU sequences...")
            try:
                import numpy as np  # local import keeps top-level imports clean
                X_seq, y, X_tab, _scaler = build_sequences(engineered_df)

                if len(X_seq) == 0:  # type: ignore[arg-type]
                    log.warning("build_sequences returned 0 sequences — skipping model fit.")
                else:
                    # ── Step 6: Fit ColdStartRouter ───────────────────────────
                    log.info(
                        "Step 6: Fitting ColdStartRouter on %d sequences...",
                        len(X_seq),  # type: ignore[arg-type]
                    )
                    router.fit(X_seq, X_tab, y)  # type: ignore[arg-type]
                    log.info(
                        "ColdStartRouter fitted — active_model='%s'", router.active_model
                    )

            except Exception as seq_exc:
                log.error(
                    "Sequence building / model fitting failed: %s — "
                    "cache will store tables and engineered_df but router=None.",
                    seq_exc,
                    exc_info=True,
                )
                router = ColdStartRouter()  # unfitted; active_model=None

        # ── Step 7: Health score ──────────────────────────────────────────────
        log.info("Step 7: Calculating health score...")
        health_score = _calculate_health_score(tables, engineered_df, degradation_log)

        # ── Step 8: Persist to cache ──────────────────────────────────────────
        log.info("Step 8: Persisting artefacts to cache...")
        predicto_cache_v2.update(
            snapshots_df    = tables.get("snapshots"),
            product_df      = tables.get("product"),
            sales_df        = tables.get("sales"),
            marketing_df    = tables.get("marketing"),
            attribution_df  = tables.get("attribution"),
            engineered_df   = engineered_df if not engineered_df.empty else None,
            router          = router,
            degradation_log = degradation_log,
            health_score    = health_score,
            is_ready        = True,
            active_model    = router.active_model,
            ingestion_error = None,
        )

    except (zipfile.BadZipFile, ValueError):
        # Re-raise validation errors — the API layer converts these to HTTP 400.
        raise

    except Exception as unexpected:
        # Catch-all: surface the error in cache but never crash the server.
        msg = f"Unexpected ingestion failure: {unexpected}"
        log.error(msg, exc_info=True)
        predicto_cache_v2.update(
            degradation_log = degradation_log,
            health_score    = 0,
            is_ready        = False,
            ingestion_error = msg,
        )

    log.info("=== Ingestion pipeline END — %s ===", predicto_cache_v2)
    return predicto_cache_v2