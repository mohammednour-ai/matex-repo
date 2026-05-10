import { db, ok, fail } from "../db";
import { appendAuditEvent } from "./audit";

const HST_RATE = 0.13; // Ontario HST — TODO(compliance): O. Reg. 37/09 under the Retail Sales Tax Act (now HST under ETA)

export async function createPayout(args: Record<string, unknown>) {
  const {
    tenant_id,
    actor_id,
    ticket_id,
    seller_id,
    subtotal,
    method,
    etransfer_email,
    cheque_number,
    notes,
  } = args as {
    tenant_id: string;
    actor_id: string;
    ticket_id: string;
    seller_id: string;
    subtotal: number;
    method: "e_transfer" | "cheque" | "cash" | "account_credit";
    etransfer_email?: string;
    cheque_number?: string;
    notes?: string;
  };

  if (!tenant_id || !actor_id || !ticket_id || !seller_id || subtotal == null || !method) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }

  // Validate payment method restrictions
  if (method === "e_transfer" && !etransfer_email) {
    return fail("VALIDATION_ERROR", "e-Transfer requires recipient email address");
  }
  if (method === "cheque" && !cheque_number) {
    return fail("VALIDATION_ERROR", "Cheque requires cheque number");
  }

  // TODO(compliance): Ontario cash threshold — Scrap Metal Dealers and Recyclers Act (expected).
  // Currently mirroring AB/BC/MB approach: ≥$100 forces non-cash.
  // Tenant setting `cash_threshold_cad` overrides this default.
  const hst_collected = Math.round(subtotal * HST_RATE * 100) / 100;
  const total = Math.round((subtotal + hst_collected) * 100) / 100;

  if (!db) {
    return ok({
      payout_id: crypto.randomUUID(),
      subtotal,
      hst_collected,
      total,
      status: "pending",
      dev_mode: true,
    });
  }

  // Check cash threshold from tenant settings
  if (method === "cash") {
    const { data: tenant } = await db
      .from("tenants")
      .select("settings")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    const settings = tenant?.settings as Record<string, unknown> ?? {};
    const threshold = (settings.cash_threshold_cad as number) ?? 100;
    const cashAllowed = settings.cash_allowed !== false;

    if (!cashAllowed) return fail("CASH_NOT_ALLOWED", "This yard does not accept cash payouts");
    if (total >= threshold) {
      return fail("CASH_THRESHOLD_EXCEEDED", `Cash payouts are blocked for amounts ≥ $${threshold} CAD. Use e-Transfer, cheque, or EFT.`);
    }
  }

  const { data, error } = await db
    .from("payouts")
    .insert({
      tenant_id,
      ticket_id,
      seller_id,
      amount: subtotal,
      hst_collected,
      method,
      etransfer_email: etransfer_email ?? null,
      cheque_number: cheque_number ?? null,
      notes: notes ?? null,
      processed_by: actor_id,
      processed_at: new Date().toISOString(),
      status: "pending",
    })
    .select("payout_id")
    .single();

  if (error) return fail("DB_ERROR", "Failed to create payout");

  // Write event to outbox for event-relay pickup
  if (db) {
    await db.schema("log_mcp").from("event_outbox").insert({
      stream: "matex.events",
      event_type: "yardops.payout.created",
      payload: JSON.stringify({ payout_id: data.payout_id, tenant_id, ticket_id, seller_id, total, method }),
    }).catch(() => {}); // non-blocking
  }

  await appendAuditEvent({
    tenant_id,
    actor_id,
    action: "create_payout",
    resource_type: "payout",
    resource_id: data.payout_id,
    payload: { ticket_id, seller_id, total, method },
  });

  return ok({ payout_id: data.payout_id, subtotal, hst_collected, total, status: "pending" });
}

export async function confirmPayout(args: Record<string, unknown>) {
  const { tenant_id, actor_id, payout_id, reference } = args as {
    tenant_id: string;
    actor_id: string;
    payout_id: string;
    reference?: string;
  };

  if (!tenant_id || !actor_id || !payout_id) return fail("VALIDATION_ERROR", "Required fields missing");
  if (!db) return ok({ confirmed: true, dev_mode: true });

  const { error } = await db
    .from("payouts")
    .update({ status: "completed", notes: reference ? `REF: ${reference}` : undefined })
    .eq("tenant_id", tenant_id)
    .eq("payout_id", payout_id);

  if (error) return fail("DB_ERROR", "Failed to confirm payout");

  await appendAuditEvent({ tenant_id, actor_id, action: "confirm_payout", resource_type: "payout", resource_id: payout_id, payload: { reference } });
  return ok({ confirmed: true });
}

export async function voidPayout(args: Record<string, unknown>) {
  const { tenant_id, actor_id, payout_id, reason } = args as {
    tenant_id: string;
    actor_id: string;
    payout_id: string;
    reason: string;
  };

  if (!tenant_id || !actor_id || !payout_id || !reason) return fail("VALIDATION_ERROR", "Required fields missing");
  if (!db) return ok({ voided: true, dev_mode: true });

  const { error } = await db
    .from("payouts")
    .update({ status: "voided", notes: `VOID: ${reason}` })
    .eq("tenant_id", tenant_id)
    .eq("payout_id", payout_id);

  if (error) return fail("DB_ERROR", "Failed to void payout");

  await appendAuditEvent({ tenant_id, actor_id, action: "void_payout", resource_type: "payout", resource_id: payout_id, payload: { reason } });
  return ok({ voided: true });
}

export async function listPayouts(args: Record<string, unknown>) {
  const { tenant_id, ticket_id, seller_id, method, status, date_from, date_to, limit = 50 } = args as {
    tenant_id: string;
    ticket_id?: string;
    seller_id?: string;
    method?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
  };

  if (!tenant_id) return fail("VALIDATION_ERROR", "tenant_id required");
  if (!db) return ok({ payouts: [], count: 0, dev_mode: true });

  let query = db
    .from("payouts")
    .select("payout_id, amount, hst_collected, method, status, processed_at, sellers ( first_name, last_name )", { count: "exact" })
    .eq("tenant_id", tenant_id)
    .order("processed_at", { ascending: false })
    .limit(Math.min(limit, 500));

  if (ticket_id) query = query.eq("ticket_id", ticket_id);
  if (seller_id) query = query.eq("seller_id", seller_id);
  if (method) query = query.eq("method", method);
  if (status) query = query.eq("status", status);
  if (date_from) query = query.gte("processed_at", date_from);
  if (date_to) query = query.lte("processed_at", date_to);

  const { data, error, count } = await query;
  if (error) return fail("DB_ERROR", "Database error");
  return ok({ payouts: data, count: count ?? 0 });
}
