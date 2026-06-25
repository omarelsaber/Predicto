import { apiGet } from "@/api/apiClient";
import type { DealPriorityResponse } from "@/types/deals";

export async function fetchDealPriority(): Promise<DealPriorityResponse> {
  return apiGet<DealPriorityResponse>("/api/v2/deals/priority");
}
