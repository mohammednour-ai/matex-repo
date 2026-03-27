const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:3001";

export type MCPResponse<T = Record<string, unknown>> = {
  success: boolean;
  data?: T & { upstream_response?: { data?: Record<string, unknown> } };
  error?: { code: string; message: string };
};

function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("matex_token") ?? "";
}

export function getUser(): { userId: string; email: string; accountType: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("matex_user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setUser(user: { userId: string; email: string; accountType: string }) {
  if (typeof window !== "undefined") localStorage.setItem("matex_user", JSON.stringify(user));
}

export function clearSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("matex_token");
    localStorage.removeItem("matex_user");
  }
}

export function extractId(result: MCPResponse, key: string): string {
  const up = result.data?.upstream_response?.data as Record<string, unknown> | undefined;
  return String(up?.[key] ?? result.data?.[key] ?? "");
}

export async function callTool<T = Record<string, unknown>>(
  tool: string,
  args: Record<string, unknown> = {},
  options: { token?: string } = {}
): Promise<MCPResponse<T>> {
  const token = options.token ?? getToken();
  const isPublic = ["auth.register","auth.login","auth.request_email_otp","auth.request_phone_otp","auth.verify_email","auth.verify_phone"].includes(tool);
  
  const res = await fetch("/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, args, token: isPublic ? undefined : token }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as MCPResponse<T>;
  } catch {
    return { success: false, error: { code: "PARSE_ERROR", message: text.slice(0, 200) } };
  }
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
