import { db, ok, fail } from "../db";

export async function appendAuditEvent(args: Record<string, unknown>) {
  const { tenant_id, actor_id, action, resource_type, resource_id, payload, ip_address } = args as {
    tenant_id: string;
    actor_id: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    payload?: Record<string, unknown>;
    ip_address?: string;
  };

  if (!tenant_id || !actor_id || !action || !resource_type) {
    return fail("VALIDATION_ERROR", "tenant_id, actor_id, action, and resource_type are required");
  }

  if (!db) {
    return ok({ audit_id: crypto.randomUUID(), logged: true, dev_mode: true });
  }

  const { data, error } = await db
    .from("audit_log")
    .insert({
      tenant_id,
      actor_id,
      action,
      resource_type,
      resource_id: resource_id ?? null,
      payload: payload ?? {},
      ip_address: ip_address ?? null,
    })
    .select("audit_id")
    .single();

  if (error) return fail("DB_ERROR", "Failed to write audit event");
  return ok({ audit_id: data.audit_id });
}

export async function queryAuditLog(args: Record<string, unknown>) {
  const { tenant_id, resource_type, resource_id, actor_id, from_date, to_date, limit = 50 } = args as {
    tenant_id: string;
    resource_type?: string;
    resource_id?: string;
    actor_id?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
  };

  if (!tenant_id) return fail("VALIDATION_ERROR", "tenant_id is required");

  if (!db) return ok({ events: [], dev_mode: true });

  let query = db
    .from("audit_log")
    .select("*")
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 500));

  if (resource_type) query = query.eq("resource_type", resource_type);
  if (resource_id) query = query.eq("resource_id", resource_id);
  if (actor_id) query = query.eq("actor_id", actor_id);
  if (from_date) query = query.gte("created_at", from_date);
  if (to_date) query = query.lte("created_at", to_date);

  const { data, error } = await query;
  if (error) return fail("DB_ERROR", "Failed to query audit log");
  return ok({ events: data, count: data.length });
}
