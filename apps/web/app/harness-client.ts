"use client";

export type GatewayResponse = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
};

const TEST_IDS_KEY = "matex_test_ids";

type TrackedIds = {
  userIds: string[];
  listingIds: string[];
  threadIds: string[];
  messageIds: string[];
  transactionIds: string[];
  verificationIds: string[];
  escrowIds: string[];
  auctionIds: string[];
  lotIds: string[];
  inspectionIds: string[];
  bookingIds: string[];
};

function defaultTrackedIds(): TrackedIds {
  return {
    userIds: [],
    listingIds: [],
    threadIds: [],
    messageIds: [],
    transactionIds: [],
    verificationIds: [],
    escrowIds: [],
    auctionIds: [],
    lotIds: [],
    inspectionIds: [],
    bookingIds: [],
  };
}

export function readTrackedIds(): TrackedIds {
  if (typeof window === "undefined") return defaultTrackedIds();
  try {
    const raw = localStorage.getItem(TEST_IDS_KEY);
    if (!raw) return defaultTrackedIds();
    return { ...defaultTrackedIds(), ...(JSON.parse(raw) as Partial<TrackedIds>) };
  } catch {
    return defaultTrackedIds();
  }
}

export function writeTrackedIds(next: TrackedIds): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TEST_IDS_KEY, JSON.stringify(next));
}

export function addTrackedId(bucket: keyof TrackedIds, value?: string | null): void {
  if (!value) return;
  const current = readTrackedIds();
  const list = current[bucket];
  if (!list.includes(value)) {
    list.push(value);
    writeTrackedIds(current);
  }
}

export async function callGatewayTool(tool: string, args: Record<string, unknown>): Promise<{ status: number; payload: GatewayResponse; raw: string }> {
  const token = typeof window !== "undefined" ? localStorage.getItem("matex_token") ?? "" : "";
  const response = await fetch("/api/gateway", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, args, token }),
  });
  const raw = await response.text();
  let payload: GatewayResponse = { success: false, error: { code: "INVALID_RESPONSE", message: "Response is not valid JSON." } };
  try {
    payload = JSON.parse(raw) as GatewayResponse;
  } catch {
    // leave default payload
  }
  return { status: response.status, payload, raw };
}

export function formatResult(title: string, result: { status: number; payload: GatewayResponse; raw: string }): string {
  const lines = [`${title}`, `HTTP ${result.status}`];
  if (result.payload.success) {
    lines.push(JSON.stringify(result.payload.data ?? {}, null, 2));
  } else {
    lines.push(JSON.stringify(result.payload.error ?? { message: result.raw }, null, 2));
  }
  return lines.join("\n");
}

export function requiredMessage(fields: Array<[string, string]>): string | null {
  const missing = fields.filter(([, value]) => value.trim().length === 0).map(([name]) => name);
  if (missing.length === 0) return null;
  return `Missing required fields: ${missing.join(", ")}`;
}
