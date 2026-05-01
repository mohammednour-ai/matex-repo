import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "auction-mcp";
const SERVER_VERSION = "0.1.0";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;
const eventBus = EVENT_REDIS_URL ? new MatexEventBus({ redisUrl: EVENT_REDIS_URL }) : null;
const lotSequence = new Map<string, number>();

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
    // non-blocking
  }
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "create_auction", description: "Create auction event", inputSchema: { type: "object", properties: { organizer_id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, scheduled_start: { type: "string" }, min_bid_increment: { type: "number" } }, required: ["organizer_id", "title", "scheduled_start"] } },
    { name: "add_lot", description: "Attach listing as auction lot", inputSchema: { type: "object", properties: { auction_id: { type: "string" }, listing_id: { type: "string" }, lot_number: { type: "number" }, starting_price: { type: "number" }, reserve_price: { type: "number" } }, required: ["auction_id", "listing_id", "lot_number", "starting_price"] } },
    { name: "start_auction", description: "Start live auction", inputSchema: { type: "object", properties: { auction_id: { type: "string" } }, required: ["auction_id"] } },
    { name: "place_auction_bid", description: "Place bid on lot with optimistic concurrency", inputSchema: { type: "object", properties: { lot_id: { type: "string" }, bidder_id: { type: "string" }, amount: { type: "number" }, expected_highest: { type: "number" } }, required: ["lot_id", "bidder_id", "amount"] } },
    { name: "close_lot", description: "Close lot and finalize winner", inputSchema: { type: "object", properties: { lot_id: { type: "string" } }, required: ["lot_id"] } },
    { name: "get_lot_state", description: "Get lot state", inputSchema: { type: "object", properties: { lot_id: { type: "string" } }, required: ["lot_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for auction-mcp.");

  if (tool === "create_auction") {
    const organizerId = String(args.organizer_id ?? "");
    const title = String(args.title ?? "");
    const scheduledStart = String(args.scheduled_start ?? "");
    if (!organizerId || !title || !scheduledStart) return fail("VALIDATION_ERROR", "organizer_id, title, scheduled_start are required.");
    const auctionId = generateId();
    const createResult = await supabase.schema("auction_mcp").from("auctions").insert({
      auction_id: auctionId,
      organizer_id: organizerId,
      title,
      description: args.description ? String(args.description) : null,
      status: "scheduled",
      scheduled_start: scheduledStart,
      min_bid_increment: Number(args.min_bid_increment ?? 50),
      created_at: now(),
      updated_at: now(),
    });
    if (createResult.error) return fail("DB_ERROR", createResult.error.message);
    await emitEvent("auction.auction.created", { auction_id: auctionId, organizer_id: organizerId });
    return { content: [{ type: "text", text: ok({ auction_id: auctionId, status: "scheduled" }) }] };
  }

  if (tool === "add_lot") {
    const auctionId = String(args.auction_id ?? "");
    const listingId = String(args.listing_id ?? "");
    const lotNumber = Number(args.lot_number ?? 0);
    const startingPrice = Number(args.starting_price ?? 0);
    if (!auctionId || !listingId || lotNumber <= 0 || startingPrice <= 0) return fail("VALIDATION_ERROR", "auction_id, listing_id, lot_number>0, starting_price>0 are required.");
    const lotId = generateId();
    const createResult = await supabase.schema("auction_mcp").from("lots").insert({
      lot_id: lotId,
      auction_id: auctionId,
      listing_id: listingId,
      lot_number: lotNumber,
      status: "pending",
      starting_price: startingPrice,
      reserve_price: typeof args.reserve_price === "number" ? Number(args.reserve_price) : null,
      total_bids: 0,
      extensions_used: 0,
    });
    if (createResult.error) return fail("DB_ERROR", createResult.error.message);
    await emitEvent("auction.lot.added", { auction_id: auctionId, lot_id: lotId, listing_id: listingId });
    return { content: [{ type: "text", text: ok({ lot_id: lotId }) }] };
  }

  if (tool === "start_auction") {
    const auctionId = String(args.auction_id ?? "");
    if (!auctionId) return fail("VALIDATION_ERROR", "auction_id is required.");

    const auctionCheck = await supabase
      .schema("auction_mcp")
      .from("auctions")
      .select("status")
      .eq("auction_id", auctionId)
      .maybeSingle();
    if (auctionCheck.error) return fail("DB_ERROR", auctionCheck.error.message);
    if (!auctionCheck.data) return fail("NOT_FOUND", "Auction not found.");
    if (auctionCheck.data.status !== "scheduled") return fail("INVALID_STATE", `Auction must be in 'scheduled' state, current: ${auctionCheck.data.status}.`);

    const startTs = now();
    const startResult = await supabase
      .schema("auction_mcp")
      .from("auctions")
      .update({ status: "live", actual_start: startTs, updated_at: startTs })
      .eq("auction_id", auctionId)
      .eq("status", "scheduled");
    if (startResult.error) return fail("DB_ERROR", startResult.error.message);

    const lotsResult = await supabase
      .schema("auction_mcp")
      .from("lots")
      .update({ status: "open", opened_at: startTs })
      .eq("auction_id", auctionId)
      .eq("status", "pending");
    if (lotsResult.error) return fail("DB_ERROR", lotsResult.error.message);

    await emitEvent("auction.auction.started", { auction_id: auctionId });
    return { content: [{ type: "text", text: ok({ auction_id: auctionId, status: "live" }) }] };
  }

  if (tool === "place_auction_bid") {
    const lotId = String(args.lot_id ?? "");
    const bidderId = String(args.bidder_id ?? "");
    const amount = Number(args.amount ?? 0);
    if (!lotId || !bidderId || amount <= 0) return fail("VALIDATION_ERROR", "lot_id, bidder_id, amount>0 are required.");

    const lotResult = await supabase.schema("auction_mcp").from("lots").select("*").eq("lot_id", lotId).maybeSingle();
    if (lotResult.error) return fail("DB_ERROR", lotResult.error.message);
    const lot = lotResult.data;
    if (!lot) return fail("NOT_FOUND", "lot not found");
    if (lot.status !== "open" && lot.status !== "closing") return fail("LOT_NOT_OPEN", `Lot status is ${lot.status}`);

    const currentHighest = Number(lot.current_highest_bid ?? lot.starting_price ?? 0);
    const minIncrement = 1;
    const expected = typeof args.expected_highest === "number" ? Number(args.expected_highest) : null;
    if (expected !== null && expected !== currentHighest) {
      return fail("OPTIMISTIC_CONCURRENCY_CONFLICT", `Expected highest ${expected} but current is ${currentHighest}`);
    }
    if (amount < currentHighest + minIncrement) {
      return fail("BID_TOO_LOW", `Bid must be at least ${currentHighest + minIncrement}`);
    }

    const sequenceKey = String(lotId);
    const serverSequence = (lotSequence.get(sequenceKey) ?? 0) + 1;
    lotSequence.set(sequenceKey, serverSequence);
    const bidId = generateId();
    const serverTs = now();

    const bidInsert = await supabase.schema("bidding_mcp").from("bids").insert({
      bid_id: bidId,
      listing_id: lot.listing_id,
      bidder_id: bidderId,
      amount,
      bid_type: "manual",
      status: "active",
      server_timestamp: serverTs,
    });
    if (bidInsert.error) return fail("DB_ERROR", bidInsert.error.message);

    const updateResult = await supabase
      .schema("auction_mcp")
      .from("lots")
      .update({
        current_highest_bid: amount,
        highest_bidder_id: bidderId,
        total_bids: Number(lot.total_bids ?? 0) + 1,
        status: "open",
      })
      .eq("lot_id", lotId)
      .eq("current_highest_bid", lot.current_highest_bid ?? null)
      .select("lot_id")
      .maybeSingle();
    if (updateResult.error) return fail("DB_ERROR", updateResult.error.message);
    if (!updateResult.data) return fail("OPTIMISTIC_CONCURRENCY_CONFLICT", "Lot highest bid changed, retry.");

    await emitEvent("auction.bid.placed", { lot_id: lotId, bid_id: bidId, bidder_id: bidderId, amount, server_timestamp: serverTs, server_sequence: serverSequence });
    return { content: [{ type: "text", text: ok({ bid_id: bidId, lot_id: lotId, amount, server_timestamp: serverTs, server_sequence: serverSequence }) }] };
  }

  if (tool === "close_lot") {
    const lotId = String(args.lot_id ?? "");
    if (!lotId) return fail("VALIDATION_ERROR", "lot_id is required.");
    const lotResult = await supabase.schema("auction_mcp").from("lots").select("*").eq("lot_id", lotId).maybeSingle();
    if (lotResult.error) return fail("DB_ERROR", lotResult.error.message);
    const lot = lotResult.data;
    if (!lot) return fail("NOT_FOUND", "lot not found");
    const sold = lot.highest_bidder_id ? "sold" : "unsold";
    const closeResult = await supabase
      .schema("auction_mcp")
      .from("lots")
      .update({ status: sold, closed_at: now() })
      .eq("lot_id", lotId);
    if (closeResult.error) return fail("DB_ERROR", closeResult.error.message);
    await emitEvent("auction.lot.closed", { lot_id: lotId, status: sold, highest_bidder_id: lot.highest_bidder_id ?? null, final_bid: lot.current_highest_bid ?? null });
    return { content: [{ type: "text", text: ok({ lot_id: lotId, status: sold }) }] };
  }

  if (tool === "get_lot_state") {
    const lotId = String(args.lot_id ?? "");
    if (!lotId) return fail("VALIDATION_ERROR", "lot_id is required.");
    const lot = await supabase.schema("auction_mcp").from("lots").select("*").eq("lot_id", lotId).maybeSingle();
    if (lot.error) return fail("DB_ERROR", lot.error.message);
    return { content: [{ type: "text", text: ok({ lot: lot.data ?? null }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("auction", Number(process.env.MCP_HTTP_PORT ?? 4110));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
