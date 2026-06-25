import { apiGet } from "@/api/apiClient";
import type { LifecycleFingerprintResponse } from "@/types/cohort";

export async function fetchCohortLifecycle(): Promise<LifecycleFingerprintResponse> {
  return apiGet<LifecycleFingerprintResponse>("/v2/cohorts/lifecycle-fingerprint");
}
