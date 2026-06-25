import { apiGet } from "@/api/apiClient";
import type { IntelligenceHubResponse } from "@/types/intelligenceHub";

export async function fetchIntelligenceHub(): Promise<IntelligenceHubResponse> {
  return apiGet<IntelligenceHubResponse>("/api/v2/intelligence/hub");
}
