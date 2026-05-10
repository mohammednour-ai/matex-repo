import * as jwt from "jsonwebtoken";
import { db, ok, fail } from "../db";
import { appendAuditEvent } from "./audit";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_TOKEN_EXPIRY ?? "8h";

export async function createTenant(args: Record<string, unknown>) {
  const { name, license_number, address, hst_number, province = "ON", admin_email, admin_password, admin_name } = args as {
    name: string;
    license_number?: string;
    address?: Record<string, unknown>;
    hst_number?: string;
    province?: string;
    admin_email: string;
    admin_password: string;
    admin_name: string;
  };

  if (!name || !admin_email || !admin_password || !admin_name) {
    return fail("VALIDATION_ERROR", "name, admin_email, admin_password, and admin_name are required");
  }

  if (!db) {
    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    return ok({ tenant_id: tenantId, user_id: userId, dev_mode: true });
  }

  const { data: existingUser } = await db
    .from("yard_users")
    .select("user_id")
    .eq("email", admin_email.toLowerCase())
    .maybeSingle();
  if (existingUser) return fail("CONFLICT", "An account with this email already exists");

  const { data: tenant, error: tenantErr } = await db
    .from("tenants")
    .insert({
      name,
      license_number: license_number ?? null,
      address: address ?? {},
      hst_number: hst_number ?? null,
      province,
      settings: {
        cash_threshold_cad: 100,
        cash_allowed: true,
        cat_hold_days: 7,
        hst_rate: 0.13,
      },
    })
    .select("tenant_id")
    .single();

  if (tenantErr) return fail("DB_ERROR", "Failed to create yard tenant");

  // Hash password (bcrypt-style via Supabase pgcrypto)
  const { data: user, error: userErr } = await db
    .from("yard_users")
    .insert({
      tenant_id: tenant.tenant_id,
      email: admin_email.toLowerCase(),
      password_hash: admin_password, // hashed by DB trigger using pgcrypto
      full_name: admin_name,
      role: "admin",
      is_active: true,
    })
    .select("user_id, email, full_name, role")
    .single();

  if (userErr) return fail("DB_ERROR", "Failed to create admin user");

  return ok({ tenant_id: tenant.tenant_id, user_id: user.user_id });
}

export async function getTenant(args: Record<string, unknown>) {
  const { tenant_id } = args as { tenant_id: string };
  if (!tenant_id) return fail("VALIDATION_ERROR", "tenant_id is required");

  if (!db) return ok({ tenant_id, name: "Demo Yard", province: "ON", dev_mode: true });

  const { data, error } = await db
    .from("tenants")
    .select("*")
    .eq("tenant_id", tenant_id)
    .maybeSingle();

  if (error) return fail("DB_ERROR", "Database error");
  if (!data) return fail("NOT_FOUND", "Yard not found");
  return ok({ tenant: data });
}

export async function yardLogin(args: Record<string, unknown>) {
  const { email, password } = args as { email: string; password: string };

  if (!email || !password) return fail("VALIDATION_ERROR", "email and password are required");

  if (!db) {
    // Dev mode: accept any credentials
    const userId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const token = jwt.sign(
      { sub: userId, tenant_id: tenantId, role: "admin", scope: "yardops", email },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY },
    );
    return ok({
      token,
      user: { user_id: userId, email, full_name: "Dev Admin", role: "admin", tenant_id: tenantId },
      dev_mode: true,
    });
  }

  // Verify password via DB (pgcrypto crypt comparison)
  const { data: user, error } = await db
    .from("yard_users")
    .select("user_id, tenant_id, email, full_name, role, is_active, password_hash")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) return fail("DB_ERROR", "Database error");
  if (!user) return fail("INVALID_CREDENTIALS", "Invalid email or password");
  if (!user.is_active) return fail("ACCOUNT_DISABLED", "This account has been disabled");

  // Verify password using Supabase RPC (pgcrypto crypt)
  const { data: pwMatch } = await db.rpc("verify_yard_user_password", {
    p_user_id: user.user_id,
    p_password: password,
  });
  if (!pwMatch) return fail("INVALID_CREDENTIALS", "Invalid email or password");

  const token = jwt.sign(
    { sub: user.user_id, tenant_id: user.tenant_id, role: user.role, scope: "yardops", email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRY },
  );

  await appendAuditEvent({
    tenant_id: user.tenant_id,
    actor_id: user.user_id,
    action: "login",
    resource_type: "yard_user",
    resource_id: user.user_id,
    payload: { email: user.email },
  });

  return ok({
    token,
    user: {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      tenant_id: user.tenant_id,
    },
  });
}

export async function upsertYardSettings(args: Record<string, unknown>) {
  const { tenant_id, settings } = args as { tenant_id: string; settings: Record<string, unknown> };
  if (!tenant_id || !settings) return fail("VALIDATION_ERROR", "tenant_id and settings are required");

  if (!db) return ok({ updated: true, dev_mode: true });

  const { error } = await db
    .from("tenants")
    .update({ settings, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenant_id);

  if (error) return fail("DB_ERROR", "Failed to update settings");
  return ok({ updated: true });
}

export async function listYardUsers(args: Record<string, unknown>) {
  const { tenant_id } = args as { tenant_id: string };
  if (!tenant_id) return fail("VALIDATION_ERROR", "tenant_id is required");

  if (!db) return ok({ users: [], dev_mode: true });

  const { data, error } = await db
    .from("yard_users")
    .select("user_id, email, full_name, role, is_active, created_at")
    .eq("tenant_id", tenant_id)
    .order("created_at", { ascending: true });

  if (error) return fail("DB_ERROR", "Database error");
  return ok({ users: data });
}

export async function createYardUser(args: Record<string, unknown>) {
  const { tenant_id, email, password, full_name, role } = args as {
    tenant_id: string;
    email: string;
    password: string;
    full_name: string;
    role: "admin" | "manager" | "scale_operator" | "viewer";
  };

  if (!tenant_id || !email || !password || !full_name || !role) {
    return fail("VALIDATION_ERROR", "All fields are required");
  }

  const validRoles = ["admin", "manager", "scale_operator", "viewer"];
  if (!validRoles.includes(role)) return fail("VALIDATION_ERROR", "Invalid role");

  if (!db) return ok({ user_id: crypto.randomUUID(), dev_mode: true });

  const { data, error } = await db
    .from("yard_users")
    .insert({ tenant_id, email: email.toLowerCase(), password_hash: password, full_name, role, is_active: true })
    .select("user_id")
    .single();

  if (error) return fail("DB_ERROR", "Failed to create user");
  return ok({ user_id: data.user_id });
}
