import { apiPost } from "@/api/apiClient";
import type {
  TopologyOptimizationRequest,
  TopologyOptimizationResponse,
} from "@/types/godtier/topologyOptimizer";

export async function runTopologyOptimizer(
  req: TopologyOptimizationRequest
): Promise<TopologyOptimizationResponse> {
  return apiPost<TopologyOptimizationResponse>(
    "/api/v2/godtier/optimization/topology",
    req
  );
}
