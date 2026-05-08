// Auction domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/auction-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "auction-edge";

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function createAuction({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const organizerId = String(args.organizer_id ?? caller.userId);
  const title = String(args.title ?? "");
  const scheduledStart = String(args.scheduled_start ?? "");
  if (!organizerId || !title || !scheduledStart) {
    return failEnvelope("VALIDATION_ERROR", "organizer_id, title, scheduled_start are required.");
  }
  const auctionId = generateId();
  const ts = now();
  const { error } = await supabase.schema("auction_mcp").from("auctions").insert({
    auction_id: auctionId, organizer_id: organizerId, title,
    description: args.description ? String(args.description) : null,
    status: "scheduled", scheduled_start: scheduledStart,
    min_bid_increment: Number(args.min_bid_increment ?? 50),
    created_at: ts, updated_at: ts,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "auction.auction.created", { auction_id: auctionId, organizer_id: organizerId });
  return okEnvelope({ auction_id: auctionId, status: "scheduled" });
}

async function addLot({ args }: ToolRequest) {
  const supabase = serviceClient();
  const auctionId = String(args.auction_id ?? "");
  const listingId = String(args.listing_id ?? "");
  const lotNumber = Number(args.lot_number ?? 0);
  const startingPrice = Number(args.starting_price ?? 0);
  if (!auctionId || !listingId || lotNumber <= 0 || startingPrice <= 0) {
    return failEnvelope("VALIDATION_ERROR", "auction_id, listing_id, lot_number>0, starting_price>0 are required.");
  }
  const lotId = generateId();
  const { error } = await supabase.schema("auction_mcp").from("lots").insert({
    lot_id: lotId, auction_id: auctionId, listing_id: listingId, lot_number: lotNumber,
    status: "pending", starting_price: startingPrice,
    reserve_price: typeof args.reserve_price === "number" ? Number(args.reserve_price) : null,
    total_bids: 0, extensions_used: 0,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "auction.lot.added", { auction_id: auctionId, lot_id: lotId, listing_id: listingId });
  return okEnvelope({ lot_id: lotId });
}

async function startAuction({ args }: ToolRequest) {
  const supabase = serviceClient();
  const auctionId = String(args.auction_id ?? "");
  if (!auctionId) return failEnvelope("VALIDATION_ERROR", "auction_id is required.");
  const check = await supabase.schema("auction_mcp").from("auctions").select("status").eq("auction_id", auctionId).maybeSingle();
  if (check.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!check.data) return failEnvelope("NOT_FOUND", "Auction not found.");
  if (check.data.status !== "scheduled") {
    return failEnvelope("INVALID_STATE", `Auction must be in 'scheduled' state, current: ${check.data.status}.`);
  }
  const startTs = now();
  const start = await supabase.schema("auction_mcp").from("auctions")
    .update({ status: "live", actual_start: startTs, updated_at: startTs })
    .eq("auction_id", auctionId).eq("status", "scheduled");
  if (start.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const lots = await supabase.schema("auction_mcp").from("lots")
    .update({ status: "open", opened_at: startTs })
    .eq("auction_id", auctionId).eq("status", "pending");
  if (lots.error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "auction.auction.started", { auction_id: auctionId });
  return okEnvelope({ auction_id: auctionId, status: "live" });
}

async function placeAuctionBid({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const lotId = String(args.lot_id ?? "");
  const bidderId = String(args.bidder_id ?? caller.userId);
  const amount = Number(args.amount ?? 0);
  if (!lotId || !bidderId || amount <= 0) {
    return failEnvelope("VALIDATION_ERROR", "lot_id, bidder_id, amount>0 are required.");
  }
  const lotResult = await supabase.schema("auction_mcp").from("lots").select("*").eq("lot_id", lotId).maybeSingle();
  if (lotResult.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const lot = lotResult.data as Record<string, unknown> | null;
  if (!lot) return failEnvelope("NOT_FOUND", "lot not found");
  if (lot.status !== "open" && lot.status !== "closing") {
    return failEnvelope("LOT_NOT_OPEN", `Lot status is ${lot.status}`);
  }
  const currentHighest = Number(lot.current_highest_bid ?? lot.starting_price ?? 0);
  const minIncrement = 1;
  const expected = typeof args.expected_highest === "number" ? Number(args.expected_highest) : null;
  if (expected !== null && expected !== currentHighest) {
    return failEnvelope("OPTIMISTIC_CONCURRENCY_CONFLICT", `Expected highest ${expected} but current is ${currentHighest}`);
  }
  if (amount < currentHighest + minIncrement) {
    return failEnvelope("BID_TOO_LOW", `Bid must be at least ${currentHighest + minIncrement}`);
  }
  const bidId = generateId();
  const serverTs = now();
  const bidInsert = await supabase.schema("bidding_mcp").from("bids").insert({
    bid_id: bidId, listing_id: lot.listing_id, bidder_id: bidderId, amount,
    bid_type: "manual", status: "active", server_timestamp: serverTs,
  });
  if (bidInsert.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const update = await supabase.schema("auction_mcp").from("lots")
    .update({
      current_highest_bid: amount, highest_bidder_id: bidderId,
      total_bids: Number(lot.total_bids ?? 0) + 1, status: "open",
    })
    .eq("lot_id", lotId).eq("current_highest_bid", lot.current_highest_bid ?? null)
    .select("lot_id").maybeSingle();
  if (update.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!update.data) return failEnvelope("OPTIMISTIC_CONCURRENCY_CONFLICT", "Lot highest bid changed, retry.");
  await emitEvent(supabase, SOURCE, "auction.bid.placed", {
    lot_id: lotId, bid_id: bidId, bidder_id: bidderId, amount, server_timestamp: serverTs,
  });
  return okEnvelope({ bid_id: bidId, lot_id: lotId, amount, server_timestamp: serverTs });
}

async function closeLot({ args }: ToolRequest) {
  const supabase = serviceClient();
  const lotId = String(args.lot_id ?? "");
  if (!lotId) return failEnvelope("VALIDATION_ERROR", "lot_id is required.");
  const lotResult = await supabase.schema("auction_mcp").from("lots").select("*").eq("lot_id", lotId).maybeSingle();
  if (lotResult.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const lot = lotResult.data as Record<string, unknown> | null;
  if (!lot) return failEnvelope("NOT_FOUND", "lot not found");
  const sold = lot.highest_bidder_id ? "sold" : "unsold";
  const close = await supabase.schema("auction_mcp").from("lots")
    .update({ status: sold, closed_at: now() }).eq("lot_id", lotId);
  if (close.error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "auction.lot.closed", {
    lot_id: lotId, status: sold,
    highest_bidder_id: lot.highest_bidder_id ?? null,
    final_bid: lot.current_highest_bid ?? null,
  });
  return okEnvelope({ lot_id: lotId, status: sold });
}

async function getLotState({ args }: ToolRequest) {
  const supabase = serviceClient();
  const lotId = String(args.lot_id ?? "");
  if (!lotId) return failEnvelope("VALIDATION_ERROR", "lot_id is required.");
  const { data, error } = await supabase.schema("auction_mcp").from("lots").select("*").eq("lot_id", lotId).maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ lot: data ?? null });
}

async function listAuctions({ args }: ToolRequest) {
  const supabase = serviceClient();
  const requestedStatus = typeof args.status === "string" ? args.status : undefined;
  const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 200);
  let query = supabase.schema("auction_mcp").from("auctions")
    .select("auction_id, organizer_id, title, status, scheduled_start, actual_start, actual_end, total_gmv, total_lots, lots_sold")
    .order("scheduled_start", { ascending: true }).limit(limit);
  if (requestedStatus) query = query.eq("status", requestedStatus);
  const { data, error } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const auctions = (data ?? []).map((row: Record<string, unknown>) => ({
    auction_id: row.auction_id, title: row.title, organizer_id: row.organizer_id,
    lot_count: Number(row.total_lots ?? 0),
    start_time: row.scheduled_start,
    end_time: row.actual_end ?? row.scheduled_start,
    total_gmv: Number(row.total_gmv ?? 0), status: row.status,
  }));
  return okEnvelope({ auctions, total: auctions.length });
}

async function getAuction({ args }: ToolRequest) {
  const supabase = serviceClient();
  const auctionId = String(args.auction_id ?? "");
  if (!auctionId) return failEnvelope("VALIDATION_ERROR", "auction_id is required.");
  const auction = await supabase.schema("auction_mcp").from("auctions")
    .select("auction_id, organizer_id, title, description, status, scheduled_start, actual_start, actual_end, total_gmv, total_lots, lots_sold, min_bid_increment")
    .eq("auction_id", auctionId).maybeSingle();
  if (auction.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!auction.data) return failEnvelope("NOT_FOUND", "Auction not found.");
  const lots = await supabase.schema("auction_mcp").from("lots").select("*")
    .eq("auction_id", auctionId).order("lot_number", { ascending: true });
  if (lots.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const a = auction.data as Record<string, unknown>;
  return okEnvelope({
    auction: {
      auction_id: a.auction_id, title: a.title, description: a.description,
      organizer_id: a.organizer_id, status: a.status,
      start_time: a.scheduled_start, end_time: a.actual_end ?? a.scheduled_start,
      total_gmv: Number(a.total_gmv ?? 0),
      total_lots: Number(a.total_lots ?? 0),
      lots_sold: Number(a.lots_sold ?? 0),
      min_bid_increment: Number(a.min_bid_increment ?? 0),
    },
    lots: lots.data ?? [],
  });
}

async function registerBidder({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  let auctionId = args.auction_id ? String(args.auction_id) : (args.session_id ? String(args.session_id) : "");
  if (!auctionId && args.listing_id) {
    const lot = await supabase.schema("auction_mcp").from("lots").select("auction_id")
      .eq("listing_id", String(args.listing_id)).order("lot_number", { ascending: true }).limit(1).maybeSingle();
    if (lot.error) return failEnvelope("DB_ERROR", "Database operation failed");
    if (lot.data?.auction_id) auctionId = String(lot.data.auction_id);
  }
  if (!auctionId) return failEnvelope("VALIDATION_ERROR", "auction_id, session_id, or a listing_id linked to a lot is required.");
  const auctionCheck = await supabase.schema("auction_mcp").from("auctions").select("status").eq("auction_id", auctionId).maybeSingle();
  if (auctionCheck.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!auctionCheck.data) return failEnvelope("NOT_FOUND", "Auction not found.");
  if (auctionCheck.data.status === "cancelled" || auctionCheck.data.status === "completed") {
    return failEnvelope("INVALID_STATE", `Cannot register for auction in status '${auctionCheck.data.status}'.`);
  }
  const depositAmount = typeof args.deposit_amount === "number" ? Number(args.deposit_amount) : null;
  const depositId = args.deposit_id ? String(args.deposit_id) : null;
  const confirmed = depositAmount === null || depositAmount === 0 || depositId !== null;
  const upsert = await supabase.schema("auction_mcp").from("auction_participants").upsert(
    { auction_id: auctionId, user_id: userId, deposit_id: depositId, confirmed, registered_at: now() },
    { onConflict: "auction_id,user_id" },
  );
  if (upsert.error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "auction.bidder.registered", {
    auction_id: auctionId, user_id: userId, confirmed, deposit_amount: depositAmount,
  });
  return okEnvelope({ auction_id: auctionId, user_id: userId, confirmed, deposit_amount: depositAmount });
}

async function listBids({ args }: ToolRequest) {
  const supabase = serviceClient();
  const lotId = String(args.lot_id ?? "");
  const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 200);
  if (!lotId) return failEnvelope("VALIDATION_ERROR", "lot_id is required.");
  const lot = await supabase.schema("auction_mcp").from("lots").select("listing_id").eq("lot_id", lotId).maybeSingle();
  if (lot.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!lot.data) return failEnvelope("NOT_FOUND", "lot not found");
  const bids = await supabase.schema("bidding_mcp").from("bids")
    .select("bid_id, bidder_id, amount, server_timestamp")
    .eq("listing_id", lot.data.listing_id)
    .order("server_timestamp", { ascending: false }).limit(limit);
  if (bids.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const rows = (bids.data ?? []).map((b: Record<string, unknown>) => ({
    bid_id: String(b.bid_id), bidder: String(b.bidder_id),
    amount: Number(b.amount), timestamp: String(b.server_timestamp),
  }));
  return okEnvelope({ lot_id: lotId, bids: rows, count: rows.length });
}

Deno.serve(serveDomain({
  ping,
  create_auction: createAuction,
  add_lot: addLot,
  start_auction: startAuction,
  place_auction_bid: placeAuctionBid,
  close_lot: closeLot,
  get_lot_state: getLotState,
  list_auctions: listAuctions,
  get_auction: getAuction,
  register_bidder: registerBidder,
  list_bids: listBids,
}));
