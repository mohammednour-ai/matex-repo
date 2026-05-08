// Profile domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/profile-mcp/src/index.ts.

import { failEnvelope, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { isPlatformAdmin } from "../_shared/auth.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "profile-edge";

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function authorize(caller: { userId: string }, targetUserId: string): Promise<boolean> {
  if (caller.userId === targetUserId) return true;
  const supabase = serviceClient();
  return await isPlatformAdmin(supabase, caller.userId);
}

async function getProfile({ args, caller }: ToolRequest) {
  const userId = String(args.user_id ?? "");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  if (!(await authorize(caller, userId))) return failEnvelope("FORBIDDEN", "Cannot read another user's profile.");

  const supabase = serviceClient();
  const { data: profileRow, error: profileError } = await supabase
    .schema("profile_mcp").from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (profileError) return failEnvelope("DB_ERROR", "Database operation failed");

  const { data: prefRow } = await supabase
    .schema("profile_mcp").from("preferences").select("notification_prefs").eq("user_id", userId).maybeSingle();
  const { data: bankRow } = await supabase
    .schema("profile_mcp").from("bank_accounts").select("account_number_enc")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  const profile = profileRow
    ? {
        user_id: profileRow.user_id,
        first_name: profileRow.first_name,
        last_name: profileRow.last_name,
        language: profileRow.language,
        timezone: profileRow.timezone,
        country: profileRow.country,
        company_name: undefined,
        bank_account_last4: typeof bankRow?.account_number_enc === "string"
          ? (bankRow.account_number_enc as string).slice(-4) : undefined,
        notification_prefs: (prefRow?.notification_prefs ?? {}) as Record<string, boolean>,
      }
    : null;
  return okEnvelope({ profile });
}

async function updateProfile({ args, caller }: ToolRequest) {
  const userId = String(args.user_id ?? "");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  if (typeof args.fields !== "object" || !args.fields) return failEnvelope("VALIDATION_ERROR", "fields must be an object.");
  if (!(await authorize(caller, userId))) return failEnvelope("FORBIDDEN", "Cannot update another user's profile.");

  const fields = args.fields as Record<string, unknown>;
  const merged = {
    user_id: userId,
    first_name: String(fields.first_name ?? "Unknown"),
    last_name: String(fields.last_name ?? "User"),
    language: String(fields.language ?? "en"),
    timezone: String(fields.timezone ?? "America/Toronto"),
    country: String(fields.country ?? "CA"),
    address: fields.address ?? null,
  };
  const supabase = serviceClient();
  const { error } = await supabase.schema("profile_mcp").from("profiles").upsert(merged, { onConflict: "user_id" });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "profile.profile.updated", { user_id: userId });
  return okEnvelope({ profile: merged });
}

async function addBankAccount({ args, caller }: ToolRequest) {
  const userId = String(args.user_id ?? "");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const accountLast4 = String(args.account_last4 ?? "").slice(-4);
  if (!/^\d{4}$/.test(accountLast4)) return failEnvelope("VALIDATION_ERROR", "account_last4 must be 4 digits.");
  if (!(await authorize(caller, userId))) return failEnvelope("FORBIDDEN", "Cannot add bank account for another user.");

  const supabase = serviceClient();
  const { error } = await supabase.schema("profile_mcp").from("bank_accounts").insert({
    user_id: userId,
    institution_name: "Unknown",
    institution_number: "000",
    transit_number: "00000",
    account_number_enc: `****${accountLast4}`,
    account_type: "checking",
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "profile.bank_account.added", { user_id: userId });
  return okEnvelope({ user_id: userId, verification_status: "pending_micro_deposit" });
}

async function setPreferences({ args, caller }: ToolRequest) {
  const userId = String(args.user_id ?? "");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  if (typeof args.preferences !== "object" || !args.preferences) {
    return failEnvelope("VALIDATION_ERROR", "preferences must be an object.");
  }
  if (!(await authorize(caller, userId))) return failEnvelope("FORBIDDEN", "Cannot update another user's preferences.");

  const preferences = args.preferences as Record<string, boolean>;
  const supabase = serviceClient();
  const { error } = await supabase.schema("profile_mcp").from("preferences")
    .upsert({ user_id: userId, notification_prefs: preferences }, { onConflict: "user_id" });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "profile.preferences.updated", { user_id: userId });
  return okEnvelope({ user_id: userId, preferences });
}

Deno.serve(serveDomain({
  ping,
  get_profile: getProfile,
  update_profile: updateProfile,
  add_bank_account: addBankAccount,
  set_preferences: setPreferences,
}));
