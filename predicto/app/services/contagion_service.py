import logging
import math
from typing import Dict, List, Optional, Set, Tuple

import networkx as nx
import numpy as np
import pandas as pd

from app.core.cache import predicto_cache_v2
from app.core.schema_resolver import resolve_canonical_df
from app.models.response_models import (
    ContagionNetworkResponse,
    ContagionNodeRisk,
    ContagionPath,
    ContagionNetworkSummary,
    ContagionSeverity,
    FeatureAvailability,
    ConfidenceLevel,
)

log = logging.getLogger("predicto.v2.contagion")

# ── Configuration ─────────────────────────────────────────────────────────────
CHURN_ANCHOR_THRESHOLD    = 0.70   # churn_probability above which a node is an anchor
ALPHA_ATTENUATION         = 0.50   # exponential decay factor per hop
MAX_PROPAGATION_HOPS      = 4      # BFS depth limit for contagion propagation
TOP_PATHS_LIMIT           = 50     # max contagion paths to return
SEVERITY_CRITICAL         = 0.75
SEVERITY_HIGH             = 0.50
SEVERITY_ELEVATED         = 0.25

EDGE_WEIGHT_COLS          = [      # shared-attribute dimensions for edge construction
    "segment",
    "sales_rep",
    "tech_stack_tier",             # optional; skipped if absent
]


def build_contagion_graph(df: pd.DataFrame) -> nx.Graph:
    if df is None or df.empty:
        log.warning("build_contagion_graph: empty DataFrame — returning empty graph.")
        return nx.Graph()

    # Apply Intelligent Schema Alignment
    df = resolve_canonical_df(df)

    id_col = next((c for c in ("customer_id", "id", "account_id") if c in df.columns), None)
    if id_col is None:
        df = df.copy()
        df["_cid"] = df.index.astype(str)
        id_col = "_cid"

    G = nx.Graph()

    for _, row in df.iterrows():
        cid = str(row[id_col])
        G.add_node(cid,
            arr               = float(row["mrr"] * 12) if "mrr" in df.columns else 0.0,
            churn_probability = float(row.get("churn_probability", 0.0)),
            segment           = str(row.get("segment", "Unknown")),
            sales_rep         = str(row.get("sales_rep", "Unknown")),
            tech_stack_tier   = str(row.get("tech_stack_tier", "Unknown")),
            health_score      = float(row.get("health_score", 0.0)),
        )

    nodes      = list(G.nodes())
    node_data  = {n: G.nodes[n] for n in nodes}
    attr_keys  = [k for k in EDGE_WEIGHT_COLS if any(k in node_data[n] for n in nodes)]

    for i, u in enumerate(nodes):
        for v in nodes[i + 1:]:
            shared = sum(
                1 for k in attr_keys
                if node_data[u].get(k, "__A") == node_data[v].get(k, "__B")
                and node_data[u].get(k, "__A") not in ("Unknown", "nan", "")
            )
            if shared > 0:
                G.add_edge(u, v, raw_weight=float(shared))

    for node in G.nodes():
        neighbour_weights = {nbr: G[node][nbr]["raw_weight"] for nbr in G.neighbors(node)}
        total = sum(neighbour_weights.values())
        if total > 0:
            for nbr, w in neighbour_weights.items():
                G[node][nbr]["gamma"] = w / total
        else:
            for nbr in G.neighbors(node):
                G[node][nbr]["gamma"] = 0.0

    log.info(
        "build_contagion_graph: %d nodes, %d edges constructed.",
        G.number_of_nodes(), G.number_of_edges(),
    )
    return G


def _propagate_contagion(
    G: nx.Graph,
    anchor_nodes: List[str],
) -> Tuple[Dict[str, float], List[ContagionPath]]:
    node_risk: Dict[str, float] = {n: 0.0 for n in G.nodes()}
    for anchor in anchor_nodes:
        if anchor in G:
            node_risk[anchor] = min(1.0, G.nodes[anchor].get("churn_probability", 1.0))

    raw_paths: List[ContagionPath] = []

    for anchor in anchor_nodes:
        if anchor not in G:
            continue
        anchor_risk = node_risk[anchor]

        visited: Dict[str, int] = {anchor: 0}
        queue   = [anchor]
        path_trace: Dict[str, List[str]] = {anchor: [anchor]}

        while queue:
            current = queue.pop(0)
            h       = visited[current]
            if h >= MAX_PROPAGATION_HOPS:
                continue
            for nbr in G.neighbors(current):
                if nbr == anchor:
                    continue
                gamma = G[current][nbr].get("gamma", 0.0)
                decay = math.exp(-ALPHA_ATTENUATION * (h + 1))
                delta = anchor_risk * gamma * decay
                node_risk[nbr] = min(1.0, node_risk[nbr] + delta)

                if nbr not in visited:
                    visited[nbr] = h + 1
                    path_trace[nbr] = path_trace[current] + [nbr]
                    queue.append(nbr)
                    if delta > 0.01:
                        raw_paths.append(ContagionPath(
                            anchor_customer_id   = anchor,
                            affected_customer_id = nbr,
                            n_hops               = h + 1,
                            path_risk            = round(delta, 4),
                            path_customer_ids    = path_trace[nbr],
                        ))

    raw_paths.sort(key=lambda p: p.path_risk, reverse=True)
    return node_risk, raw_paths[:TOP_PATHS_LIMIT]


def _severity(risk: float) -> ContagionSeverity:
    if risk >= SEVERITY_CRITICAL:
        return ContagionSeverity.CRITICAL
    if risk >= SEVERITY_HIGH:
        return ContagionSeverity.HIGH
    if risk >= SEVERITY_ELEVATED:
        return ContagionSeverity.ELEVATED
    return ContagionSeverity.NOMINAL


def _confidence_from_graph(G: nx.Graph, n_anchors: int) -> ConfidenceLevel:
    n = G.number_of_nodes()
    if n >= 50 and n_anchors >= 1:
        return ConfidenceLevel.HIGH
    if n >= 10:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW


def calculate_contagion_network() -> ContagionNetworkResponse:
    warnings: List[str] = []

    G: Optional[nx.Graph] = getattr(predicto_cache_v2, "contagion_graph", None)
    graph_precomputed = G is not None and G.number_of_nodes() > 0

    if not graph_precomputed:
        warnings.append(
            "contagion_graph not found in cache — building on-the-fly from engineered_df. "
            "For lower latency, call build_contagion_graph() during ingestion."
        )
        raw_df = predicto_cache_v2.engineered_df
        if raw_df is None or raw_df.empty:
            log.warning("contagion_service: no graph and no engineered_df — OFFLINE.")
            return ContagionNetworkResponse(
                summary_narrative="No data available. Run ingestion to populate the cache.",
                data_availability=FeatureAvailability.OFFLINE,
                overall_confidence=ConfidenceLevel.LOW,
                warnings=warnings,
            )
        # Apply Intelligent Schema Alignment
        df = resolve_canonical_df(raw_df)
        G = build_contagion_graph(df)

    if G.number_of_nodes() == 0:
        return ContagionNetworkResponse(
            summary_narrative="Empty contagion graph — no customers found.",
            data_availability=FeatureAvailability.PARTIAL,
            overall_confidence=ConfidenceLevel.LOW,
            graph_precomputed=graph_precomputed,
            warnings=warnings,
        )

    all_nodes    = list(G.nodes())
    anchor_nodes = [
        n for n in all_nodes
        if G.nodes[n].get("churn_probability", 0.0) > CHURN_ANCHOR_THRESHOLD
    ]

    if not anchor_nodes:
        warnings.append(
            f"No anchor nodes found (churn_probability > {CHURN_ANCHOR_THRESHOLD}). "
            "Contagion risk will be zero for all customers."
        )

    node_risk, contagion_paths = _propagate_contagion(G, anchor_nodes)

    node_records: List[ContagionNodeRisk] = []
    arr_at_risk  = 0.0

    for cid in all_nodes:
        attrs   = G.nodes[cid]
        risk    = node_risk.get(cid, 0.0)
        sev     = _severity(risk)
        is_anch = cid in anchor_nodes
        arr     = float(attrs.get("arr", 0.0))

        if sev in (ContagionSeverity.ELEVATED, ContagionSeverity.HIGH, ContagionSeverity.CRITICAL):
            arr_at_risk += arr

        node_records.append(ContagionNodeRisk(
            customer_id            = cid,
            arr                    = round(arr, 2),
            churn_probability      = round(float(attrs.get("churn_probability", 0.0)), 4),
            contagion_risk_factor  = round(risk, 4),
            is_anchor_node         = is_anch,
            severity               = sev,
            neighbor_count         = G.degree(cid),
            segment                = str(attrs.get("segment", "Unknown")),
            )
        )

    node_records.sort(key=lambda nr: nr.contagion_risk_factor, reverse=True)

    total_nodes       = G.number_of_nodes()
    critical_count    = sum(1 for nr in node_records if nr.severity == ContagionSeverity.CRITICAL)
    avg_risk          = float(np.mean([nr.contagion_risk_factor for nr in node_records])) if node_records else 0.0
    possible_edges    = total_nodes * (total_nodes - 1) / 2
    graph_density     = G.number_of_edges() / possible_edges if possible_edges > 0 else 0.0

    network_summary = ContagionNetworkSummary(
        total_customers              = total_nodes,
        anchor_nodes                 = len(anchor_nodes),
        critical_nodes               = critical_count,
        total_arr_at_contagion_risk  = round(arr_at_risk, 2),
        total_edges                  = G.number_of_edges(),
        avg_contagion_risk           = round(avg_risk, 4),
        graph_density                = round(graph_density, 4),
    )

    if anchor_nodes:
        narrative = (
            f"Contagion analysis across {total_nodes} customers identified "
            f"{len(anchor_nodes)} high-risk anchor nodes (churn probability > {CHURN_ANCHOR_THRESHOLD:.0%}). "
            f"{critical_count} customers are at critical contagion exposure, "
            f"representing ${arr_at_risk:,.0f} ARR at contagion risk. "
            f"Mean portfolio contagion factor: {avg_risk:.3f}."
        )
    else:
        narrative = (
            f"No anchor nodes detected across {total_nodes} customers. "
            f"Portfolio contagion risk is nominal. "
            f"Monitor churn probability thresholds as pipeline evolves."
        )

    avail      = FeatureAvailability.ACTIVE if graph_precomputed else FeatureAvailability.PARTIAL
    confidence = _confidence_from_graph(G, len(anchor_nodes))

    log.info(
        "contagion_service: %d nodes, %d anchors, %d critical, confidence=%s",
        total_nodes, len(anchor_nodes), critical_count, confidence,
    )

    return ContagionNetworkResponse(
        nodes               = node_records,
        contagion_paths     = contagion_paths,
        network_summary     = network_summary,
        summary_narrative   = narrative,
        data_availability   = avail,
        overall_confidence  = confidence,
        graph_precomputed   = graph_precomputed,
        warnings            = warnings,
    )
