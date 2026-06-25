import type { FeatureAvailability } from "@/types/shared";

export interface HeadlineKPI {
  key: string;
  label: string;
  value: number;
  unit: string;
  delta?: number | null;
  delta_label?: string | null;
  trend?: string | null;
}

export interface IntelligenceHubResponse {
  headline_kpis: HeadlineKPI[];
  revenue_risk_summary: Array<Record<string, unknown>>;
  action_queue: Array<Record<string, unknown>>;
  root_cause_narrative?: Record<string, unknown> | null;
  data_availability: FeatureAvailability;
  overall_confidence: string;
  warnings: string[];
}
