import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side fan-out for the dashboard's six initial tool calls (P2-10).
 *
 * The dashboard previously fired six independent client-side tool calls on
 * mount: analytics.get_dashboard_stats, payments.get_wallet_balance,
 * messaging.get_unread, notifications.get_notifications, kyc.get_kyc_level,
 * booking.list_user_bookings. Six serial round-trips from the browser to
 * Vercel and then on to Supabase Edge cost noticeable TTFB even with
 * Promise.all on the client.
 *
 * This route runs server-side (Node runtime in Vercel), reads the HttpOnly
 * matex_session cookie that the middleware validates, and fans the calls
 * out in parallel against the Supabase Edge functions. The browser does a
 * single round-trip and gets the merged seed bundle back.
 *
 * Auth: requires the matex_session cookie. Same JWT the per-call edge
 * functions verify; this route doesn't decode it, just forwards the bearer
 * value. The middleware ensures the cookie is present before the route is
 * reached.
 *
 * Refs: docs/audit/2026-05-10/p1-p2-plan.md (P2-10).
 */

type ToolCall = { tool: string; args: Record<string, unknown> };

type SeedKey =
  | "stats"
  | "wallet"
  | "unread"
  | "notifications"
  | "kyc"
  | "bookings";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("matex_session")?.value;
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    return NextResponse.json({ ok: false, error: "supabase_url_missing" }, { status: 500 });
  }

  // Decode the JWT payload to extract sub (user_id). The edge function will
  // re-verify the token; we just need user_id to populate the args. Same
  // decode-without-verify pattern used elsewhere on the platform.
  const userId = decodeUserId(token);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }

  const calls: Record<SeedKey, ToolCall> = {
    stats: { tool: "analytics.get_dashboard_stats", args: { user_id: userId } },
    wallet: { tool: "payments.get_wallet_balance", args: { user_id: userId, actor_id: userId } },
    unread: { tool: "messaging.get_unread", args: { user_id: userId } },
    notifications: { tool: "notifications.get_notifications", args: { user_id: userId, limit: 8 } },
    kyc: { tool: "kyc.get_kyc_level", args: { user_id: userId } },
    bookings: { tool: "booking.list_user_bookings", args: { user_id: userId, upcoming: true, limit: 3 } },
  };

  const entries = Object.entries(calls) as Array<[SeedKey, ToolCall]>;
  const results = await Promise.all(
    entries.map(async ([key, call]) => {
      const [domain, ...rest] = call.tool.split(".");
      const toolName = rest.join(".");
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/${domain}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ tool: toolName, args: call.args }),
          cache: "no-store",
        });
        const json = (await res.json()) as { success?: boolean; data?: unknown; error?: unknown };
        return [key, json] as const;
      } catch {
        return [key, { success: false, error: { code: "FETCH_FAILED", message: "Network error" } }] as const;
      }
    }),
  );

  const seed = Object.fromEntries(results) as Record<SeedKey, unknown>;
  // Cache-Control prevents Vercel's edge cache from holding personalised
  // dashboard data across users — same posture as every authenticated route.
  return NextResponse.json(
    { ok: true, seed, fetched_at: new Date().toISOString() },
    { headers: { "cache-control": "private, no-store" } },
  );
}

function decodeUserId(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
    const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    const payload = JSON.parse(json) as Record<string, unknown>;
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
