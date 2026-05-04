// Common request wrapper for {tool, args} envelope used by every edge function.
// Mirrors the shape the MCP gateway already speaks so the UI can swap transport
// per-tool without changing call sites.

import { failEnvelope, okEnvelope } from "./logic.ts";
import { getCaller, type Caller } from "./auth.ts";

export interface ToolRequest {
  tool: string;
  args: Record<string, unknown>;
  caller: Caller;
}

export type ToolHandler = (req: ToolRequest) => Promise<unknown>;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export function serveDomain(handlers: Record<string, ToolHandler>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (req.method !== "POST") return jsonResponse(failEnvelope("METHOD_NOT_ALLOWED", "POST only"), 405);

    const caller = getCaller(req);
    if (!caller) return jsonResponse(failEnvelope("UNAUTHENTICATED", "Missing or invalid bearer token"), 401);

    let body: { tool?: string; args?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return jsonResponse(failEnvelope("BAD_REQUEST", "Invalid JSON body"), 400);
    }
    const tool = String(body.tool ?? "");
    const args = (body.args ?? {}) as Record<string, unknown>;
    if (!tool) return jsonResponse(failEnvelope("BAD_REQUEST", "tool is required"), 400);

    const handler = handlers[tool];
    if (!handler) return jsonResponse(failEnvelope("UNKNOWN_TOOL", `Unknown tool: ${tool}`), 404);

    try {
      const result = await handler({ tool, args, caller });
      // Handlers may return either a raw data object (we wrap as ok) or an
      // already-built envelope (we pass through).
      const envelope =
        result && typeof result === "object" && "success" in (result as Record<string, unknown>)
          ? result
          : okEnvelope(result);
      return jsonResponse(envelope);
    } catch (err) {
      console.error(`[${tool}] handler error:`, err);
      return jsonResponse(failEnvelope("INTERNAL_ERROR", "Handler threw"), 500);
    }
  };
}
