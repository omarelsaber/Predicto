import type { FeatureAvailability, ConfidenceLevel } from "@/types/shared";

export type CliffAlertLevel = "CLIFF_ALERT" | "ELEVATED" | "NORMAL";

export interface CliffMonthWindow {
  month: number;
  total_renewing_arr: number;
  high_risk_arr: number;
  cliff_severity_score: number;
  alert_level: CliffAlertLevel;
}

export interface CliffDetectorResponse {
  cliff_calendar: CliffMonthWindow[];
  cliff_alert_months: number[];
  elevated_months: number[];
  total_arr_at_risk: number;
  peak_cliff_month: number | null;
  cliff_narrative: string;
  data_availability: FeatureAvailability;
  overall_confidence: ConfidenceLevel;
  warnings: string[];
}
