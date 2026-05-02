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
import { isValidCanadianPhone, isValidEmail, MatexEventBus, now, sha256 } from "@matex/utils";
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
const SERVER_VERSION = "0.1.0";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;

if (process.env.NODE_ENV === "production" && JWT_SECRET === "dev-secret-change-me") {
  console.error("[auth-mcp] FATAL: JWT_SECRET must be set in production. Refusing to start.");
  process.exit(1);
}

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

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
    const { data, error } = await supabase
      .from("auth_mcp.users")
      .insert({
        email,
        phone,
        password_hash: passwordHash,
        account_type: accountType,
      })
      .select("user_id,email,phone,account_type,account_status,email_verified,phone_verified,mfa_enabled,created_at")
      .single();

    if (error) throw new Error(`Failed to register user: ${error.message}`);

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

  if (supabase) {
    const { data, error } = await supabase
      .from("auth_mcp.users")
      .select("user_id,email,password_hash,account_status,mfa_enabled")
      .eq("email", email)
      .single();
    if (error || !data) throw new Error("Invalid credentials.");
    const valid = await verifyPassword(password, data.password_hash as string);
    if (!valid) throw new Error("Invalid credentials.");
    if (data.account_status !== "active" && data.account_status !== "pending_review") {
      throw new Error(`Account is ${data.account_status}.`);
    }
    await emitEvent("auth.user.logged_in", { user_id: data.user_id, email });
    return { user_id: data.user_id, tokens: buildTokens(data.user_id), mfa_required: Boolean(data.mfa_enabled) };
  }

  const user = users.get(email);
  if (!user) throw new Error("Invalid credentials.");
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) throw new Error("Invalid credentials.");
  await emitEvent("auth.user.logged_in", { user_id: user.user_id, email });
  return { user_id: user.user_id, tokens: buildTokens(user.user_id), mfa_required: user.mfa_enabled };
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
        const { error } = await supabase.from("auth_mcp.users").update({ email_verified: true }).eq("email", email);
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
        const { error } = await supabase.from("auth_mcp.users").update({ phone_verified: true }).eq("phone", phone);
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
      return { content: [{ type: "text", text: JSON.stringify({ success: true, data: { access_token: signToken({ sub: decoded.sub, scope: "access" }, "15m"), expires_in: 900 } }) }] };
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
        const { error } = await supabase.from("auth_mcp.users").update({ password_hash: newHash }).eq("email", email);
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
