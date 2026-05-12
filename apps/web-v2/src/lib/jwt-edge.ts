/**
 * Edge-runtime-safe JWT verification for the matex_session cookie (P1-10b).
 *
 * The MCP gateway signs HS256 tokens with `MATEX_JWT_SECRET` (mirrored from
 * apps/mcp-gateway's JWT_SECRET). The middleware previously only checked the
 * cookie's presence; this helper verifies the signature and the standard
 * `exp` claim so a forged or expired cookie is rejected at the edge rather
 * than waiting for the API layer to 401.
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
    // Dev / preview without a secret configured. We refuse to authenticate
    // rather than treating any token as valid — same posture as the gateway,
    // which logs FATAL when the dev secret is in use under NODE_ENV=production.
    if (process.env.NODE_ENV === "production") return null;
    // In non-prod we still verify the structure (three base64 segments) so
    // tests with a fake token can opt into the unverified path explicitly
    // via env, but signature is required.
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
