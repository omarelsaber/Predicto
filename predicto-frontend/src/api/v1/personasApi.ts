import { apiGet } from "@/api/apiClient";
import type { PersonasResponse } from "@/types/personas";

export async function fetchPersonas(): Promise<PersonasResponse> {
  return apiGet<PersonasResponse>("/api/v1/personas");
}
