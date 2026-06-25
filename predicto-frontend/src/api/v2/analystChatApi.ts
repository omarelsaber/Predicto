import { apiPost } from "@/api/apiClient";

export async function fetchAnalystChat(body: Record<string, unknown>) {
  return apiPost("/api/v2/analyst/chat", body);
}
