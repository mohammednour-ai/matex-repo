export type MCPResponse<T = Record<string, unknown>> = {
  success: boolean;
  data?: T & { upstream_response?: { data?: Record<string, unknown> } };
  error?: { code: string; message: string; requestId?: string };
};

const GENERIC_ERROR = "The service is temporarily unavailable. Please try again.";

function isSafeMessage(message: string): boolean {
  if (!message || message.length > 240) return false;
  if (/column\s+\S+\.\S+\s+does\s+not\s+exist/i.test(message)) return false;
  if (/relation\s+"\S+"\s+does\s+not\s+exist/i.test(message)) return false;
  if (/syntax error at or near/i.test(message)) return false;
  return true;
}

export function normalizeError(
  err: { code?: string; message?: string; requestId?: string } | undefined,
): { code: string; message: string; requestId?: string } {
  if (!err) return { code: "UNKNOWN_ERROR", message: GENERIC_ERROR };
  const safe = isSafeMessage(err.message ?? "") ? err.message! : GENERIC_ERROR;
  return { code: err.code ?? "UNKNOWN_ERROR", message: safe, requestId: err.requestId };
}

export type YardUser = {
  user_id: string;
  email: string;
  full_name: string;
  role: "admin" | "manager" | "scale_operator" | "viewer";
  tenant_id: string;
};

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("yardops_token") ?? "";
}

export function getUser(): YardUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("yardops_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as YardUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: YardUser) {
  if (typeof window !== "undefined") {
    localStorage.setItem("yardops_token", token);
    localStorage.setItem("yardops_user", JSON.stringify(user));
  }
}

export function clearSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("yardops_token");
    localStorage.removeItem("yardops_user");
  }
}

const PUBLIC_TOOLS = new Set(["yardops.login", "yardops.create_tenant"]);

export async function callTool<T = Record<string, unknown>>(
  tool: string,
  args: Record<string, unknown> = {},
  options: { token?: string } = {},
): Promise<MCPResponse<T>> {
  const isPublic = PUBLIC_TOOLS.has(tool);
  const token = options.token ?? getToken();

  if (!isPublic && !token) {
    return { success: false, error: { code: "UNAUTHENTICATED", message: "Not logged in." } };
  }

  try {
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
      return { success: false, error: { code: "PARSE_ERROR", message: GENERIC_ERROR } };
    }
    if (!parsed.success) return { success: false, error: normalizeError(parsed.error) };
    return parsed;
  } catch {
    return { success: false, error: { code: "NETWORK_ERROR", message: GENERIC_ERROR } };
  }
}
