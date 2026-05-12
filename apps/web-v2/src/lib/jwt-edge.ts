/**
 * Edge-runtime-safe JWT verification for the matex_session cookie.
 *
 * The MCP gateway signs HS256 tokens with `MATEX_JWT_SECRET` (mirrored from
 * apps/mcp-gateway's JWT_SECRET). Used by the middleware (P1-10b) and by
 * self-authenticated API routes like /api/auctions/[id]/bid-stream (P1-7b).
 *
 * Uses `jose` because `jsonwebtoken` depends on Node's crypto module and
 * doesn't run in the Edge Runtime where Next middleware executes.
 */

import { jwtVerify } from "jose";

export type MatexJwtClaims = {
  sub: string;
  email?: string;
  role?: string;
  scope?: string;
  exp?: number;
  iat?: number;
};

let cachedKey: Uint8Array | null = null;

function secretKey(): Uint8Array | null {
  if (cachedKey) return cachedKey;
  const secret = process.env.MATEX_JWT_SECRET ?? process.env.JWT_SECRET ?? "";
  if (!secret) return null;
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

/**
 * Returns the verified claims if the token is valid and not expired; null
 * otherwise. Errors are intentionally swallowed — every failure mode
 * (signature mismatch, malformed JWT, missing secret, expiry) collapses to
 * "not authenticated" at the call site.
 */
export async function verifyMatexJwt(token: string): Promise<MatexJwtClaims | null> {
  if (!token) return null;
  const key = secretKey();
  if (!key) {
    // No secret configured — fail closed in production rather than treat
    // any token as valid. Dev / preview also rejects so behavior is
    // identical across environments.
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) return null;
    return {
      sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
      scope: typeof payload.scope === "string" ? payload.scope : undefined,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
      iat: typeof payload.iat === "number" ? payload.iat : undefined,
    };
  } catch {
    return null;
  }
}
