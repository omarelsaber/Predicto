import type { FeatureAvailability } from "@/types/shared";

export interface DegradationEvent {
  table: string;
  column: string;
  strategy: string;
  n_affected: number;
}

export interface AIModuleStatus {
  status: "ACTIVE" | "PARTIAL" | "OFFLINE";
  reason: string;
}

export interface V2IngestResponse {
  status: string;
  health_score: number;
  tables_loaded: string[];
  tables_missing: string[];
  active_model: string | null;
  degradation_events: number;
  message: string;
}

export interface V1IngestResponse {
  status: string;
  rows_raw: number;
  rows_monthly: number;
  file_hash: string;
  rows_dropped?: number;
  validation_errors?: string[];
}

export interface V2HealthResponse {
  is_ready: boolean;
  health_score: number;
  active_model: string | null;
  tables_loaded: string[];
  tables_missing: string[];
  degradation_log: DegradationEvent[];
  ai_modules: Record<string, AIModuleStatus>;
  ingestion_error: string | null;
  sales_preview: Record<string, unknown>[];
}
