export interface SimulatorRequest {
  discount_ceiling?: number | null;
  churn_intervention_threshold?: number | null;
  expansion_activation_clusters?: string[] | null;
  forecast_months?: number;
}

export interface SimulatorMonthPoint {
  month: number;
  baseline_mrr: number;
  scenario_mrr: number;
  delta_mrr: number;
  confidence: string;
}

export interface SimulatorResponse {
  baseline_total_mrr: number;
  scenario_total_mrr: number;
  net_mrr_delta: number;
  monthly_projection: SimulatorMonthPoint[];
  summary_narrative: string;
  warnings: string[];
}
