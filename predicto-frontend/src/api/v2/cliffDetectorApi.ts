import { apiGet } from "@/api/apiClient";
import type { CliffDetectorResponse } from "@/types/cliffDetector";

export async function fetchCliffDetector(): Promise<CliffDetectorResponse> {
  return apiGet<CliffDetectorResponse>("/api/v2/risk/revenue-cliff-detector");
}
