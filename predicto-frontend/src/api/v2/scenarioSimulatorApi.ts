import { apiPost } from "@/api/apiClient";
import type { SimulatorRequest, SimulatorResponse } from "@/types/simulator";

export async function runScenarioSimulator(
  req: SimulatorRequest
): Promise<SimulatorResponse> {
  return apiPost<SimulatorResponse>("/api/v2/forecast/revenue-simulator", req);
}
