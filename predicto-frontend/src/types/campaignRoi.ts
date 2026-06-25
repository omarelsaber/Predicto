import type { FeatureAvailability, ConfidenceLevel } from "@/types/shared";

export interface CampaignShapleyRecord {
  campaign_id: string;
  campaign_type: string;
  shapley_value: number;
  shapley_pct: number;
  total_cost: number;
  roi: number;
  touch_count: number;
  deals_influenced: number;
}

export interface GoldenSequenceRecord {
  sequence_id: number;
  campaign_sequence: string[];
  sequence_key: string;
  win_rate: number;
  mean_arr_won: number;
  ev_score: number;
}

export interface CampaignROIResponse {
  campaign_attributions: CampaignShapleyRecord[];
  golden_sequences: GoldenSequenceRecord[];
  total_campaigns_analysed: number;
  total_attributed_arr: number;
  portfolio_roi: number;
  data_availability: FeatureAvailability;
  overall_confidence: ConfidenceLevel;
  warnings: string[];
}
