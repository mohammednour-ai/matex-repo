import { NextResponse, type NextRequest } from "next/server";
import { deleteAlert, updateAlertStatus } from "@/lib/intelligence/db";
import { readUserId } from "@/lib/intelligence/auth";
import type { PriceAlertStatus } from "@/lib/intelligence/types";

const VALID_STATUS: PriceAlertStatus[] = ["active", "paused", "archived"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = readUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!VALID_STATUS.includes(body.status as PriceAlertStatus)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  const updated = await updateAlertStatus(params.id, userId, body.status as PriceAlertStatus);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ alert: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = readUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const ok = await deleteAlert(params.id, userId);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
