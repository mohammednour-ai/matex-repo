import { NextResponse } from "next/server";
import { listLatestIntelligence } from "@/lib/intelligence/db";

/**
 * Returns the latest market_intelligence row per material. Used by the
 * top-level dashboards. No auth: market summaries are platform-public data.
 */
export async function GET() {
  const rows = await listLatestIntelligence();
  return NextResponse.json({ snapshots: rows });
}
