import { apiGet } from "@/api/apiClient";

export async function fetchRevenueOverview() {
  return apiGet("/api/v1/revenue/overview");
}
