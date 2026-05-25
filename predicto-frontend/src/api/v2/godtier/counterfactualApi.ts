import type { TreatmentType } from "@/types/enums";
import type { CounterfactualResponse } from "@/types/godtier/counterfactual";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

export async function fetchCounterfactual(treatment: TreatmentType): Promise<CounterfactualResponse> {
    const res = await fetch(`${API_URL}/api/v2/godtier/causal/counterfactual?treatment=${treatment}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch counterfactual data for ${treatment}`);
    }
    return res.json();
}
