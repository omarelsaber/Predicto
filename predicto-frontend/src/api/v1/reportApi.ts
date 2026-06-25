import { apiGet } from "@/api/apiClient";

export async function fetchReport() {
  return apiGet("/api/v1/report");
}
