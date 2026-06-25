import type { FeatureAvailability, ConfidenceLevel } from "@/types/shared";

export type ContagionSeverity = "CRITICAL" | "ELEVATED" | "NOMINAL";

export interface ContagionNodeRisk {
  customer_id: string;
  arr: number;
  churn_probability: number;
  contagion_risk_factor: number;
  is_anchor_node: boolean;
  severity: ContagionSeverity;
  neighbor_count: number;
  segment: string;
}

export interface ContagionPath {
  anchor_customer_id: string;
  affected_customer_id: string;
  n_hops: number;
  path_risk: number;
  path_customer_ids: string[];
}

export interface ContagionNetworkSummary {
  total_customers: number;
  anchor_nodes: number;
  critical_nodes: number;
  total_arr_at_stake_contagion: number;
  total_edges: number;
  avg_contagion_risk: number;
  graph_density: number;
}

export interface ContagionNetworkResponse {
  nodes: ContagionNodeRisk[];
  contagion_paths: ContagionPath[];
  network_summary: ContagionNetworkSummary;
  summary_narrative: string;
  data_availability: FeatureAvailability;
  overall_confidence: ConfidenceLevel;
  warnings: string[];
}
