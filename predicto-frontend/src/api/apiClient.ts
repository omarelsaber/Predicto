/**
 * Shared HTTP client for Predicto frontend API modules.
 *
 * Uses VITE_API_URL when set (production / custom backend). When empty,
 * requests use relative paths so the Vite dev proxy forwards to the API.
 */

import type { ApiError } from "@/types/shared";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

function buildUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

async function parseError(response: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = await response.json();
  } catch {
    // non-JSON error body
  }

  const detail = body.detail;
  const message =
    (typeof body.message === "string" && body.message) ||
    (typeof detail === "string" && detail) ||
    (typeof detail === "object" &&
      detail !== null &&
      typeof (detail as { message?: string }).message === "string" &&
      (detail as { message: string }).message) ||
    `Request failed (${response.status})`;

  return {
    status: response.status,
    code: typeof body.error === "string" ? body.error : "request_failed",
    message,
    detail: typeof detail === "string" ? detail : undefined,
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const err = await parseError(response);
    throw new Error(err.message);
  }
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    method: "GET",
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });
  return handleResponse<T>(response);
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    method: "POST",
    body: formData,
  });
  return handleResponse<T>(response);
}

export { API_BASE };
