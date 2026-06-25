import { apiGet } from "@/api/apiClient";

export async function fetchPreview() {
  return apiGet("/api/v1/preview");
}
