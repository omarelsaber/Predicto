import { apiGet } from "@/api/apiClient";

export async function fetchAnalystExplain() {
  return apiGet("/api/v2/analyst/explain");
}
