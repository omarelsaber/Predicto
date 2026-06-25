import type { FeatureAvailability } from "@/types/shared";

export type DealSignalType =
  | "DISCOUNT_CLIFF"
  | "MARGIN_PRESSURE"
  | "SEGMENT_MISMATCH"
  | "HIGH_PRIORITY"
  | "LONG_CYCLE"
  | "HIGH_ARR"
  | "CHURN_RISK"
  | "GENERIC";

export interface DealRecord {
  deal_id: string;
  deal_name: string;
  priority_score: number;
  arr: number;
  rep: string;
  segment: string;
  discount_pct: number;
  days_in_pipeline: number;
  top_signal: string;
  top_signal_type: DealSignalType;
  recommended_action: string;
  win_probability: number | null;
}

export interface DealPriorityResponse {
  deals: DealRecord[];
  total_deals: number;
  total_arr_at_stake: number;
  high_discount_threshold: number;
  safe_margin_floor: number;
  scorer_mode: string;
  data_availability: FeatureAvailability;
}
