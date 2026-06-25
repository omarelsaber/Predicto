import type { FeatureAvailability, ConfidenceLevel } from "@/types/shared";

export interface StressTestScenarioResult {
  scenario: string;
  cvar_5pct: number;
  survival_probability: number;
  arr_bands: Array<Record<string, unknown>>;
}

export interface StressTestResponse {
  scenario_results: StressTestScenarioResult[];
  survival_curve: Array<Record<string, unknown>>;
  summary_narrative: string;
  data_availability: FeatureAvailability;
  overall_confidence: ConfidenceLevel;
  warnings: string[];
}

export interface StressTestRequest {
  scenarios: string[];
  n_iterations?: number;
  forecast_horizon_months?: number;
}
