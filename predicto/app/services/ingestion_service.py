"""
app/services/ingestion_service.py
──────────────────────────────────────────────────────────────────────────────
Ingestion Service — Predicto Revenue Intelligence Platform
──────────────────────────────────────────────────────────────────────────────

Responsibilities:
    1. Accept a file path (local) or an in-memory bytes buffer (upload).
    2. Validate the CSV schema against REQUIRED_COLUMNS.
    3. Enforce strict type coercion, logical constraints, and date parsing.
    4. Engineer Margin_Rate and high_discount_flag features.
    5. Build a monthly-aggregated DataFrame for Pillar 1 (Forecasting).
    6. Hydrate predicto_cache via set_data(raw_df, monthly_df, file_hash).
    7. Return a structured IngestionResult summary to the API layer.

Validation Pipeline (the "Strict Data Validation Layer")
─────────────────────────────────────────────────────────
    Step 1 — Presence Check:  Every REQUIRED_COLUMN must exist in the CSV.
    Step 2 — Type Enforcement: Sales, Quantity, Discount coerced to numeric;
             rows that fail conversion are dropped and logged.
    Step 3 — Logical Constraints:
             • Sales > 0
             • Quantity > 0
             • 0 ≤ Discount ≤ 1
             Violations are dropped with per-row detail logging.
    Step 4 — Date Parsing: Order Date must parse to a valid datetime.
             Unparseable rows are dropped.

Design constraints:
    - No FastAPI imports — this module is pure Python / Pandas.
    - No ML imports — clean data is handed to ml/ modules; no training here.
    - All config access via get_settings() singleton.
    - All cache writes via predicto_cache singleton.
    - Validation errors surface as IngestionValidationError (subclass of
      ValueError); the API layer translates these into HTTP 400 responses.
"""

from __future__ import annotations

import hashlib
import io
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Union

import pandas as pd

from app.core.cache import predicto_cache
from app.core.config import get_settings

# ──────────────────────────────────────────────────────────────────────────────
# Module-level logger
# ──────────────────────────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# § 1  Universal ML Feature Registry — single source of truth
# ──────────────────────────────────────────────────────────────────────────────

ML_FEATURE_REGISTRY: dict[str, dict] = {
    # Column name      →  default value (scalar or callable(df, row_index)),
    #                     dtype class, whether it's critical (no-synth)
    "Order ID":   {"default": lambda df, i: f"AUTO-{i:06d}", "dtype": "str",     "critical": False},
    "Order Date": {"default": None,                          "dtype": "datetime", "critical": True},
    "Customer":   {"default": "Unknown Client",              "dtype": "str",     "critical": False},
    "Segment":    {"default": "General",                     "dtype": "str",     "critical": False},
    "Region":     {"default": "Global",                      "dtype": "str",     "critical": False},
    "Product":    {"default": "Standard Product",            "dtype": "str",     "critical": False},
    "Industry":   {"default": "Unknown",                     "dtype": "str",     "critical": False},
    "License":    {"default": "Standard",                    "dtype": "str",     "critical": False},
    "Sales":      {"default": 0.0,                           "dtype": "numeric", "critical": True},
    "Quantity":   {"default": 1,                             "dtype": "numeric", "critical": True},
    "Discount":   {"default": 0.0,                           "dtype": "numeric", "critical": False},
    "Profit":     {"default": 0.0,                           "dtype": "numeric", "critical": False},
}
"""
Universal Feature Registry — every column that ANY ML pipeline in Predicto
may ever reference.  Each entry specifies:
  - ``default``:  scalar or ``callable(df, row_index)`` for auto-generation.
  - ``dtype``:    ``"str"`` | ``"numeric"`` | ``"datetime"``.
  - ``critical``: if ``True`` the column MUST exist in the CSV (no synthesis).
                  Only Order Date, Sales, and Quantity are critical.
"""

# Convenience views derived from the registry
REQUIRED_COLUMNS: list[str] = list(ML_FEATURE_REGISTRY.keys())
_NUMERIC_REGISTRY_COLS: list[str] = [
    col for col, meta in ML_FEATURE_REGISTRY.items() if meta["dtype"] == "numeric"
]
_CATEGORICAL_REGISTRY_COLS: list[str] = [
    col for col, meta in ML_FEATURE_REGISTRY.items() if meta["dtype"] == "str"
]
_CRITICAL_REGISTRY_COLS: list[str] = [
    col for col, meta in ML_FEATURE_REGISTRY.items() if meta["critical"]
]

# ──────────────────────────────────────────────────────────────────────────────
# § 1b  Column Alias Mapping — Smart rename for real-world CSV headers
# ──────────────────────────────────────────────────────────────────────────────

COLUMN_ALIASES: dict[str, str] = {
    # ── Order ID aliases ──────────────────────────────────────────────────
    "order_id":         "Order ID",
    "orderid":          "Order ID",
    "order id":         "Order ID",
    "order number":     "Order ID",
    "order_number":     "Order ID",
    "ordernumber":      "Order ID",
    "transaction_id":   "Order ID",
    "transactionid":    "Order ID",
    "transaction id":   "Order ID",
    "id":               "Order ID",
    "invoice_id":       "Order ID",
    "invoice id":       "Order ID",

    # ── Order Date aliases ────────────────────────────────────────────────
    "order_date":       "Order Date",
    "orderdate":        "Order Date",
    "order date":       "Order Date",
    "date":             "Order Date",
    "transaction_date": "Order Date",
    "transactiondate":  "Order Date",
    "transaction date": "Order Date",
    "purchase_date":    "Order Date",
    "created_at":       "Order Date",
    "createdat":        "Order Date",
    "created at":       "Order Date",
    "timestamp":        "Order Date",

    # ── Customer aliases ──────────────────────────────────────────────────
    "customer":         "Customer",
    "customer_name":    "Customer",
    "customername":     "Customer",
    "customer name":    "Customer",
    "client":           "Customer",
    "client_name":      "Customer",
    "buyer":            "Customer",
    "contact_name":     "Customer",
    "contact name":     "Customer",
    "first_name":       "Customer",
    "firstname":        "Customer",
    "first name":       "Customer",
    "name":             "Customer",

    # ── Segment aliases ───────────────────────────────────────────────────
    "segment":          "Segment",
    "customer_segment": "Segment",
    "customersegment":  "Segment",
    "customer segment": "Segment",
    "tier":             "Segment",
    "customer_tier":    "Segment",
    "account_type":     "Segment",
    "category":         "Segment",

    # ── Region aliases ────────────────────────────────────────────────────
    "region":           "Region",
    "country":          "Region",
    "customer_country": "Region",
    "customercountry":  "Region",
    "customer country": "Region",
    "territory":        "Region",
    "market":           "Region",
    "geo":              "Region",
    "geography":        "Region",
    "location":         "Region",

    # ── Product aliases ───────────────────────────────────────────────────
    "product":          "Product",
    "product_name":     "Product",
    "productname":      "Product",
    "product name":     "Product",
    "item":             "Product",
    "item_name":        "Product",
    "sku":              "Product",
    "product_id":       "Product",

    # ── Sales / Revenue aliases ───────────────────────────────────────────
    "sales":            "Sales",
    "revenue":          "Sales",
    "total_revenue":    "Sales",
    "total revenue":    "Sales",
    "totalrevenue":     "Sales",
    "amount":           "Sales",
    "total_amount":     "Sales",
    "total amount":     "Sales",
    "total":            "Sales",
    "price":            "Sales",
    "total_price":      "Sales",
    "value":            "Sales",
    "deal_value":       "Sales",
    "order_total":      "Sales",

    # ── Quantity aliases ──────────────────────────────────────────────────
    "quantity":         "Quantity",
    "qty":              "Quantity",
    "units":            "Quantity",
    "count":            "Quantity",
    "items":            "Quantity",
    "units_sold":       "Quantity",
    "quantity_sold":    "Quantity",
    "order_quantity":   "Quantity",

    # ── Discount aliases ──────────────────────────────────────────────────
    "discount":         "Discount",
    "discount_rate":    "Discount",
    "discountrate":     "Discount",
    "discount rate":    "Discount",
    "discount_pct":     "Discount",
    "discount_percent": "Discount",
    "disc":             "Discount",

    # ── Profit aliases (optional column) ──────────────────────────────────
    "profit":           "Profit",
    "net_profit":       "Profit",
    "net profit":       "Profit",
    "margin":           "Profit",
    "gross_profit":     "Profit",
    "gross profit":     "Profit",

    # ── Industry aliases (optional column) ────────────────────────────────
    "industry":         "Industry",
    "sector":           "Industry",
    "vertical":         "Industry",
    "business_type":    "Industry",
    "business type":    "Industry",
}
"""
Maps common CSV header variants (lowercased) to canonical Predicto column
names.  This lets users upload CSVs from Shopify, Stripe, HubSpot, Salesforce,
or any export without manual column renaming.

Lookup is case-insensitive: raw headers are lowercased + stripped before
matching against this dict.
"""

# Columns that must be numeric for ML (derived from registry)
_NUMERIC_COLUMNS: list[str] = _NUMERIC_REGISTRY_COLS

# Columns whose nulls are fatal (row must be dropped)
_CRITICAL_COLUMNS: list[str] = _CRITICAL_REGISTRY_COLS


# ──────────────────────────────────────────────────────────────────────────────
# Internal column-name constants (used throughout the module)
# ──────────────────────────────────────────────────────────────────────────────

_DATE_COLUMN = "Order Date"
_DATE_KEY_COLUMN = "Date Key"
_SALES_COLUMN = "Sales"
_QUANTITY_COLUMN = "Quantity"
_PROFIT_COLUMN = "Profit"
_DISCOUNT_COLUMN = "Discount"
_SEGMENT_COLUMN = "Segment"

# Margin_Rate clipping bounds — prevents infinite values from near-zero Sales
_MARGIN_CLIP_MIN: float = -1.0
_MARGIN_CLIP_MAX: float = 1.0

# Discount threshold for the high_discount_flag feature
_HIGH_DISCOUNT_THRESHOLD: float = 0.3


# ──────────────────────────────────────────────────────────────────────────────
# Result dataclass returned to the API / caller
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class IngestionResult:
    """Structured summary returned after a successful ingestion run."""

    status: str                          # "success" | "error"
    rows_loaded: int = 0                 # rows in cleaned raw_df
    rows_dropped: int = 0                # rows removed during cleaning
    monthly_periods: int = 0             # rows in monthly_df
    segments_detected: list[str] = field(default_factory=list)
    cache_key: str = ""                  # "sha256:<hex>" of source bytes
    warnings: list[str] = field(default_factory=list)
    validation_errors: list[str] = field(default_factory=list)
    detail: str = ""                     # populated only on error


# ──────────────────────────────────────────────────────────────────────────────
# Custom exception
# ──────────────────────────────────────────────────────────────────────────────

class IngestionValidationError(ValueError):
    """
    Raised when the CSV fails schema or data-quality validation.

    The API layer catches this and translates it into HTTP 400 Bad Request
    with the exception message as the error detail.
    """


# ──────────────────────────────────────────────────────────────────────────────
# Public entry point
# ──────────────────────────────────────────────────────────────────────────────

def ingest(
    source: Union[str, Path, bytes, io.IOBase],
) -> IngestionResult:
    """
    Load, validate, clean, engineer, and cache the SaaS-Sales dataset.

    Parameters
    ----------
    source:
        - ``str`` or ``Path`` — local file path to the CSV.
        - ``bytes``           — raw CSV bytes (e.g. from an HTTP upload).
        - ``io.IOBase``       — any file-like object (SpooledTemporaryFile, etc.).

    Returns
    -------
    IngestionResult
        Summary of the ingestion run.  On error, ``status == "error"`` and
        ``detail`` contains a human-readable explanation; no exception is
        re-raised so the API layer can translate it into the appropriate HTTP
        response.

    Raises
    ------
    Does **not** raise — all exceptions are caught internally and reflected in
    ``IngestionResult.status / .detail``.  The only exception to this rule is
    a raw ``TypeError`` on an unsupported ``source`` type, which is raised
    immediately before any I/O occurs.
    """

    # ── 0. Resolve source to (raw_bytes, label) ───────────────────────────────
    raw_bytes, source_label = _resolve_source(source)  # may raise TypeError

    logger.info("Ingestion started — source: %s  size: %d bytes", source_label, len(raw_bytes))

    try:
        # ── 1. Compute file hash (cache key) ──────────────────────────────────
        file_hash = _compute_hash(raw_bytes)
        cache_key = f"sha256:{file_hash}"
        logger.debug("File hash: %s", cache_key)

        # ── 2. Parse CSV (auto-detect delimiter) ──────────────────────────────
        raw_df = _parse_csv(raw_bytes)
        logger.info("CSV parsed — shape: %s", raw_df.shape)

        # ── 2b. Normalize column names (smart alias mapping) ──────────────────
        raw_df, rename_warnings = _normalize_columns(raw_df)

        # ── 3. Universal Schema Enforcement (impute + coerce + clean) ────────
        raw_df, warnings = _enforce_ml_schema(raw_df)
        warnings.extend(rename_warnings)

        # ── 4. Type enforcement + logical constraints + date parsing ──────────
        raw_df, rows_before, rows_after, validation_errors = _validate_and_clean(raw_df)
        rows_dropped = rows_before - rows_after

        if rows_after == 0:
            raise IngestionValidationError(
                "All rows were removed during validation. "
                "The CSV contains no valid data after applying type enforcement "
                "and logical constraints (Sales > 0, Quantity > 0, 0 ≤ Discount ≤ 1)."
            )

        logger.info(
            "Validation & cleaning complete — kept %d rows, dropped %d rows, %d validation issue(s)",
            rows_after, rows_dropped, len(validation_errors),
        )

        # ── 5. Feature engineering ─────────────────────────────────────────────
        raw_df = _engineer_features(raw_df)
        logger.info("Feature engineering complete — columns: %s", list(raw_df.columns))

        # ── 6. Monthly aggregation (Prophet feed) ──────────────────────────────
        monthly_df = _build_monthly_df(raw_df)
        logger.info("Monthly aggregation complete — shape: %s", monthly_df.shape)

        # ── 7. Hydrate cache ───────────────────────────────────────────────────
        predicto_cache.set_data(
            raw_df=raw_df,
            monthly_df=monthly_df,
            file_hash=file_hash,
        )
        logger.info("Cache hydrated — key: %s", cache_key)

        segments = sorted(raw_df[_SEGMENT_COLUMN].dropna().unique().tolist())

        return IngestionResult(
            status="success",
            rows_loaded=rows_after,
            rows_dropped=rows_dropped,
            monthly_periods=len(monthly_df),
            segments_detected=segments,
            cache_key=cache_key,
            warnings=warnings,
            validation_errors=validation_errors,
        )

    except IngestionValidationError as exc:
        logger.error("Validation failed: %s", exc)
        return IngestionResult(status="error", detail=str(exc))

    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error during ingestion: %s", exc)
        return IngestionResult(
            status="error",
            detail=f"Unexpected ingestion error: {type(exc).__name__}: {exc}",
        )


# ──────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ──────────────────────────────────────────────────────────────────────────────

def _resolve_source(
    source: Union[str, Path, bytes, io.IOBase],
) -> tuple[bytes, str]:
    """
    Normalise *source* into ``(raw_bytes, label)`` regardless of input type.

    Parameters
    ----------
    source:
        File path, raw bytes, or file-like object.

    Returns
    -------
    tuple[bytes, str]
        The raw file bytes and a human-readable source label for logging.

    Raises
    ------
    TypeError
        If *source* is not one of the supported types.
    FileNotFoundError
        If a path is given but does not exist on disk.
    """

    if isinstance(source, (str, Path)):
        path = Path(source)
        if not path.exists():
            raise FileNotFoundError(f"CSV file not found: {path}")
        raw_bytes = path.read_bytes()
        return raw_bytes, str(path)

    if isinstance(source, bytes):
        return source, "<bytes upload>"

    if isinstance(source, io.IOBase):
        raw_bytes = source.read()
        if isinstance(raw_bytes, str):
            raw_bytes = raw_bytes.encode("utf-8")
        return raw_bytes, "<file-like upload>"

    raise TypeError(
        f"Unsupported source type: {type(source).__name__}. "
        "Expected str, Path, bytes, or file-like object."
    )


def _compute_hash(raw_bytes: bytes) -> str:
    """Return the SHA-256 hex digest of *raw_bytes*."""
    return hashlib.sha256(raw_bytes).hexdigest()


def _parse_csv(raw_bytes: bytes) -> pd.DataFrame:
    """
    Parse *raw_bytes* into a DataFrame with automatic delimiter detection.

    Uses ``sep=None`` with the Python engine so pandas' built-in sniffer
    detects commas, semicolons, tabs, pipes, etc.  Falls back to latin-1
    if UTF-8 decoding fails.

    Raises ``IngestionValidationError`` on parse failure.
    """
    for encoding in ("utf-8", "latin-1"):
        try:
            df = pd.read_csv(
                io.BytesIO(raw_bytes),
                sep=None,           # ← auto-detect delimiter
                engine="python",    # ← required for sep=None
                encoding=encoding,
            )
            logger.info(
                "CSV decoded — encoding=%s  delimiter=auto  columns=%d  rows=%d",
                encoding, len(df.columns), len(df),
            )
            return df
        except UnicodeDecodeError:
            logger.debug("Encoding %s failed, trying next", encoding)
        except Exception as exc:  # noqa: BLE001
            raise IngestionValidationError(f"Failed to parse CSV: {exc}") from exc

    raise IngestionValidationError(
        "Could not decode CSV with UTF-8 or latin-1 encoding."
    )


# ──────────────────────────────────────────────────────────────────────────────
# § Step 0b: Column Normalization — smart rename via COLUMN_ALIASES
# ──────────────────────────────────────────────────────────────────────────────

def _normalize_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """
    Rename CSV columns using the COLUMN_ALIASES mapping.

    Process
    -------
    1. Strip whitespace from all column names.
    2. For each column, look up its lowercased form in COLUMN_ALIASES.
    3. If a match is found and the canonical name isn't already present,
       rename the column.
    4. Log every rename for full transparency.

    Parameters
    ----------
    df:
        Freshly parsed DataFrame (before schema validation).

    Returns
    -------
    tuple[pd.DataFrame, list[str]]
        (renamed_df, warnings) — warnings describe each rename that occurred.
    """
    df = df.copy()
    warnings: list[str] = []

    # Step 1: Strip whitespace from headers
    df.columns = df.columns.str.strip()

    # Step 2: Build the rename map
    rename_map: dict[str, str] = {}
    canonical_present = set(df.columns.tolist())  # track what's already there

    for col in df.columns:
        col_lower = col.lower().strip()

        # Skip if this column already has a canonical name
        if col in REQUIRED_COLUMNS or col in ("Profit", "Industry"):
            continue

        if col_lower in COLUMN_ALIASES:
            target = COLUMN_ALIASES[col_lower]

            # Don't rename if the canonical column already exists
            if target not in canonical_present and target not in rename_map.values():
                rename_map[col] = target
                canonical_present.add(target)

    # Step 3: Apply renames
    if rename_map:
        df = df.rename(columns=rename_map)
        for original, canonical in rename_map.items():
            msg = f"Column auto-mapped: '{original}' → '{canonical}'"
            logger.info(msg)
            warnings.append(msg)

        logger.info(
            "Column normalization complete — %d column(s) renamed: %s",
            len(rename_map),
            {k: v for k, v in rename_map.items()},
        )
    else:
        logger.debug("Column normalization — no renames needed.")

    return df, warnings


# ──────────────────────────────────────────────────────────────────────────────
# § Step 1: Universal Schema Enforcer — zero-crash column guarantee
# ──────────────────────────────────────────────────────────────────────────────

def _enforce_ml_schema(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """
    Universal Schema Enforcer — guarantees that **every** column listed in
    ``ML_FEATURE_REGISTRY`` exists, has the correct type, and contains no
    NaN values in categorical fields before data reaches the ML pipelines.

    Pipeline
    --------
    A. **Critical-column gate** — hard-fail if Order Date / Sales / Quantity
       are entirely absent (cannot be synthesized).
    B. **Impute missing columns** — auto-generate from registry defaults.
    C. **Aggressive numeric coercion** — strip currency symbols, commas,
       whitespace, and percent signs from numeric fields before casting.
    D. **Categorical NaN fill** — replace NaN in string columns with the
       registry default so LabelEncoder never sees NaN.
    E. **Profit NaN guard** — ensure Profit column exists and is filled.

    Parameters
    ----------
    df:
        Freshly parsed, column-normalized DataFrame.

    Returns
    -------
    tuple[pd.DataFrame, list[str]]
        (enforced_df, warnings)

    Raises
    ------
    IngestionValidationError
        If a critical column is missing and cannot be auto-generated.
    """
    df = df.copy()
    actual_cols = set(df.columns.tolist())
    warnings: list[str] = []
    synthesized_count = 0

    # ── A. Critical-column gate ───────────────────────────────────────────
    for col, meta in ML_FEATURE_REGISTRY.items():
        if meta["critical"] and col not in actual_cols:
            raise IngestionValidationError(
                f"Missing required column: '{col}'. "
                f"This column is critical and cannot be auto-generated. "
                f"Present columns: {sorted(actual_cols)}"
            )

    # ── B. Impute missing columns from registry defaults ──────────────────
    for col, meta in ML_FEATURE_REGISTRY.items():
        if col not in actual_cols:
            default = meta["default"]
            if callable(default):
                df[col] = [default(df, i) for i in range(1, len(df) + 1)]
                default_desc = "sequential IDs" if col == "Order ID" else "callable"
            else:
                df[col] = default
                default_desc = repr(default)

            synthesized_count += 1
            msg = f"Auto-generated missing column: '{col}' (default: {default_desc})"
            logger.warning(msg)
            warnings.append(msg)

    # ── C. Aggressive numeric coercion ────────────────────────────────────
    #    Strips $, €, £, commas, whitespace, % from numeric fields before
    #    pd.to_numeric so "$1,234.56" and "50%" parse correctly.
    for col in _NUMERIC_REGISTRY_COLS:
        if col in df.columns and df[col].dtype == object:
            df[col] = (
                df[col]
                .astype(str)
                .str.replace(r'[^\d.\-]', '', regex=True)
            )
            logger.debug("Stripped non-numeric chars from '%s'.", col)

        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(
                ML_FEATURE_REGISTRY[col]["default"]
            )

    # ── D. Categorical NaN fill ───────────────────────────────────────────
    for col in _CATEGORICAL_REGISTRY_COLS:
        if col in df.columns:
            default = ML_FEATURE_REGISTRY[col]["default"]
            if not callable(default):
                nan_count = int(df[col].isna().sum())
                if nan_count > 0:
                    df[col] = df[col].fillna(default)
                    logger.info(
                        "Filled %d NaN(s) in '%s' with '%s'.",
                        nan_count, col, default,
                    )
                    warnings.append(
                        f"Filled {nan_count} null value(s) in '{col}' with '{default}'."
                    )

    # ── E. Profit column NaN guard ────────────────────────────────────────
    if _PROFIT_COLUMN in df.columns:
        profit_nan = int(df[_PROFIT_COLUMN].isna().sum())
        if profit_nan > 0:
            df[_PROFIT_COLUMN] = df[_PROFIT_COLUMN].fillna(0.0)
            logger.info("Filled %d NaN(s) in Profit with 0.0.", profit_nan)
        if df[_PROFIT_COLUMN].eq(0.0).all():
            msg = (
                f"Column '{_PROFIT_COLUMN}' is entirely zero — "
                "Margin_Rate will be 0.0 for all rows."
            )
            logger.warning(msg)
            warnings.append(msg)

    logger.info(
        "Schema enforcement complete — %d/%d columns present "
        "(%d synthesized, %d numeric coerced, %d categorical filled)",
        len([c for c in ML_FEATURE_REGISTRY if c in df.columns]),
        len(ML_FEATURE_REGISTRY),
        synthesized_count,
        len(_NUMERIC_REGISTRY_COLS),
        len(_CATEGORICAL_REGISTRY_COLS),
    )

    return df, warnings


# ──────────────────────────────────────────────────────────────────────────────
# § Steps 2-4: Type Enforcement, Logical Constraints, Date Parsing
# ──────────────────────────────────────────────────────────────────────────────

def _validate_and_clean(df: pd.DataFrame) -> tuple[pd.DataFrame, int, int, list[str]]:
    """
    Enforce strict data quality rules on every row.

    Steps
    -----
    Step 2 — Type Enforcement:
        Force 'Sales', 'Quantity', 'Discount' to numeric.
        Rows that cannot be converted are dropped.

    Step 3 — Logical Constraints:
        - Sales must be > 0
        - Quantity must be > 0
        - Discount must be between 0 and 1 (inclusive)
        Rows that violate these constraints are dropped with logged detail.

    Step 4 — Date Parsing:
        'Order Date' must parse to a valid datetime. Unparseable rows are dropped.

    Parameters
    ----------
    df:
        DataFrame that has already passed schema validation.

    Returns
    -------
    tuple[pd.DataFrame, int, int, list[str]]
        (cleaned_df, rows_before, rows_after, validation_errors)
        validation_errors is a list of human-readable issue descriptions.
    """
    df = df.copy()
    rows_before = len(df)
    validation_errors: list[str] = []

    # ── Step 2: Type Enforcement (post-schema, catches remaining edge cases) ──
    #    The heavy lifting (currency stripping, coercion) was done in
    #    _enforce_ml_schema.  This step catches any residual NaN rows and
    #    drops them cleanly.

    critical_numeric = ["Sales", "Quantity", "Discount"]
    for col in critical_numeric:
        if col not in df.columns:
            continue

        original_non_null = df[col].notna().sum()
        df[col] = pd.to_numeric(df[col], errors="coerce")
        coercion_failures = original_non_null - df[col].notna().sum()

        if coercion_failures > 0:
            msg = (
                f"Type enforcement: {coercion_failures} row(s) had non-numeric "
                f"values in '{col}' and were marked for removal."
            )
            logger.warning(msg)
            validation_errors.append(msg)

    # Coerce Profit if present (not required, but used for Margin_Rate)
    if _PROFIT_COLUMN in df.columns:
        df[_PROFIT_COLUMN] = pd.to_numeric(df[_PROFIT_COLUMN], errors="coerce").fillna(0.0)

    # Drop rows where critical numeric columns are still NaN after coercion
    pre_type_drop = len(df)
    numeric_present = [c for c in critical_numeric if c in df.columns]
    df = df.dropna(subset=numeric_present)
    type_dropped = pre_type_drop - len(df)
    if type_dropped > 0:
        msg = f"Dropped {type_dropped} row(s) with non-numeric values in {numeric_present}."
        logger.info(msg)
        validation_errors.append(msg)

    # ── Step 4: Date Parsing ──────────────────────────────────────────────────
    # (Done before logical constraints so we drop bad dates early)

    logger.debug("Parsing '%s' column …", _DATE_COLUMN)

    # Try multiple date formats for flexibility
    df[_DATE_COLUMN] = pd.to_datetime(
        df[_DATE_COLUMN],
        format="mixed",
        dayfirst=False,
        errors="coerce",
    )

    nat_count = int(df[_DATE_COLUMN].isna().sum())
    if nat_count > 0:
        msg = (
            f"Date parsing: {nat_count} row(s) had unparseable 'Order Date' "
            f"values and will be dropped."
        )
        logger.warning(msg)
        validation_errors.append(msg)

    # Drop rows with invalid dates
    pre_date_drop = len(df)
    df = df.dropna(subset=[_DATE_COLUMN])
    date_dropped = pre_date_drop - len(df)
    if date_dropped > 0:
        logger.info("Dropped %d row(s) with invalid Order Date.", date_dropped)

    # ── Step 3: Logical Constraints ───────────────────────────────────────────

    pre_constraint_count = len(df)

    # Constraint 1: Sales > 0
    if _SALES_COLUMN in df.columns:
        invalid_sales = df[df[_SALES_COLUMN] <= 0]
        if len(invalid_sales) > 0:
            # Log up to 5 specific violation details for debugging
            sample_rows = invalid_sales.head(5)
            details = []
            for idx, row in sample_rows.iterrows():
                details.append(
                    f"Row {idx}: Sales={row[_SALES_COLUMN]}"
                )
            sample_str = "; ".join(details)
            suffix = f" (and {len(invalid_sales) - 5} more)" if len(invalid_sales) > 5 else ""

            msg = (
                f"Logical constraint: {len(invalid_sales)} row(s) have "
                f"Sales ≤ 0 and will be removed. Examples: {sample_str}{suffix}"
            )
            logger.warning(msg)
            validation_errors.append(msg)

            df = df[df[_SALES_COLUMN] > 0]

    # Constraint 2: Quantity > 0
    if _QUANTITY_COLUMN in df.columns:
        invalid_qty = df[df[_QUANTITY_COLUMN] <= 0]
        if len(invalid_qty) > 0:
            sample_rows = invalid_qty.head(5)
            details = []
            for idx, row in sample_rows.iterrows():
                details.append(
                    f"Row {idx}: Quantity={row[_QUANTITY_COLUMN]}"
                )
            sample_str = "; ".join(details)
            suffix = f" (and {len(invalid_qty) - 5} more)" if len(invalid_qty) > 5 else ""

            msg = (
                f"Logical constraint: {len(invalid_qty)} row(s) have "
                f"Quantity ≤ 0 and will be removed. Examples: {sample_str}{suffix}"
            )
            logger.warning(msg)
            validation_errors.append(msg)

            df = df[df[_QUANTITY_COLUMN] > 0]

    # Constraint 3: 0 ≤ Discount ≤ 1
    if _DISCOUNT_COLUMN in df.columns:
        invalid_discount = df[
            (df[_DISCOUNT_COLUMN] < 0) | (df[_DISCOUNT_COLUMN] > 1)
        ]
        if len(invalid_discount) > 0:
            sample_rows = invalid_discount.head(5)
            details = []
            for idx, row in sample_rows.iterrows():
                details.append(
                    f"Row {idx}: Discount={row[_DISCOUNT_COLUMN]}"
                )
            sample_str = "; ".join(details)
            suffix = f" (and {len(invalid_discount) - 5} more)" if len(invalid_discount) > 5 else ""

            msg = (
                f"Logical constraint: {len(invalid_discount)} row(s) have "
                f"Discount outside [0, 1] and will be removed. "
                f"Examples: {sample_str}{suffix}"
            )
            logger.warning(msg)
            validation_errors.append(msg)

            df = df[
                (df[_DISCOUNT_COLUMN] >= 0) & (df[_DISCOUNT_COLUMN] <= 1)
            ]

    constraint_dropped = pre_constraint_count - len(df)
    if constraint_dropped > 0:
        logger.info(
            "Logical constraints removed %d total row(s).", constraint_dropped
        )

    # ── Post-validation cleanup ───────────────────────────────────────────────
    #    At this point _enforce_ml_schema has already filled most NaNs.
    #    These are final safety nets.

    # Fill any residual null Discount with 0.0
    if _DISCOUNT_COLUMN in df.columns:
        df[_DISCOUNT_COLUMN] = df[_DISCOUNT_COLUMN].fillna(0.0)

    # Guarantee Profit exists and is numeric with no NaN
    if _PROFIT_COLUMN in df.columns:
        df[_PROFIT_COLUMN] = pd.to_numeric(df[_PROFIT_COLUMN], errors="coerce").fillna(0.0)
    else:
        df[_PROFIT_COLUMN] = 0.0
        logger.info("Created '%s' column with default 0.0.", _PROFIT_COLUMN)

    # Guarantee Industry exists (margin engine categorical)
    if "Industry" not in df.columns:
        df["Industry"] = "Unknown"

    # Fill NaN in all categorical columns one final time
    for col in _CATEGORICAL_REGISTRY_COLS:
        if col in df.columns:
            df[col] = df[col].fillna(ML_FEATURE_REGISTRY[col]["default"] if not callable(ML_FEATURE_REGISTRY[col]["default"]) else "Unknown")

    # Cast Date Key to nullable int if present
    if _DATE_KEY_COLUMN in df.columns:
        df[_DATE_KEY_COLUMN] = pd.to_numeric(
            df[_DATE_KEY_COLUMN], errors="coerce"
        ).astype("Int64")
        logger.debug("'%s' cast to nullable Int64.", _DATE_KEY_COLUMN)

    rows_after = len(df)

    # Emit a summary of all validation issues
    if validation_errors:
        logger.warning(
            "Data quality report: %d issue(s) detected during validation:\n  • %s",
            len(validation_errors),
            "\n  • ".join(validation_errors),
        )

    return df.reset_index(drop=True), rows_before, rows_after, validation_errors


# ──────────────────────────────────────────────────────────────────────────────
# Feature engineering
# ──────────────────────────────────────────────────────────────────────────────

def _engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add model-ready feature columns in-place (copy returned).

    New columns
    -----------
    ``Margin_Rate``
        ``(Profit / Sales).clip(-1.0, 1.0)``
        Rows where Sales == 0 produce NaN (safe for XGBoost; Prophet uses sums).
    ``high_discount_flag``
        Boolean: ``Discount > 0.3``.

    Parameters
    ----------
    df:
        Cleaned transaction DataFrame (output of ``_validate_and_clean``).

    Returns
    -------
    pd.DataFrame
        DataFrame with two additional feature columns.
    """
    df = df.copy()

    # ── Margin_Rate ────────────────────────────────────────────────────────────
    with_zero_sales = (df[_SALES_COLUMN] == 0).sum()
    if with_zero_sales:
        logger.warning(
            "%d row(s) have Sales == 0; Margin_Rate will be NaN for those rows.",
            with_zero_sales,
        )

    df["Margin_Rate"] = (df[_PROFIT_COLUMN] / df[_SALES_COLUMN]).clip(
        lower=_MARGIN_CLIP_MIN,
        upper=_MARGIN_CLIP_MAX,
    )
    logger.debug(
        "Margin_Rate engineered — min: %.4f  mean: %.4f  max: %.4f",
        df["Margin_Rate"].min(),
        df["Margin_Rate"].mean(),
        df["Margin_Rate"].max(),
    )

    # ── high_discount_flag ─────────────────────────────────────────────────────
    df["high_discount_flag"] = df[_DISCOUNT_COLUMN] > _HIGH_DISCOUNT_THRESHOLD
    high_count = df["high_discount_flag"].sum()
    logger.debug(
        "high_discount_flag engineered — %d row(s) (%.1f%%) exceed threshold %.0f%%.",
        high_count,
        100 * high_count / max(len(df), 1),
        _HIGH_DISCOUNT_THRESHOLD * 100,
    )

    return df


# ──────────────────────────────────────────────────────────────────────────────
# Monthly aggregation
# ──────────────────────────────────────────────────────────────────────────────

def _build_monthly_df(raw_df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate the transaction DataFrame to monthly granularity by Segment.

    This DataFrame is the sole input to Pillar 1 (Prophet).  Keeping it
    separate from ``raw_df`` avoids re-aggregating on every forecast request.

    Aggregation logic
    -----------------
    - Period key: ``Order Date`` floored to month → ``period`` (Period[M]).
    - Group keys: ``period`` + ``Segment``.
    - ``Sales``  → sum.
    - ``Profit`` → sum.
    - ``Margin_Rate`` → mean (approximation; weighted mean requires extra join).

    Parameters
    ----------
    raw_df:
        Cleaned, feature-engineered transaction DataFrame.

    Returns
    -------
    pd.DataFrame
        Monthly summary with columns:
        ``period``, ``Segment``, ``Sales``, ``Profit``, ``Margin_Rate``.
    """
    df = raw_df.copy()

    # Create month period key
    df["period"] = df[_DATE_COLUMN].dt.to_period("M")

    agg_cols: dict[str, str | pd.NamedAgg] = {
        _SALES_COLUMN: "sum",
        _PROFIT_COLUMN: "sum",
        "Margin_Rate": "mean",
    }

    group_keys = ["period", _SEGMENT_COLUMN]

    monthly = (
        df.groupby(group_keys, observed=True)
        .agg(agg_cols)
        .reset_index()
    )

    # Ensure period is Period[M] dtype (survives groupby in older pandas versions)
    if not hasattr(monthly["period"].dtype, "freq"):
        monthly["period"] = monthly["period"].dt.to_period("M")

    monthly = monthly.sort_values(["period", _SEGMENT_COLUMN]).reset_index(drop=True)

    logger.debug(
        "Monthly DataFrame — %d rows, date range: %s → %s",
        len(monthly),
        monthly["period"].min(),
        monthly["period"].max(),
    )

    return monthly
