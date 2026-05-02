import { NextResponse } from "next/server";

/**
 * Lightweight health endpoint for Railway / load balancer probes.
 *
 * Must:
 *  - return 200 quickly with no DB / network calls
 *  - work regardless of upstream gateway / Supabase availability
 *  - never require auth
 *
 * Reachable at /api/health.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "matex-web",
    timestamp: new Date().toISOString(),
  });
}
