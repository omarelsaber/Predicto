import { apiGet } from "@/api/apiClient";
import type { TreatmentType } from "@/types/enums";
import type { CounterfactualResponse } from "@/types/godtier/counterfactual";

export async function fetchCounterfactual(
  treatment: TreatmentType
): Promise<CounterfactualResponse> {
  return apiGet<CounterfactualResponse>(
    `/api/v2/godtier/causal/counterfactual?treatment=${treatment}`
  );
}
