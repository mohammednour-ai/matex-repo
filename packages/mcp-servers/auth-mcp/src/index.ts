/**
 * MATEX auth-mcp (Phase 0/1 foundation implementation)
 *
 * Tools implemented for foundation:
 * - register
 * - login
 * - verify_email
 * - verify_phone
 * - refresh_token
 * - ping
 *
 * Notes:
 * - Uses Supabase when configured.
 * - Falls back to in-memory development store otherwise.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import * as jwt from "jsonwebtoken";
import { randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { AccountType, AuthTokens, User } from "@matex/types";
import { isValidCanadianPhone, isValidEmail, MatexEventBus, now, sha256 , initSentry} from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    return timingSafeEqual(Buffer.from(hash, "hex"), derived);
  } catch {
    return false;
  }
}

const SERVER_NAME = "auth-mcp";
initSentry(SERVER_NAME);
const SERVER_VERSION = "0.1.0";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;

if (process.env.NODE_ENV === "production" && JWT_SECRET === "dev-secret-change-me") {
  console.error("[auth-mcp] FATAL: JWT_SECRET must be set in production. Refusing to start.");
  process.exit(1);
}

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// Anon-key client used exclusively for signInWithPassword. Keeps every login
// in its own session-less context so server requests don't bleed into each
// other's auth state.
function makeAnonClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const users = new Map<string, User & { password_hash: string }>();
const otpChallenges = new Map<string, OtpChallenge>();
const resetTokens = new Map<string, { email: string; code: string; expires_at: number }>();
const eventBus = EVENT_REDIS_URL ? new MatexEventBus({ redisUrl: EVENT_REDIS_URL }) : null;

interface OtpChallenge {
  challenge_id: string;
  target_type: "email" | "phone";
  target_value: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  verified: boolean;
  created_at: string;
}

async function emitEvent(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!eventBus) return;
  try {
    await eventBus.publish(event, payload, SERVER_NAME);
  } catch {
    // Non-blocking event emission for foundation runtime.
  }
}

function signToken(
  payload: Record<string, string>,
  expiresIn: jwt.SignOptions["expiresIn"],
): string {
  return jwt.sign(payload, JWT_SECRET as jwt.Secret, { expiresIn });
}

function buildTokens(userId: string): AuthTokens {
  return {
    access_token: signToken({ sub: userId, scope: "access" }, "15m"),
    refresh_token: signToken({ sub: userId, scope: "refresh" }, "7d"),
    expires_in: 900,
  };
}

const ACCESS_TOKEN_TTL_MS = 15 * 60_000;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60_000;

interface SessionContext {
  ip_address?: string | null;
  user_agent?: string | null;
  device_fingerprint?: string | null;
}

async function persistSession(userId: string, tokens: AuthTokens, context: SessionContext): Promise<string | null> {
  if (!supabase) return null;
  const sessionId = randomUUID();
  const createdAt = new Date();
  const { error } = await supabase.schema("auth_mcp").from("sessions").insert({
    session_id: sessionId,
    user_id: userId,
    access_token_hash: sha256(tokens.access_token),
    refresh_token_hash: sha256(tokens.refresh_token),
    ip_address: context.ip_address ?? null,
    user_agent: context.user_agent ?? null,
    device_fingerprint: context.device_fingerprint ?? null,
    expires_at: new Date(createdAt.getTime() + ACCESS_TOKEN_TTL_MS).toISOString(),
    refresh_expires_at: new Date(createdAt.getTime() + REFRESH_TOKEN_TTL_MS).toISOString(),
    revoked: false,
    created_at: createdAt.toISOString(),
  });
  if (error) {
    console.error("[auth-mcp] Failed to persist session", error);
    return null;
  }
  return sessionId;
}

async function revokeSessionByRefreshToken(refreshToken: string): Promise<boolean> {
  if (!supabase) return true;
  const refreshHash = sha256(refreshToken);
  const { data, error } = await supabase
    .schema("auth_mcp")
    .from("sessions")
    .update({ revoked: true })
    .eq("refresh_token_hash", refreshHash)
    .select("session_id")
    .maybeSingle();
  if (error) {
    console.error("[auth-mcp] Failed to revoke session", error);
    return false;
  }
  return Boolean(data);
}

async function revokeSessionById(sessionId: string, actorUserId: string): Promise<{ revoked: boolean; reason?: string }> {
  if (!supabase) return { revoked: true };
  const { data: existing, error: lookupError } = await supabase
    .schema("auth_mcp")
    .from("sessions")
    .select("session_id,user_id,revoked")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (lookupError || !existing) return { revoked: false, reason: "Session not found." };
  if (existing.user_id !== actorUserId) {
    const { data: actorRow } = await supabase
      .schema("auth_mcp")
      .from("users")
      .select("is_platform_admin")
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (!actorRow?.is_platform_admin) return { revoked: false, reason: "Not authorized to revoke this session." };
  }
  const { error: updateError } = await supabase
    .schema("auth_mcp")
    .from("sessions")
    .update({ revoked: true })
    .eq("session_id", sessionId);
  if (updateError) return { revoked: false, reason: "Database operation failed." };
  return { revoked: true };
}

async function isRefreshTokenRevoked(refreshToken: string): Promise<boolean> {
  if (!supabase) return false;
  const refreshHash = sha256(refreshToken);
  const { data } = await supabase
    .schema("auth_mcp")
    .from("sessions")
    .select("revoked")
    .eq("refresh_token_hash", refreshHash)
    .maybeSingle();
  return Boolean(data?.revoked);
}

function toSafeUser(user: User & { password_hash: string }): User {
  return {
    user_id: user.user_id,
    email: user.email,
    phone: user.phone,
    account_type: user.account_type,
    account_status: user.account_status,
    email_verified: user.email_verified,
    phone_verified: user.phone_verified,
    mfa_enabled: user.mfa_enabled,
    created_at: user.created_at,
  };
}

function issueOtp(targetType: "email" | "phone", targetValue: string): { challenge_id: string; expires_at: string; code?: string } {
  const challengeId = randomUUID();
  const rawCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  otpChallenges.set(challengeId, {
    challenge_id: challengeId,
    target_type: targetType,
    target_value: targetValue,
    otp_hash: sha256(rawCode),
    expires_at: expiresAt,
    attempts: 0,
    verified: false,
    created_at: now(),
  });
  return {
    challenge_id: challengeId,
    expires_at: expiresAt,
    // Expose raw code in non-production so dev/test flows can complete OTP without email/SMS.
    ...(process.env.NODE_ENV !== "production" ? { code: rawCode } : {}),
  };
}

function verifyOtp(targetType: "email" | "phone", targetValue: string, otpCode: string): OtpChallenge {
  const candidates = Array.from(otpChallenges.values())
    .filter((row) => row.target_type === targetType && row.target_value === targetValue)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const latest = candidates[0];
  if (!latest) {
    throw new Error("No OTP challenge found. Request a new OTP first.");
  }

  if (latest.verified) {
    throw new Error("OTP already used. Request a new OTP.");
  }

  if (new Date(latest.expires_at).getTime() < Date.now()) {
    throw new Error("OTP expired. Request a new OTP.");
  }

  if (latest.attempts >= 5) {
    throw new Error("Too many OTP attempts. Request a new OTP.");
  }

  latest.attempts += 1;
  if (latest.otp_hash !== sha256(otpCode)) {
    otpChallenges.set(latest.challenge_id, latest);
    throw new Error("Invalid OTP code.");
  }

  latest.verified = true;
  otpChallenges.set(latest.challenge_id, latest);
  return latest;
}

async function register(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const email = String(args.email ?? "").toLowerCase().trim();
  const phone = String(args.phone ?? "").trim();
  const password = String(args.password ?? "");
  const accountType = String(args.account_type ?? "individual") as AccountType;

  if (!isValidEmail(email)) throw new Error("Invalid email format.");
  if (!isValidCanadianPhone(phone)) throw new Error("Invalid Canadian phone format.");
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  if (!["individual", "corporate", "carrier", "inspector"].includes(accountType)) {
    throw new Error("Invalid account_type.");
  }

  const passwordHash = await hashPassword(password);

  if (supabase) {
    // Create the Supabase auth.users row first so its UUID becomes the
    // canonical user_id. This is what edge functions will see in `sub` after
    // verify_jwt; keeping the two ids identical avoids a join on every call.
    const adminAuth = supabase.auth.admin;
    const { data: authCreated, error: authError } = await adminAuth.createUser({
      email,
      password,
      email_confirm: false,
      phone,
      phone_confirm: false,
      user_metadata: { account_type: accountType },
    });
    if (authError || !authCreated?.user) {
      throw new Error(`Failed to create Supabase auth user: ${authError?.message ?? "unknown error"}`);
    }
    const supabaseUserId = authCreated.user.id;

    const { data, error } = await supabase
      .schema("auth_mcp")
      .from("users")
      .insert({
        user_id: supabaseUserId,
        email,
        phone,
        password_hash: passwordHash,
        account_type: accountType,
        supabase_synced_at: new Date().toISOString(),
      })
      .select("user_id,email,phone,account_type,account_status,email_verified,phone_verified,mfa_enabled,created_at")
      .single();

    if (error) {
      // Roll back the auth.users row so the email isn't orphaned.
      await adminAuth.deleteUser(supabaseUserId).catch(() => {});
      throw new Error(`Failed to register user: ${error.message}`);
    }

    const emailChallenge = issueOtp("email", email);
    const phoneChallenge = issueOtp("phone", phone);
    await emitEvent("auth.user.registered", { email, account_type: accountType, user_id: data.user_id });
    return {
      user: data,
      status: "pending_review",
      verification_required: true,
      challenges: {
        email: { challenge_id: emailChallenge.challenge_id, expires_at: emailChallenge.expires_at },
        phone: { challenge_id: phoneChallenge.challenge_id, expires_at: phoneChallenge.expires_at },
      },
    };
  }

  const userId = randomUUID();
  const user: User & { password_hash: string } = {
    user_id: userId,
    email,
    phone,
    password_hash: passwordHash,
    account_type: accountType,
    account_status: "pending_review",
    email_verified: false,
    phone_verified: false,
    mfa_enabled: false,
    created_at: now(),
  };
  users.set(email, user);
  const emailChallenge = issueOtp("email", email);
  const phoneChallenge = issueOtp("phone", phone);
  await emitEvent("auth.user.registered", { email, account_type: accountType, user_id: user.user_id });
  return {
    user: toSafeUser(user),
    status: "pending_review",
    verification_required: true,
    challenges: {
      email: { challenge_id: emailChallenge.challenge_id, expires_at: emailChallenge.expires_at, code: emailChallenge.code },
      phone: { challenge_id: phoneChallenge.challenge_id, expires_at: phoneChallenge.expires_at, code: phoneChallenge.code },
    },
  };
}

async function login(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const email = String(args.email ?? "").toLowerCase().trim();
  const password = String(args.password ?? "");
  const context: SessionContext = {
    ip_address: args.ip_address ? String(args.ip_address) : null,
    user_agent: args.user_agent ? String(args.user_agent) : null,
    device_fingerprint: args.device_fingerprint ? String(args.device_fingerprint) : null,
  };

  if (supabase) {
    const { data, error } = await supabase
      .schema("auth_mcp")
      .from("users")
      .select("user_id,email,password_hash,account_status,mfa_enabled,supabase_synced_at")
      .eq("email", email)
      .maybeSingle();
    if (error || !data) throw new Error("Invalid credentials.");
    if (data.account_status !== "active" && data.account_status !== "pending_review") {
      throw new Error(`Account is ${data.account_status}.`);
    }

    let tokens: AuthTokens;

    if (data.supabase_synced_at) {
      // Synced user: get a real Supabase JWT that edge functions can verify.
      const anon = makeAnonClient();
      if (!anon) throw new Error("Supabase anon key not configured.");
      const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
      if (signInError || !signIn?.session) throw new Error("Invalid credentials.");
      tokens = {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
        expires_in: signIn.session.expires_in ?? 3600,
      };
    } else {
      // Legacy user predating the Supabase-auth cutover: keep the local hash
      // path so they aren't locked out. The migration script will sync them
      // and the next login flips them onto Supabase JWTs.
      const valid = await verifyPassword(password, data.password_hash as string);
      if (!valid) throw new Error("Invalid credentials.");
      tokens = buildTokens(data.user_id);
    }

    const sessionId = await persistSession(data.user_id, tokens, context);
    await emitEvent("auth.user.logged_in", { user_id: data.user_id, email, session_id: sessionId });
    return { user_id: data.user_id, tokens, session_id: sessionId, mfa_required: Boolean(data.mfa_enabled) };
  }

  const user = users.get(email);
  if (!user) throw new Error("Invalid credentials.");
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) throw new Error("Invalid credentials.");
  const tokens = buildTokens(user.user_id);
  await emitEvent("auth.user.logged_in", { user_id: user.user_id, email });
  return { user_id: user.user_id, tokens, session_id: null, mfa_required: user.mfa_enabled };
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "register", description: "Create a new user account", inputSchema: { type: "object", properties: { email: { type: "string" }, phone: { type: "string" }, password: { type: "string" }, account_type: { type: "string" } }, required: ["email", "phone", "password", "account_type"] } },
    { name: "login", description: "Authenticate a user and return tokens", inputSchema: { type: "object", properties: { email: { type: "string" }, password: { type: "string" } }, required: ["email", "password"] } },
    { name: "request_email_otp", description: "Issue a new OTP challenge for email verification", inputSchema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] } },
    { name: "request_phone_otp", description: "Issue a new OTP challenge for phone verification", inputSchema: { type: "object", properties: { phone: { type: "string" } }, required: ["phone"] } },
    { name: "verify_email", description: "Verify email using OTP code", inputSchema: { type: "object", properties: { email: { type: "string" }, otp_code: { type: "string" } }, required: ["email", "otp_code"] } },
    { name: "verify_phone", description: "Verify phone using OTP code", inputSchema: { type: "object", properties: { phone: { type: "string" }, otp_code: { type: "string" } }, required: ["phone", "otp_code"] } },
    { name: "refresh_token", description: "Issue a new access token from refresh token", inputSchema: { type: "object", properties: { refresh_token: { type: "string" } }, required: ["refresh_token"] } },
    { name: "logout", description: "Revoke the current session given a refresh token", inputSchema: { type: "object", properties: { refresh_token: { type: "string" } }, required: ["refresh_token"] } },
    { name: "revoke_session", description: "Revoke a specific session by id (caller must own the session or be a platform admin)", inputSchema: { type: "object", properties: { actor_user_id: { type: "string" }, session_id: { type: "string" } }, required: ["actor_user_id", "session_id"] } },
    { name: "request_password_reset", description: "Send a password reset code to email", inputSchema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] } },
    { name: "confirm_password_reset", description: "Confirm password reset with code and new password", inputSchema: { type: "object", properties: { email: { type: "string" }, reset_code: { type: "string" }, new_password: { type: "string" } }, required: ["email", "reset_code", "new_password"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  try {
    if (tool === "ping") {
      return { content: [{ type: "text", text: JSON.stringify({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
    }
    if (tool === "register") {
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: await register(args) }) }] };
    }
    if (tool === "login") {
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: await login(args) }) }] };
    }
    if (tool === "request_email_otp") {
      const email = String(args.email ?? "").toLowerCase().trim();
      if (!isValidEmail(email)) throw new Error("Invalid email format.");
      const challenge = issueOtp("email", email);
      await emitEvent("auth.otp.requested", { target_type: "email", target_value: email, challenge_id: challenge.challenge_id });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: challenge }) }] };
    }
    if (tool === "request_phone_otp") {
      const phone = String(args.phone ?? "").trim();
      if (!isValidCanadianPhone(phone)) throw new Error("Invalid Canadian phone format.");
      const challenge = issueOtp("phone", phone);
      await emitEvent("auth.otp.requested", { target_type: "phone", target_value: phone, challenge_id: challenge.challenge_id });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: challenge }) }] };
    }
    if (tool === "verify_email") {
      const email = String(args.email ?? "").toLowerCase().trim();
      const otpCode = String(args.otp_code ?? "").trim();
      if (!isValidEmail(email)) throw new Error("Invalid email format.");
      verifyOtp("email", email, otpCode);

      if (supabase) {
        const { error } = await supabase.schema("auth_mcp").from("users").update({ email_verified: true }).eq("email", email);
        if (error) throw new Error(`Failed to verify email: ${error.message}`);
      } else {
        const user = users.get(email);
        if (!user) throw new Error("User not found.");
        user.email_verified = true;
        users.set(email, user);
      }

      await emitEvent("auth.email.verified", { email });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: { email, verified: true } }) }] };
    }
    if (tool === "verify_phone") {
      const phone = String(args.phone ?? "").trim();
      const otpCode = String(args.otp_code ?? "").trim();
      if (!isValidCanadianPhone(phone)) throw new Error("Invalid Canadian phone format.");
      verifyOtp("phone", phone, otpCode);

      if (supabase) {
        const { error } = await supabase.schema("auth_mcp").from("users").update({ phone_verified: true }).eq("phone", phone);
        if (error) throw new Error(`Failed to verify phone: ${error.message}`);
      } else {
        const user = Array.from(users.values()).find((row) => row.phone === phone);
        if (!user) throw new Error("User not found.");
        user.phone_verified = true;
        users.set(user.email, user);
      }

      await emitEvent("auth.phone.verified", { phone });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: { phone, verified: true } }) }] };
    }
    if (tool === "refresh_token") {
      const refreshToken = String(args.refresh_token ?? "");
      const decoded = jwt.verify(refreshToken, JWT_SECRET) as { sub: string; scope: string };
      if (decoded.scope !== "refresh") throw new Error("Invalid token scope.");
      if (await isRefreshTokenRevoked(refreshToken)) throw new Error("Session has been revoked. Please log in again.");
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: { access_token: signToken({ sub: decoded.sub, scope: "access" }, "15m"), expires_in: 900 } }) }] };
    }
    if (tool === "logout") {
      const refreshToken = String(args.refresh_token ?? "");
      if (!refreshToken) throw new Error("refresh_token is required.");
      let userId: string | null = null;
      try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET) as { sub: string; scope: string };
        if (decoded.scope !== "refresh") throw new Error("Invalid token scope.");
        userId = decoded.sub;
      } catch {
        // Treat unverifiable tokens as already-invalid; still respond success so callers can clear local state.
      }
      const revoked = await revokeSessionByRefreshToken(refreshToken);
      if (userId) await emitEvent("auth.session.revoked", { user_id: userId, reason: "logout" });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: { revoked } }) }] };
    }
    if (tool === "revoke_session") {
      const actorUserId = String(args.actor_user_id ?? "");
      const sessionId = String(args.session_id ?? "");
      if (!actorUserId) throw new Error("actor_user_id is required.");
      if (!sessionId) throw new Error("session_id is required.");
      const result = await revokeSessionById(sessionId, actorUserId);
      if (!result.revoked) throw new Error(result.reason ?? "Failed to revoke session.");
      await emitEvent("auth.session.revoked", { session_id: sessionId, actor_user_id: actorUserId, reason: "manual" });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: { session_id: sessionId, revoked: true } }) }] };
    }
    if (tool === "request_password_reset") {
      const email = String(args.email ?? "").toLowerCase().trim();
      if (!isValidEmail(email)) throw new Error("Invalid email format.");
      const rawCode = String(Math.floor(100000 + Math.random() * 900000));
      resetTokens.set(email, { email, code: sha256(rawCode), expires_at: Date.now() + 600_000 });
      await emitEvent("auth.password_reset.requested", { email });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: { challenge_id: randomUUID(), expires_at: new Date(Date.now() + 600_000).toISOString() } }) }] };
    }
    if (tool === "confirm_password_reset") {
      const email = String(args.email ?? "").toLowerCase().trim();
      const resetCode = String(args.reset_code ?? "").trim();
      const newPassword = String(args.new_password ?? "");
      if (!isValidEmail(email)) throw new Error("Invalid email format.");
      if (newPassword.length < 12) throw new Error("New password must be at least 12 characters.");
      const token = resetTokens.get(email);
      if (!token || token.expires_at < Date.now()) throw new Error("Reset code expired or not found.");
      if (token.code !== sha256(resetCode)) throw new Error("Invalid reset code.");
      resetTokens.delete(email);
      const newHash = await hashPassword(newPassword);
      if (supabase) {
        const { error } = await supabase.schema("auth_mcp").from("users").update({ password_hash: newHash }).eq("email", email);
        // Also push the password change to the Supabase auth.users row if synced.
        if (!error) {
          const { data: linkedRow } = await supabase
            .schema("auth_mcp")
            .from("users")
            .select("user_id,supabase_synced_at")
            .eq("email", email)
            .maybeSingle();
          if (linkedRow?.supabase_synced_at) {
            await supabase.auth.admin.updateUserById(linkedRow.user_id, { password: newPassword }).catch(() => {});
          }
        }
        if (error) throw new Error(`Failed to update password: ${error.message}`);
      } else {
        const user = users.get(email);
        if (!user) throw new Error("User not found.");
        user.password_hash = newHash;
        users.set(email, user);
      }
      await emitEvent("auth.password_reset.completed", { email });
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: { email, reset: true } }) }] };
    }
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "AUTH_ERROR", message: error instanceof Error ? error.message : String(error) } }) }],
    };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("auth", Number(process.env.MCP_HTTP_PORT ?? 4101));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
