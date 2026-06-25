import type { FeatureAvailability, ConfidenceLevel } from "@/types/shared";

export interface DealWarRoomResponse {
  deal_recommendations: Array<Record<string, unknown>>;
  pareto_frontier: Array<Record<string, unknown>>;
  equilibrium_mix: Record<string, number>;
  summary_narrative: string;
  data_availability: FeatureAvailability;
  overall_confidence: ConfidenceLevel;
  warnings: string[];
}
