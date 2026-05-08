// Bidding domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/bidding-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { getPlatformConfigNumber } from "../_shared/config.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "bidding-edge";
const DEFAULT_MIN_BID_INCREMENT = 1;
const DEFAULT_KYC_LEVEL2_THRESHOLD = 5000;

function rankLevel(level: string): number {
  const map: Record<string, number> = { level_0: 0, level_1: 1, level_2: 2, level_3: 3 };
  return map[level] ?? 0;
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function placeBid({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  const bidderId = String(args.bidder_id ?? caller.userId);
  const amount = Number(args.amount ?? 0);
  const bidType = String(args.bid_type ?? "manual");
  if (!listingId || !bidderId || amount <= 0) {
    return failEnvelope("VALIDATION_ERROR", "listing_id, bidder_id, amount>0 are required.");
  }

  const listing = await supabase.schema("listing_mcp").from("listings").select("status").eq("listing_id", listingId).maybeSingle();
  if (listing.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!listing.data || listing.data.status !== "active") return failEnvelope("LISTING_NOT_BIDDABLE", "Listing is not active.");

  const kyc = await supabase.schema("kyc_mcp").from("kyc_levels").select("current_level").eq("user_id", bidderId).maybeSingle();
  if (kyc.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const currentLevel = String(kyc.data?.current_level ?? "level_0");
  const kycLevel2Threshold = await getPlatformConfigNumber(
    supabase, "kyc_required_amount_level_2", DEFAULT_KYC_LEVEL2_THRESHOLD, (n) => n > 0,
  );
  const requiredLevel = amount >= kycLevel2Threshold ? "level_2" : "level_1";
  if (rankLevel(currentLevel) < rankLevel(requiredLevel)) {
    return failEnvelope("KYC_GATE_BLOCKED", `Bids require ${requiredLevel}. Current ${currentLevel}.`);
  }

  const highest = await supabase.schema("bidding_mcp").from("bids")
    .select("amount").eq("listing_id", listingId).eq("status", "active")
    .order("amount", { ascending: false }).limit(1).maybeSingle();
  if (highest.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const currentHighest = Number(highest.data?.amount ?? 0);
  const expectedHighest = typeof args.expected_highest === "number" ? Number(args.expected_highest) : null;
  if (expectedHighest !== null && expectedHighest !== currentHighest) {
    return failEnvelope("OPTIMISTIC_CONCURRENCY_CONFLICT", `Expected highest ${expectedHighest} but current highest is ${currentHighest}.`);
  }
  const minIncrement = await getPlatformConfigNumber(supabase, "min_bid_increment", DEFAULT_MIN_BID_INCREMENT, (n) => n > 0);
  if (amount < currentHighest + minIncrement) {
    return failEnvelope("BID_TOO_LOW", `Bid must be at least ${currentHighest + minIncrement} (current highest + minimum increment of ${minIncrement}).`);
  }

  const bidId = generateId();
  const serverTs = now();
  const insert = await supabase.schema("bidding_mcp").from("bids").insert({
    bid_id: bidId, listing_id: listingId, bidder_id: bidderId, amount, bid_type: bidType,
    status: "active", server_timestamp: serverTs,
  });
  if (insert.error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "bidding.bid.placed", {
    listing_id: listingId, bid_id: bidId, bidder_id: bidderId, amount, server_timestamp: serverTs,
  });
  return okEnvelope({ bid_id: bidId, amount, server_timestamp: serverTs, previous_highest: currentHighest });
}

async function retractBid({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const bidId = String(args.bid_id ?? "");
  const bidderId = String(args.bidder_id ?? caller.userId);
  const reason = String(args.reason ?? "");
  if (!bidId || !bidderId || !reason) return failEnvelope("VALIDATION_ERROR", "bid_id, bidder_id, reason are required.");
  const { error } = await supabase.schema("bidding_mcp").from("bids")
    .update({ status: "retracted", retraction_reason: reason, retracted_at: now() })
    .eq("bid_id", bidId).eq("bidder_id", bidderId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "bidding.bid.retracted", { bid_id: bidId, bidder_id: bidderId, reason });
  return okEnvelope({ bid_id: bidId, status: "retracted" });
}

async function getHighestBid({ args }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  if (!listingId) return failEnvelope("VALIDATION_ERROR", "listing_id is required.");
  const { data, error } = await supabase.schema("bidding_mcp").from("bids")
    .select("bid_id,bidder_id,amount,server_timestamp")
    .eq("listing_id", listingId).eq("status", "active")
    .order("amount", { ascending: false }).limit(1).maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ listing_id: listingId, highest_bid: data ?? null });
}

async function flagSuspiciousBid({ args }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  const flaggedUserId = String(args.flagged_user_id ?? "");
  const flagType = String(args.flag_type ?? "");
  const severity = String(args.severity ?? "");
  if (!listingId || !flaggedUserId || !flagType || !severity) {
    return failEnvelope("VALIDATION_ERROR", "listing_id, flagged_user_id, flag_type, severity are required.");
  }
  const flagId = generateId();
  const { error } = await supabase.schema("bidding_mcp").from("anti_manipulation_flags").insert({
    flag_id: flagId, listing_id: listingId, flagged_user_id: flaggedUserId,
    flag_type: flagType, severity, details: (args.details ?? {}) as Record<string, unknown>, created_at: now(),
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "bidding.anti_manipulation.flagged", {
    flag_id: flagId, listing_id: listingId, flagged_user_id: flaggedUserId, severity,
  });
  return okEnvelope({ flag_id: flagId });
}

Deno.serve(serveDomain({
  ping,
  place_bid: placeBid,
  retract_bid: retractBid,
  get_highest_bid: getHighestBid,
  flag_suspicious_bid: flagSuspiciousBid,
}));
