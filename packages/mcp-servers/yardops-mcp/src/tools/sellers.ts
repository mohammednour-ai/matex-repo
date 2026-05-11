import { db, ok, fail } from "../db";
import { appendAuditEvent } from "./audit";

export async function createSeller(args: Record<string, unknown>) {
  const { tenant_id, actor_id, first_name, last_name, phone, email, address, notes } = args as {
    tenant_id: string;
    actor_id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email?: string;
    address?: Record<string, unknown>;
    notes?: string;
  };

  if (!tenant_id || !actor_id || !first_name || !last_name || !phone) {
    return fail("VALIDATION_ERROR", "tenant_id, actor_id, first_name, last_name, and phone are required");
  }

  if (!db) {
    return ok({ seller_id: crypto.randomUUID(), dev_mode: true });
  }

  const { data, error } = await db
    .from("sellers")
    .insert({
      tenant_id,
      first_name,
      last_name,
      phone,
      email: email ?? null,
      address: address ?? {},
      notes: notes ?? null,
      pipeda_consent: false,
      is_blocked: false,
    })
    .select("seller_id")
    .single();

  if (error) return fail("DB_ERROR", "Failed to create seller");

  await appendAuditEvent({
    tenant_id,
    actor_id,
    action: "create_seller",
    resource_type: "seller",
    resource_id: data.seller_id,
    payload: { first_name, last_name, phone },
  });

  return ok({ seller_id: data.seller_id });
}

export async function getSeller(args: Record<string, unknown>) {
  const { tenant_id, seller_id } = args as { tenant_id: string; seller_id: string };
  if (!tenant_id || !seller_id) return fail("VALIDATION_ERROR", "tenant_id and seller_id are required");

  if (!db) return ok({ seller: { seller_id, first_name: "Demo", last_name: "Seller", phone: "555-0100", dev_mode: true } });

  const { data, error } = await db
    .from("sellers")
    .select("seller_id, first_name, last_name, phone, email, address, notes, is_blocked, pipeda_consent, pipeda_consent_at, created_at")
    .eq("tenant_id", tenant_id)
    .eq("seller_id", seller_id)
    .maybeSingle();

  if (error) return fail("DB_ERROR", "Database error");
  if (!data) return fail("NOT_FOUND", "Seller not found");
  return ok({ seller: data });
}

export async function listSellers(args: Record<string, unknown>) {
  const { tenant_id, search, is_blocked, limit = 50, offset = 0 } = args as {
    tenant_id: string;
    search?: string;
    is_blocked?: boolean;
    limit?: number;
    offset?: number;
  };

  if (!tenant_id) return fail("VALIDATION_ERROR", "tenant_id is required");

  if (!db) return ok({ sellers: [], count: 0, dev_mode: true });

  let query = db
    .from("sellers")
    .select("seller_id, first_name, last_name, phone, email, is_blocked, pipeda_consent, created_at", { count: "exact" })
    .eq("tenant_id", tenant_id)
    .order("last_name", { ascending: true })
    .range(offset, offset + Math.min(limit, 200) - 1);

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  if (typeof is_blocked === "boolean") query = query.eq("is_blocked", is_blocked);

  const { data, error, count } = await query;
  if (error) return fail("DB_ERROR", "Database error");
  return ok({ sellers: data, count: count ?? 0 });
}

export async function updateSeller(args: Record<string, unknown>) {
  const { tenant_id, actor_id, seller_id, ...updates } = args as {
    tenant_id: string;
    actor_id: string;
    seller_id: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
    address?: Record<string, unknown>;
    notes?: string;
  };

  if (!tenant_id || !actor_id || !seller_id) return fail("VALIDATION_ERROR", "tenant_id, actor_id, seller_id required");
  if (!db) return ok({ updated: true, dev_mode: true });

  const allowed = ["first_name", "last_name", "phone", "email", "address", "notes"];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (updates[k] !== undefined) patch[k] = updates[k];
  }

  const { error } = await db.from("sellers").update(patch).eq("tenant_id", tenant_id).eq("seller_id", seller_id);
  if (error) return fail("DB_ERROR", "Failed to update seller");

  await appendAuditEvent({
    tenant_id,
    actor_id,
    action: "update_seller",
    resource_type: "seller",
    resource_id: seller_id,
    payload: patch,
  });

  return ok({ updated: true });
}

export async function blockSeller(args: Record<string, unknown>) {
  const { tenant_id, actor_id, seller_id, reason } = args as {
    tenant_id: string;
    actor_id: string;
    seller_id: string;
    reason?: string;
  };

  if (!tenant_id || !actor_id || !seller_id) return fail("VALIDATION_ERROR", "Required fields missing");
  if (!db) return ok({ blocked: true, dev_mode: true });

  const { error } = await db
    .from("sellers")
    .update({ is_blocked: true, notes: reason ?? "Blocked by operator", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenant_id)
    .eq("seller_id", seller_id);

  if (error) return fail("DB_ERROR", "Failed to block seller");

  await appendAuditEvent({
    tenant_id,
    actor_id,
    action: "block_seller",
    resource_type: "seller",
    resource_id: seller_id,
    payload: { reason },
  });

  return ok({ blocked: true });
}

export async function recordPipedaConsent(args: Record<string, unknown>) {
  const { tenant_id, actor_id, seller_id } = args as {
    tenant_id: string;
    actor_id: string;
    seller_id: string;
  };

  if (!tenant_id || !seller_id) return fail("VALIDATION_ERROR", "tenant_id and seller_id required");
  if (!db) return ok({ consent_recorded: true, dev_mode: true });

  const { error } = await db
    .from("sellers")
    .update({ pipeda_consent: true, pipeda_consent_at: new Date().toISOString() })
    .eq("tenant_id", tenant_id)
    .eq("seller_id", seller_id);

  if (error) return fail("DB_ERROR", "Failed to record consent");

  await appendAuditEvent({
    tenant_id,
    actor_id: actor_id ?? seller_id,
    action: "pipeda_consent",
    resource_type: "seller",
    resource_id: seller_id,
    payload: { consented_at: new Date().toISOString() },
  });

  return ok({ consent_recorded: true });
}

export async function logSellerId(args: Record<string, unknown>) {
  const {
    tenant_id,
    actor_id,
    seller_id,
    id_type,
    id_number_plain,
    id_expiry,
    province_issued,
    ocr_confidence,
    id_photo_storage_key,
    face_photo_storage_key,
  } = args as {
    tenant_id: string;
    actor_id: string;
    seller_id: string;
    id_type: string;
    id_number_plain: string;
    id_expiry?: string;
    province_issued?: string;
    ocr_confidence?: number;
    id_photo_storage_key?: string;
    face_photo_storage_key?: string;
  };

  if (!tenant_id || !seller_id || !id_type || !id_number_plain) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }

  if (!db) {
    return ok({ id_record_id: crypto.randomUUID(), dev_mode: true });
  }

  // Encrypt id_number_plain via Supabase RPC (pgcrypto pgp_sym_encrypt)
  const { data: encrypted, error: encErr } = await db.rpc("encrypt_seller_id_number", {
    p_plain_text: id_number_plain,
  });

  if (encErr) return fail("DB_ERROR", "Failed to encrypt ID number");

  const { data, error } = await db
    .from("seller_ids")
    .insert({
      seller_id,
      tenant_id,
      id_type,
      id_number_encrypted: encrypted,
      id_expiry: id_expiry ?? null,
      province_issued: province_issued ?? null,
      ocr_confidence: ocr_confidence ?? null,
      id_photo_storage_key: id_photo_storage_key ?? null,
      face_photo_storage_key: face_photo_storage_key ?? null,
      captured_by: actor_id,
      captured_at: new Date().toISOString(),
      verified: false,
    })
    .select("id_record_id")
    .single();

  if (error) return fail("DB_ERROR", "Failed to log seller ID");

  await appendAuditEvent({
    tenant_id,
    actor_id,
    action: "log_seller_id",
    resource_type: "seller_id",
    resource_id: data.id_record_id,
    payload: { seller_id, id_type, province_issued },
  });

  return ok({ id_record_id: data.id_record_id });
}

export async function listSellerIds(args: Record<string, unknown>) {
  const { tenant_id, seller_id } = args as { tenant_id: string; seller_id: string };
  if (!tenant_id || !seller_id) return fail("VALIDATION_ERROR", "tenant_id and seller_id required");
  if (!db) return ok({ id_records: [], dev_mode: true });

  const { data, error } = await db
    .from("seller_ids")
    .select("id_record_id, id_type, id_expiry, province_issued, ocr_confidence, captured_at, verified")
    .eq("tenant_id", tenant_id)
    .eq("seller_id", seller_id)
    .order("captured_at", { ascending: false });

  if (error) return fail("DB_ERROR", "Database error");
  return ok({ id_records: data });
}
