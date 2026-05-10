import { db, ok, fail } from "../db";
import { appendAuditEvent } from "./audit";

function lotNumber(material: string): string {
  const year = new Date().getFullYear();
  const short = material.slice(0, 2).toUpperCase();
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return `LOT-${year}-${short}-${rand}`;
}

export async function createLot(args: Record<string, unknown>) {
  const { tenant_id, actor_id, material_id, initial_weight_kg, location, notes, source_ticket_id } = args as {
    tenant_id: string;
    actor_id: string;
    material_id: string;
    initial_weight_kg: number;
    location?: string;
    notes?: string;
    source_ticket_id?: string;
  };

  if (!tenant_id || !actor_id || !material_id || initial_weight_kg == null) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }

  if (!db) {
    const id = crypto.randomUUID();
    return ok({ lot_id: id, lot_number: lotNumber(material_id), status: "open", dev_mode: true });
  }

  const { data: mat } = await db.from("materials").select("name").eq("material_id", material_id).maybeSingle();

  const { data, error } = await db
    .from("lots")
    .insert({
      tenant_id,
      material_id,
      total_weight_kg: initial_weight_kg,
      lot_number: lotNumber(mat?.name ?? material_id.slice(0, 6)),
      status: "open",
      location: location ?? null,
      notes: notes ?? null,
    })
    .select("lot_id, lot_number")
    .single();

  if (error) return fail("DB_ERROR", "Failed to create lot");

  // Record movement
  await db.from("lot_movements").insert({
    lot_id: data.lot_id,
    weight_kg: initial_weight_kg,
    action: source_ticket_id ? "intake" : "manual",
    ticket_id: source_ticket_id ?? null,
    actor_id,
  }).catch(() => {});

  await appendAuditEvent({ tenant_id, actor_id, action: "create_lot", resource_type: "lot", resource_id: data.lot_id, payload: { material_id, initial_weight_kg } });
  return ok({ lot_id: data.lot_id, lot_number: data.lot_number, status: "open" });
}

export async function splitLot(args: Record<string, unknown>) {
  const { tenant_id, actor_id, lot_id, split_weight_kg, new_material_id, new_location, notes } = args as {
    tenant_id: string;
    actor_id: string;
    lot_id: string;
    split_weight_kg: number;
    new_material_id?: string;
    new_location?: string;
    notes?: string;
  };

  if (!tenant_id || !actor_id || !lot_id || split_weight_kg == null) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }

  if (!db) return ok({ new_lot_id: crypto.randomUUID(), dev_mode: true });

  const { data: parent, error: fetchErr } = await db
    .from("lots")
    .select("lot_id, material_id, total_weight_kg, status")
    .eq("tenant_id", tenant_id)
    .eq("lot_id", lot_id)
    .maybeSingle();

  if (fetchErr || !parent) return fail("NOT_FOUND", "Lot not found");
  if (parent.total_weight_kg < split_weight_kg) return fail("VALIDATION_ERROR", "Split weight exceeds lot weight");
  if (parent.status === "sold" || parent.status === "archived") return fail("CONFLICT", "Cannot split a sold or archived lot");

  const newWeight = parent.total_weight_kg - split_weight_kg;

  // Update parent weight
  await db.from("lots").update({ total_weight_kg: newWeight }).eq("lot_id", lot_id);

  // Create child lot
  const { data: mat } = await db.from("materials").select("name").eq("material_id", new_material_id ?? parent.material_id).maybeSingle();
  const { data: newLot, error } = await db
    .from("lots")
    .insert({
      tenant_id,
      material_id: new_material_id ?? parent.material_id,
      total_weight_kg: split_weight_kg,
      lot_number: lotNumber(mat?.name ?? "SP"),
      status: "open",
      location: new_location ?? null,
      notes: notes ?? null,
      parent_lot_id: lot_id,
    })
    .select("lot_id, lot_number")
    .single();

  if (error) return fail("DB_ERROR", "Failed to create split lot");

  // Record movements
  await db.from("lot_movements").insert([
    { lot_id, weight_kg: -split_weight_kg, action: "split", actor_id },
    { lot_id: newLot.lot_id, from_lot_id: lot_id, weight_kg: split_weight_kg, action: "split", actor_id },
  ]).catch(() => {});

  await appendAuditEvent({ tenant_id, actor_id, action: "split_lot", resource_type: "lot", resource_id: lot_id, payload: { split_weight_kg, new_lot_id: newLot.lot_id } });
  return ok({ new_lot_id: newLot.lot_id, new_lot_number: newLot.lot_number, parent_remaining_kg: newWeight });
}

export async function mergeLots(args: Record<string, unknown>) {
  const { tenant_id, actor_id, source_lot_ids, target_lot_id } = args as {
    tenant_id: string;
    actor_id: string;
    source_lot_ids: string[];
    target_lot_id: string;
  };

  if (!tenant_id || !actor_id || !Array.isArray(source_lot_ids) || !target_lot_id) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }
  if (source_lot_ids.includes(target_lot_id)) return fail("VALIDATION_ERROR", "Target lot cannot be a source lot");
  if (!db) return ok({ merged: true, dev_mode: true });

  const { data: sources } = await db.from("lots").select("lot_id, total_weight_kg, material_id").in("lot_id", source_lot_ids).eq("tenant_id", tenant_id);
  if (!sources?.length) return fail("NOT_FOUND", "Source lots not found");

  const { data: target } = await db.from("lots").select("lot_id, material_id, total_weight_kg").eq("lot_id", target_lot_id).eq("tenant_id", tenant_id).maybeSingle();
  if (!target) return fail("NOT_FOUND", "Target lot not found");

  const addedWeight = (sources as Array<{total_weight_kg: number}>).reduce((s, l) => s + l.total_weight_kg, 0);

  await db.from("lots").update({ total_weight_kg: target.total_weight_kg + addedWeight }).eq("lot_id", target_lot_id);
  await db.from("lots").update({ status: "archived", total_weight_kg: 0 }).in("lot_id", source_lot_ids);

  const movements = source_lot_ids.map((id) => ({ lot_id: target_lot_id, from_lot_id: id, weight_kg: addedWeight / source_lot_ids.length, action: "merge", actor_id }));
  await db.from("lot_movements").insert(movements).catch(() => {});

  await appendAuditEvent({ tenant_id, actor_id, action: "merge_lots", resource_type: "lot", resource_id: target_lot_id, payload: { source_lot_ids, added_weight_kg: addedWeight } });
  return ok({ merged: true, new_total_weight_kg: target.total_weight_kg + addedWeight });
}

export async function getLot(args: Record<string, unknown>) {
  const { tenant_id, lot_id } = args as { tenant_id: string; lot_id: string };
  if (!tenant_id || !lot_id) return fail("VALIDATION_ERROR", "Required fields missing");
  if (!db) return ok({ lot: { lot_id, lot_number: "LOT-2026-CU-0001", status: "open", dev_mode: true } });

  const { data, error } = await db
    .from("lots")
    .select("*, materials ( name, category, unit )")
    .eq("tenant_id", tenant_id)
    .eq("lot_id", lot_id)
    .maybeSingle();

  if (error) return fail("DB_ERROR", "Database error");
  if (!data) return fail("NOT_FOUND", "Lot not found");
  return ok({ lot: data });
}

export async function listLots(args: Record<string, unknown>) {
  const { tenant_id, status, material_id, limit = 50 } = args as {
    tenant_id: string;
    status?: string;
    material_id?: string;
    limit?: number;
  };

  if (!tenant_id) return fail("VALIDATION_ERROR", "tenant_id required");
  if (!db) return ok({ lots: [], count: 0, dev_mode: true });

  let query = db
    .from("lots")
    .select("lot_id, lot_number, total_weight_kg, status, location, created_at, materials ( name, category, unit )", { count: "exact" })
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 500));

  if (status) query = query.eq("status", status);
  if (material_id) query = query.eq("material_id", material_id);

  const { data, error, count } = await query;
  if (error) return fail("DB_ERROR", "Database error");
  return ok({ lots: data, count: count ?? 0 });
}

export async function getLotLineage(args: Record<string, unknown>) {
  const { tenant_id, lot_id } = args as { tenant_id: string; lot_id: string };
  if (!tenant_id || !lot_id) return fail("VALIDATION_ERROR", "Required fields missing");
  if (!db) return ok({ movements: [], dev_mode: true });

  const { data, error } = await db
    .from("lot_movements")
    .select("movement_id, weight_kg, action, from_lot_id, ticket_id, created_at")
    .eq("lot_id", lot_id)
    .order("created_at", { ascending: true });

  if (error) return fail("DB_ERROR", "Database error");
  return ok({ movements: data });
}
