import { db, ok, fail } from "../db";

export async function setMaterial(args: Record<string, unknown>) {
  const { tenant_id, material_id, name, category, sub_category, lme_metal, unit = "kg", is_active = true, sort_order } = args as {
    tenant_id: string;
    material_id?: string;
    name: string;
    category: string;
    sub_category?: string;
    lme_metal?: string;
    unit?: string;
    is_active?: boolean;
    sort_order?: number;
  };

  if (!tenant_id || !name || !category) return fail("VALIDATION_ERROR", "tenant_id, name, category required");
  if (!db) return ok({ material_id: material_id ?? crypto.randomUUID(), dev_mode: true });

  if (material_id) {
    const { error } = await db
      .from("materials")
      .update({ name, category, sub_category: sub_category ?? null, lme_metal: lme_metal ?? null, unit, is_active, sort_order: sort_order ?? 0 })
      .eq("tenant_id", tenant_id)
      .eq("material_id", material_id);
    if (error) return fail("DB_ERROR", "Failed to update material");
    return ok({ material_id });
  }

  const { data, error } = await db
    .from("materials")
    .insert({ tenant_id, name, category, sub_category: sub_category ?? null, lme_metal: lme_metal ?? null, unit, is_active, sort_order: sort_order ?? 0 })
    .select("material_id")
    .single();

  if (error) return fail("DB_ERROR", "Failed to create material");
  return ok({ material_id: data.material_id });
}

export async function listMaterials(args: Record<string, unknown>) {
  const { tenant_id, is_active } = args as { tenant_id: string; is_active?: boolean };
  if (!tenant_id) return fail("VALIDATION_ERROR", "tenant_id required");

  if (!db) {
    return ok({
      materials: [
        { material_id: "mat-1", name: "#1 Copper Bare Bright", category: "non_ferrous", unit: "kg", is_active: true, sort_order: 1 },
        { material_id: "mat-2", name: "#2 Copper", category: "non_ferrous", unit: "kg", is_active: true, sort_order: 2 },
        { material_id: "mat-3", name: "Yellow Brass", category: "non_ferrous", unit: "kg", is_active: true, sort_order: 3 },
        { material_id: "mat-4", name: "Aluminum Sheet", category: "non_ferrous", unit: "kg", is_active: true, sort_order: 4 },
        { material_id: "mat-5", name: "Steel HMS 1&2", category: "ferrous", unit: "kg", is_active: true, sort_order: 10 },
        { material_id: "mat-6", name: "Cast Iron", category: "ferrous", unit: "kg", is_active: true, sort_order: 11 },
        { material_id: "mat-7", name: "Catalytic Converter", category: "cat_converter", unit: "piece", is_active: true, sort_order: 20 },
        { material_id: "mat-8", name: "E-Scrap", category: "ewaste", unit: "kg", is_active: true, sort_order: 30 },
      ],
      dev_mode: true,
    });
  }

  let query = db
    .from("materials")
    .select("*")
    .eq("tenant_id", tenant_id)
    .order("sort_order", { ascending: true });

  if (typeof is_active === "boolean") query = query.eq("is_active", is_active);

  const { data, error } = await query;
  if (error) return fail("DB_ERROR", "Database error");
  return ok({ materials: data });
}

export async function setPriceSchedule(args: Record<string, unknown>) {
  const { tenant_id, actor_id, material_id, price_per_kg, effective_date, expires_date, lme_reference_price, lme_spread } = args as {
    tenant_id: string;
    actor_id: string;
    material_id: string;
    price_per_kg: number;
    effective_date: string;
    expires_date?: string;
    lme_reference_price?: number;
    lme_spread?: number;
  };

  if (!tenant_id || !actor_id || !material_id || price_per_kg == null || !effective_date) {
    return fail("VALIDATION_ERROR", "Required fields missing");
  }

  if (!db) return ok({ price_id: crypto.randomUUID(), dev_mode: true });

  const { data, error } = await db
    .from("material_prices")
    .insert({
      tenant_id,
      material_id,
      price_per_kg,
      effective_date,
      expires_date: expires_date ?? null,
      lme_reference_price: lme_reference_price ?? null,
      lme_spread: lme_spread ?? null,
      set_by: actor_id,
    })
    .select("price_id")
    .single();

  if (error) return fail("DB_ERROR", "Failed to set price schedule");
  return ok({ price_id: data.price_id });
}

export async function getActivePrices(args: Record<string, unknown>) {
  const { tenant_id } = args as { tenant_id: string };
  if (!tenant_id) return fail("VALIDATION_ERROR", "tenant_id required");

  if (!db) {
    return ok({
      prices: [
        { material_id: "mat-1", material_name: "#1 Copper Bare Bright", price_per_kg: 9.50, effective_date: "2026-05-08" },
        { material_id: "mat-2", material_name: "#2 Copper", price_per_kg: 8.75, effective_date: "2026-05-08" },
        { material_id: "mat-3", material_name: "Yellow Brass", price_per_kg: 5.25, effective_date: "2026-05-08" },
        { material_id: "mat-4", material_name: "Aluminum Sheet", price_per_kg: 1.85, effective_date: "2026-05-08" },
        { material_id: "mat-5", material_name: "Steel HMS 1&2", price_per_kg: 0.28, effective_date: "2026-05-08" },
        { material_id: "mat-6", material_name: "Cast Iron", price_per_kg: 0.18, effective_date: "2026-05-08" },
        { material_id: "mat-7", material_name: "Catalytic Converter", price_per_kg: 125.00, effective_date: "2026-05-08" },
      ],
      dev_mode: true,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db
    .from("material_prices")
    .select(`
      price_id,
      material_id,
      price_per_kg,
      effective_date,
      expires_date,
      lme_reference_price,
      lme_spread,
      created_at,
      materials ( name, category, unit )
    `)
    .eq("tenant_id", tenant_id)
    .lte("effective_date", today)
    .or(`expires_date.is.null,expires_date.gte.${today}`)
    .order("effective_date", { ascending: false });

  if (error) return fail("DB_ERROR", "Database error");

  // Keep only the latest price per material
  const byMaterial = new Map<string, Record<string, unknown>>();
  for (const row of (data ?? [])) {
    if (!byMaterial.has(row.material_id)) byMaterial.set(row.material_id, row);
  }

  return ok({ prices: Array.from(byMaterial.values()) });
}

export async function getPriceHistory(args: Record<string, unknown>) {
  const { tenant_id, material_id, limit = 30 } = args as { tenant_id: string; material_id: string; limit?: number };
  if (!tenant_id || !material_id) return fail("VALIDATION_ERROR", "tenant_id and material_id required");
  if (!db) return ok({ history: [], dev_mode: true });

  const { data, error } = await db
    .from("material_prices")
    .select("price_id, price_per_kg, effective_date, expires_date, lme_reference_price, created_at")
    .eq("tenant_id", tenant_id)
    .eq("material_id", material_id)
    .order("effective_date", { ascending: false })
    .limit(limit);

  if (error) return fail("DB_ERROR", "Database error");
  return ok({ history: data });
}
