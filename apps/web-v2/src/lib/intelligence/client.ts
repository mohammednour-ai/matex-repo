"use client";

/**
 * Browser helper that talks to the /api/intelligence/* routes.
 *
 * Mirrors the lib/api.ts approach: pulls the JWT + user_id out of
 * localStorage and forwards them via headers so the server can attribute
 * recommendations / alerts to the right user without needing a separate
 * cookie-based session.
 */

import { getToken, getUser } from "@/lib/api";
import type {
  ListingMetricsRow,
  MarketIntelligenceRow,
  PriceAlertRow,
  PriceAlertStatus,
  PriceAlertType,
  PriceRecommendationRow,
} from "./types";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const user = getUser();
  if (user?.userId) headers["x-matex-user-id"] = user.userId;
  return headers;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("intelligence_response_invalid_json");
  }
  if (!res.ok) {
    const err = data as { error?: string; message?: string };
    throw new Error(err.message ?? err.error ?? "intelligence_request_failed");
  }
  return data as T;
}

export async function fetchAllSnapshots(): Promise<MarketIntelligenceRow[]> {
  const res = await fetch("/api/intelligence/summary", { headers: authHeaders() });
  const json = await jsonOrThrow<{ snapshots: MarketIntelligenceRow[] }>(res);
  return json.snapshots;
}

export async function fetchMaterialSnapshot(materialKey: string): Promise<{
  material: { key: string; label: string; unit: string };
  latest: MarketIntelligenceRow | null;
  history: MarketIntelligenceRow[];
}> {
  const res = await fetch(`/api/intelligence/summary/${encodeURIComponent(materialKey)}`, {
    headers: authHeaders(),
  });
  return jsonOrThrow(res);
}

export async function requestPriceRecommendation(input: {
  material_key?: string;
  material?: string;
  quantity?: number | string | null;
  unit?: string;
  seller_region?: string;
  listing_id?: string;
}): Promise<{ recommendation: PriceRecommendationRow; intelligence: MarketIntelligenceRow | null; ai: { configured: boolean; source: string } }> {
  const res = await fetch("/api/intelligence/recommend-price", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return jsonOrThrow(res);
}

export async function fetchListingMetrics(listingId: string): Promise<ListingMetricsRow> {
  const res = await fetch(`/api/intelligence/listing/${encodeURIComponent(listingId)}/metrics`, {
    headers: authHeaders(),
  });
  const json = await jsonOrThrow<{ metrics: ListingMetricsRow }>(res);
  return json.metrics;
}

export async function recomputeListingMetrics(
  listingId: string,
  body: { material_key?: string; material?: string; asking_price?: number | string | null },
): Promise<ListingMetricsRow> {
  const res = await fetch(`/api/intelligence/listing/${encodeURIComponent(listingId)}/metrics`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const json = await jsonOrThrow<{ metrics: ListingMetricsRow }>(res);
  return json.metrics;
}

export async function fetchAlerts(): Promise<PriceAlertRow[]> {
  const res = await fetch("/api/intelligence/alerts", { headers: authHeaders() });
  const json = await jsonOrThrow<{ alerts: PriceAlertRow[] }>(res);
  return json.alerts;
}

export async function createAlert(input: {
  material_key: string;
  alert_type: PriceAlertType;
  threshold?: number | string | null;
  region?: string | null;
  channels?: string[];
  note?: string | null;
}): Promise<PriceAlertRow> {
  const res = await fetch("/api/intelligence/alerts", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  const json = await jsonOrThrow<{ alert: PriceAlertRow }>(res);
  return json.alert;
}

export async function setAlertStatus(alertId: string, status: PriceAlertStatus): Promise<PriceAlertRow> {
  const res = await fetch(`/api/intelligence/alerts/${encodeURIComponent(alertId)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  const json = await jsonOrThrow<{ alert: PriceAlertRow }>(res);
  return json.alert;
}

export async function deleteAlert(alertId: string): Promise<void> {
  const res = await fetch(`/api/intelligence/alerts/${encodeURIComponent(alertId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await jsonOrThrow(res);
}
