import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const DEV_SECRET = "dev-secret-do-not-use-in-prod";

// Dev-mode handlers for tools that need the MCP stack to work at all.
// Only active when the gateway is unreachable and NODE_ENV !== "production".
async function devFallback(tool: string, args: Record<string, unknown>): Promise<NextResponse | null> {
  if (process.env.NODE_ENV === "production") return null;

  if (tool === "yardops.login") {
    const token = jwt.sign(
      { sub: "dev-user-id", tenant_id: "dev-tenant-id", role: "admin", scope: "yardops", email: (args.email as string) ?? "dev@yard.local", full_name: "Dev Admin" },
      DEV_SECRET,
      { expiresIn: "7d" },
    );

    return NextResponse.json({
      success: true,
      data: {
        token: token,
        user: { user_id: "dev-user-id", email: (args.email as string) ?? "dev@yard.local", full_name: "Dev Admin", role: "admin", tenant_id: "dev-tenant-id" },
        dev_mode: true,
      },
    });
  }

  if (tool === "yardops.generate_z_report") {
    return NextResponse.json({ success: true, data: { total_tickets: 7, total_net_weight_kg: 3420, total_payouts_cad: 4821.50, hst_collected: 626.80, cash_on_hand: 250, payouts_by_method: { e_transfer: 3200, cheque: 1371.50, cash: 250 }, dev_mode: true } });
  }

  if (tool === "yardops.get_active_prices") {
    return NextResponse.json({ success: true, data: { materials: [
      { material_id: "m1", name: "#1 Copper", category: "copper", is_cat_converter: false, is_prohibited: false, unit_price_per_kg: 8.420 },
      { material_id: "m2", name: "#2 Copper", category: "copper", is_cat_converter: false, is_prohibited: false, unit_price_per_kg: 7.180 },
      { material_id: "m3", name: "Aluminum Extrusion", category: "aluminum", is_cat_converter: false, is_prohibited: false, unit_price_per_kg: 1.650 },
      { material_id: "m4", name: "Aluminum Cast", category: "aluminum", is_cat_converter: false, is_prohibited: false, unit_price_per_kg: 1.320 },
      { material_id: "m5", name: "Mixed Steel", category: "ferrous", is_cat_converter: false, is_prohibited: false, unit_price_per_kg: 0.210 },
      { material_id: "m6", name: "Stainless Steel 304", category: "stainless", is_cat_converter: false, is_prohibited: false, unit_price_per_kg: 1.890 },
      { material_id: "m7", name: "Catalytic Converter", category: "cat_converters", is_cat_converter: true, is_prohibited: false, unit_price_per_kg: 42.00 },
      { material_id: "m8", name: "Lead Battery", category: "lead", is_cat_converter: false, is_prohibited: false, unit_price_per_kg: 0.580 },
    ], dev_mode: true } });
  }

  if (tool === "yardops.list_sellers") {
    return NextResponse.json({ success: true, data: { sellers: [
      { seller_id: "s1", first_name: "Jane", last_name: "Smith", phone: "613-555-0101", pipeda_consent: true, is_blocked: false, created_at: new Date().toISOString() },
      { seller_id: "s2", first_name: "Bob", last_name: "Johnson", phone: "613-555-0202", pipeda_consent: false, is_blocked: false, created_at: new Date().toISOString() },
    ], dev_mode: true } });
  }

  if (tool === "yardops.create_seller") {
    return NextResponse.json({ success: true, data: { seller_id: `dev-seller-${Date.now()}`, dev_mode: true } });
  }

  if (tool === "yardops.record_pipeda_consent" || tool === "yardops.log_seller_id") {
    return NextResponse.json({ success: true, data: { dev_mode: true } });
  }

  if (tool === "yardops.create_ticket") {
    const id = `dev-ticket-${Date.now()}`;
    return NextResponse.json({ success: true, data: { ticket_id: id, ticket_number: `YD-2026-${id.slice(-6).toUpperCase()}`, dev_mode: true } });
  }

  if (tool === "yardops.record_weights" || tool === "yardops.record_signature" || tool === "yardops.complete_ticket") {
    return NextResponse.json({ success: true, data: { dev_mode: true } });
  }

  if (tool === "yardops.add_ticket_line") {
    return NextResponse.json({ success: true, data: { line_id: `dev-line-${Date.now()}`, dev_mode: true } });
  }

  if (tool === "yardops.create_payout") {
    return NextResponse.json({ success: true, data: { payout_id: `dev-payout-${Date.now()}`, total: ((args.subtotal as number) ?? 0) * 1.13, dev_mode: true } });
  }

  return null;
}

function gatewayUrl(): string {
  const a = process.env.MCP_GATEWAY_URL?.trim().replace(/\/$/, "") ?? "";
  if (a) return a;
  const b = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim().replace(/\/$/, "") ?? "";
  if (b) return b;
  return "http://localhost:3001";
}

function unreachableMessage(url: string): string {
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const base = `MCP Gateway is not reachable at ${url}.`;
  if (isLocal) return `${base} Start it with: pnpm dev:yardops-stack`;
  return `${base} Confirm MCP_GATEWAY_URL is set correctly.`;
}

type Body = { tool: string; args?: Record<string, unknown>; token?: string };

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const gateway = gatewayUrl();

  // In dev mode, intercept known tools before hitting the gateway
  if (process.env.NODE_ENV !== "production") {
    const earlyFallback = await devFallback(body.tool, body.args ?? {});
    if (earlyFallback) return earlyFallback;
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (body.token) headers.authorization = `Bearer ${body.token}`;

  try {
    const r = await fetch(`${gateway}/tool`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: body.tool, args: body.args ?? {} }),
    });
    return new NextResponse(await r.text(), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const isConnRefused =
      err instanceof Error &&
      err.cause &&
      (err.cause as NodeJS.ErrnoException).code === "ECONNREFUSED";
    const isUnreachable =
      isConnRefused || (err instanceof Error && err.message.includes("fetch failed"));

    if (isUnreachable) {
      const fallback = await devFallback(body.tool, body.args ?? {});
      if (fallback) return fallback;
    }

    const message = isUnreachable
      ? unreachableMessage(gateway)
      : err instanceof Error
        ? err.message
        : "Unknown gateway error";

    return NextResponse.json(
      { success: false, error: { code: "GATEWAY_UNREACHABLE", message } },
      { status: 502 },
    );
  }
}
