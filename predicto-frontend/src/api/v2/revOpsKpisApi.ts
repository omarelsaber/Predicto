import { apiGet } from "@/api/apiClient";
import type { RevOpsKPIResponse } from "@/types/revOpsKpis";

export async function fetchRevOpsKpis(): Promise<RevOpsKPIResponse> {
  return apiGet<RevOpsKPIResponse>("/api/v2/revops/kpis");
}
