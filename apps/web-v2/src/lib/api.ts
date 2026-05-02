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
