import { createHash } from "node:crypto";
import { db, ok, fail } from "../db";

const HST_RATE = 0.13;

export async function generateZReport(args: Record<string, unknown>) {
  const { tenant_id, business_date } = args as { tenant_id: string; business_date: string };
  if (!tenant_id || !business_date) return fail("VALIDATION_ERROR", "tenant_id and business_date required");

  if (!db) {
    return ok({
      report_date: business_date,
      total_tickets: 5,
      total_net_weight_kg: 2450,
      total_payouts_cad: 3250.75,
      payouts_by_method: { e_transfer: 2800, cheque: 450.75, cash: 0 },
      total_hst: 422.60,
      dev_mode: true,
    });
  }

  const dayStart = `${business_date}T00:00:00.000Z`;
  const dayEnd = `${business_date}T23:59:59.999Z`;

  const { data: tickets } = await db
    .from("intake_tickets")
    .select("ticket_id, net_weight_kg, status")
    .eq("tenant_id", tenant_id)
    .eq("status", "completed")
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd);

  const { data: payouts } = await db
    .from("payouts")
    .select("amount, hst_collected, method, status")
    .eq("tenant_id", tenant_id)
    .eq("status", "completed")
    .gte("processed_at", dayStart)
    .lte("processed_at", dayEnd);

  const totalNetWeight = ((tickets ?? []) as Array<{net_weight_kg: number}>).reduce((s, t) => s + (t.net_weight_kg ?? 0), 0);
  const totalPayouts = ((payouts ?? []) as Array<{amount: number}>).reduce((s, p) => s + p.amount, 0);
  const totalHst = ((payouts ?? []) as Array<{hst_collected: number}>).reduce((s, p) => s + (p.hst_collected ?? 0), 0);

  const byMethod: Record<string, number> = {};
  for (const p of (payouts ?? []) as Array<{method: string; amount: number}>) {
    byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;
  }

  return ok({
    report_date: business_date,
    total_tickets: tickets?.length ?? 0,
    total_net_weight_kg: Math.round(totalNetWeight * 100) / 100,
    total_payouts_cad: Math.round(totalPayouts * 100) / 100,
    payouts_by_method: byMethod,
    total_hst: Math.round(totalHst * 100) / 100,
    cash_on_hand: Math.round((byMethod.cash ?? 0) * 100) / 100,
  });
}

export async function generateHstReport(args: Record<string, unknown>) {
  const { tenant_id, period_start, period_end } = args as {
    tenant_id: string;
    period_start: string;
    period_end: string;
  };

  if (!tenant_id || !period_start || !period_end) return fail("VALIDATION_ERROR", "tenant_id, period_start, period_end required");
  if (!db) return ok({ period_start, period_end, hst_collected: 2847.30, hst_rate: HST_RATE, dev_mode: true });

  const { data: payouts } = await db
    .from("payouts")
    .select("payout_id, amount, hst_collected, method, processed_at, sellers ( first_name, last_name )")
    .eq("tenant_id", tenant_id)
    .eq("status", "completed")
    .gte("processed_at", `${period_start}T00:00:00Z`)
    .lte("processed_at", `${period_end}T23:59:59Z`);

  const totalHst = ((payouts ?? []) as Array<{hst_collected: number}>).reduce((s, p) => s + (p.hst_collected ?? 0), 0);
  const totalSubtotal = ((payouts ?? []) as Array<{amount: number}>).reduce((s, p) => s + p.amount, 0);

  return ok({
    period_start,
    period_end,
    // TODO(compliance): CRA GST/HST: Ontario HST 13% per ETA s. 165(2). Effective 2010-07-01.
    // Reference: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html
    hst_rate: HST_RATE,
    total_subtotal: Math.round(totalSubtotal * 100) / 100,
    hst_collected: Math.round(totalHst * 100) / 100,
    line_items: payouts ?? [],
    transaction_count: payouts?.length ?? 0,
  });
}

export async function bylawExport(args: Record<string, unknown>) {
  const { tenant_id, date_from, date_to, material_filter } = args as {
    tenant_id: string;
    date_from: string;
    date_to: string;
    material_filter?: string[];
  };

  if (!tenant_id || !date_from || !date_to) return fail("VALIDATION_ERROR", "tenant_id, date_from, date_to required");
  if (!db) {
    const hash = createHash("sha256").update(JSON.stringify({ tenant_id, date_from, date_to })).digest("hex");
    return ok({ transactions: [], transaction_count: 0, sha256_hash: hash, dev_mode: true });
  }

  // TODO(compliance): Ontario Scrap Metal Dealers and Recyclers Act — O. Reg. XXX (pending)
  // Current best practice mirrors BC Scrap Metal Dealers Act RSBC 2015 c.15 and
  // AB Bill 90 (2024). Required fields per transaction: seller ID, vehicle plate,
  // material type, weight, price, payment method, timestamp.
  // Reference: https://www.ontario.ca/laws/statute/90s17 (Ontario Municipal Act related)

  const { data: tickets } = await db
    .from("intake_tickets")
    .select(`
      ticket_id, ticket_number, created_at, net_weight_kg, status,
      sellers ( first_name, last_name, phone ),
      vehicles ( plate, province ),
      ticket_lines ( quantity_kg, unit_price_per_kg, materials ( name, category ) )
    `)
    .eq("tenant_id", tenant_id)
    .eq("status", "completed")
    .gte("created_at", `${date_from}T00:00:00Z`)
    .lte("created_at", `${date_to}T23:59:59Z`);

  const { data: catConverters } = await db
    .from("cat_converters")
    .select("cat_id, unit_count, vin_source, no_source_reason, converter_category, logged_at, sellers ( first_name, last_name )")
    .eq("tenant_id", tenant_id)
    .gte("logged_at", `${date_from}T00:00:00Z`)
    .lte("logged_at", `${date_to}T23:59:59Z`);

  const exportData = { tickets: tickets ?? [], cat_converters: catConverters ?? [], date_from, date_to, tenant_id, generated_at: new Date().toISOString() };
  const hash = createHash("sha256").update(JSON.stringify(exportData)).digest("hex");

  return ok({
    transactions: tickets ?? [],
    cat_converters: catConverters ?? [],
    transaction_count: tickets?.length ?? 0,
    date_from,
    date_to,
    generated_at: exportData.generated_at,
    sha256_hash: hash,
  });
}

export async function flagSuspiciousTransaction(args: Record<string, unknown>) {
  const { tenant_id, actor_id, ticket_id, reason, contact_police } = args as {
    tenant_id: string;
    actor_id: string;
    ticket_id: string;
    reason: string;
    contact_police?: boolean;
  };

  if (!tenant_id || !actor_id || !ticket_id || !reason) return fail("VALIDATION_ERROR", "Required fields missing");
  if (!db) return ok({ flagged: true, dev_mode: true });

  const { data, error } = await db
    .from("compliance_flags")
    .insert({
      tenant_id,
      flag_type: "stolen_risk",
      ref_type: "intake_ticket",
      ref_id: ticket_id,
      notes: reason,
      resolved: false,
    })
    .select("flag_id")
    .single();

  if (error) return fail("DB_ERROR", "Failed to flag transaction");

  // Immutable audit record — TODO(compliance): Ontario duty to report suspected stolen goods
  // Reference: Criminal Code RSC 1985 c C-46 s. 354 (possession of stolen property)
  const { appendAuditEvent } = await import("./audit");
  await appendAuditEvent({
    tenant_id,
    actor_id,
    action: "flag_suspicious_transaction",
    resource_type: "compliance_flag",
    resource_id: data.flag_id,
    payload: { ticket_id, reason, contact_police: contact_police ?? false },
  });

  return ok({ flag_id: data.flag_id, flagged: true, contact_police: contact_police ?? false });
}
