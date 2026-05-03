import { NextResponse, type NextRequest } from "next/server";
import { runDailyMarketAnalysis } from "@/lib/intelligence/pipeline";

/**
 * Manual debug trigger for the daily market analysis pipeline.
 *
 * In production, Inngest invokes the same code on a cron. This endpoint is
 * gated by `INTELLIGENCE_DEBUG_TOKEN` (header `x-debug-token`) so it can
 * safely live alongside production traffic. Without the token set the route
 * returns 404 to avoid leaking its existence.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.INTELLIGENCE_DEBUG_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const provided = req.headers.get("x-debug-token");
  if (provided !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const summary = await runDailyMarketAnalysis();
  return NextResponse.json({ summary });
}
