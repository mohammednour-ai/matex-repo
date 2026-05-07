export type MCPResponse<T = Record<string, unknown>> = {
  success: boolean;
  data?: T & { upstream_response?: { data?: Record<string, unknown> } };
  error?: { code: string; message: string; requestId?: string };
};

const GENERIC_ERROR_MESSAGE = "The service is temporarily unavailable. Please try again.";

/**
 * Normalize any upstream/error payload to a user-safe message. The gateway already
 * sanitizes upstream errors, but defense-in-depth: the browser must never render
 * raw SQL/stack/column text even if a future gateway regression slips through.
 */
function isSafeMessage(message: string): boolean {
  if (!message) return false;
  if (message.length > 240) return false;
  // Heuristics: anything that looks like a DB schema reference or a raw status line
  // is not safe to show users.
  if (/column\s+\S+\.\S+\s+does\s+not\s+exist/i.test(message)) return false;
  if (/^Upstream returned \d{3}/i.test(message)) return false;
  if (/relation\s+"\S+"\s+does\s+not\s+exist/i.test(message)) return false;
  if (/syntax error at or near/i.test(message)) return false;
  return true;
}

export function normalizeError(err: { code?: string; message?: string; requestId?: string } | undefined): {
  code: string;
  message: string;
  requestId?: string;
} {
  if (!err) return { code: "UNKNOWN_ERROR", message: GENERIC_ERROR_MESSAGE };
  const safe = isSafeMessage(err.message ?? "") ? err.message! : GENERIC_ERROR_MESSAGE;
  return { code: err.code ?? "UNKNOWN_ERROR", message: safe, requestId: err.requestId };
}

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("matex_token") ?? "";
}

export type MatexUser = {
  userId: string;
  email: string;
  accountType: string;
  /** Set at login when the account is in `public.matex_admin_operators` or matches `MATEX_DEV_ADMIN_EMAILS`. */
  isPlatformAdmin?: boolean;
};

export function getUser(): MatexUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("matex_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MatexUser;
  } catch {
    return null;
  }
}

export function setUser(user: MatexUser) {
  if (typeof window !== "undefined") localStorage.setItem("matex_user", JSON.stringify(user));
}

export function clearSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("matex_token");
    localStorage.removeItem("matex_user");
  }
}

export function extractId(result: MCPResponse, key: string): string {
  const data = result.data as Record<string, unknown> | undefined;
  if (!data) return "";
  const top = data[key];
  if (top !== undefined && top !== null && String(top).trim() !== "") return String(top);
  const ur = data.upstream_response as Record<string, unknown> | undefined;
  if (ur && typeof ur === "object") {
    const inner = ur.data as Record<string, unknown> | undefined;
    if (inner && inner[key] !== undefined && inner[key] !== null && String(inner[key]).trim() !== "") {
      return String(inner[key]);
    }
    const flat = ur[key];
    if (flat !== undefined && flat !== null && String(flat).trim() !== "") return String(flat);
  }
  return "";
}

// Tools migrated to Supabase Edge Functions. Membership in this set flips
// transport from /api/mcp (Node MCP gateway) to /functions/v1/<domain>
// (Supabase Edge). Add tools here as their domain function ships and passes
// parity tests. The MCP path remains available as fallback and is the AI
// surface (apps/web-v2/src/app/api/chat/route.ts).
const TOOLS_ON_EDGE = new Set<string>([
  "escrow.create_escrow",
  "escrow.hold_funds",
  "escrow.release_funds",
  "escrow.freeze_escrow",
  "escrow.refund_escrow",
  "escrow.set_release_conditions",
  "escrow.approve_release_condition",
  "escrow.get_escrow",
  "escrow.list_escrows",
  "escrow.ping",
  "listing.create_listing",
  "listing.update_listing",
  "listing.upload_images",
  "listing.publish_listing",
  "listing.archive_listing",
  "listing.get_listing",
  "listing.get_my_listings",
  "listing.list_listings",
  "listing.add_favorite",
  "listing.remove_favorite",
  "listing.list_favorites",
  "listing.create_category",
  "listing.update_category",
  "listing.list_categories",
  "listing.get_category",
  "listing.ping",
  "search.search_materials",
  "search.geo_search",
  "search.filter_by_category",
  "search.save_search",
  "search.get_saved_searches",
  "search.index_listing",
  "search.remove_from_index",
  "search.ping",
  "orders.create_order",
  "orders.get_order",
  "orders.list_orders",
  "orders.update_order_status",
  "orders.cancel_order",
  "orders.ping",
  "payments.process_payment",
  "payments.get_wallet_balance",
  "payments.top_up_wallet",
  "payments.manage_payment_methods",
  "payments.get_transaction_history",
  "payments.ping",
]);

const SUPABASE_FN_BASE =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") + "/functions/v1";

async function callViaEdge<T>(
  tool: string,
  args: Record<string, unknown>,
  token: string,
): Promise<MCPResponse<T>> {
  const [domain, ...rest] = tool.split(".");
  const toolName = rest.join(".");
  try {
    const res = await fetch(`${SUPABASE_FN_BASE}/${domain}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tool: toolName, args }),
    });
    const text = await res.text();
    const parsed = JSON.parse(text) as MCPResponse<T>;
    if (!parsed.success) return { success: false, error: normalizeError(parsed.error) };
    return parsed;
  } catch {
    return { success: false, error: { code: "NETWORK_ERROR", message: GENERIC_ERROR_MESSAGE } };
  }
}

export async function callTool<T = Record<string, unknown>>(
  tool: string,
  args: Record<string, unknown> = {},
  options: { token?: string } = {}
): Promise<MCPResponse<T>> {
  const publicTools = ["auth.register","auth.login","auth.request_email_otp","auth.request_phone_otp","auth.verify_email","auth.verify_phone"];
  const isPublic = publicTools.includes(tool);
  const token = options.token ?? getToken();

  // Don't make authenticated calls without a token
  if (!isPublic && !token) {
    return { success: false, error: { code: "UNAUTHENTICATED", message: "Not logged in." } };
  }

  if (TOOLS_ON_EDGE.has(tool) && token) {
    return callViaEdge<T>(tool, args, token);
  }

  const res = await fetch("/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, args, token: isPublic ? undefined : token }),
  });
  const text = await res.text();
  let parsed: MCPResponse<T>;
  try {
    parsed = JSON.parse(text) as MCPResponse<T>;
  } catch {
    return { success: false, error: { code: "PARSE_ERROR", message: GENERIC_ERROR_MESSAGE } };
  }
  if (!parsed.success) {
    return { success: false, error: normalizeError(parsed.error) };
  }
  return parsed;
}

export async function callCopilot(message: string, context?: Record<string, unknown>): Promise<{
  content: string;
  tool_call?: { tool: string; args: Record<string, unknown>; status: number; response: Record<string, unknown> } | null;
}> {
  const token = getToken();
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, context, token }),
  });
  return res.json();
}
