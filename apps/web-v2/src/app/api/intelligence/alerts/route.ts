import { NextResponse, type NextRequest } from "next/server";
import { createAlert, listAlertsForUser } from "@/lib/intelligence/db";
import { readUserId } from "@/lib/intelligence/auth";
import { getMaterial } from "@/lib/intelligence/materials";
import type { PriceAlertType } from "@/lib/intelligence/types";

const VALID_TYPES: PriceAlertType[] = ["price_below", "price_above", "trend_reversal", "demand_change"];
const VALID_CHANNELS = new Set(["in_app", "email", "sms"]);

export async function GET(req: NextRequest) {
  const userId = readUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const alerts = await listAlertsForUser(userId);
  return NextResponse.json({ alerts });
}

type CreateBody = {
  material_key?: string;
  alert_type?: string;
  threshold?: number | string | null;
  region?: string | null;
  channels?: string[];
  note?: string | null;
};

export async function POST(req: NextRequest) {
  const userId = readUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: CreateBody = {};
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const material = body.material_key ? getMaterial(body.material_key) : null;
  if (!material) {
    return NextResponse.json({ error: "unknown_material" }, { status: 400 });
  }
  if (!VALID_TYPES.includes(body.alert_type as PriceAlertType)) {
    return NextResponse.json({ error: "invalid_alert_type" }, { status: 400 });
  }
  const channels = (body.channels ?? ["in_app"]).filter((c) => VALID_CHANNELS.has(c));
  if (channels.length === 0) channels.push("in_app");
  const threshold =
    body.threshold === null || body.threshold === undefined || body.threshold === ""
      ? null
      : Number(body.threshold);
  if ((body.alert_type === "price_below" || body.alert_type === "price_above") && threshold === null) {
    return NextResponse.json({ error: "threshold_required" }, { status: 400 });
  }
  const alert = await createAlert({
    user_id: userId,
    material_key: material.key,
    material_label: material.label,
    alert_type: body.alert_type as PriceAlertType,
    threshold: threshold !== null && Number.isFinite(threshold) ? threshold : null,
    region: body.region ?? null,
    channels,
    note: body.note ?? null,
  });
  return NextResponse.json({ alert }, { status: 201 });
}
