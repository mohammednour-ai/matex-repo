/**
 * Server-side helper for calling MCP tools via the gateway. Used by API
 * routes and Inngest functions that run on the Next.js server.
 *
 * The browser-side equivalent lives in `lib/api.ts` and proxies through
 * `/api/mcp`; this version skips that hop and calls the gateway directly.
 */

export type GatewayResponse<T = Record<string, unknown>> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
};

function gatewayUrl(): string {
  const a = process.env.MCP_GATEWAY_URL?.trim().replace(/\/$/, "") ?? "";
  if (a) return a;
  const b = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim().replace(/\/$/, "") ?? "";
  if (b) return b;
  return "http://localhost:3001";
}

export async function callGatewayTool<T = Record<string, unknown>>(
  tool: string,
  args: Record<string, unknown> = {},
  options: { token?: string } = {},
): Promise<GatewayResponse<T>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  try {
    const res = await fetch(`${gatewayUrl()}/tool`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool, args }),
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as GatewayResponse<T>;
    } catch {
      return {
        success: false,
        error: { code: "GATEWAY_PARSE_ERROR", message: `Non-JSON response from gateway: ${text.slice(0, 200)}` },
      };
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: "GATEWAY_UNREACHABLE",
        message: err instanceof Error ? err.message : "Unknown gateway error",
      },
    };
  }
}
