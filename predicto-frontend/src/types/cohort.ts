import type { FeatureAvailability, ConfidenceLevel } from "@/types/shared";

export interface CohortArchetype {
  archetype_id: number;
  label: string;
  customer_count: number;
  mean_arr: number;
  mean_churn: number;
}

export interface LifecycleFingerprintResponse {
  archetypes: CohortArchetype[];
  customer_assignments: Array<Record<string, unknown>>;
  total_customers_fingerprinted: number;
  dominant_archetype_label: string | null;
  fingerprint_mode: string;
  data_availability: FeatureAvailability;
  overall_confidence: ConfidenceLevel;
  warnings: string[];
}
