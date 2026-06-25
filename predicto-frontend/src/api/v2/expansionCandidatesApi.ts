import { apiGet } from "@/api/apiClient";
import type { ExpansionCandidatesResponse } from "@/types/expansion";

export async function fetchExpansionCandidates(): Promise<ExpansionCandidatesResponse> {
  return apiGet<ExpansionCandidatesResponse>("/api/v2/expansion/candidates");
}
