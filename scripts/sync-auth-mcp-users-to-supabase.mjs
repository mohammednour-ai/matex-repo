#!/usr/bin/env node
/**
 * One-shot migration: for every auth_mcp.users row without supabase_synced_at,
 * create the corresponding Supabase auth.users row (id forced to match the
 * existing user_id) and stamp supabase_synced_at.
 *
 * The temporary password is a high-entropy random value the user can never
 * use directly — they're forced through `auth.request_password_reset` on next
 * login (which we still own). After reset, signInWithPassword starts working
 * end-to-end.
 *
 * Run with: node scripts/sync-auth-mcp-users-to-supabase.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[sync] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function tempPassword() {
  return randomBytes(32).toString("base64url");
}

async function main() {
  const { data: rows, error } = await supabase
    .schema("auth_mcp")
    .from("users")
    .select("user_id,email,phone,account_type,email_verified,phone_verified")
    .is("supabase_synced_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[sync] Failed to fetch unsynced users:", error.message);
    process.exit(1);
  }

  console.log(`[sync] ${rows?.length ?? 0} unsynced user(s) to migrate.`);
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const row of rows ?? []) {
    try {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        id: row.user_id,
        email: row.email,
        phone: row.phone,
        password: tempPassword(),
        email_confirm: Boolean(row.email_verified),
        phone_confirm: Boolean(row.phone_verified),
        user_metadata: { account_type: row.account_type },
      });
      if (createError) {
        // If the auth user already exists with this id, just stamp synced_at.
        if (/already (registered|exists)/i.test(createError.message)) {
          skip++;
        } else {
          console.error(`[sync] createUser failed for ${row.email}:`, createError.message);
          fail++;
          continue;
        }
      } else if (!created?.user) {
        fail++;
        continue;
      }

      const { error: stampError } = await supabase
        .schema("auth_mcp")
        .from("users")
        .update({ supabase_synced_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
      if (stampError) {
        console.error(`[sync] stamp failed for ${row.email}:`, stampError.message);
        fail++;
        continue;
      }
      ok++;
    } catch (err) {
      console.error(`[sync] unexpected error for ${row.email}:`, err);
      fail++;
    }
  }

  console.log(`[sync] done. created=${ok} already_existed=${skip} failed=${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[sync] fatal:", err);
  process.exit(1);
});
