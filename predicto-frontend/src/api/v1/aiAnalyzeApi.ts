import { apiGet } from "@/api/apiClient";

export async function fetchAiAnalyze() {
  return apiGet("/api/v1/ai/analyze");
}
