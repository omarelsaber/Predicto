import { apiGet } from "@/api/apiClient";

export async function fetchSynthesise() {
  return apiGet("/api/v1/synthesis/executive");
}
