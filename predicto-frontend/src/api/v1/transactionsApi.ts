import { apiGet } from "@/api/apiClient";

export async function fetchTransactions() {
  return apiGet("/api/v1/preview");
}
