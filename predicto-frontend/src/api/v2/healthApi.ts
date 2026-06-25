import { apiGet } from "@/api/apiClient";
import type { V2HealthResponse } from "@/types/health";

export async function fetchHealthV2(): Promise<V2HealthResponse> {
  return apiGet<V2HealthResponse>("/api/v2/data/health");
}
