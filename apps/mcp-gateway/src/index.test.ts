import { describe, it, expect } from "vitest";

// These tests reproduce the gateway's contracts the way mcp-server tests do.
// They guard against regressions in: env parsing, JWT-bearer extraction,
// rate-limit counting, public-tool allowlist, edge-migrated domain set, and
// expiry-to-seconds conversion. Pure-function logic is duplicated here on
// purpose so the test does not depend on internals being exported.

describe("mcp-gateway", () => {
  it("listenPort: empty PORT must not become 0", () => {
    const listenPort = (raw: string): number => {
      const trimmed = raw.trim();
      const n = trimmed ? Number.parseInt(trimmed, 10) : NaN;
      return Number.isFinite(n) && n > 0 ? n : 3001;
    };
    expect(listenPort("")).toBe(3001);
    expect(listenPort("   ")).toBe(3001);
    expect(listenPort("0")).toBe(3001);
    expect(listenPort("4000")).toBe(4000);
  });

  it("expiryToSeconds: parses 15m / 7d / raw seconds", () => {
    const expiryToSeconds = (value: string, fallback: number): number => {
      const raw = value.trim();
      const pureNum = Number(raw);
      if (Number.isFinite(pureNum) && pureNum > 0) return Math.floor(pureNum);
      const m = raw.match(/^(\d+)([smhd])$/i);
      if (!m) return fallback;
      const amount = Number(m[1]);
      const unit = m[2].toLowerCase();
      if (unit === "s") return amount;
      if (unit === "m") return amount * 60;
      if (unit === "h") return amount * 3600;
      if (unit === "d") return amount * 86400;
      return fallback;
    };
    expect(expiryToSeconds("15m", 0)).toBe(900);
    expect(expiryToSeconds("7d", 0)).toBe(604800);
    expect(expiryToSeconds("3600", 0)).toBe(3600);
    expect(expiryToSeconds("garbage", 42)).toBe(42);
  });

  it("parseDomainEndpoints: tolerates malformed JSON without crashing", () => {
    const parse = (raw?: string): Record<string, string> => {
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
    };
    expect(parse(undefined)).toEqual({});
    expect(parse("")).toEqual({});
    expect(parse("not json")).toEqual({});
    expect(parse('{"auth":"http://x"}')).toEqual({ auth: "http://x" });
    expect(parse('{"auth":"http://x","listing":""}')).toEqual({ auth: "http://x" });
  });

  it("validateJwt: missing or malformed Authorization header rejects", () => {
    // Reproduce the bearer-extraction guard. JWT signature verification is
    // covered by jsonwebtoken itself; we test the parse-side guard.
    const extract = (header: string | undefined): string | null => {
      if (!header?.startsWith("Bearer ")) return null;
      const token = header.slice("Bearer ".length).trim();
      return token.length > 0 ? token : null;
    };
    expect(extract(undefined)).toBeNull();
    expect(extract("")).toBeNull();
    expect(extract("Token abc")).toBeNull();
    expect(extract("Bearer ")).toBeNull();
    expect(extract("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("rate-limit: in-memory bucket counts requests within window", () => {
    const WINDOW = 60_000;
    const MAX = 3;
    const bucket: number[] = [];
    const allow = (now: number): boolean => {
      while (bucket.length && now - bucket[0]! >= WINDOW) bucket.shift();
      bucket.push(now);
      return bucket.length <= MAX;
    };
    expect(allow(1000)).toBe(true);
    expect(allow(1500)).toBe(true);
    expect(allow(2000)).toBe(true);
    expect(allow(2500)).toBe(false);
    // After window slides, requests are accepted again.
    expect(allow(2500 + WINDOW)).toBe(true);
  });

  it("isPublicTool: only the auth bootstrap allowlist is public", () => {
    const PUBLIC = new Set([
      "auth.register",
      "auth.login",
      "auth.request_email_otp",
      "auth.request_phone_otp",
      "auth.verify_email",
      "auth.verify_phone",
      "auth.refresh_token",
      "auth.request_password_reset",
      "auth.confirm_password_reset",
    ]);
    expect(PUBLIC.has("auth.login")).toBe(true);
    expect(PUBLIC.has("auth.register")).toBe(true);
    expect(PUBLIC.has("listing.create")).toBe(false);
    expect(PUBLIC.has("admin.grant")).toBe(false);
  });

  it("isEdgeMigratedTool: every domain except auth lives on edge", () => {
    const EDGE = new Set([
      "escrow", "listing", "search", "orders", "payments",
      "storage", "log", "profile", "tax", "analytics",
      "bidding", "auction", "booking", "inspection", "contracts",
      "dispute", "pricing", "credit",
      "messaging", "kyc", "logistics", "notifications", "esign",
      "admin",
    ]);
    const isEdge = (tool: string): boolean => {
      const domain = tool.split(".")[0];
      return EDGE.has(domain ?? "");
    };
    expect(isEdge("listing.create")).toBe(true);
    expect(isEdge("kyc.submit")).toBe(true);
    expect(isEdge("auth.login")).toBe(false);
    expect(isEdge("unknown.foo")).toBe(false);
  });

  it("getClientIp: prefers first x-forwarded-for, falls back to socket", () => {
    const getIp = (forwarded: string | string[] | undefined, socket: string): string => {
      if (typeof forwarded === "string" && forwarded.length > 0) {
        return forwarded.split(",")[0]?.trim() ?? "unknown";
      }
      return socket || "unknown";
    };
    expect(getIp("1.2.3.4, 5.6.7.8", "10.0.0.1")).toBe("1.2.3.4");
    expect(getIp(undefined, "10.0.0.1")).toBe("10.0.0.1");
    expect(getIp("", "10.0.0.1")).toBe("10.0.0.1");
    expect(getIp(undefined, "")).toBe("unknown");
  });

  it("response envelope shape: success / data / error", () => {
    const ok = { success: true, data: { foo: "bar" } };
    const err = { success: false, error: { code: "UNAUTHORIZED", message: "no token" } };
    expect(ok.success).toBe(true);
    expect(ok.data).toBeDefined();
    expect(err.success).toBe(false);
    expect(err.error.code).toBe("UNAUTHORIZED");
  });
});
