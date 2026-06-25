import { apiGet } from "@/api/apiClient";
import type { DealWarRoomResponse } from "@/types/godtier/warRoom";

export async function fetchWarRoom(): Promise<DealWarRoomResponse> {
  return apiGet<DealWarRoomResponse>("/api/v2/godtier/deals/war-room");
}
