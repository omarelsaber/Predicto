import { apiGet } from "@/api/apiClient";
import type { ForecastResponse } from "@/types/forecast";

export async function fetchForecast(periods = 3): Promise<ForecastResponse> {
  return apiGet<ForecastResponse>(`/api/v1/forecast?periods=${periods}`);
}
