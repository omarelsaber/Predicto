import { apiGet } from "@/api/apiClient";
import type { ContagionNetworkResponse } from "@/types/godtier/contagionNetwork";

export async function fetchContagionNetwork(): Promise<ContagionNetworkResponse> {
  return apiGet<ContagionNetworkResponse>(
    "/api/v2/godtier/portfolio/contagion-network"
  );
}
