import { db, ok, fail } from "../db";
import { appendAuditEvent } from "./audit";

function ticketNumber(id: string): string {
  return `YD-${new Date().getFullYear()}-${id.slice(0, 6).toUpperCase()}`;
}

export async function createTicket(args: Record<string, unknown>) {
  const { tenant_id, actor_id, seller_id, vehicle_id } = args as {
    tenant_id: string;
    actor_id: string;
    seller_id: string;
    vehicle_id?: string;
  };

  if (!tenant_id || !actor_id || !seller_id) return fail("VALIDATION_ERROR", "Required fields missing");

  if (!db) {
    const id = crypto.randomUUID();
    return ok({ ticket_id: id, ticket_number: ticketNumber(id), status: "draft", dev_mode: true });
  }

  const { data, error } = await db
    .from("intake_tickets")
    .insert({
      tenant_id,
      scale_operator_id: actor_id,
      seller_id,
      vehicle_id: vehicle_id ?? null,
      status: "draft",
    })
    .select("ticket_id, ticket_number")
    .single();

  if (error) return fail("DB_ERROR", "Failed to create ticket");

  await appendAuditEvent({ tenant_id, actor_id, action: "create_ticket", resource_type: "intake_ticket", resource_id: data.ticket_id, payload: { seller_id } });
  return ok({ ticket_id: data.ticket_id, ticket_number: data.ticket_number, status: "draft" });
}

export async function recordWeights(args: Record<string, unknown>) {
  const { tenant_id, actor_id, ticket_id, gross_weight_kg, tare_weight_kg } = args as {
    tenant_id: string;
    actor_id: string;
    ticket_id: string;
    gross_weight_kg: number;
    tare_weight_kg: number;
  };

  if (!tenant_id || !ticket_id || gross_weight_kg == null || tare_weight_kg == null) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }

  if (gross_weight_kg < tare_weight_kg) return fail("VALIDATION_ERROR", "Gross weight must be >= tare weight");

  if (!db) return ok({ updated: true, net_weight_kg: gross_weight_kg - tare_weight_kg, dev_mode: true });

  const { error } = await db
    .from("intake_tickets")
    .update({ gross_weight_kg, tare_weight_kg, weighed_at: new Date().toISOString(), status: "weighed" })
    .eq("tenant_id", tenant_id)
    .eq("ticket_id", ticket_id);

  if (error) return fail("DB_ERROR", "Failed to record weights");

  await appendAuditEvent({ tenant_id, actor_id, action: "record_weights", resource_type: "intake_ticket", resource_id: ticket_id, payload: { gross_weight_kg, tare_weight_kg } });
  return ok({ updated: true, net_weight_kg: gross_weight_kg - tare_weight_kg });
}

export async function addTicketLine(args: Record<string, unknown>) {
  const { tenant_id, actor_id, ticket_id, material_id, quantity_kg, unit_price_per_kg, price_schedule_id, notes } = args as {
    tenant_id: string;
    actor_id: string;
    ticket_id: string;
    material_id: string;
    quantity_kg: number;
    unit_price_per_kg: number;
    price_schedule_id?: string;
    notes?: string;
  };

  if (!tenant_id || !ticket_id || !material_id || quantity_kg == null || unit_price_per_kg == null) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }

  if (!db) return ok({ line_id: crypto.randomUUID(), dev_mode: true });

  const { data, error } = await db
    .from("ticket_lines")
    .insert({
      ticket_id,
      material_id,
      quantity_kg,
      unit_price_per_kg,
      price_schedule_id: price_schedule_id ?? null,
      notes: notes ?? null,
    })
    .select("line_id")
    .single();

  if (error) return fail("DB_ERROR", "Failed to add ticket line");

  await appendAuditEvent({ tenant_id, actor_id, action: "add_ticket_line", resource_type: "ticket_line", resource_id: data.line_id, payload: { ticket_id, material_id, quantity_kg, unit_price_per_kg } });
  return ok({ line_id: data.line_id, line_total: quantity_kg * unit_price_per_kg });
}

export async function removeTicketLine(args: Record<string, unknown>) {
  const { tenant_id, actor_id, line_id, ticket_id } = args as { tenant_id: string; actor_id: string; line_id: string; ticket_id: string };
  if (!tenant_id || !line_id || !ticket_id) return fail("VALIDATION_ERROR", "Required fields missing");
  if (!db) return ok({ removed: true, dev_mode: true });

  const { error } = await db.from("ticket_lines").delete().eq("line_id", line_id);
  if (error) return fail("DB_ERROR", "Failed to remove line");

  await appendAuditEvent({ tenant_id, actor_id, action: "remove_ticket_line", resource_type: "ticket_line", resource_id: line_id, payload: { ticket_id } });
  return ok({ removed: true });
}

export async function recordSignature(args: Record<string, unknown>) {
  const { tenant_id, actor_id, ticket_id, signature_svg } = args as {
    tenant_id: string;
    actor_id: string;
    ticket_id: string;
    signature_svg: string;
  };

  if (!tenant_id || !ticket_id || !signature_svg) return fail("VALIDATION_ERROR", "Required fields missing");
  if (!db) return ok({ signed: true, dev_mode: true });

  const { error } = await db
    .from("intake_tickets")
    .update({ signature_svg, signed_at: new Date().toISOString(), status: "signed" })
    .eq("tenant_id", tenant_id)
    .eq("ticket_id", ticket_id);

  if (error) return fail("DB_ERROR", "Failed to record signature");

  await appendAuditEvent({ tenant_id, actor_id, action: "record_signature", resource_type: "intake_ticket", resource_id: ticket_id, payload: {} });
  return ok({ signed: true });
}

export async function completeTicket(args: Record<string, unknown>) {
  const { tenant_id, actor_id, ticket_id } = args as { tenant_id: string; actor_id: string; ticket_id: string };
  if (!tenant_id || !actor_id || !ticket_id) return fail("VALIDATION_ERROR", "Required fields missing");

  if (!db) return ok({ completed: true, dev_mode: true });

  const { data: ticket, error: fetchErr } = await db
    .from("intake_tickets")
    .select("status, signature_svg, seller_id")
    .eq("tenant_id", tenant_id)
    .eq("ticket_id", ticket_id)
    .maybeSingle();

  if (fetchErr) return fail("DB_ERROR", "Database error");
  if (!ticket) return fail("NOT_FOUND", "Ticket not found");
  if (!ticket.signature_svg) return fail("VALIDATION_ERROR", "Seller signature is required before completing");
  if (ticket.status === "completed") return fail("CONFLICT", "Ticket already completed");
  if (ticket.status === "voided") return fail("CONFLICT", "Cannot complete a voided ticket");

  const { error } = await db
    .from("intake_tickets")
    .update({ status: "completed" })
    .eq("tenant_id", tenant_id)
    .eq("ticket_id", ticket_id);

  if (error) return fail("DB_ERROR", "Failed to complete ticket");

  await appendAuditEvent({ tenant_id, actor_id, action: "complete_ticket", resource_type: "intake_ticket", resource_id: ticket_id, payload: {} });
  return ok({ completed: true });
}

export async function voidTicket(args: Record<string, unknown>) {
  const { tenant_id, actor_id, ticket_id, reason } = args as {
    tenant_id: string;
    actor_id: string;
    ticket_id: string;
    reason: string;
  };

  if (!tenant_id || !actor_id || !ticket_id || !reason) return fail("VALIDATION_ERROR", "Required fields missing");
  if (!db) return ok({ voided: true, dev_mode: true });

  const { error } = await db
    .from("intake_tickets")
    .update({ status: "voided", notes: `VOID: ${reason}` })
    .eq("tenant_id", tenant_id)
    .eq("ticket_id", ticket_id);

  if (error) return fail("DB_ERROR", "Failed to void ticket");

  await appendAuditEvent({ tenant_id, actor_id, action: "void_ticket", resource_type: "intake_ticket", resource_id: ticket_id, payload: { reason } });
  return ok({ voided: true });
}

export async function getTicket(args: Record<string, unknown>) {
  const { tenant_id, ticket_id } = args as { tenant_id: string; ticket_id: string };
  if (!tenant_id || !ticket_id) return fail("VALIDATION_ERROR", "Required fields missing");

  if (!db) return ok({ ticket: { ticket_id, status: "draft", ticket_number: "YD-2026-DEMO01", dev_mode: true } });

  const { data, error } = await db
    .from("intake_tickets")
    .select(`
      ticket_id, ticket_number, status, gross_weight_kg, tare_weight_kg, net_weight_kg,
      weighed_at, signature_svg, signed_at, notes, created_at,
      sellers ( seller_id, first_name, last_name, phone ),
      vehicles ( vehicle_id, plate, make, model, year ),
      ticket_lines ( line_id, quantity_kg, unit_price_per_kg, notes, materials ( name, category, unit ) )
    `)
    .eq("tenant_id", tenant_id)
    .eq("ticket_id", ticket_id)
    .maybeSingle();

  if (error) return fail("DB_ERROR", "Database error");
  if (!data) return fail("NOT_FOUND", "Ticket not found");
  return ok({ ticket: data });
}

export async function listTickets(args: Record<string, unknown>) {
  const { tenant_id, status, seller_id, date_from, date_to, limit = 50, offset = 0 } = args as {
    tenant_id: string;
    status?: string;
    seller_id?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  };

  if (!tenant_id) return fail("VALIDATION_ERROR", "tenant_id required");
  if (!db) return ok({ tickets: [], count: 0, dev_mode: true });

  let query = db
    .from("intake_tickets")
    .select("ticket_id, ticket_number, status, net_weight_kg, created_at, sellers ( first_name, last_name )", { count: "exact" })
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + Math.min(limit, 200) - 1);

  if (status) query = query.eq("status", status);
  if (seller_id) query = query.eq("seller_id", seller_id);
  if (date_from) query = query.gte("created_at", date_from);
  if (date_to) query = query.lte("created_at", date_to);

  const { data, error, count } = await query;
  if (error) return fail("DB_ERROR", "Database error");
  return ok({ tickets: data, count: count ?? 0 });
}

export async function attachLinePhoto(args: Record<string, unknown>) {
  const { tenant_id, actor_id, ticket_id, line_id, photo_base64, media_type = "image/jpeg" } = args as {
    tenant_id: string;
    actor_id: string;
    ticket_id: string;
    line_id: string;
    photo_base64: string;
    media_type?: string;
  };

  if (!tenant_id || !actor_id || !ticket_id || !line_id || !photo_base64) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }

  if (!db) {
    return ok({ photo_key: `dev/tickets/${ticket_id}/lines/${line_id}.jpg`, dev_mode: true });
  }

  // Upload to Supabase Storage and store key on the ticket line
  const { createClient } = await import("@supabase/supabase-js");
  const storageClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const ext = media_type === "image/png" ? "png" : "jpg";
  const key = `tenants/${tenant_id}/tickets/${ticket_id}/lines/${line_id}.${ext}`;
  const buffer = Buffer.from(photo_base64, "base64");

  const { error: uploadError } = await storageClient.storage
    .from("yardops-media")
    .upload(key, buffer, { contentType: media_type as string, upsert: true });

  if (uploadError) return fail("STORAGE_ERROR", uploadError.message);

  await db.from("ticket_lines").update({ photo_storage_key: key }).eq("line_id", line_id).eq("tenant_id", tenant_id);
  await appendAuditEvent({ tenant_id, actor_id, action: "attach_line_photo", resource_type: "ticket_line", resource_id: line_id, payload: { ticket_id, photo_key: key } });

  return ok({ photo_key: key });
}
