import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "yardops-web",
    timestamp: new Date().toISOString(),
  });
}
