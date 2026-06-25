import { apiUpload } from "@/api/apiClient";
import type { V2IngestResponse } from "@/types/health";

export async function ingestZip(file: File): Promise<V2IngestResponse> {
  const formData = new FormData();
  formData.append("files", file);
  return apiUpload<V2IngestResponse>("/api/v2/data/ingest", formData);
}
