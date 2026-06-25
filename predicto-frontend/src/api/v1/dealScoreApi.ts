import { apiPost } from "@/api/apiClient";

export async function fetchDealScore(body: Record<string, unknown>) {
  return apiPost("/api/v1/deals/score", body);
}
