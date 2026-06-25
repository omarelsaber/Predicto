import type { FeatureAvailability, ConfidenceLevel } from "@/types/shared";

export interface RepPlaybookRecord {
  rep_id: string;
  rep_name: string;
  total_deals: number;
  overall_win_rate: number;
  playbook_narrative: string;
  segment_breakdown: Array<Record<string, unknown>>;
}

export interface RepPlaybookResponse {
  rep_playbooks: RepPlaybookRecord[];
  routing_matrix: Array<Record<string, unknown>>;
  total_reps: number;
  portfolio_win_rate: number;
  data_availability: FeatureAvailability;
  overall_confidence: ConfidenceLevel;
  warnings: string[];
}
