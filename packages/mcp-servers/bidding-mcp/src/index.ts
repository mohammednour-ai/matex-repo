import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "bidding-mcp";
const SERVER_VERSION = "0.1.0";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;
const eventBus = EVENT_REDIS_URL ? new MatexEventBus({ redisUrl: EVENT_REDIS_URL }) : null;
const bidSequence = new Map<string, number>();

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, data });
}

function fail(code: string, message: string): { isError: true; content: Array<{ type: "text"; text: string }> } {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

function rankLevel(level: string): number {
  const map: Record<string, number> = { level_0: 0, level_1: 1, level_2: 2, level_3: 3 };
  return map[level] ?? 0;
}

async function emitEvent(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!eventBus) return;
  try {
    await eventBus.publish(event, payload, SERVER_NAME);
  } catch {
    // non-blocking
  }
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "place_bid", description: "Place bid with server-authoritative timestamp", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, bidder_id: { type: "string" }, amount: { type: "number" }, bid_type: { type: "string" }, expected_highest: { type: "number" } }, required: ["listing_id", "bidder_id", "amount"] } },
    { name: "retract_bid", description: "Retract an active bid", inputSchema: { type: "object", properties: { bid_id: { type: "string" }, bidder_id: { type: "string" }, reason: { type: "string" } }, required: ["bid_id", "bidder_id", "reason"] } },
    { name: "get_highest_bid", description: "Get highest active bid for listing", inputSchema: { type: "object", properties: { listing_id: { type: "string" } }, required: ["listing_id"] } },
    { name: "flag_suspicious_bid", description: "Create anti-manipulation flag", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, flagged_user_id: { type: "string" }, flag_type: { type: "string" }, severity: { type: "string" }, details: { type: "object" } }, required: ["listing_id", "flagged_user_id", "flag_type", "severity"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for bidding-mcp.");

  if (tool === "place_bid") {
    const listingId = String(args.listing_id ?? "");
    const bidderId = String(args.bidder_id ?? "");
    const amount = Number(args.amount ?? 0);
    const bidType = String(args.bid_type ?? "manual");
    if (!listingId || !bidderId || amount <= 0) return fail("VALIDATION_ERROR", "listing_id, bidder_id, amount>0 are required.");

    const listingResult = await supabase.schema("listing_mcp").from("listings").select("status").eq("listing_id", listingId).maybeSingle();
    if (listingResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!listingResult.data || listingResult.data.status !== "active") return fail("LISTING_NOT_BIDDABLE", "Listing is not active.");

    // KYC gate: level_1 required for all bids, level_2 required for bids >= 5000.
    const kyc = await supabase.schema("kyc_mcp").from("kyc_levels").select("current_level").eq("user_id", bidderId).maybeSingle();
    if (kyc.error) return fail("DB_ERROR", "Database operation failed");
    const currentLevel = String(kyc.data?.current_level ?? "level_0");
    const requiredLevel = amount >= 5000 ? "level_2" : "level_1";
    if (rankLevel(currentLevel) < rankLevel(requiredLevel)) {
      return fail("KYC_GATE_BLOCKED", `Bids require ${requiredLevel}. Current ${currentLevel}.`);
    }

    const highestResult = await supabase
      .schema("bidding_mcp")
      .from("bids")
      .select("amount,bid_id")
      .eq("listing_id", listingId)
      .eq("status", "active")
      .order("amount", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (highestResult.error) return fail("DB_ERROR", "Database operation failed");
    const currentHighest = Number(highestResult.data?.amount ?? 0);
    const expectedHighest = typeof args.expected_highest === "number" ? Number(args.expected_highest) : null;
    if (expectedHighest !== null && expectedHighest !== currentHighest) {
      return fail("OPTIMISTIC_CONCURRENCY_CONFLICT", `Expected highest ${expectedHighest} but current highest is ${currentHighest}.`);
    }
    const MIN_BID_INCREMENT = 1;
    if (amount < currentHighest + MIN_BID_INCREMENT) {
      return fail("BID_TOO_LOW", `Bid must be at least ${currentHighest + MIN_BID_INCREMENT} (current highest + minimum increment of ${MIN_BID_INCREMENT}).`);
    }

    const nextSeq = (bidSequence.get(listingId) ?? 0) + 1;
    bidSequence.set(listingId, nextSeq);
    const bidId = generateId();
    const serverTs = now(); // authoritative timestamp
    const bidInsert = await supabase.schema("bidding_mcp").from("bids").insert({
      bid_id: bidId,
      listing_id: listingId,
      bidder_id: bidderId,
      amount,
      bid_type: bidType,
      status: "active",
      server_timestamp: serverTs,
    });
    if (bidInsert.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("bidding.bid.placed", { listing_id: listingId, bid_id: bidId, bidder_id: bidderId, amount, server_timestamp: serverTs, server_sequence: nextSeq });
    return { content: [{ type: "text", text: ok({ bid_id: bidId, amount, server_timestamp: serverTs, server_sequence: nextSeq, previous_highest: currentHighest }) }] };
  }

  if (tool === "retract_bid") {
    const bidId = String(args.bid_id ?? "");
    const bidderId = String(args.bidder_id ?? "");
    const reason = String(args.reason ?? "");
    if (!bidId || !bidderId || !reason) return fail("VALIDATION_ERROR", "bid_id, bidder_id, reason are required.");
    const retractResult = await supabase
      .schema("bidding_mcp")
      .from("bids")
      .update({
        status: "retracted",
        retraction_reason: reason,
        retracted_at: now(),
      })
      .eq("bid_id", bidId)
      .eq("bidder_id", bidderId);
    if (retractResult.error) return fail("DB_ERROR", "Database operation failed");
    await emitEvent("bidding.bid.retracted", { bid_id: bidId, bidder_id: bidderId, reason });
    return { content: [{ type: "text", text: ok({ bid_id: bidId, status: "retracted" }) }] };
  }

  if (tool === "get_highest_bid") {
    const listingId = String(args.listing_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    const result = await supabase
      .schema("bidding_mcp")
      .from("bids")
      .select("bid_id,bidder_id,amount,server_timestamp")
      .eq("listing_id", listingId)
      .eq("status", "active")
      .order("amount", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) return fail("DB_ERROR", "Database operation failed");
    return { content: [{ type: "text", text: ok({ listing_id: listingId, highest_bid: result.data ?? null }) }] };
  }

  if (tool === "flag_suspicious_bid") {
    const listingId = String(args.listing_id ?? "");
    const flaggedUserId = String(args.flagged_user_id ?? "");
    const flagType = String(args.flag_type ?? "");
    const severity = String(args.severity ?? "");
    if (!listingId || !flaggedUserId || !flagType || !severity) {
      return fail("VALIDATION_ERROR", "listing_id, flagged_user_id, flag_type, severity are required.");
    }
    const flagId = generateId();
    const createResult = await supabase.schema("bidding_mcp").from("anti_manipulation_flags").insert({
      flag_id: flagId,
      listing_id: listingId,
      flagged_user_id: flaggedUserId,
      flag_type: flagType,
      severity,
      details: (args.details ?? {}) as Record<string, unknown>,
      created_at: now(),
    });
    if (createResult.error) return fail("DB_ERROR", "Database operation failed");
    await emitEvent("bidding.anti_manipulation.flagged", { flag_id: flagId, listing_id: listingId, flagged_user_id: flaggedUserId, severity });
    return { content: [{ type: "text", text: ok({ flag_id: flagId }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("bidding", Number(process.env.MCP_HTTP_PORT ?? 4109));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
