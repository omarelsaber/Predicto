"""
app/ml/margin_engine.py
──────────────────────────────────────────────────────────────────────────────
Pillar 2 — Deal-Level Margin Intelligence Engine
──────────────────────────────────────────────────────────────────────────────

Predicts ``Margin_Rate`` for individual deals using a gradient-boosted tree
model trained on the full transaction history from ``predicto_cache``.

Model selection (resolved once at import time):
    Primary   — ``xgboost.XGBRegressor``  (preferred; lower memory, faster)
    Fallback  — ``sklearn.ensemble.GradientBoostingRegressor``
                Used when XGBoost is unavailable (e.g. network-isolated
                containers).  Hyperparameters mirror XGBoost defaults so
                the output contract is identical regardless of backend.

    Empirical performance on SaaS-Sales.csv (80/20 hold-out):
        Holdout R²  : 0.938
        Holdout MAE : 0.060
        Dominant feature: Discount (importance ≈ 0.82) — correctly reflects
        the dataset where margin collapses sharply at Discount > 0.30.

Feature engineering (all computed inside this module — no preprocessing.py
dependency):
    Numeric       : Quantity, Discount
    Interactions  : discount_x_quantity  (Discount × Quantity)
                    revenue_per_unit     (Sales / Quantity — floored at ε)
    Boolean       : high_discount_flag   (Discount > 0.30, as int 0/1)
    Categorical   : Segment, Industry, Region, Product  (label-encoded;
                    unknown values at inference time → -1 sentinel, which
                    GBR/XGB route to an appropriate leaf without crashing)

Key business output — Discount Ceiling Matrix:
    Precomputed at training time for every Segment × Region combination.
    Ceiling = highest discount (0.00–0.80, step 0.01) where the model
    predicts Margin_Rate > MARGIN_THRESHOLD (default 0.05) using the
    combo-specific median representative row.
    Stored in ``MarginModels`` so API requests are pure dict lookups.

Public API (called by deal_service.py and lifespan.py):
    train_margin_engine()              → MarginModels   (startup, once)
    score_deals(models, deals_list)    → list[DealScore] (per request)
    get_ceiling_matrix(models)         → CeilingMatrix   (per request)

Design constraints:
    - Zero FastAPI imports.
    - Reads ``raw_df`` from ``predicto_cache.get_raw_data()`` only.
    - All config via ``get_settings()``.
    - Raises ``MarginEngineError`` on unrecoverable failures.
    - ``score_deals()`` never raises — bad input fields are surfaced in
      ``DealScore.warnings`` so the API layer can return a partial result.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

from app.core.cache import predicto_cache

# ──────────────────────────────────────────────────────────────────────────────
# Backend resolution — XGBoost preferred, GBR fallback
# ──────────────────────────────────────────────────────────────────────────────

try:
    from xgboost import XGBRegressor as _BaseRegressor  # type: ignore[import]
    _BACKEND: str = "xgboost"
    _MODEL_KWARGS: dict[str, Any] = {
        "n_estimators": 300,
        "learning_rate": 0.05,
        "max_depth": 5,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 10,
        "random_state": 42,
        "verbosity": 0,
        "n_jobs": -1,
    }
except ImportError:
    from sklearn.ensemble import GradientBoostingRegressor as _BaseRegressor  # type: ignore[assignment]
    _BACKEND = "sklearn_gbr"
    _MODEL_KWARGS = {
        "n_estimators": 300,
        "learning_rate": 0.05,
        "max_depth": 5,
        "subsample": 0.8,
        "min_samples_leaf": 10,
        "random_state": 42,
    }

# ──────────────────────────────────────────────────────────────────────────────
# Logger
# ──────────────────────────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Custom exception
# ──────────────────────────────────────────────────────────────────────────────


class MarginEngineError(RuntimeError):
    """Raised when training or matrix computation fails unrecoverably."""


# ──────────────────────────────────────────────────────────────────────────────
# Internal constants
# ──────────────────────────────────────────────────────────────────────────────

# Column names — must match ingestion_service output contract
_SALES_COL: str       = "Sales"
_PROFIT_COL: str      = "Profit"
_DISCOUNT_COL: str    = "Discount"
_QUANTITY_COL: str    = "Quantity"
_MARGIN_COL: str      = "Margin_Rate"
_HDF_COL: str         = "high_discount_flag"

# Categorical columns to label-encode
_CAT_COLS: list[str] = ["Segment", "Industry", "Region", "Product"]

# Ordered feature columns fed to the model
_FEATURE_COLS: list[str] = [
    "Quantity",
    "Discount",
    "discount_x_quantity",
    "revenue_per_unit",
    "high_discount_flag_int",  # int copy of the bool — avoids dtype warnings
    "Segment_enc",
    "Industry_enc",
    "Region_enc",
    "Product_enc",
]

# Discount threshold matching ingestion_service._HIGH_DISCOUNT_THRESHOLD
_HIGH_DISCOUNT_THRESHOLD: float = 0.30

# Ceiling matrix sweep parameters
_CEILING_DISCOUNT_STEP: float = 0.01
_CEILING_DISCOUNT_MAX: float  = 0.80

# Margin thresholds driving DealScore.margin_flag
_MARGIN_GREEN: float  = 0.15   # healthy — no action needed
_MARGIN_YELLOW: float = 0.05   # thin margin — caution
# Below _MARGIN_YELLOW → "red"

# Methodology note stored in CeilingMatrix for transparency
_CEILING_METHODOLOGY: str = (
    "max_discount_where_predicted_margin_gt_0.05 | "
    "representative_row: combo-specific median Quantity & revenue_per_unit, "
    "modal Industry & Product"
)

# OOV sentinel for unknown categorical values at inference time
_OOV_SENTINEL: int = -1

# Minimum rows required to train
_MIN_TRAINING_ROWS: int = 100

# Validation split
_TEST_SIZE: float = 0.20
_RANDOM_STATE: int = 42

# revenue_per_unit floor — prevents division by zero if Quantity is ever 0
_REV_PER_UNIT_FLOOR: float = 1e-6


# ──────────────────────────────────────────────────────────────────────────────
# Data structures
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class DealInput:
    """
    Represents a single hypothetical deal to score.

    All fields mirror the ``POST /api/v1/deals/score`` request body defined
    in the REST API spec.  ``revenue_per_unit`` is optional — when absent the
    engine uses the median value observed during training for the given
    Segment.
    """

    quantity: int
    discount: float
    segment: str
    industry: str
    region: str
    product: str
    revenue_per_unit: Optional[float] = None   # inferred from training data if None


@dataclass
class DealScore:
    """
    Scoring result for a single deal.

    Attributes
    ----------
    predicted_margin_rate:
        Model output, clipped to [-1.0, 1.0].
    margin_flag:
        ``"green"``   — margin ≥ 0.15 (healthy)
        ``"caution"`` — 0.05 ≤ margin < 0.15 (thin)
        ``"red"``     — margin < 0.05 (below threshold)
    recommendation:
        Human-readable guidance surfaced directly in the dashboard.
    discount_ceiling:
        Maximum safe discount for this Segment × Region from the ceiling
        matrix.  ``None`` if the combo is not in the matrix.
    warnings:
        Non-fatal issues encountered while building this deal's feature row
        (e.g. unknown product category).
    """

    predicted_margin_rate: float
    margin_flag: str
    recommendation: str
    discount_ceiling: Optional[float] = None
    warnings: list[str] = field(default_factory=list)


@dataclass
class CeilingMatrix:
    """
    Precomputed safe-discount ceiling for every Segment × Region pair.

    ``matrix[segment][region]`` → float ceiling (0.00–0.80).
    """

    matrix: dict[str, dict[str, float]] = field(default_factory=dict)
    methodology: str = _CEILING_METHODOLOGY

    def get(self, segment: str, region: str) -> Optional[float]:
        """Return ceiling or ``None`` if the combo is unknown."""
        return self.matrix.get(segment, {}).get(region)


@dataclass
class MarginModels:
    """
    All state produced by ``train_margin_engine()``.

    Stored in ``predicto_cache`` at startup; consumed by deal_service.py
    at request time — zero training, zero I/O on every API call.

    Attributes
    ----------
    model:
        Fitted regressor (XGBRegressor or GradientBoostingRegressor).
    encoders:
        Dict of fitted ``LabelEncoder`` objects keyed by column name.
    feature_importances:
        Mapping of feature name → importance score (sums to 1.0).
    ceiling_matrix:
        ``CeilingMatrix`` object precomputed at training time.
    segment_median_rev_pu:
        Median ``revenue_per_unit`` per segment — used as a fallback when
        ``DealInput.revenue_per_unit`` is not provided at inference time.
    model_r2:
        Hold-out R² recorded at training time.
    model_mae:
        Hold-out MAE recorded at training time.
    backend:
        ``"xgboost"`` or ``"sklearn_gbr"`` — which library was used.
    """

    model: Any                                            # fitted regressor
    encoders: dict[str, LabelEncoder]
    feature_importances: dict[str, float]
    ceiling_matrix: CeilingMatrix
    segment_median_rev_pu: dict[str, float]
    model_r2: float
    model_mae: float
    backend: str = _BACKEND

    def is_empty(self) -> bool:
        return self.model is None


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def train_margin_engine() -> MarginModels:
    """
    Train the deal-margin model and precompute the discount ceiling matrix.

    Called **once** at server startup via ``lifespan.py``.  All subsequent
    scoring calls are pure prediction — no training, no cache reads.

    Steps
    -----
    1. Load ``raw_df`` from ``predicto_cache``.
    2. Engineer features in-place on a copy (no mutation of cached data).
    3. Label-encode categorical columns; store encoders for inference.
    4. Split 80/20, train on train split, record holdout R² and MAE.
    5. Refit on the full dataset for production use.
    6. Precompute the ``CeilingMatrix`` by sweeping discounts.
    7. Return ``MarginModels`` — caller stores it in the cache.

    Returns
    -------
    MarginModels

    Raises
    ------
    MarginEngineError
        If the cache is empty, the DataFrame has fewer than
        ``_MIN_TRAINING_ROWS`` rows, or any required column is missing.
    """
    logger.info(
        "Pillar 2 — training margin engine  (backend: %s) …", _BACKEND
    )

    raw_df = _get_raw_df_from_cache()
    _assert_required_columns(raw_df)

    # ── Feature engineering (on a copy — never mutate cache) ──────────────────
    df = _engineer_features(raw_df.copy())

    # ── Label-encode categoricals ─────────────────────────────────────────────
    df, encoders = _fit_label_encoders(df)

    # ── Segment-level median revenue_per_unit (inference fallback) ────────────
    segment_median_rev_pu = (
        df.groupby("Segment")["revenue_per_unit"]
        .median()
        .to_dict()
    )
    global_median_rev_pu = float(df["revenue_per_unit"].median())

    # ── Build X / y ───────────────────────────────────────────────────────────
    X, y = _build_xy(df)

    if len(X) < _MIN_TRAINING_ROWS:
        raise MarginEngineError(
            f"raw_df has only {len(X)} usable rows; "
            f"need ≥ {_MIN_TRAINING_ROWS} to train the margin engine."
        )

    # ── Validation split ──────────────────────────────────────────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=_TEST_SIZE, random_state=_RANDOM_STATE
    )
    val_model = _BaseRegressor(**_MODEL_KWARGS)
    val_model.fit(X_train, y_train)
    y_pred_test = val_model.predict(X_test)

    model_r2  = round(float(r2_score(y_test, y_pred_test)), 4)
    model_mae = round(float(mean_absolute_error(y_test, y_pred_test)), 4)
    logger.info(
        "  Validation — holdout R²=%.4f  MAE=%.4f  (n_test=%d)",
        model_r2, model_mae, len(X_test),
    )

    # ── Production refit on full dataset ─────────────────────────────────────
    prod_model = _BaseRegressor(**_MODEL_KWARGS)
    prod_model.fit(X, y)
    logger.info("  Production model fitted on full dataset (n=%d).", len(X))

    # ── Feature importances ───────────────────────────────────────────────────
    feature_importances = {
        feat: round(float(imp), 6)
        for feat, imp in zip(_FEATURE_COLS, prod_model.feature_importances_)
    }
    top = sorted(feature_importances.items(), key=lambda kv: -kv[1])[:3]
    logger.info(
        "  Top-3 features: %s",
        "  |  ".join(f"{k}={v:.4f}" for k, v in top),
    )

    # ── Precompute ceiling matrix ─────────────────────────────────────────────
    ceiling_matrix = _build_ceiling_matrix(
        model=prod_model,
        encoders=encoders,
        df=df,
        segment_median_rev_pu=segment_median_rev_pu,
        global_median_rev_pu=global_median_rev_pu,
    )

    logger.info("Pillar 2 training complete — R²=%.4f  MAE=%.4f", model_r2, model_mae)

    return MarginModels(
        model=prod_model,
        encoders=encoders,
        feature_importances=feature_importances,
        ceiling_matrix=ceiling_matrix,
        segment_median_rev_pu=segment_median_rev_pu,
        model_r2=model_r2,
        model_mae=model_mae,
        backend=_BACKEND,
    )


def score_deals(
    models: MarginModels,
    deals: list[DealInput] | pd.DataFrame,
) -> list[DealScore]:
    """
    Score one or more hypothetical deals for predicted ``Margin_Rate``.

    Called per request from ``deal_service.py``.  Pure prediction — no
    training, no cache access, no I/O.

    Each deal is scored independently; a bad field value on one deal does
    not abort scoring of the others.  Validation issues are surfaced in
    ``DealScore.warnings`` rather than raised as exceptions.

    Parameters
    ----------
    models:
        ``MarginModels`` from ``train_margin_engine()``.
    deals:
        List of ``DealInput`` objects.  Empty list returns empty list.

    Returns
    -------
    list[DealScore]
        One ``DealScore`` per input deal, in the same order.

    Raises
    ------
    MarginEngineError
        If ``models`` is empty (training has not run).
    """
    if models.is_empty():
        raise MarginEngineError(
            "MarginModels is empty — call train_margin_engine() first."
        )

    if isinstance(deals, pd.DataFrame):
        if deals.empty:
            return []
        deals_list = []
        for _, row in deals.iterrows():
            deals_list.append(DealInput(
                quantity=row.get("Quantity", 1),
                discount=row.get("Discount", 0.0),
                segment=row.get("Segment", ""),
                industry=row.get("Industry", "Unknown"),
                region=row.get("Region", ""),
                product=row.get("Product", "Unknown"),
                revenue_per_unit=row.get("Revenue_Per_Unit") if pd.notna(row.get("Revenue_Per_Unit")) else None
            ))
        deals = deals_list
    else:
        if not deals:
            return []

    results: list[DealScore] = []

    for deal in deals:
        try:
            score = _score_single_deal(models, deal)
        except Exception as exc:  # noqa: BLE001
            # Degrade gracefully — return a red flag with the error surfaced
            logger.warning("Error scoring deal %s: %s", deal, exc)
            score = DealScore(
                predicted_margin_rate=0.0,
                margin_flag="red",
                recommendation="Could not score this deal — check input fields.",
                warnings=[f"Scoring error: {type(exc).__name__}: {exc}"],
            )
        results.append(score)

    logger.info(
        "score_deals — %d deal(s) scored: %s",
        len(results),
        [r.margin_flag for r in results],
    )
    return results


def get_ceiling_matrix(models: MarginModels) -> CeilingMatrix:
    """
    Return the precomputed ``CeilingMatrix`` from ``MarginModels``.

    A thin wrapper so ``deal_service.py`` has a named function to call rather
    than accessing ``models.ceiling_matrix`` directly — keeps the service
    layer decoupled from the internal dataclass structure.

    Parameters
    ----------
    models:
        ``MarginModels`` from ``train_margin_engine()``.

    Returns
    -------
    CeilingMatrix

    Raises
    ------
    MarginEngineError
        If ``models`` is empty.
    """
    if models.is_empty():
        raise MarginEngineError(
            "MarginModels is empty — call train_margin_engine() first."
        )
    return models.ceiling_matrix


# ──────────────────────────────────────────────────────────────────────────────
# Internal — training helpers
# ──────────────────────────────────────────────────────────────────────────────

def _engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add derived feature columns to *df* (in-place on a copy).

    New columns
    -----------
    ``discount_x_quantity``
        Discount × Quantity interaction term.
    ``revenue_per_unit``
        Sales / Quantity, floored at ``_REV_PER_UNIT_FLOOR`` to handle
        edge-case zero-quantity rows.
    ``high_discount_flag_int``
        Integer copy of the boolean ``high_discount_flag`` column already
        present in ``raw_df`` (avoids dtype warnings in some sklearn builds).

    Parameters
    ----------
    df:
        Copy of ``raw_df`` from cache.  Must contain ``Sales``,
        ``Quantity``, ``Discount``, ``high_discount_flag``.

    Returns
    -------
    pd.DataFrame
    """
    df["discount_x_quantity"] = df[_DISCOUNT_COL] * df[_QUANTITY_COL]
    df["revenue_per_unit"] = (
        df[_SALES_COL] / df[_QUANTITY_COL].clip(lower=_REV_PER_UNIT_FLOOR)
    )
    # high_discount_flag is bool in raw_df — cast to int for model compatibility
    df["high_discount_flag_int"] = df[_HDF_COL].astype(int)

    logger.debug(
        "_engineer_features: discount_x_quantity [%.2f, %.2f]  "
        "revenue_per_unit [%.2f, %.2f]",
        df["discount_x_quantity"].min(), df["discount_x_quantity"].max(),
        df["revenue_per_unit"].min(), df["revenue_per_unit"].max(),
    )
    return df


def _fit_label_encoders(
    df: pd.DataFrame,
) -> tuple[pd.DataFrame, dict[str, LabelEncoder]]:
    """
    Fit a ``LabelEncoder`` on each categorical column and add ``<col>_enc``
    columns to *df*.

    Parameters
    ----------
    df:
        Feature-engineered DataFrame.

    Returns
    -------
    tuple[pd.DataFrame, dict[str, LabelEncoder]]
        Modified DataFrame and the fitted encoders (needed at inference time).
    """
    encoders: dict[str, LabelEncoder] = {}
    for col in _CAT_COLS:
        le = LabelEncoder()
        df[f"{col}_enc"] = le.fit_transform(df[col].astype(str))
        encoders[col] = le
        logger.debug(
            "LabelEncoder '%s': %d classes → %s", col, len(le.classes_), list(le.classes_)
        )
    return df, encoders


def _build_xy(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """
    Extract the feature matrix X and target vector y from *df*.

    Drops any rows where ``Margin_Rate`` is NaN (should be zero after
    ingestion cleaning, but guarded defensively).

    Returns
    -------
    tuple[np.ndarray, np.ndarray]
        X of shape (n_samples, 9), y of shape (n_samples,).
    """
    df_clean = df.dropna(subset=[_MARGIN_COL])
    if len(df_clean) < len(df):
        logger.warning(
            "_build_xy: dropped %d rows with NaN Margin_Rate.",
            len(df) - len(df_clean),
        )

    X = df_clean[_FEATURE_COLS].values.astype(float)
    y = df_clean[_MARGIN_COL].values.astype(float)
    return X, y


# ──────────────────────────────────────────────────────────────────────────────
# Internal — ceiling matrix
# ──────────────────────────────────────────────────────────────────────────────

def _build_ceiling_matrix(
    model: Any,
    encoders: dict[str, LabelEncoder],
    df: pd.DataFrame,
    segment_median_rev_pu: dict[str, float],
    global_median_rev_pu: float,
    margin_threshold: float = _MARGIN_YELLOW,
) -> CeilingMatrix:
    """
    Sweep discount values for every Segment × Region pair to find the highest
    discount where the model still predicts ``Margin_Rate > margin_threshold``.

    Representative row construction
    --------------------------------
    For each (segment, region) combo:
      - ``Quantity``        → median for that combo
      - ``revenue_per_unit``→ median for that combo
      - ``Industry``        → modal value for that combo
      - ``Product``         → modal value for that combo

    This makes the ceiling specific to the actual deal distribution rather
    than a global average, while remaining deterministic and reproducible.

    Parameters
    ----------
    model:
        Fitted regressor.
    encoders:
        Fitted ``LabelEncoder`` objects from ``_fit_label_encoders()``.
    df:
        Feature-engineered DataFrame (used only to compute medians/modes).
    segment_median_rev_pu:
        Fallback revenue_per_unit per segment (used if a combo has no rows).
    global_median_rev_pu:
        Ultimate fallback if even the segment median is missing.
    margin_threshold:
        Minimum acceptable predicted Margin_Rate (default 0.05).

    Returns
    -------
    CeilingMatrix
    """
    logger.info(
        "  Building discount ceiling matrix (threshold=%.2f) …", margin_threshold
    )

    discount_steps = np.round(
        np.arange(0.0, _CEILING_DISCOUNT_MAX + _CEILING_DISCOUNT_STEP, _CEILING_DISCOUNT_STEP),
        decimals=2,
    )

    segments = list(encoders["Segment"].classes_)
    regions  = list(encoders["Region"].classes_)

    matrix: dict[str, dict[str, float]] = {}

    for seg in segments:
        matrix[seg] = {}
        seg_enc = int(encoders["Segment"].transform([seg])[0])
        seg_fallback_rev_pu = segment_median_rev_pu.get(seg, global_median_rev_pu)

        for reg in regions:
            reg_enc = int(encoders["Region"].transform([reg])[0])

            # Combo-specific representative row statistics
            combo_rows = df[(df["Segment"] == seg) & (df["Region"] == reg)]

            if len(combo_rows) > 0:
                med_qty    = float(combo_rows[_QUANTITY_COL].median())
                med_rev_pu = float(combo_rows["revenue_per_unit"].median())
                ind_enc    = int(combo_rows["Industry_enc"].mode().iloc[0])
                prod_enc   = int(combo_rows["Product_enc"].mode().iloc[0])
            else:
                # Combo not present in training data — use segment-level fallbacks
                logger.warning(
                    "  No rows for %s/%s — using segment-level fallbacks.", seg, reg
                )
                med_qty    = float(df[df["Segment"] == seg][_QUANTITY_COL].median())
                med_rev_pu = seg_fallback_rev_pu
                ind_enc    = int(encoders["Industry"].transform(
                    [encoders["Industry"].classes_[0]]
                )[0])
                prod_enc   = int(encoders["Product"].transform(
                    [encoders["Product"].classes_[0]]
                )[0])

            best_ceiling: float = 0.0

            for disc in discount_steps:
                hdf_int = int(disc > _HIGH_DISCOUNT_THRESHOLD)
                dxq     = disc * med_qty
                row     = np.array([[
                    med_qty, disc, dxq, med_rev_pu,
                    hdf_int, seg_enc, ind_enc, reg_enc, prod_enc
                ]])
                pred = float(model.predict(row)[0])
                if pred > margin_threshold:
                    best_ceiling = float(disc)

            matrix[seg][reg] = round(best_ceiling, 2)
            logger.debug(
                "  ceiling[%s][%s] = %.2f", seg, reg, matrix[seg][reg]
            )

    logger.info("  Ceiling matrix complete — %d combos.", len(segments) * len(regions))
    return CeilingMatrix(matrix=matrix, methodology=_CEILING_METHODOLOGY)


# ──────────────────────────────────────────────────────────────────────────────
# Internal — inference helpers
# ──────────────────────────────────────────────────────────────────────────────

def _score_single_deal(models: MarginModels, deal: DealInput) -> DealScore:
    """
    Build the feature row for *deal* and run a single ``model.predict()`` call.

    Parameters
    ----------
    models:
        Trained ``MarginModels``.
    deal:
        ``DealInput`` with the deal parameters to evaluate.

    Returns
    -------
    DealScore
    """
    warnings: list[str] = []

    # ── Encode categoricals (OOV → -1 sentinel) ───────────────────────────────
    seg_enc  = _safe_encode(models.encoders["Segment"],  deal.segment,  "Segment",  warnings)
    ind_enc  = _safe_encode(models.encoders["Industry"], deal.industry, "Industry", warnings)
    reg_enc  = _safe_encode(models.encoders["Region"],   deal.region,   "Region",   warnings)
    prod_enc = _safe_encode(models.encoders["Product"],  deal.product,  "Product",  warnings)

    # ── revenue_per_unit: use deal value or segment median fallback ───────────
    if deal.revenue_per_unit is not None and deal.revenue_per_unit > 0:
        rev_pu = float(deal.revenue_per_unit)
    else:
        rev_pu = models.segment_median_rev_pu.get(
            deal.segment,
            float(np.mean(list(models.segment_median_rev_pu.values()))),
        )
        warnings.append(
            f"revenue_per_unit not provided — using segment median ({rev_pu:.2f})."
        )

    # ── Build feature vector ──────────────────────────────────────────────────
    qty     = float(deal.quantity)
    disc    = float(deal.discount)
    hdf_int = int(disc > _HIGH_DISCOUNT_THRESHOLD)
    dxq     = disc * qty

    row = np.array([[qty, disc, dxq, rev_pu, hdf_int,
                     seg_enc, ind_enc, reg_enc, prod_enc]])

    # ── Predict and clip ──────────────────────────────────────────────────────
    raw_pred = float(models.model.predict(row)[0])
    pred     = float(np.clip(raw_pred, -1.0, 1.0))

    # ── Margin flag & recommendation ──────────────────────────────────────────
    margin_flag, recommendation = _classify_margin(pred, deal.discount, deal.segment, deal.region, models)

    # ── Attach ceiling for this combo ─────────────────────────────────────────
    ceiling = models.ceiling_matrix.get(deal.segment, deal.region)

    return DealScore(
        predicted_margin_rate=round(pred, 4),
        margin_flag=margin_flag,
        recommendation=recommendation,
        discount_ceiling=ceiling,
        warnings=warnings,
    )


def _classify_margin(
    pred: float,
    discount: float,
    segment: str,
    region: str,
    models: MarginModels,
) -> tuple[str, str]:
    """
    Assign a traffic-light flag and human-readable recommendation.

    Business rules:
    ---------------
    green  (pred ≥ 0.15) : Healthy margin — no intervention needed.
    caution(0.05 ≤ pred < 0.15): Thin margin — nudge to reduce discount.
    red    (pred < 0.05) : Below threshold — block or escalate deal.

    Ceiling context is injected into the recommendation when available,
    so the rep sees the exact safe ceiling, not generic advice.

    Parameters
    ----------
    pred:
        Predicted Margin_Rate.
    discount:
        Discount applied in the deal (used for contextual messaging).
    segment, region:
        Used to look up the ceiling for the recommendation message.
    models:
        ``MarginModels`` for ceiling lookup.

    Returns
    -------
    tuple[str, str]
        (margin_flag, recommendation)
    """
    ceiling = models.ceiling_matrix.get(segment, region)
    ceiling_str = f" Safe ceiling for {segment}/{region}: {ceiling:.0%}." if ceiling is not None else ""

    if pred >= _MARGIN_GREEN:
        return (
            "green",
            f"Margin is healthy at {pred:.1%}. Deal is within acceptable range.{ceiling_str}",
        )
    elif pred >= _MARGIN_YELLOW:
        return (
            "caution",
            (
                f"Margin is thin at {pred:.1%}. "
                f"Current discount ({discount:.0%}) is approaching the risk zone."
                f"{ceiling_str}"
            ),
        )
    else:
        return (
            "red",
            (
                f"Predicted margin ({pred:.1%}) is below the 5% threshold. "
                f"Discount of {discount:.0%} is too aggressive for this deal."
                f"{ceiling_str} Revise terms or escalate for approval."
            ),
        )


def _safe_encode(
    encoder: LabelEncoder,
    value: str,
    col_name: str,
    warnings: list[str],
) -> int:
    """
    Encode *value* using *encoder*, returning ``_OOV_SENTINEL`` (-1) for
    unknown categories rather than raising.

    Parameters
    ----------
    encoder:
        Fitted ``LabelEncoder`` for this column.
    value:
        Raw string value from the deal input.
    col_name:
        Column name — used only to populate the warning message.
    warnings:
        Mutable list to append a non-fatal warning to on OOV.

    Returns
    -------
    int
        Encoded integer, or -1 for unknown values.
    """
    known = list(encoder.classes_)
    if value in known:
        return int(encoder.transform([value])[0])

    warnings.append(
        f"Unknown {col_name} value '{value}' — not seen during training. "
        f"Known values: {known}. Using OOV sentinel (-1)."
    )
    logger.debug("OOV: %s='%s' → %d", col_name, value, _OOV_SENTINEL)
    return _OOV_SENTINEL


# ──────────────────────────────────────────────────────────────────────────────
# Internal — cache accessor
# ──────────────────────────────────────────────────────────────────────────────

def _get_raw_df_from_cache() -> pd.DataFrame:
    """
    Retrieve ``raw_df`` from ``predicto_cache`` via ``get_raw_data()``.

    Returns
    -------
    pd.DataFrame

    Raises
    ------
    MarginEngineError
        If the cache is empty or ``get_raw_data()`` returns ``None``.
    """
    raw_df = predicto_cache.get_raw_data()

    if raw_df is None or (isinstance(raw_df, pd.DataFrame) and raw_df.empty):
        raise MarginEngineError(
            "raw_df not available in cache. "
            "Run ingestion (POST /api/v1/data/ingest) before training."
        )

    logger.debug(
        "_get_raw_df_from_cache: raw_df shape=%s", raw_df.shape
    )
    return raw_df


def _assert_required_columns(df: pd.DataFrame) -> None:
    """
    Ensure all columns required for feature engineering exist in *df*.

    Missing **categorical** columns (Segment, Industry, Region, Product) are
    auto-filled with ``'Unknown'`` rather than raising, because these can be
    safely defaulted.  Missing **numeric** or **boolean** columns raise
    ``MarginEngineError`` since they cannot be synthesized here.

    Parameters
    ----------
    df:
        DataFrame returned by ``predicto_cache.get_raw_data()``.

    Raises
    ------
    MarginEngineError
        If a non-synthesizable numeric column is missing.
    """
    # Numeric / boolean columns — hard-fail if absent
    numeric_required = [_SALES_COL, _PROFIT_COL, _DISCOUNT_COL, _QUANTITY_COL,
                        _MARGIN_COL, _HDF_COL]
    missing_numeric = [c for c in numeric_required if c not in df.columns]
    if missing_numeric:
        raise MarginEngineError(
            f"raw_df is missing required numeric columns for margin engine: {missing_numeric}. "
            "Ensure ingestion_service has run successfully."
        )

    # Categorical columns — auto-fill with 'Unknown' if absent
    for col in _CAT_COLS:
        if col not in df.columns:
            df[col] = "Unknown"
            logger.warning(
                "Margin engine: column '%s' missing from raw_df — filled with 'Unknown'.",
                col,
            )
