import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import type { Profile } from "@matex/types";
import { MatexEventBus, now } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "profile-mcp";
const SERVER_VERSION = "0.1.0";
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface UserProfile extends Profile {
  company_name?: string;
  bank_account_last4?: string;
  notification_prefs?: Record<string, boolean>;
}

const profileStore = new Map<string, UserProfile>();
const eventBus = EVENT_REDIS_URL ? new MatexEventBus({ redisUrl: EVENT_REDIS_URL }) : null;
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, data });
}

function fail(code: string, message: string): { isError: true; content: Array<{ type: "text"; text: string }> } {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

async function emitEvent(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!eventBus) return;
  try {
    await eventBus.publish(event, payload, SERVER_NAME);
  } catch {
    // Non-blocking event emission for MVP scaffold.
  }
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "get_profile", description: "Get user profile by user_id", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "update_profile", description: "Update profile fields for a user", inputSchema: { type: "object", properties: { user_id: { type: "string" }, fields: { type: "object" } }, required: ["user_id", "fields"] } },
    { name: "add_bank_account", description: "Attach a bank account (masked) to user profile", inputSchema: { type: "object", properties: { user_id: { type: "string" }, account_last4: { type: "string" } }, required: ["user_id", "account_last4"] } },
    { name: "set_preferences", description: "Update profile notification preferences", inputSchema: { type: "object", properties: { user_id: { type: "string" }, preferences: { type: "object" } }, required: ["user_id", "preferences"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }

  if (tool === "get_profile") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    if (supabase) {
      const { data: profileRow, error: profileError } = await supabase
        .schema("profile_mcp")
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (profileError) return fail("DB_ERROR", "Database operation failed");

      const { data: prefRow } = await supabase
        .schema("profile_mcp")
        .from("preferences")
        .select("notification_prefs")
        .eq("user_id", userId)
        .maybeSingle();
      const { data: bankRow } = await supabase
        .schema("profile_mcp")
        .from("bank_accounts")
        .select("account_number_enc")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const profile = profileRow
        ? {
            user_id: profileRow.user_id,
            first_name: profileRow.first_name,
            last_name: profileRow.last_name,
            language: profileRow.language,
            timezone: profileRow.timezone,
            country: profileRow.country,
            company_name: undefined,
            bank_account_last4: typeof bankRow?.account_number_enc === "string" ? bankRow.account_number_enc.slice(-4) : undefined,
            notification_prefs: (prefRow?.notification_prefs ?? {}) as Record<string, boolean>,
          }
        : null;
      return { content: [{ type: "text", text: ok({ profile }) }] };
    }

    const profile = profileStore.get(userId);
    return { content: [{ type: "text", text: ok({ profile: profile ?? null }) }] };
  }

  if (tool === "update_profile") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    if (typeof args.fields !== "object" || !args.fields) {
      return fail("VALIDATION_ERROR", "fields must be an object.");
    }
    const fields = (args.fields ?? {}) as Partial<UserProfile>;

    if (supabase) {
      const merged = {
        user_id: userId,
        first_name: String(fields.first_name ?? "Unknown"),
        last_name: String(fields.last_name ?? "User"),
        language: String(fields.language ?? "en"),
        timezone: String(fields.timezone ?? "America/Toronto"),
        country: String(fields.country ?? "CA"),
        address: fields.address ?? null,
      };
      const { error } = await supabase.schema("profile_mcp").from("profiles").upsert(merged, { onConflict: "user_id" });
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("profile.profile.updated", { user_id: userId });
      return { content: [{ type: "text", text: ok({ profile: merged }) }] };
    }

    const current = profileStore.get(userId) ?? {
      user_id: userId,
      first_name: "Unknown",
      last_name: "User",
      language: "en",
      timezone: "America/Toronto",
      country: "CA",
    };
    const updated: UserProfile = { ...current, ...fields };
    profileStore.set(userId, updated);
    await emitEvent("profile.profile.updated", { user_id: userId });
    return { content: [{ type: "text", text: ok({ profile: updated }) }] };
  }

  if (tool === "add_bank_account") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    const accountLast4 = String(args.account_last4 ?? "").slice(-4);
    if (!/^\d{4}$/.test(accountLast4)) {
      return fail("VALIDATION_ERROR", "account_last4 must be 4 digits.");
    }

    if (supabase) {
      const { error } = await supabase.schema("profile_mcp").from("bank_accounts").insert({
        user_id: userId,
        institution_name: "Unknown",
        institution_number: "000",
        transit_number: "00000",
        account_number_enc: `****${accountLast4}`,
        account_type: "checking",
      });
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("profile.bank_account.added", { user_id: userId });
      return { content: [{ type: "text", text: ok({ user_id: userId, verification_status: "pending_micro_deposit" }) }] };
    }

    const current = profileStore.get(userId) ?? {
      user_id: userId,
      first_name: "Unknown",
      last_name: "User",
      language: "en",
      timezone: "America/Toronto",
      country: "CA",
    };
    const updated: UserProfile = { ...current, bank_account_last4: accountLast4 };
    profileStore.set(userId, updated);
    await emitEvent("profile.bank_account.added", { user_id: userId });
    return { content: [{ type: "text", text: ok({ user_id: userId, verification_status: "pending_micro_deposit" }) }] };
  }

  if (tool === "set_preferences") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    if (typeof args.preferences !== "object" || !args.preferences) {
      return fail("VALIDATION_ERROR", "preferences must be an object.");
    }
    const preferences = (args.preferences ?? {}) as Record<string, boolean>;

    if (supabase) {
      const { error } = await supabase
        .schema("profile_mcp")
        .from("preferences")
        .upsert({ user_id: userId, notification_prefs: preferences }, { onConflict: "user_id" });
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("profile.preferences.updated", { user_id: userId });
      return { content: [{ type: "text", text: ok({ user_id: userId, preferences }) }] };
    }

    const current = profileStore.get(userId) ?? {
      user_id: userId,
      first_name: "Unknown",
      last_name: "User",
      language: "en",
      timezone: "America/Toronto",
      country: "CA",
    };
    const updated: UserProfile = { ...current, notification_prefs: preferences };
    profileStore.set(userId, updated);
    await emitEvent("profile.preferences.updated", { user_id: userId });
    return { content: [{ type: "text", text: ok({ user_id: userId, preferences: updated.notification_prefs ?? {} }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("profile", Number(process.env.MCP_HTTP_PORT ?? 4102));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
