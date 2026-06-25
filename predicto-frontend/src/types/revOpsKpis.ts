export interface KPIValue {
  key: string;
  label: string;
  value: number;
  unit: string;
  delta?: number | null;
  n_customers: number;
}

export interface RevOpsKPIResponse {
  kpis: KPIValue[];
  overall_health_score: number;
  tables_loaded: string[];
  active_model: string | null;
  degradation_events: number;
}
