import logging
from typing import Dict, List, Optional, Set, Tuple

import numpy as np
import pandas as pd
import networkx as nx
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler

from app.core.cache import predicto_cache_v2
from app.core.schema_resolver import resolve_canonical_df
from app.models.response_models import (
    RevenueGenomeResponse,
    GenomeClusterNode,
    GenomeEdge,
    GenomeDriftMetrics,
    GenomeArchetypeLabel,
    FeatureAvailability,
    ConfidenceLevel,
)

log = logging.getLogger("predicto.v2.genome")

# ── Configuration ─────────────────────────────────────────────────────────────
GENOME_FEATURE_COLS = [
    "FAV",
    "SBS",
    "EDI",
    "health_score",
    "churn_probability",
    "mrr",
    "product_adoption_score",
]
COVER_LENS_COL      = "churn_probability"   # lifetime risk axis for TDA lens
N_COVER_INTERVALS   = 8                     # number of intervals along lens axis
COVER_OVERLAP_PCT   = 0.3                   # fractional overlap between intervals
DBSCAN_EPS          = 0.8                   # neighbourhood radius in scaled space
DBSCAN_MIN_SAMPLES  = 2                     # minimum cluster size


def _archetype_from_means(
    avg_fav: float,
    avg_sbs: float,
    avg_edi: float,
    avg_churn: float,
    avg_health: float,
) -> GenomeArchetypeLabel:
    if avg_health > 0.7 and avg_churn < 0.3:
        return GenomeArchetypeLabel.HEALTHY_CORE
    if avg_fav > 0.65 and avg_churn < 0.4:
        return GenomeArchetypeLabel.GROWTH_FRONTIER
    if avg_churn > 0.6 or avg_edi > 0.65:
        return GenomeArchetypeLabel.AT_RISK_ZONE
    if avg_edi > 0.5 and avg_fav < 0.4:
        return GenomeArchetypeLabel.DECAY_CLUSTER
    return GenomeArchetypeLabel.TRANSITIONAL


def _confidence_from_n(n: int, n_features: int) -> ConfidenceLevel:
    if n >= 50 and n_features >= 5:
        return ConfidenceLevel.HIGH
    if n >= 10:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW


def calculate_genome() -> RevenueGenomeResponse:
    raw_df = predicto_cache_v2.engineered_df
    if raw_df is None or raw_df.empty:
        log.warning("genome_service: engineered_df absent — returning OFFLINE.")
        return RevenueGenomeResponse(
            summary_narrative="No engineered data available. Run ingestion to populate the cache.",
            data_availability=FeatureAvailability.OFFLINE,
            overall_confidence=ConfidenceLevel.LOW,
        )

    # Apply Intelligent Schema Alignment
    df = resolve_canonical_df(raw_df)

    available_features = [c for c in GENOME_FEATURE_COLS if c in df.columns]
    warnings: List[str] = []
    missing_feats = [c for c in GENOME_FEATURE_COLS if c not in df.columns]
    if missing_feats:
        warnings.append(f"Missing feature columns (defaulted to 0): {missing_feats}")

    if len(available_features) < 2 or len(df) < 4:
        log.warning("genome_service: insufficient features or rows — PARTIAL.")
        return RevenueGenomeResponse(
            summary_narrative=f"Insufficient data: {len(df)} customers, {len(available_features)} features available.",
            data_availability=FeatureAvailability.PARTIAL,
            overall_confidence=ConfidenceLevel.LOW,
            feature_columns_used=available_features,
            warnings=warnings,
        )

    work_df = df.copy()
    for col in GENOME_FEATURE_COLS:
        if col not in work_df.columns:
            work_df[col] = 0.0
    work_df = work_df.fillna(0.0)

    id_col = next((c for c in ("customer_id", "id", "account_id") if c in work_df.columns), None)
    if id_col:
        customer_ids = work_df[id_col].astype(str).tolist()
    else:
        customer_ids = [str(i) for i in work_df.index]

    X_raw = work_df[available_features].values.astype(float)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_raw)

    lens_col_idx = available_features.index(COVER_LENS_COL) if COVER_LENS_COL in available_features else 0
    lens_values = X_raw[:, lens_col_idx]
    lens_min, lens_max = float(lens_values.min()), float(lens_values.max())

    if lens_max - lens_min < 1e-9:
        lens_max = lens_min + 1.0
        warnings.append("Lens axis (churn_probability) has zero variance; artificial range applied.")

    interval_size = (lens_max - lens_min) / N_COVER_INTERVALS
    overlap       = interval_size * COVER_OVERLAP_PCT

    cover_bins: Dict[int, List[int]] = {i: [] for i in range(N_COVER_INTERVALS)}
    for row_idx, lens_val in enumerate(lens_values):
        for i in range(N_COVER_INTERVALS):
            lo = lens_min + i * interval_size - (overlap if i > 0 else 0.0)
            hi = lens_min + (i + 1) * interval_size + (overlap if i < N_COVER_INTERVALS - 1 else 0.0)
            if lo <= lens_val <= hi:
                cover_bins[i].append(row_idx)

    node_registry: Dict[Tuple[int, int], int] = {}
    node_id_counter = 0
    node_members: Dict[int, Set[int]] = {}
    node_cover_interval: Dict[int, int] = {}
    noise_row_indices: Set[int] = set()

    for interval_idx, row_indices in cover_bins.items():
        if len(row_indices) < DBSCAN_MIN_SAMPLES:
            for ri in row_indices:
                noise_row_indices.add(ri)
            continue

        X_bin = X_scaled[row_indices]
        db    = DBSCAN(eps=DBSCAN_EPS, min_samples=DBSCAN_MIN_SAMPLES).fit(X_bin)
        labels = db.labels_

        for local_label in set(labels):
            if local_label == -1:
                for ri, lbl in zip(row_indices, labels):
                    if lbl == -1:
                        noise_row_indices.add(ri)
                continue
            member_rows = {row_indices[j] for j, lbl in enumerate(labels) if lbl == local_label}
            node_registry[(interval_idx, local_label)] = node_id_counter
            node_members[node_id_counter]       = member_rows
            node_cover_interval[node_id_counter] = interval_idx
            node_id_counter += 1

    n_nodes = node_id_counter

    if n_nodes == 0:
        log.warning("genome_service: DBSCAN produced no clusters — all noise.")
        return RevenueGenomeResponse(
            summary_narrative=f"TDA Mapper produced no stable clusters. All {len(df)} customers classified as noise.",
            data_availability=FeatureAvailability.PARTIAL,
            overall_confidence=ConfidenceLevel.LOW,
            n_customers_analyzed=len(df),
            feature_columns_used=available_features,
            warnings=warnings + ["All DBSCAN labels were noise (-1)."],
        )

    G = nx.Graph()
    G.add_nodes_from(range(n_nodes))

    for nid_a in range(n_nodes):
        for nid_b in range(nid_a + 1, n_nodes):
            shared = node_members[nid_a] & node_members[nid_b]
            if shared:
                min_size = min(len(node_members[nid_a]), len(node_members[nid_b]))
                weight   = len(shared) / max(min_size, 1)
                G.add_edge(nid_a, nid_b, shared=len(shared), weight=weight)

    def _node_health_score(nid: int) -> float:
        rows = list(node_members[nid])
        if not rows:
            return 0.0
        health_idx = available_features.index("health_score") if "health_score" in available_features else -1
        if health_idx >= 0:
            return float(np.mean(X_raw[rows, health_idx]))
        return 0.5

    node_health = {nid: _node_health_score(nid) for nid in range(n_nodes)}
    healthiest_nid = max(node_health, key=node_health.__getitem__)

    if nx.is_connected(G):
        raw_distances = nx.single_source_shortest_path_length(G, healthiest_nid)
        node_drift = {nid: float(raw_distances.get(nid, n_nodes)) for nid in range(n_nodes)}
    else:
        node_drift = {}
        for component in nx.connected_components(G):
            sub = G.subgraph(component)
            if healthiest_nid in component:
                dists = nx.single_source_shortest_path_length(sub, healthiest_nid)
            else:
                local_anchor = max(component, key=lambda n: node_health.get(n, 0.0))
                dists = nx.single_source_shortest_path_length(sub, local_anchor)
                extra_penalty = len(df)
                dists = {n: v + extra_penalty for n, v in dists.items()}
            node_drift.update({n: float(v) for n, v in dists.items()})

    max_drift = max(node_drift.values()) if node_drift else 1.0
    if max_drift < 1e-9:
        max_drift = 1.0
    node_drift_norm = {nid: v / max_drift for nid, v in node_drift.items()}
    most_drifted_nid = max(node_drift_norm, key=node_drift_norm.__getitem__)

    feat_idx = {col: i for i, col in enumerate(available_features)}
    genome_nodes: List[GenomeClusterNode] = []

    for nid in range(n_nodes):
        rows = list(node_members[nid])
        cids = [customer_ids[r] for r in rows]
        avg_vals = {col: float(np.mean(X_raw[rows, idx])) for col, idx in feat_idx.items()}

        archetype = _archetype_from_means(
            avg_fav    = avg_vals.get("fav_score",            0.0),
            avg_sbs    = avg_vals.get("sbs_score",            0.0),
            avg_edi    = avg_vals.get("edi_score",            0.0),
            avg_churn  = avg_vals.get("churn_probability",    0.0),
            avg_health = avg_vals.get("health_score",         0.0),
        )

        genome_nodes.append(GenomeClusterNode(
            node_id               = nid,
            customer_ids          = cids,
            customer_count        = len(rows),
            archetype             = archetype,
            avg_health_score      = avg_vals.get("health_score",      0.0),
            avg_churn_probability = avg_vals.get("churn_probability",  0.0),
            avg_mrr               = avg_vals.get("mrr",                0.0),
            genetic_drift_score   = round(node_drift_norm[nid], 4),
            cover_interval_index  = node_cover_interval[nid],
        ))

    genome_edges: List[GenomeEdge] = []
    for u, v, edata in G.edges(data=True):
        genome_edges.append(GenomeEdge(
            source_node_id       = u,
            target_node_id       = v,
            shared_customer_count = edata.get("shared", 0),
            edge_weight          = round(float(edata.get("weight", 0.0)), 4),
        ))

    drift_vals = list(node_drift_norm.values())
    drift_metrics = GenomeDriftMetrics(
        max_drift_score       = round(max(drift_vals), 4) if drift_vals else 0.0,
        mean_drift_score      = round(float(np.mean(drift_vals)), 4) if drift_vals else 0.0,
        healthiest_node_id    = healthiest_nid,
        most_drifted_node_id  = most_drifted_nid,
        n_cover_intervals     = N_COVER_INTERVALS,
        n_dbscan_noise_points = len(noise_row_indices),
    )

    archetype_counts: Dict[str, int] = {}
    for gn in genome_nodes:
        archetype_counts[gn.archetype.value] = archetype_counts.get(gn.archetype.value, 0) + gn.customer_count
    dominant_archetype = max(archetype_counts, key=archetype_counts.__getitem__) if archetype_counts else "UNKNOWN"

    narrative = (
        f"Genome analysis of {len(df)} customers produced {n_nodes} topological nodes "
        f"across {N_COVER_INTERVALS} cover intervals on the lifetime risk axis. "
        f"Dominant archetype: {dominant_archetype}. "
        f"Mean genetic drift score: {drift_metrics.mean_drift_score:.3f} "
        f"(max {drift_metrics.max_drift_score:.3f} at node {most_drifted_nid}). "
        f"{len(noise_row_indices)} customers were classified as topological noise."
    )

    confidence = _confidence_from_n(len(df), len(available_features))
    avail = FeatureAvailability.ACTIVE if not missing_feats else FeatureAvailability.PARTIAL

    log.info("genome_service: complete — %d nodes, %d edges, confidence=%s", n_nodes, len(genome_edges), confidence)

    return RevenueGenomeResponse(
        nodes                  = genome_nodes,
        edges                  = genome_edges,
        drift_metrics          = drift_metrics,
        n_customers_analyzed   = len(df),
        feature_columns_used   = available_features,
        summary_narrative      = narrative,
        data_availability      = avail,
        overall_confidence     = confidence,
        warnings               = warnings,
    )
