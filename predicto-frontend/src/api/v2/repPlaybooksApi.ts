import { apiGet } from "@/api/apiClient";
import type { RepPlaybookResponse } from "@/types/repPlaybooks";

export async function fetchRepPlaybooks(): Promise<RepPlaybookResponse> {
  return apiGet<RepPlaybookResponse>("/v2/attribution/rep-playbook");
}
