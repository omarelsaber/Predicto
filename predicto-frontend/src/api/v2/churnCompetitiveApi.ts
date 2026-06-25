import { apiGet } from "@/api/apiClient";
import type { CompetitiveChurnResponse } from "@/types/churn";

export async function fetchChurnWarnings(): Promise<CompetitiveChurnResponse> {
  return apiGet<CompetitiveChurnResponse>("/api/v2/churn/competitive?limit=50");
}
