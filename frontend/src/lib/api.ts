import {
  Analytics,
  Category,
  CreateExperimentRequest,
  ExperimentDetail,
  ExperimentSummary,
  ProviderWithModels,
  Topic,
} from "@/types/experiment";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...options, cache: "no-store" });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function getModels(): Promise<ProviderWithModels[]> {
  return request("/api/models");
}

export function getCategories(): Promise<Category[]> {
  return request("/api/categories");
}

export function getTopics(categoryId: number): Promise<Topic[]> {
  return request(`/api/topics?category_id=${categoryId}`);
}

export function createExperiment(body: CreateExperimentRequest): Promise<{ uuid: string }> {
  return request("/api/experiments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getExperiments(): Promise<ExperimentSummary[]> {
  return request("/api/experiments");
}

export function getExperiment(uuid: string): Promise<ExperimentDetail> {
  return request(`/api/experiments/${uuid}`);
}

export function getAnalytics(): Promise<Analytics> {
  return request("/api/analytics");
}

export function experimentWsUrl(uuid: string): string {
  const base = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
  return `${base}/ws/experiments/${uuid}`;
}
