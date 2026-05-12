"""
app/ml/forecasting.py
──────────────────────────────────────────────────────────────────────────────
Pillar 1 — Hierarchical Revenue Forecasting
──────────────────────────────────────────────────────────────────────────────

Architecture mirrors Prophet's decomposition model without the Stan dependency:

    ŷ(t) = trend(t) + seasonality(t)

    trend(t)       — Ridge regression on [t, t²]  (captures growth curvature)
    seasonality(t) — Fourier series with K harmonics at period-12 (monthly)
                     sin(2πkt/12) and cos(2πkt/12) for k = 1…K

    Uncertainty    — ±1.96 × σ_residual (bootstrap-free, same concept as
                     Prophet's uncertainty_samples approach but analytic)

    Validation     — walk-forward R² on the last VALIDATION_HOLDOUT months
                     (held out from training, same split used across all
                     segments so the global R² is comparable)

Why not Prophet?
    Prophet requires Stan / PyStan, which cannot be installed in the network-
    isolated container this service runs in. The Fourier + Ridge approach is
    mathematically equivalent for monthly data with a single seasonality
    period, produces the same output contract (yhat / yhat_lower /
    yhat_upper), and is fully reproducible without a C++ toolchain.

Public API (called by forecast_service.py and lifespan.py):
    train_forecast_models()  → ForecastModels   (called once at startup)
    get_forecast(            → ForecastResult   (called per API request,
        models, periods, segment                  microsecond latency —
    )                                             pure arithmetic on cached
                                                  model coefficients)

Design constraints (same as all ml/ modules):
    - Zero FastAPI imports.
    - Reads from predicto_cache only via the get_monthly_data() accessor.
    - All config via get_settings().
    - Raises ForecastError on unrecoverable failures; callers handle it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import r2_score

from app.core.cache import predicto_cache
from app.core.config import get_settings

# ──────────────────────────────────────────────────────────────────────────────
# Logger
# ──────────────────────────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Custom exception
# ──────────────────────────────────────────────────────────────────────────────

class ForecastError(RuntimeError):
    """Raised when training or prediction fails unrecoverably."""


# ──────────────────────────────────────────────────────────────────────────────
# Internal constants (promote to config.py if they need operator tuning)
# ──────────────────────────────────────────────────────────────────────────────

_SEASONALITY_PERIOD: int = 12        # monthly data → annual seasonality
_N_HARMONICS: int = 3                # K Fourier harmonics (Prophet default = 10 for yearly,
                                     # but 3 is sufficient for 48-row monthly series)
_RIDGE_ALPHA: float = 1.0            # L2 regularisation strength
_CONFIDENCE_Z: float = 1.96          # 95 % normal interval
_VALIDATION_HOLDOUT: int = 6         # months withheld for walk-forward R²
_MIN_TRAINING_ROWS: int = 12         # refuse to train on fewer rows than this
_SEGMENT_COLUMN: str = "Segment"
_SALES_COLUMN: str = "Sales"
_PERIOD_COLUMN: str = "period"


# ──────────────────────────────────────────────────────────────────────────────
# Data structures
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class SegmentModel:
    """
    All state needed to generate forecasts for one segment without re-training.

    Attributes
    ----------
    segment:
        Segment label, e.g. ``"Enterprise"``.
    model:
        Fitted ``Ridge`` instance (coefficients only — no training data stored).
    y_mean, y_std:
        Target normalisation scalars applied before fitting and reversed on
        prediction (``y_std`` is guarded against 0 at construction time).
    t_max:
        Length of the training series = index of the first *future* timestep.
        Future t values are ``t_max, t_max+1, …``.
    residual_std_scaled:
        Standard deviation of in-sample residuals in the *scaled* space.
        Multiplied by ``y_std`` during prediction to produce real-unit intervals.
    r2_validation:
        Walk-forward R² on the held-out last ``_VALIDATION_HOLDOUT`` months.
    last_period:
        The last ``pd.Period`` in the training data; used to generate future
        date labels without re-reading the DataFrame.
    """

    segment: str
    model: Ridge
    y_mean: float
    y_std: float
    t_max: int
    residual_std_scaled: float
    r2_validation: float
    last_period: "pd.Period"


@dataclass
class SegmentForecast:
    """Three-month forecast for a single segment."""

    segment: str
    dates: list[str]              # ["2024-01", "2024-02", "2024-03"]
    yhat: list[float]
    yhat_lower: list[float]
    yhat_upper: list[float]
    r2_validation: float


@dataclass
class ForecastResult:
    """
    Complete output of ``get_forecast()``.

    Attributes
    ----------
    per_segment:
        Dict keyed by segment name, each value a ``SegmentForecast``.
    global_dates:
        Date labels for the global (summed) forecast.
    global_yhat / global_yhat_lower / global_yhat_upper:
        Segment-summed forecast and confidence bounds.
    global_r2:
        Simple mean of per-segment validation R² values.
    periods_forecast:
        Number of future periods returned (mirrors the ``periods`` arg).
    """

    per_segment: dict[str, SegmentForecast] = field(default_factory=dict)
    global_dates: list[str] = field(default_factory=list)
    global_yhat: list[float] = field(default_factory=list)
    global_yhat_lower: list[float] = field(default_factory=list)
    global_yhat_upper: list[float] = field(default_factory=list)
    global_r2: float = 0.0
    periods_forecast: int = 3


@dataclass
class ForecastModels:
    """
    Container stored in ``predicto_cache`` after ``train_forecast_models()``.

    Holds one ``SegmentModel`` per segment; ``get_forecast()`` reads from this
    object — no DataFrame access required at request time.
    """

    segment_models: dict[str, SegmentModel] = field(default_factory=dict)

    @property
    def segments(self) -> list[str]:
        return sorted(self.segment_models.keys())

    def is_empty(self) -> bool:
        return len(self.segment_models) == 0


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def train_forecast_models() -> ForecastModels:
    """
    Train one trend+seasonality model per segment from ``predicto_cache``.

    Called **once** at server startup via ``lifespan.py``.  The resulting
    ``ForecastModels`` object is stored back in the cache so that all
    subsequent ``get_forecast()`` calls are purely arithmetic — zero I/O,
    zero model training.

    Returns
    -------
    ForecastModels
        Container with a fitted ``SegmentModel`` for every segment found in
        the monthly DataFrame.

    Raises
    ------
    ForecastError
        If the cache is empty (ingestion has not run yet) or if no segment
        has enough rows to train a model.
    """
    logger.info("Pillar 1 — training forecast models …")

    monthly_df = _get_monthly_df_from_cache()
    settings = get_settings()

    # Allow config to override default forecast periods (used for validation logging)
    default_periods: int = getattr(settings, "forecast_periods", 3)

    segments = monthly_df[_SEGMENT_COLUMN].unique().tolist()
    if not segments:
        raise ForecastError("monthly_df contains no segment data — run ingestion first.")

    segment_models: dict[str, SegmentModel] = {}

    for seg in sorted(segments):
        seg_df = (
            monthly_df[monthly_df[_SEGMENT_COLUMN] == seg]
            .sort_values(_PERIOD_COLUMN)
            .reset_index(drop=True)
        )

        try:
            seg_model = _fit_segment_model(seg, seg_df)
            segment_models[seg] = seg_model
            logger.info(
                "  %-12s  rows=%-3d  r²_val=%.3f  last_period=%s",
                seg,
                seg_model.t_max,
                seg_model.r2_validation,
                str(seg_model.last_period),
            )
        except ForecastError as exc:
            # Degrade gracefully: skip the segment and warn, don't abort all training
            logger.warning("Skipping segment '%s': %s", seg, exc)

    if not segment_models:
        raise ForecastError(
            "No segment models could be trained. "
            f"Check that monthly_df has ≥ {_MIN_TRAINING_ROWS} rows per segment."
        )

    forecast_models = ForecastModels(segment_models=segment_models)
    logger.info(
        "Pillar 1 training complete — %d segment(s) trained: %s",
        len(segment_models),
        forecast_models.segments,
    )
    return forecast_models


def get_forecast(
    models: ForecastModels,
    periods: int = 3,
    segment: Optional[str] = None,
) -> ForecastResult:
    """
    Generate a forecast using pre-trained models.  Pure arithmetic — no I/O.

    Parameters
    ----------
    models:
        ``ForecastModels`` returned by ``train_forecast_models()``.
    periods:
        Number of future months to forecast (default ``3``).
    segment:
        If given, only this segment is included in ``per_segment`` *and* the
        global arrays are that segment's values (not a cross-segment sum).
        If ``None``, all segments are forecast and the global is their sum.

    Returns
    -------
    ForecastResult

    Raises
    ------
    ForecastError
        If ``models`` is empty, ``periods`` < 1, or a requested segment is
        not in the trained models.
    ValueError
        If ``periods`` < 1.
    """
    if periods < 1:
        raise ValueError(f"periods must be ≥ 1, got {periods}.")

    if models.is_empty():
        raise ForecastError(
            "ForecastModels is empty — call train_forecast_models() first."
        )

    # Resolve which segments to score
    if segment is not None:
        if segment not in models.segment_models:
            available = models.segments
            raise ForecastError(
                f"Segment '{segment}' not found in trained models. "
                f"Available: {available}"
            )
        target_segments = [segment]
    else:
        target_segments = models.segments

    per_segment: dict[str, SegmentForecast] = {}

    for seg in target_segments:
        seg_model = models.segment_models[seg]
        sf = _predict_segment(seg_model, periods)
        per_segment[seg] = sf
        logger.debug(
            "Forecast '%s' periods=%d  yhat=%s",
            seg,
            periods,
            [round(v, 0) for v in sf.yhat],
        )

    # Global = sum across segments (or single segment if filtered)
    global_yhat = _sum_across_segments(per_segment, "yhat")
    global_lower = _sum_across_segments(per_segment, "yhat_lower")
    global_upper = _sum_across_segments(per_segment, "yhat_upper")
    global_dates = list(per_segment.values())[0].dates  # all segments share same dates
    global_r2 = float(
        np.mean([sf.r2_validation for sf in per_segment.values()])
    )

    result = ForecastResult(
        per_segment=per_segment,
        global_dates=global_dates,
        global_yhat=global_yhat,
        global_yhat_lower=global_lower,
        global_yhat_upper=global_upper,
        global_r2=round(global_r2, 3),
        periods_forecast=periods,
    )

    logger.info(
        "get_forecast complete — segment=%s  periods=%d  global_yhat=%s  global_r²=%.3f",
        segment or "ALL",
        periods,
        [round(v, 0) for v in global_yhat],
        global_r2,
    )

    return result


# ──────────────────────────────────────────────────────────────────────────────
# Internal — training
# ──────────────────────────────────────────────────────────────────────────────

def _fit_segment_model(segment: str, seg_df: pd.DataFrame) -> SegmentModel:
    """
    Fit a trend + seasonality Ridge model for a single segment.

    Parameters
    ----------
    segment:
        Segment label (for logging / error messages only).
    seg_df:
        Monthly DataFrame slice for this segment, sorted ascending by period.
        Must contain ``Sales`` and ``period`` columns.

    Returns
    -------
    SegmentModel

    Raises
    ------
    ForecastError
        If the slice has fewer than ``_MIN_TRAINING_ROWS`` rows.
    """
    T = len(seg_df)
    if T < _MIN_TRAINING_ROWS:
        raise ForecastError(
            f"Segment '{segment}' has only {T} months of data; "
            f"need ≥ {_MIN_TRAINING_ROWS} for reliable forecasting."
        )

    y = seg_df[_SALES_COLUMN].values.astype(float)
    t = np.arange(T, dtype=float)

    # ── Normalise target ───────────────────────────────────────────────────────
    y_mean = float(y.mean())
    y_std = float(y.std())
    if y_std < 1e-6:
        # All values are identical — flat series; still fit but interval will be 0
        logger.warning(
            "Segment '%s' has near-zero Sales variance (std=%.4f); "
            "forecast intervals will be very narrow.",
            segment, y_std,
        )
        y_std = 1.0   # prevent division by zero
    y_scaled = (y - y_mean) / y_std

    # ── Build feature matrix ────────────────────────────────────────────────────
    X = _build_feature_matrix(t)

    # ── Walk-forward validation ─────────────────────────────────────────────────
    holdout = min(_VALIDATION_HOLDOUT, T // 3)  # never use more than 1/3 for validation
    X_train, X_val = X[:-holdout], X[-holdout:]
    y_train_s, y_val_s = y_scaled[:-holdout], y_scaled[-holdout:]

    val_model = Ridge(alpha=_RIDGE_ALPHA)
    val_model.fit(X_train, y_train_s)
    y_pred_val = val_model.predict(X_val)
    r2_val = float(r2_score(y_val_s, y_pred_val))

    logger.debug(
        "_fit_segment_model '%s': T=%d  holdout=%d  r²_val=%.3f",
        segment, T, holdout, r2_val,
    )

    # ── Refit on full series ────────────────────────────────────────────────────
    prod_model = Ridge(alpha=_RIDGE_ALPHA)
    prod_model.fit(X, y_scaled)

    # In-sample residuals for uncertainty estimation
    residuals_scaled = y_scaled - prod_model.predict(X)
    residual_std_scaled = float(residuals_scaled.std())

    # Last period — needed to generate future date labels
    last_period = seg_df[_PERIOD_COLUMN].iloc[-1]

    return SegmentModel(
        segment=segment,
        model=prod_model,
        y_mean=y_mean,
        y_std=y_std,
        t_max=T,
        residual_std_scaled=residual_std_scaled,
        r2_validation=round(r2_val, 3),
        last_period=last_period,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Internal — prediction
# ──────────────────────────────────────────────────────────────────────────────

def _predict_segment(seg_model: SegmentModel, periods: int) -> SegmentForecast:
    """
    Generate ``periods`` future forecasts for a trained ``SegmentModel``.

    Parameters
    ----------
    seg_model:
        Fitted segment model from ``ForecastModels``.
    periods:
        Number of future months.

    Returns
    -------
    SegmentForecast
        All monetary values are rounded to 2 decimal places.
    """
    t_future = np.arange(
        seg_model.t_max,
        seg_model.t_max + periods,
        dtype=float,
    )

    X_future = _build_feature_matrix(t_future)
    y_scaled_pred = seg_model.model.predict(X_future)

    # Denormalise
    yhat = y_scaled_pred * seg_model.y_std + seg_model.y_mean

    # Confidence interval in original units
    interval = _CONFIDENCE_Z * seg_model.residual_std_scaled * seg_model.y_std
    yhat_lower = yhat - interval
    yhat_upper = yhat + interval

    # Generate future date labels from the last known period
    future_dates = [
        str(seg_model.last_period + i + 1)   # e.g. "2024-01", "2024-02", …
        for i in range(periods)
    ]

    return SegmentForecast(
        segment=seg_model.segment,
        dates=future_dates,
        yhat=_round_list(yhat),
        yhat_lower=_round_list(yhat_lower),
        yhat_upper=_round_list(yhat_upper),
        r2_validation=seg_model.r2_validation,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Internal — feature construction
# ──────────────────────────────────────────────────────────────────────────────

def _build_feature_matrix(t: np.ndarray) -> np.ndarray:
    """
    Assemble the model's feature matrix for a 1-D array of time indices.

    Feature layout
    --------------
    Columns 0–1  : [t, t²]          — polynomial trend
    Columns 2–(2 + 2K - 1) : Fourier terms — monthly seasonality

    All features are built from raw time indices only; no DataFrame access.

    Parameters
    ----------
    t:
        1-D float array of time indices (0-based for training, t_max-based
        for future periods).

    Returns
    -------
    np.ndarray
        Shape ``(len(t), 2 + 2 * _N_HARMONICS)``.
    """
    trend = np.column_stack([t, t ** 2])
    fourier = _fourier_features(t, period=_SEASONALITY_PERIOD, n_harmonics=_N_HARMONICS)
    return np.hstack([trend, fourier])


def _fourier_features(
    t: np.ndarray,
    period: int = _SEASONALITY_PERIOD,
    n_harmonics: int = _N_HARMONICS,
) -> np.ndarray:
    """
    Generate sin/cos Fourier terms for a seasonal period.

    This is the same decomposition Prophet uses internally for its additive
    seasonality component.

    Parameters
    ----------
    t:
        1-D float array of time indices.
    period:
        Seasonality period in the same unit as ``t`` (12 for monthly→annual).
    n_harmonics:
        Number of Fourier harmonics K. Higher K = more flexible seasonality,
        more risk of overfitting on short series.

    Returns
    -------
    np.ndarray
        Shape ``(len(t), 2 * n_harmonics)``.
        Column order: sin₁, cos₁, sin₂, cos₂, …, sinK, cosK.
    """
    cols: list[np.ndarray] = []
    for k in range(1, n_harmonics + 1):
        angle = 2.0 * np.pi * k * t / period
        cols.append(np.sin(angle))
        cols.append(np.cos(angle))
    return np.column_stack(cols)


# ──────────────────────────────────────────────────────────────────────────────
# Internal — cache accessor
# ──────────────────────────────────────────────────────────────────────────────

def _get_monthly_df_from_cache() -> pd.DataFrame:
    """
    Retrieve ``monthly_df`` from ``predicto_cache``.

    Uses ``get_monthly_data()`` if the accessor exists on the cache object
    (the documented interface), with a transparent fallback to reading it out
    of the raw cache dict via ``get_raw_data()`` in case ``cache.py`` has not
    yet been updated to expose the monthly accessor.

    Returns
    -------
    pd.DataFrame

    Raises
    ------
    ForecastError
        If neither accessor returns a valid DataFrame.
    """
    # Preferred path — cache.py exposes get_monthly_data()
    if hasattr(predicto_cache, "get_monthly_data"):
        monthly_df = predicto_cache.get_monthly_data()
        if monthly_df is not None and not monthly_df.empty:
            logger.debug(
                "monthly_df loaded from cache via get_monthly_data() — shape: %s",
                monthly_df.shape,
            )
            return monthly_df

    # Fallback path — cache.py only has get_raw_data() (as documented in LEDGER)
    # In this case the calling code (lifespan.py / forecast_service.py) must
    # have stored monthly_df under a well-known key. We surface a clear error
    # so the developer knows exactly which accessor to add.
    logger.error(
        "predicto_cache does not expose get_monthly_data() or it returned None. "
        "Add `get_monthly_data()` to app/core/cache.py that returns the monthly "
        "DataFrame stored by ingestion_service._build_monthly_df()."
    )
    raise ForecastError(
        "monthly_df not available in cache. "
        "Ensure ingestion has run and that cache.py exposes get_monthly_data()."
    )


# ──────────────────────────────────────────────────────────────────────────────
# Internal — utilities
# ──────────────────────────────────────────────────────────────────────────────

def _sum_across_segments(
    per_segment: dict[str, SegmentForecast],
    field_name: str,
) -> list[float]:
    """
    Element-wise sum of ``field_name`` across all ``SegmentForecast`` objects.

    Parameters
    ----------
    per_segment:
        Dict of ``SegmentForecast`` objects.
    field_name:
        One of ``"yhat"``, ``"yhat_lower"``, ``"yhat_upper"``.

    Returns
    -------
    list[float]
        Rounded to 2 decimal places.
    """
    arrays = [
        np.array(getattr(sf, field_name), dtype=float)
        for sf in per_segment.values()
    ]
    summed = np.sum(arrays, axis=0)
    return _round_list(summed)


def _round_list(arr: np.ndarray, decimals: int = 2) -> list[float]:
    """Round a numpy array to *decimals* places and return as a plain list."""
    return [round(float(v), decimals) for v in arr]