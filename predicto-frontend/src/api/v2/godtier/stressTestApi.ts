import { apiPost } from "@/api/apiClient";
import type {
  StressTestRequest,
  StressTestResponse,
} from "@/types/godtier/stressTest";

export async function runStressTest(
  req: StressTestRequest
): Promise<StressTestResponse> {
  return apiPost<StressTestResponse>(
    "/api/v2/godtier/forecast/stress-test",
    req
  );
}
