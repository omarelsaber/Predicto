import { apiGet } from "@/api/apiClient";
import type { RevenueGenomeResponse } from "@/types/godtier/revenueGenome";

export async function fetchRevenueGenome(): Promise<RevenueGenomeResponse> {
  return apiGet<RevenueGenomeResponse>("/api/v2/godtier/portfolio/genome");
}
