import { db, ok, fail } from "../db";
import { appendAuditEvent } from "./audit";

const GATEWAY_URL = process.env.MCP_GATEWAY_URL ?? "http://localhost:3001";

async function callGatewayTool(tool: string, args: Record<string, unknown>, token: string): Promise<{ success: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/tool`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ tool, args }),
    });
    return await res.json() as { success: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };
  } catch {
    return { success: false, error: { code: "GATEWAY_UNREACHABLE", message: "Could not reach Matex Exchange Hub" } };
  }
}

export async function connectToExchange(args: Record<string, unknown>) {
  const { tenant_id, actor_id, matex_email, matex_password } = args as {
    tenant_id: string;
    actor_id: string;
    matex_email: string;
    matex_password: string;
  };

  if (!tenant_id || !actor_id || !matex_email || !matex_password) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }

  // Login to Matex Exchange Hub to get credentials
  const loginRes = await callGatewayTool("auth.login", { email: matex_email, password: matex_password }, "");
  if (!loginRes.success) return fail("AUTH_FAILED", "Failed to authenticate with Matex Exchange Hub");

  const token = (loginRes.data as Record<string, unknown>)?.token as string;
  const userId = (loginRes.data as Record<string, unknown>)?.user_id as string;
  if (!token || !userId) return fail("AUTH_FAILED", "Invalid response from Matex Exchange Hub");

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15min access token

  if (!db) return ok({ connected: true, matex_user_id: userId, dev_mode: true });

  const { error } = await db
    .from("exchange_connections")
    .upsert({
      tenant_id,
      matex_user_id: userId,
      matex_access_token: token,
      token_expires_at: expiresAt,
      is_active: true,
      last_sync_at: new Date().toISOString(),
    }, { onConflict: "tenant_id" });

  if (error) return fail("DB_ERROR", "Failed to store exchange credentials");

  await appendAuditEvent({ tenant_id, actor_id, action: "connect_to_exchange", resource_type: "exchange_connection", resource_id: tenant_id, payload: { matex_user_id: userId } });
  return ok({ connected: true, matex_user_id: userId });
}

export async function publishLotToExchange(args: Record<string, unknown>) {
  const { tenant_id, actor_id, lot_id, asking_price_per_kg, min_quantity_kg, pickup_window_days, description } = args as {
    tenant_id: string;
    actor_id: string;
    lot_id: string;
    asking_price_per_kg: number;
    min_quantity_kg?: number;
    pickup_window_days?: number;
    description?: string;
  };

  if (!tenant_id || !actor_id || !lot_id || asking_price_per_kg == null) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }

  if (!db) return ok({ published: true, listing_id: crypto.randomUUID(), dev_mode: true });

  // Get exchange credentials
  const { data: conn } = await db
    .from("exchange_connections")
    .select("matex_access_token, matex_user_id, is_active, token_expires_at")
    .eq("tenant_id", tenant_id)
    .maybeSingle();

  if (!conn?.is_active) return fail("NOT_CONNECTED", "Yard is not connected to Matex Exchange Hub. Go to Settings → Exchange Connection.");

  // Get lot details
  const { data: lot } = await db
    .from("lots")
    .select("*, materials ( name, category, unit )")
    .eq("tenant_id", tenant_id)
    .eq("lot_id", lot_id)
    .maybeSingle();

  if (!lot) return fail("NOT_FOUND", "Lot not found");
  if (lot.status === "sold" || lot.status === "archived") return fail("CONFLICT", "Cannot publish a sold or archived lot");

  const mat = (lot as Record<string, unknown>).materials as { name: string; category: string; unit: string };
  const listingArgs = {
    seller_id: conn.matex_user_id,
    title: `${mat?.name ?? "Scrap Material"} — ${lot.lot_number}`,
    category: mat?.category ?? "ferrous",
    quantity: lot.total_weight_kg,
    unit: "kg",
    asking_price: asking_price_per_kg * lot.total_weight_kg,
    description: description ?? `YardOps Lot ${lot.lot_number}. Total weight: ${lot.total_weight_kg} kg.`,
  };

  const createRes = await callGatewayTool("listing.create_listing", listingArgs, conn.matex_access_token as string);
  if (!createRes.success) return fail("EXCHANGE_ERROR", (createRes.error?.message ?? "Failed to create listing on exchange"));

  const listingId = (createRes.data as Record<string, unknown>)?.listing_id as string | undefined;
  if (!listingId) return fail("EXCHANGE_ERROR", "No listing_id returned from exchange");

  // Publish it
  await callGatewayTool("listing.publish_listing", { listing_id: listingId }, conn.matex_access_token as string);

  // Update lot
  await db.from("lots").update({ status: "published", exchange_listing_id: listingId }).eq("lot_id", lot_id);

  await appendAuditEvent({ tenant_id, actor_id, action: "publish_lot_to_exchange", resource_type: "lot", resource_id: lot_id, payload: { listing_id: listingId, asking_price_per_kg } });
  return ok({ published: true, listing_id: listingId, exchange_url: `${GATEWAY_URL}/listing/${listingId}` });
}

export async function getExchangeBids(args: Record<string, unknown>) {
  const { tenant_id, lot_id } = args as { tenant_id: string; lot_id: string };
  if (!tenant_id || !lot_id) return fail("VALIDATION_ERROR", "Required fields missing");

  if (!db) return ok({ bids: [], dev_mode: true });

  const { data: lot } = await db.from("lots").select("exchange_listing_id").eq("tenant_id", tenant_id).eq("lot_id", lot_id).maybeSingle();
  if (!lot?.exchange_listing_id) return fail("NOT_PUBLISHED", "Lot has not been published to the exchange");

  const { data: conn } = await db.from("exchange_connections").select("matex_access_token").eq("tenant_id", tenant_id).maybeSingle();
  if (!conn) return fail("NOT_CONNECTED", "Not connected to exchange");

  const res = await callGatewayTool("bidding.get_highest_bid", { listing_id: lot.exchange_listing_id }, conn.matex_access_token as string);
  if (!res.success) return fail("EXCHANGE_ERROR", "Failed to retrieve bids");

  return ok({ bids: res.data?.bids ?? [], highest_bid: res.data });
}
