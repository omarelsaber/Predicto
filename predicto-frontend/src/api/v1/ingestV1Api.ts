import { apiUpload } from "@/api/apiClient";
import type { V1IngestResponse } from "@/types/health";

export async function ingestCsv(file: File): Promise<V1IngestResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<V1IngestResponse>("/api/v1/ingest", formData);
}
