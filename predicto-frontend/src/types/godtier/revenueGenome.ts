import type { FeatureAvailability, ConfidenceLevel } from "@/types/shared";

export interface GenomeClusterNode {
  cluster_id: string;
  label: string;
  customer_count: number;
  mean_churn: number;
  genetic_drift_score: number;
}

export interface RevenueGenomeResponse {
  clusters: GenomeClusterNode[];
  edges: Array<Record<string, unknown>>;
  drift_metrics: Array<Record<string, unknown>>;
  summary_narrative: string;
  data_availability: FeatureAvailability;
  overall_confidence: ConfidenceLevel;
  warnings: string[];
}
