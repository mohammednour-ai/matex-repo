import { db, ok, fail } from "../db";
import { appendAuditEvent } from "./audit";

export async function logCatConverter(args: Record<string, unknown>) {
  const {
    tenant_id,
    actor_id,
    ticket_id,
    seller_id,
    vehicle_id,
    unit_count,
    total_weight_kg,
    photos,
    vin_source,
    no_source_reason,
    proof_of_ownership_storage_key,
    converter_category,
    notes,
  } = args as {
    tenant_id: string;
    actor_id: string;
    ticket_id: string;
    seller_id: string;
    vehicle_id?: string;
    unit_count: number;
    total_weight_kg?: number;
    photos?: string[];
    vin_source?: string;
    no_source_reason?: string;
    proof_of_ownership_storage_key?: string;
    converter_category?: string;
    notes?: string;
  };

  if (!tenant_id || !actor_id || !ticket_id || !seller_id || !unit_count) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }

  if (!vin_source && !no_source_reason) {
    return fail("VALIDATION_ERROR", "Either vin_source or no_source_reason (with supervisor sign-off) is required");
  }

  if (!db) return ok({ cat_id: crypto.randomUUID(), dev_mode: true });

  // TODO(compliance): Ontario Bill 90 / expected legislation — cat converter VIN requirements
  // mirror AB O. Reg. 390/21 and MB The Regulated Metal Dealers Act. When ON passes equivalent,
  // this field becomes a hard requirement. Currently best-practice default.
  const holdUntil = new Date();
  // TODO(compliance): Hold period configurable via tenant settings (default 7 days per best practice)
  holdUntil.setDate(holdUntil.getDate() + 7);

  const { data, error } = await db
    .from("cat_converters")
    .insert({
      tenant_id,
      ticket_id,
      seller_id,
      vehicle_id: vehicle_id ?? null,
      unit_count,
      total_weight_kg: total_weight_kg ?? null,
      photos: photos ? JSON.stringify(photos) : "[]",
      vin_source: vin_source ?? null,
      no_source_reason: no_source_reason ?? null,
      proof_of_ownership_storage_key: proof_of_ownership_storage_key ?? null,
      converter_category: converter_category ?? null,
      notes: notes ?? null,
      hold_until: holdUntil.toISOString(),
      status: "received",
      logged_by: actor_id,
      logged_at: new Date().toISOString(),
    })
    .select("cat_id")
    .single();

  if (error) return fail("DB_ERROR", "Failed to log catalytic converter");

  await appendAuditEvent({
    tenant_id,
    actor_id,
    action: "log_cat_converter",
    resource_type: "cat_converter",
    resource_id: data.cat_id,
    payload: { ticket_id, seller_id, unit_count, vin_source: vin_source ?? "no_source" },
  });

  return ok({ cat_id: data.cat_id, hold_until: holdUntil.toISOString() });
}

export async function updateCatStatus(args: Record<string, unknown>) {
  const { tenant_id, actor_id, cat_id, status, notes } = args as {
    tenant_id: string;
    actor_id: string;
    cat_id: string;
    status: "received" | "logged" | "submitted" | "cleared";
    notes?: string;
  };

  if (!tenant_id || !actor_id || !cat_id || !status) return fail("VALIDATION_ERROR", "Required fields missing");
  if (!db) return ok({ updated: true, dev_mode: true });

  const { error } = await db
    .from("cat_converters")
    .update({ status, notes: notes ?? undefined })
    .eq("tenant_id", tenant_id)
    .eq("cat_id", cat_id);

  if (error) return fail("DB_ERROR", "Failed to update status");

  await appendAuditEvent({ tenant_id, actor_id, action: "update_cat_status", resource_type: "cat_converter", resource_id: cat_id, payload: { status } });
  return ok({ updated: true });
}

export async function listCatConverters(args: Record<string, unknown>) {
  const { tenant_id, status, ticket_id, date_from, date_to, limit = 100 } = args as {
    tenant_id: string;
    status?: string;
    ticket_id?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
  };

  if (!tenant_id) return fail("VALIDATION_ERROR", "tenant_id required");
  if (!db) return ok({ converters: [], count: 0, dev_mode: true });

  let query = db
    .from("cat_converters")
    .select("cat_id, unit_count, total_weight_kg, vin_source, no_source_reason, converter_category, status, hold_until, logged_at, sellers ( first_name, last_name )", { count: "exact" })
    .eq("tenant_id", tenant_id)
    .order("logged_at", { ascending: false })
    .limit(Math.min(limit, 500));

  if (status) query = query.eq("status", status);
  if (ticket_id) query = query.eq("ticket_id", ticket_id);
  if (date_from) query = query.gte("logged_at", date_from);
  if (date_to) query = query.lte("logged_at", date_to);

  const { data, error, count } = await query;
  if (error) return fail("DB_ERROR", "Database error");
  return ok({ converters: data, count: count ?? 0 });
}
