/**
 * MATEX MCP Gateway (Phase 0 foundation implementation)
 *
 * Responsibilities:
 * - JWT authentication
 * - Basic per-user and per-IP rate limiting
 * - Tool routing map by MCP namespace
 * - Event bus publication (Redis Streams)
 * - Health endpoint for CI/CD checks
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import * as jwt from "jsonwebtoken";
import Redis from "ioredis";
import { now, sha256 } from "@matex/utils";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

interface GatewayRequestBody {
  tool: string;
  args?: Record<string, JsonValue>;
}

interface AuthClaims extends jwt.JwtPayload {
  sub: string;
  role?: string;
  email?: string;
}

interface ToolResult {
  success: boolean;
  data?: Record<string, JsonValue>;
  error?: { code: string; message: string };
}

const PORT = Number(process.env.MCP_GATEWAY_PORT ?? 3001);
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.GATEWAY_RATE_LIMIT_MAX ?? 120);
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.REDIS_URL;
const EVENT_STREAM = process.env.GATEWAY_EVENT_STREAM ?? "matex.events";
const FORWARD_TIMEOUT_MS = Number(process.env.GATEWAY_FORWARD_TIMEOUT_MS ?? 10_000);

const redis = REDIS_URL ? new Redis(REDIS_URL) : null;
const requestLog = new Map<string, number[]>();
const domainEndpoints = parseDomainEndpoints(process.env.MCP_DOMAIN_ENDPOINTS_JSON);

// Domain -> MCP server package mapping (expand as servers go live)
const ROUTE_MAP: Record<string, string> = {
  auth: "@matex/auth-mcp",
  profile: "@matex/profile-mcp",
  kyc: "@matex/kyc-mcp",
  listing: "@matex/listing-mcp",
  search: "@matex/search-mcp",
  messaging: "@matex/messaging-mcp",
  payments: "@matex/payments-mcp",
  escrow: "@matex/escrow-mcp",
  bidding: "@matex/bidding-mcp",
  auction: "@matex/auction-mcp",
  inspection: "@matex/inspection-mcp",
  booking: "@matex/booking-mcp",
  contracts: "@matex/contracts-mcp",
  dispute: "@matex/dispute-mcp",
  logistics: "@matex/logistics-mcp",
  tax: "@matex/tax-mcp",
  notifications: "@matex/notifications-mcp",
  esign: "@matex/esign-mcp",
  pricing: "@matex/pricing-mcp",
  analytics: "@matex/analytics-mcp",
  admin: "@matex/admin-mcp",
  storage: "@matex/storage-mcp",
  log: "@matex/log-mcp",
  credit: "@matex/credit-mcp",
};

function parseDomainEndpoints(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed)
      .filter(([, value]) => typeof value === "string" && value.length > 0)
      .map(([key, value]) => [key, String(value)]);
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<GatewayRequestBody | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as GatewayRequestBody;
  } catch {
    return null;
  }
}

function validateJwt(req: IncomingMessage): AuthClaims | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const claims = jwt.verify(token, JWT_SECRET) as AuthClaims;
    return claims;
  } catch {
    return null;
  }
}

function applyRateLimit(key: string): boolean {
  const currentTime = Date.now();
  const bucket = requestLog.get(key) ?? [];
  const recent = bucket.filter((ts) => currentTime - ts < RATE_LIMIT_WINDOW_MS);
  recent.push(currentTime);
  requestLog.set(key, recent);
  return recent.length <= RATE_LIMIT_MAX;
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

function isPublicTool(tool: string): boolean {
  return [
    "auth.register",
    "auth.login",
    "auth.request_email_otp",
    "auth.request_phone_otp",
    "auth.verify_email",
    "auth.verify_phone",
    "auth.refresh_token",
  ].includes(tool);
}

async function publishEvent(eventName: string, payload: Record<string, unknown>): Promise<void> {
  if (!redis) return;
  await redis.xadd(
    EVENT_STREAM,
    "*",
    "event",
    eventName,
    "payload",
    JSON.stringify(payload),
    "timestamp",
    now(),
    "publisher",
    "mcp-gateway",
  );
}

async function routeToolRequest(
  claims: AuthClaims,
  body: GatewayRequestBody,
  ipAddress: string,
): Promise<ToolResult> {
  if (!body.tool || !body.tool.includes(".")) {
    return { success: false, error: { code: "INVALID_TOOL", message: "Expected tool format: domain.action" } };
  }

  const [domain, action] = body.tool.split(".");
  const targetServer = ROUTE_MAP[domain ?? ""];
  if (!targetServer) {
    return {
      success: false,
      error: { code: "UNKNOWN_DOMAIN", message: `No MCP server route for domain '${domain ?? "unknown"}'` },
    };
  }

  // Phase 0 gateway routes and logs requests. Server invocation wiring is added as each MCP server goes live.
  const traceInput = JSON.stringify({ tool: body.tool, args: body.args ?? {} });
  await publishEvent("gateway.tool.routed", {
    trace_id: sha256(`${claims.sub}:${Date.now()}:${traceInput}`),
    user_id: claims.sub,
    role: claims.role ?? "unknown",
    ip_address: ipAddress,
    tool: body.tool,
    action: action ?? "",
    target_server: targetServer,
  });

  const endpoint = domainEndpoints[domain ?? ""];
  if (endpoint) {
    try {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), FORWARD_TIMEOUT_MS);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-matex-user-id": claims.sub,
          "x-matex-user-role": claims.role ?? "unknown",
          "x-matex-gateway-source-ip": ipAddress,
        },
        body: JSON.stringify({
          tool: body.tool,
          args: body.args ?? {},
          auth: {
            sub: claims.sub,
            role: claims.role ?? "unknown",
            email: claims.email ?? "",
          },
        }),
        signal: abortController.signal,
      });
      clearTimeout(timeout);

      const textBody = await response.text();
      let parsedBody: unknown = textBody;
      try {
        parsedBody = JSON.parse(textBody);
      } catch {
        // Keep raw text body if upstream response is not JSON.
      }

      await publishEvent("gateway.tool.forwarded", {
        user_id: claims.sub,
        tool: body.tool,
        action: action ?? "",
        target_server: targetServer,
        endpoint,
        upstream_status: response.status,
      });

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: "UPSTREAM_ERROR",
            message: `Upstream returned ${response.status}`,
          },
          data: {
            endpoint,
            upstream_status: response.status,
            upstream_body: parsedBody as JsonValue,
          },
        };
      }

      return {
        success: true,
        data: {
          status: "forwarded",
          target_server: targetServer,
          endpoint,
          tool: body.tool,
          upstream_response: parsedBody as JsonValue,
        },
      };
    } catch (error) {
      await publishEvent("gateway.tool.forward_failed", {
        user_id: claims.sub,
        tool: body.tool,
        action: action ?? "",
        target_server: targetServer,
        endpoint,
        error: error instanceof Error ? error.message : "unknown",
      });
      return {
        success: false,
        error: { code: "FORWARD_FAILED", message: `Failed to forward request to ${endpoint}` },
      };
    }
  }

  return {
    success: true,
    data: {
      status: "routed",
      target_server: targetServer,
      tool: body.tool,
      next_step: "Configure MCP_DOMAIN_ENDPOINTS_JSON to enable live forwarding",
    },
  };
}

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

const server = createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = parsedUrl.pathname;

  if (req.method === "GET" && path === "/health") {
    writeJson(res, 200, {
      status: "ok",
      service: "mcp-gateway",
      timestamp: now(),
      redis: redis ? "configured" : "not_configured",
      routes: Object.keys(ROUTE_MAP).length,
    });
    return;
  }

  if (req.method === "POST" && path === "/tool") {
    const body = await readJsonBody(req);
    if (!body) {
      writeJson(res, 400, { success: false, error: { code: "INVALID_JSON", message: "Malformed JSON request body" } });
      return;
    }

    const ipAddress = getClientIp(req);
    const authClaims = validateJwt(req);
    const publicRoute = isPublicTool(body.tool);
    const claims: AuthClaims | null = authClaims?.sub
      ? authClaims
      : publicRoute
        ? { sub: "anonymous", role: "public" }
        : null;

    if (!claims?.sub) {
      writeJson(res, 401, { success: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing JWT" } });
      return;
    }

    const rateUser = claims.sub === "anonymous" ? `ip:${ipAddress}:public` : `user:${claims.sub}`;
    if (!applyRateLimit(`ip:${ipAddress}`) || !applyRateLimit(rateUser)) {
      writeJson(res, 429, { success: false, error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } });
      return;
    }

    const result = await routeToolRequest(claims, body, ipAddress);
    writeJson(res, result.success ? 200 : 400, result);
    return;
  }

  writeJson(res, 404, { success: false, error: { code: "NOT_FOUND", message: "Route not found" } });
});

server.listen(PORT, () => {
  console.log(`MCP Gateway listening on http://localhost:${PORT}`);
});
