import axios from 'axios';
import type { TopologyOptimizationRequest, TopologyOptimizationResponse } from "@/types/godtier/topologyOptimizer";

export async function runTopologyOptimizer(req: TopologyOptimizationRequest): Promise<TopologyOptimizationResponse> {
  const { data } = await axios.post('/api/v2/godtier/optimization/topology', req);
  return data;
}
