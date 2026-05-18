"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  app/services/fingerprint_service.py                                        ║
║  Predicto V2 — Revenue Cohort Lifecycle Fingerprinting (Feature 02)        ║
║                                                                              ║
║  Reads exclusively from `predicto_cache_v2`.  No I/O, no external calls.   ║
║                                                                              ║
║  Degradation contract:                                                       ║
║    OFFLINE   — engineered_df or snapshots_df absent / empty.               ║
║    DEGRADED  — valid customers < MIN_CUSTOMERS_KMEANS (15): 2-archetype    ║
║                fallback derived from std-deviation cuts on FAV and SBS.    ║
║    KMEANS    — full K-Means (k=4, init=k-means++, n_init=10, seed=42).     ║
║                                                                              ║
║  Zero-crash guarantee: every numeric output defaults to 0.0.                ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from scipy.stats import linregress
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler

from app.core.cache import predicto_cache_v2  # type: ignore[import]
from app.models.response_models import ConfidenceLevel, FeatureAvailability
from app.models.response_models import (
    CohortArchetype,
    CustomerFingerprintRecord,
    FingerprintMode,
    KPITrajectory,
    LifecycleFingerprintResponse,
)

log = logging.getLogger("predicto.v2.fingerprint")

# ─────────────────────────────────────────────────────────────────────────────
# DOMAIN CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

COL_CUSTOMER_ID    = "customer_id"
COL_CUSTOMER_NAME  = "customer_name"
COL_SNAPSHOT_MONTH = "snapshot_month"
COL_MRR            = "mrr"
COL_ARR            = "arr"
COL_CHURN_PROB     = "churn_probability"
COL_CLUSTER        = "cluster_label"

KPI_COLS: List[str] = ["FAV", "RER", "EDI", "SBS", "ORC", "CQS", "RSFS"]

# K-Means hyper-parameters (deterministic)
KMEANS_K           = 4
KMEANS_INIT        = "k-means++"
KMEANS_N_INIT      = 10
KMEANS_RANDOM_SEED = 42

# Minimum customers required to run K-Means; below → 2-archetype degraded mode
MIN_CUSTOMERS_KMEANS = 15

# KPI benchmarks used for health-label classification
KPI_BENCHMARKS: Dict[str, float] = {
    "FAV":  0.6,
    "RER":  0.7,
    "EDI":  0.3,   # lower EDI = less decay = healthier
    "SBS":  0.4,   # lower SBS = less burden = healthier
    "ORC":  0.6,
    "CQS":  0.65,
    "RSFS": 0.5,
}

# KPIs where *lower* value = worse (need to flip sign in health check)
KPI_LOWER_IS_WORSE: Dict[str, bool] = {
    "FAV":  False,
    "RER":  False,
    "EDI":  True,
    "SBS":  True,
    "ORC":  False,
    "CQS":  False,
    "RSFS": False,
}

ARCHETYPE_LABELS_KMEANS = [
    "High-Velocity Champion",
    "Steady-State Performer",
    "Deceleration Risk",
    "Stagnant Laggard",
]

ARCHETYPE_LABELS_DEGRADED = ["Healthy Portfolio", "At-Risk Portfolio"]


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def compute_lifecycle_fingerprint() -> LifecycleFingerprintResponse:
    """
    Main entry point for Feature 02.

    Steps:
      1. Validate cache readiness → derive data_availability.
      2. Join snapshots_df with engineered_df to build per-customer KPI series.
      3. For each customer, run linregress on every KPI across snapshot_months.
      4. Assemble slope-vector feature matrix.
      5a. If N >= 15: run K-Means (k=4) → 4 archetypes.
      5b. If N < 15:  run 2-archetype std-deviation fallback.
      6. Compute cosine similarity for each customer → archetype centroid.
      7. Enrich archetypes with health labels and top-KPI signals.
      8. Assemble and return LifecycleFingerprintResponse.
    """

    warnings: List[str] = []

    # ── Step 1: Validate cache ────────────────────────────────────────────────
    availability, mode, warnings = _assess_cache_readiness(warnings)
    if mode == FingerprintMode.OFFLINE:
        return _offline_response(warnings)

    # ── Step 2: Build per-customer KPI time-series ────────────────────────────
    kpi_series_map, valid_customers_df, build_warnings = _build_kpi_series(warnings)
    warnings = build_warnings

    if valid_customers_df.empty or len(valid_customers_df) == 0:
        warnings.append("No valid customers after KPI series build — returning OFFLINE.")
        return _offline_response(warnings)

    n_customers = len(valid_customers_df)

    # ── Step 3: Compute linregress trajectories per customer per KPI ──────────
    trajectory_matrix, customer_trajectories, traj_warnings = _compute_trajectories(
        kpi_series_map, valid_customers_df
    )
    warnings.extend(traj_warnings)

    if trajectory_matrix is None or trajectory_matrix.shape[0] == 0:
        warnings.append("Trajectory matrix empty — returning OFFLINE.")
        return _offline_response(warnings)

    # ── Steps 4/5: Cluster archetypes ─────────────────────────────────────────
    if n_customers >= MIN_CUSTOMERS_KMEANS:
        archetypes, labels, centroids, inertia, cluster_warnings = _run_kmeans(
            trajectory_matrix, valid_customers_df
        )
        mode = FingerprintMode.KMEANS
        availability = FeatureAvailability.ACTIVE
        warnings.extend(cluster_warnings)
    else:
        archetypes, labels, centroids, inertia, cluster_warnings = _run_degraded_fallback(
            trajectory_matrix, valid_customers_df
        )
        mode = FingerprintMode.DEGRADED
        availability = FeatureAvailability.PARTIAL
        warnings.append(
            f"Portfolio has {n_customers} valid customers (< {MIN_CUSTOMERS_KMEANS} required "
            f"for K-Means). Using 2-archetype FAV/SBS fallback."
        )
        warnings.extend(cluster_warnings)

    # ── Step 6: Compute cosine similarity per customer ────────────────────────
    customer_assignments = _assign_customers(
        valid_customers_df,
        trajectory_matrix,
        centroids,
        labels,
        archetypes,
        customer_trajectories,
    )

    # ── Step 7: Enrich archetypes with health labels ──────────────────────────
    archetypes = _enrich_archetypes(archetypes, customer_assignments, valid_customers_df, labels)

    # ── Step 8: Assemble response ─────────────────────────────────────────────
    dominant = max(archetypes, key=lambda a: a.customer_count) if archetypes else None

    overall_confidence = _derive_confidence(n_customers, mode)

    return LifecycleFingerprintResponse(
        archetypes=archetypes,
        customer_assignments=customer_assignments,
        total_customers_fingerprinted=n_customers,
        dominant_archetype_id=dominant.archetype_id if dominant else None,
        dominant_archetype_label=dominant.archetype_label if dominant else None,
        portfolio_mean_arr=round(float(valid_customers_df[COL_ARR].mean()) if COL_ARR in valid_customers_df.columns else 0.0, 2),
        portfolio_mean_churn=round(float(valid_customers_df[COL_CHURN_PROB].mean()) if COL_CHURN_PROB in valid_customers_df.columns else 0.0, 4),
        fingerprint_mode=mode,
        n_kpi_features_used=trajectory_matrix.shape[1],
        kmeans_inertia=round(inertia, 4) if inertia is not None else None,
        data_availability=availability,
        overall_confidence=overall_confidence,
        missing_columns=_detect_missing_columns(),
        warnings=warnings,
    )


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — CACHE READINESS
# ─────────────────────────────────────────────────────────────────────────────

def _assess_cache_readiness(
    warnings: List[str],
) -> Tuple[FeatureAvailability, FingerprintMode, List[str]]:
    cache = predicto_cache_v2

    if not cache.is_ready:
        warnings.append("Cache not ready — ingestion has not completed.")
        return FeatureAvailability.OFFLINE, FingerprintMode.OFFLINE, warnings

    if cache.engineered_df is None or cache.engineered_df.empty:
        warnings.append("engineered_df is absent — KPI features required for fingerprinting.")
        return FeatureAvailability.OFFLINE, FingerprintMode.OFFLINE, warnings

    if cache.snapshots_df is None or cache.snapshots_df.empty:
        warnings.append("snapshots_df is absent — time-series trajectory requires snapshot history.")
        return FeatureAvailability.OFFLINE, FingerprintMode.OFFLINE, warnings

    return FeatureAvailability.ACTIVE, FingerprintMode.KMEANS, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — BUILD KPI TIME-SERIES MAP
# ─────────────────────────────────────────────────────────────────────────────

def _build_kpi_series(
    warnings: List[str],
) -> Tuple[Dict[str, pd.DataFrame], pd.DataFrame, List[str]]:
    """
    Joins snapshots_df with engineered_df to produce a per-customer KPI
    time-series dictionary.  Returns (kpi_series_map, valid_customers_df, warnings).

    kpi_series_map: {customer_id → DataFrame(snapshot_month, KPI1..7)}
    valid_customers_df: engineered_df rows for customers with ≥ 2 snapshots.
    """
    cache       = predicto_cache_v2
    eng_df      = cache.engineered_df.copy()
    snap_df     = cache.snapshots_df.copy()

    # Detect available KPI columns
    available_kpis = [k for k in KPI_COLS if k in eng_df.columns]
    if not available_kpis:
        warnings.append("No KPI columns found in engineered_df — returning OFFLINE.")
        return {}, pd.DataFrame(), warnings

    missing_kpis = [k for k in KPI_COLS if k not in eng_df.columns]
    if missing_kpis:
        warnings.append(f"Missing KPI columns (graceful skip): {missing_kpis}")

    # Merge snapshots with KPI data on customer_id
    try:
        merged = snap_df.merge(
            eng_df[[COL_CUSTOMER_ID] + available_kpis].drop_duplicates(COL_CUSTOMER_ID),
            on=COL_CUSTOMER_ID,
            how="inner",
        )
    except Exception as exc:
        warnings.append(f"snapshots_df × engineered_df merge failed: {exc} — returning OFFLINE.")
        return {}, pd.DataFrame(), warnings

    if merged.empty:
        warnings.append("No rows after join — customer_id keys may not match.")
        return {}, pd.DataFrame(), warnings

    if COL_SNAPSHOT_MONTH not in merged.columns:
        warnings.append("snapshot_month column absent — cannot build time-series.")
        return {}, pd.DataFrame(), warnings

    # Build per-customer series; keep only customers with ≥ 2 snapshot months
    kpi_series_map: Dict[str, pd.DataFrame] = {}
    valid_cids: List[str] = []

    for cid, grp in merged.groupby(COL_CUSTOMER_ID):
        grp_sorted = grp.sort_values(COL_SNAPSHOT_MONTH)
        if len(grp_sorted) >= 2:
            kpi_series_map[str(cid)] = grp_sorted[[COL_SNAPSHOT_MONTH] + available_kpis].reset_index(drop=True)
            valid_cids.append(str(cid))

    if not valid_cids:
        warnings.append("No customers have ≥ 2 snapshot months — cannot compute trajectories.")
        return {}, pd.DataFrame(), warnings

    valid_customers_df = eng_df[eng_df[COL_CUSTOMER_ID].isin(valid_cids)].copy()

    return kpi_series_map, valid_customers_df, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — COMPUTE LINREGRESS TRAJECTORIES
# ─────────────────────────────────────────────────────────────────────────────

def _compute_trajectories(
    kpi_series_map: Dict[str, pd.DataFrame],
    valid_customers_df: pd.DataFrame,
) -> Tuple[Optional[np.ndarray], Dict[str, List[KPITrajectory]], List[str]]:
    """
    Runs scipy.stats.linregress per customer per KPI.

    Returns:
        trajectory_matrix  : np.ndarray shape (N, K) — one slope per KPI per customer.
        customer_trajectories : {customer_id → List[KPITrajectory]}
        warnings           : diagnostic messages
    """
    warnings: List[str] = []
    customer_ids      = list(kpi_series_map.keys())
    available_kpis    = list(kpi_series_map[customer_ids[0]].columns.drop(COL_SNAPSHOT_MONTH))

    slope_rows: List[List[float]] = []
    customer_trajectories: Dict[str, List[KPITrajectory]] = {}

    for cid in customer_ids:
        series_df = kpi_series_map[cid]
        x         = series_df[COL_SNAPSHOT_MONTH].astype(float).values
        kpi_trajs: List[KPITrajectory] = []
        slopes:    List[float]          = []

        for kpi in available_kpis:
            y = series_df[kpi].fillna(0.0).astype(float).values
            try:
                if np.std(y) < 1e-9:
                    # Constant series — linregress is undefined; use zeros
                    slope, intercept, r_sq = 0.0, float(np.mean(y)), 0.0
                else:
                    result    = linregress(x, y)
                    slope     = float(result.slope)
                    intercept = float(result.intercept)
                    r_sq      = float(result.rvalue ** 2)
            except Exception:
                slope, intercept, r_sq = 0.0, float(np.mean(y)), 0.0

            slopes.append(slope)
            kpi_trajs.append(
                KPITrajectory(
                    kpi_name=kpi,
                    slope=round(slope, 6),
                    intercept=round(intercept, 6),
                    r_squared=round(min(max(r_sq, 0.0), 1.0), 4),
                    mean_value=round(float(np.mean(y)), 4),
                    n_snapshots=len(x),
                )
            )

        slope_rows.append(slopes)
        customer_trajectories[cid] = kpi_trajs

    trajectory_matrix = np.array(slope_rows, dtype=float)

    # Replace any remaining NaN/inf with 0
    trajectory_matrix = np.nan_to_num(trajectory_matrix, nan=0.0, posinf=0.0, neginf=0.0)

    return trajectory_matrix, customer_trajectories, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5a — K-MEANS CLUSTERING (N ≥ 15)
# ─────────────────────────────────────────────────────────────────────────────

def _run_kmeans(
    trajectory_matrix: np.ndarray,
    valid_customers_df: pd.DataFrame,
) -> Tuple[List[CohortArchetype], np.ndarray, np.ndarray, Optional[float], List[str]]:
    """
    Runs K-Means (k=4, init=k-means++, n_init=10, seed=42) on the slope matrix.

    Returns (archetypes, labels, centroids, inertia, warnings).
    """
    warnings: List[str] = []

    # Standardise before clustering
    scaler = StandardScaler()
    try:
        X_scaled = scaler.fit_transform(trajectory_matrix)
    except Exception as exc:
        warnings.append(f"StandardScaler failed: {exc} — using raw slopes.")
        X_scaled = trajectory_matrix.copy()

    try:
        km = KMeans(
            n_clusters=KMEANS_K,
            init=KMEANS_INIT,
            n_init=KMEANS_N_INIT,
            random_state=KMEANS_RANDOM_SEED,
        )
        labels   = km.fit_predict(X_scaled)
        centroids = km.cluster_centers_   # scaled centroids
        inertia   = float(km.inertia_)
    except Exception as exc:
        warnings.append(f"K-Means failed: {exc} — degrading to 2-archetype fallback.")
        return _run_degraded_fallback(trajectory_matrix, valid_customers_df)

    # Unscale centroids back to slope space for interpretability
    try:
        centroids_unscaled = scaler.inverse_transform(centroids)
    except Exception:
        centroids_unscaled = centroids.copy()

    # Build CohortArchetype objects (labels assigned by _enrich_archetypes later)
    available_kpis = _available_kpi_cols()
    archetypes: List[CohortArchetype] = []
    for k in range(KMEANS_K):
        mask         = labels == k
        centroid_row = centroids_unscaled[k]
        centroid_map = {
            kpi: round(float(centroid_row[i]), 6)
            for i, kpi in enumerate(available_kpis)
            if i < len(centroid_row)
        }
        archetypes.append(
            CohortArchetype(
                archetype_id=k,
                archetype_label=ARCHETYPE_LABELS_KMEANS[k],
                customer_count=int(np.sum(mask)),
                centroid_kpi_slopes=centroid_map,
                mean_churn_probability=0.0,   # filled in _enrich_archetypes
                mean_arr=0.0,
                top_risk_kpis=[],
                top_growth_kpis=[],
                health_label="unknown",
            )
        )

    return archetypes, labels, centroids_unscaled, inertia, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5b — DEGRADED 2-ARCHETYPE FALLBACK (N < 15)
# ─────────────────────────────────────────────────────────────────────────────

def _run_degraded_fallback(
    trajectory_matrix: np.ndarray,
    valid_customers_df: pd.DataFrame,
) -> Tuple[List[CohortArchetype], np.ndarray, np.ndarray, Optional[float], List[str]]:
    """
    2-archetype fallback for portfolios with fewer than 15 valid customers.

    Split logic:
      1. Compute composite score = mean(FAV_slope, RER_slope) - mean(EDI_slope, SBS_slope)
         (positive = healthy trajectory, negative = at-risk trajectory)
      2. If composite score ≥ portfolio median → Archetype 0 = Healthy
         Else → Archetype 1 = At-Risk

    Centroids are the mean slope vectors for each archetype.
    """
    warnings: List[str] = []
    available_kpis = _available_kpi_cols()
    n = trajectory_matrix.shape[0]

    # Build composite health score from FAV/RER (higher = good) vs EDI/SBS (lower = good)
    def _kpi_idx(name: str) -> Optional[int]:
        try:
            return available_kpis.index(name)
        except ValueError:
            return None

    fav_idx  = _kpi_idx("FAV")
    rer_idx  = _kpi_idx("RER")
    edi_idx  = _kpi_idx("EDI")
    sbs_idx  = _kpi_idx("SBS")

    health_score = np.zeros(n, dtype=float)

    def _add_col(idx: Optional[int], sign: float) -> None:
        if idx is not None and idx < trajectory_matrix.shape[1]:
            health_score[:] += sign * trajectory_matrix[:, idx]

    _add_col(fav_idx, +1.0)
    _add_col(rer_idx, +1.0)
    _add_col(edi_idx, -1.0)
    _add_col(sbs_idx, -1.0)

    # Fallback when all KPI slopes are zero (constant series)
    if np.std(health_score) < 1e-9:
        # Assign half-and-half
        labels = np.array([i % 2 for i in range(n)], dtype=int)
        warnings.append("All KPI slopes zero — applying alternating Healthy/At-Risk labels.")
    else:
        median_score = float(np.median(health_score))
        labels       = np.where(health_score >= median_score, 0, 1).astype(int)

    centroids = np.array([
        trajectory_matrix[labels == k].mean(axis=0) if np.any(labels == k) else np.zeros(trajectory_matrix.shape[1])
        for k in range(2)
    ])

    archetypes: List[CohortArchetype] = []
    for k in range(2):
        mask         = labels == k
        centroid_map = {
            kpi: round(float(centroids[k, i]), 6)
            for i, kpi in enumerate(available_kpis)
            if i < centroids.shape[1]
        }
        archetypes.append(
            CohortArchetype(
                archetype_id=k,
                archetype_label=ARCHETYPE_LABELS_DEGRADED[k],
                customer_count=int(np.sum(mask)),
                centroid_kpi_slopes=centroid_map,
                mean_churn_probability=0.0,
                mean_arr=0.0,
                top_risk_kpis=[],
                top_growth_kpis=[],
                health_label="healthy" if k == 0 else "at-risk",
            )
        )

    return archetypes, labels, centroids, None, warnings


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — CUSTOMER ASSIGNMENT WITH COSINE SIMILARITY
# ─────────────────────────────────────────────────────────────────────────────

def _assign_customers(
    valid_customers_df: pd.DataFrame,
    trajectory_matrix: np.ndarray,
    centroids: np.ndarray,
    labels: np.ndarray,
    archetypes: List[CohortArchetype],
    customer_trajectories: Dict[str, List[KPITrajectory]],
) -> List[CustomerFingerprintRecord]:
    """
    Computes cosine similarity between each customer's slope vector and its
    assigned archetype centroid, then builds CustomerFingerprintRecord list.
    """
    records: List[CustomerFingerprintRecord] = []
    customer_ids = valid_customers_df[COL_CUSTOMER_ID].tolist()
    label_to_archetype = {a.archetype_id: a for a in archetypes}

    for i, cid in enumerate(customer_ids):
        cid_str    = str(cid)
        label      = int(labels[i])
        archetype  = label_to_archetype.get(label, archetypes[0])
        row_vector = trajectory_matrix[i].reshape(1, -1)
        centroid   = centroids[label].reshape(1, -1)

        try:
            cos_sim = float(cosine_similarity(row_vector, centroid)[0, 0])
            cos_sim = float(np.clip(cos_sim, 0.0, 1.0))
        except Exception:
            cos_sim = 0.0

        # Lookup customer metadata from engineered_df
        cust_row   = valid_customers_df[valid_customers_df[COL_CUSTOMER_ID] == cid]
        cust_name  = str(cust_row[COL_CUSTOMER_NAME].iloc[0]) if (COL_CUSTOMER_NAME in cust_row.columns and not cust_row.empty) else cid_str
        arr        = float(cust_row[COL_ARR].iloc[0]) if (COL_ARR in cust_row.columns and not cust_row.empty) else 0.0
        churn_prob = float(cust_row[COL_CHURN_PROB].iloc[0]) if (COL_CHURN_PROB in cust_row.columns and not cust_row.empty) else 0.0
        cluster    = str(cust_row[COL_CLUSTER].iloc[0]) if (COL_CLUSTER in cust_row.columns and not cust_row.empty) else "Unknown"

        records.append(
            CustomerFingerprintRecord(
                customer_id=cid_str,
                customer_name=cust_name,
                archetype_id=label,
                archetype_label=archetype.archetype_label,
                cosine_similarity=round(cos_sim, 4),
                kpi_trajectories=customer_trajectories.get(cid_str, []),
                cluster_label=cluster,
                arr=round(arr, 2),
                churn_probability=round(churn_prob, 4),
            )
        )

    # Sort by cosine_similarity descending (best fit first)
    records.sort(key=lambda r: r.cosine_similarity, reverse=True)
    return records


# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — ARCHETYPE ENRICHMENT
# ─────────────────────────────────────────────────────────────────────────────

def _enrich_archetypes(
    archetypes: List[CohortArchetype],
    customer_assignments: List[CustomerFingerprintRecord],
    valid_customers_df: pd.DataFrame,
    labels: np.ndarray,
) -> List[CohortArchetype]:
    """
    Populates mean_churn_probability, mean_arr, top_risk_kpis, top_growth_kpis,
    and health_label on each archetype using the customer assignment data.
    """
    for arch in archetypes:
        members = [r for r in customer_assignments if r.archetype_id == arch.archetype_id]
        if not members:
            continue

        arch.mean_churn_probability = round(
            float(np.mean([m.churn_probability for m in members])), 4
        )
        arch.mean_arr = round(float(np.mean([m.arr for m in members])), 2)

        # Top risk KPIs = those with the most negative centroid slope
        slopes = arch.centroid_kpi_slopes
        sorted_slopes = sorted(slopes.items(), key=lambda x: x[1])  # ascending
        arch.top_risk_kpis   = [k for k, _ in sorted_slopes[:2] if _ < 0.0]
        arch.top_growth_kpis = [k for k, _ in reversed(sorted_slopes) if _ > 0.0][:2]

        # Health label heuristic
        if arch.mean_churn_probability < 0.3 and len(arch.top_growth_kpis) > 0:
            arch.health_label = "healthy"
        elif arch.mean_churn_probability > 0.6:
            arch.health_label = "churning"
        elif arch.top_risk_kpis and not arch.top_growth_kpis:
            arch.health_label = "at-risk"
        elif arch.top_growth_kpis:
            arch.health_label = "expanding"
        else:
            arch.health_label = "stable"

    return archetypes


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _available_kpi_cols() -> List[str]:
    """Returns the subset of KPI_COLS present in the current engineered_df."""
    eng_df = predicto_cache_v2.engineered_df
    if eng_df is None:
        return KPI_COLS
    return [k for k in KPI_COLS if k in eng_df.columns]


def _detect_missing_columns() -> List[str]:
    """Returns columns absent from engineered_df that would improve fingerprinting."""
    eng_df = predicto_cache_v2.engineered_df
    if eng_df is None:
        return KPI_COLS + [COL_CUSTOMER_NAME, COL_ARR, COL_CHURN_PROB, COL_CLUSTER]
    missing = []
    for col in KPI_COLS + [COL_CUSTOMER_NAME, COL_ARR, COL_CHURN_PROB, COL_CLUSTER]:
        if col not in eng_df.columns:
            missing.append(col)
    return missing


def _derive_confidence(n_customers: int, mode: FingerprintMode) -> ConfidenceLevel:
    if mode == FingerprintMode.OFFLINE:
        return ConfidenceLevel.LOW
    if mode == FingerprintMode.DEGRADED or n_customers < 50:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.HIGH


def _offline_response(warnings: List[str]) -> LifecycleFingerprintResponse:
    """Returns a safe zero-state LifecycleFingerprintResponse with OFFLINE status."""
    return LifecycleFingerprintResponse(
        archetypes=[],
        customer_assignments=[],
        total_customers_fingerprinted=0,
        dominant_archetype_id=None,
        dominant_archetype_label=None,
        portfolio_mean_arr=0.0,
        portfolio_mean_churn=0.0,
        fingerprint_mode=FingerprintMode.OFFLINE,
        n_kpi_features_used=0,
        kmeans_inertia=None,
        data_availability=FeatureAvailability.OFFLINE,
        overall_confidence=ConfidenceLevel.LOW,
        missing_columns=_detect_missing_columns(),
        warnings=warnings,
    )
