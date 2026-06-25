import { apiGet } from "@/api/apiClient";
import type { CampaignROIResponse } from "@/types/campaignRoi";

export async function fetchCampaignRoi(): Promise<CampaignROIResponse> {
  return apiGet<CampaignROIResponse>("/v2/attribution/campaign-roi-decomposer");
}
