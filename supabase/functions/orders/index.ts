// Orders domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/orders-mcp/src/index.ts.

import {
  calculateCommission,
  failEnvelope,
  generateId,
  now,
  okEnvelope,
  roundToTwoDecimals,
} from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { getPlatformConfigNumber } from "../_shared/config.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "orders-edge";

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "disputed"]);
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled", "disputed"],
  shipped: ["delivered", "disputed"],
  delivered: ["inspected", "completed", "disputed"],
  inspected: ["completed", "disputed"],
  disputed: ["completed", "cancelled"],
};

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function createOrder({ args }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  const buyerId = String(args.buyer_id ?? "");
  const sellerId = String(args.seller_id ?? "");
  const quantity = Number(args.quantity ?? 0);
  const unit = String(args.unit ?? "");
  const originalAmount = Number(args.original_amount ?? 0);
  if (!listingId || !buyerId || !sellerId || !unit) {
    return failEnvelope("VALIDATION_ERROR", "listing_id, buyer_id, seller_id, unit are required.");
  }
  if (quantity <= 0) return failEnvelope("VALIDATION_ERROR", "quantity must be > 0.");
  if (originalAmount <= 0) return failEnvelope("VALIDATION_ERROR", "original_amount must be > 0.");
  if (buyerId === sellerId) return failEnvelope("VALIDATION_ERROR", "buyer_id and seller_id must differ.");

  const listingResult = await supabase
    .schema("listing_mcp")
    .from("listings")
    .select("listing_id,seller_id,status,unit")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (listingResult.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!listingResult.data) return failEnvelope("NOT_FOUND", "Listing not found.");
  if (listingResult.data.seller_id !== sellerId) {
    return failEnvelope("FORBIDDEN", "seller_id does not match listing owner.");
  }
  if (listingResult.data.status !== "active") {
    return failEnvelope("INVALID_STATE", `Listing is not active (status: ${listingResult.data.status}).`);
  }

  const commissionRate = await getPlatformConfigNumber(
    supabase,
    "commission_rate",
    0.035,
    (n) => n > 0 && n < 1,
  );
  const commissionAmount = calculateCommission(originalAmount, {
    rate: commissionRate,
    minimum: 25,
    cap: 5000,
  });

  const orderId = generateId();
  const createdAt = now();
  const insertResult = await supabase.schema("orders_mcp").from("orders").insert({
    order_id: orderId,
    listing_id: listingId,
    buyer_id: buyerId,
    seller_id: sellerId,
    bid_id: args.bid_id ? String(args.bid_id) : null,
    contract_id: args.contract_id ? String(args.contract_id) : null,
    original_amount: originalAmount,
    quantity,
    unit,
    commission_rate: commissionRate,
    commission_amount: commissionAmount,
    currency: "CAD",
    payment_method: args.payment_method ? String(args.payment_method) : null,
    down_payment_pct: args.down_payment_pct !== undefined ? Number(args.down_payment_pct) : null,
    inspection_window_hours: args.inspection_window_hours !== undefined ? Number(args.inspection_window_hours) : 72,
    weight_tolerance_pct: args.weight_tolerance_pct !== undefined ? Number(args.weight_tolerance_pct) : 2.0,
    status: "pending",
    notes: args.notes ? String(args.notes) : null,
    created_at: createdAt,
    updated_at: createdAt,
  });
  if (insertResult.error) return failEnvelope("DB_ERROR", "Database operation failed");

  await emitEvent(supabase, SOURCE, "orders.order.created", {
    order_id: orderId,
    listing_id: listingId,
    buyer_id: buyerId,
    seller_id: sellerId,
    original_amount: originalAmount,
    commission_amount: commissionAmount,
  });
  return okEnvelope({
    order_id: orderId,
    status: "pending",
    commission_rate: commissionRate,
    commission_amount: commissionAmount,
  });
}

async function getOrder({ args }: ToolRequest) {
  const supabase = serviceClient();
  const orderId = String(args.order_id ?? "");
  if (!orderId) return failEnvelope("VALIDATION_ERROR", "order_id is required.");
  const { data, error } = await supabase
    .schema("orders_mcp")
    .from("orders")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!data) return failEnvelope("NOT_FOUND", "Order not found.");
  return okEnvelope({ order: data });
}

async function listOrders({ args }: ToolRequest) {
  const supabase = serviceClient();
  const buyerId = args.buyer_id ? String(args.buyer_id) : null;
  const sellerId = args.seller_id ? String(args.seller_id) : null;
  const statusFilter = args.status ? String(args.status) : null;
  const limit = Math.min(Number(args.limit ?? 50), 100);
  const offset = Math.max(Number(args.offset ?? 0), 0);
  if (!buyerId && !sellerId) return failEnvelope("VALIDATION_ERROR", "buyer_id or seller_id is required.");

  let query = supabase
    .schema("orders_mcp")
    .from("orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (buyerId) query = query.eq("buyer_id", buyerId);
  if (sellerId) query = query.eq("seller_id", sellerId);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data, error, count } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ orders: data ?? [], total: count ?? 0, limit, offset });
}

async function updateOrderStatus({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const orderId = String(args.order_id ?? "");
  const actorId = String(args.actor_id ?? caller.userId);
  const nextStatus = String(args.status ?? "");
  if (!orderId || !actorId || !nextStatus) {
    return failEnvelope("VALIDATION_ERROR", "order_id, actor_id, status are required.");
  }

  const orderResult = await supabase
    .schema("orders_mcp")
    .from("orders")
    .select("buyer_id,seller_id,status")
    .eq("order_id", orderId)
    .maybeSingle();
  if (orderResult.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!orderResult.data) return failEnvelope("NOT_FOUND", "Order not found.");
  const { buyer_id, seller_id, status: currentStatus } = orderResult.data as {
    buyer_id: string;
    seller_id: string;
    status: string;
  };
  if (actorId !== buyer_id && actorId !== seller_id) {
    return failEnvelope("FORBIDDEN", "Only the buyer or seller may update this order.");
  }
  if (TERMINAL_STATUSES.has(currentStatus)) {
    return failEnvelope("INVALID_STATE", `Order is in terminal status: ${currentStatus}.`);
  }
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    return failEnvelope("INVALID_TRANSITION", `Cannot transition from '${currentStatus}' to '${nextStatus}'.`);
  }

  const update: Record<string, unknown> = { status: nextStatus, updated_at: now() };
  if (nextStatus === "confirmed") update.confirmed_at = now();
  if (nextStatus === "shipped") update.shipped_at = now();
  if (nextStatus === "delivered") update.delivered_at = now();
  if (nextStatus === "completed") update.completed_at = now();
  if (args.adjusted_amount !== undefined) update.adjusted_amount = roundToTwoDecimals(Number(args.adjusted_amount));
  if (args.final_amount !== undefined) update.final_amount = roundToTwoDecimals(Number(args.final_amount));
  if (args.notes !== undefined) update.notes = String(args.notes);

  const updateResult = await supabase
    .schema("orders_mcp")
    .from("orders")
    .update(update)
    .eq("order_id", orderId)
    .eq("status", currentStatus);
  if (updateResult.error) return failEnvelope("DB_ERROR", "Database operation failed");

  await emitEvent(supabase, SOURCE, `orders.order.${nextStatus}`, {
    order_id: orderId,
    actor_id: actorId,
    from: currentStatus,
    to: nextStatus,
  });
  return okEnvelope({ order_id: orderId, status: nextStatus, previous_status: currentStatus });
}

async function cancelOrder({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const orderId = String(args.order_id ?? "");
  const actorId = String(args.actor_id ?? caller.userId);
  const reason = String(args.reason ?? "");
  if (!orderId || !actorId || !reason) {
    return failEnvelope("VALIDATION_ERROR", "order_id, actor_id, reason are required.");
  }

  const orderResult = await supabase
    .schema("orders_mcp")
    .from("orders")
    .select("buyer_id,seller_id,status")
    .eq("order_id", orderId)
    .maybeSingle();
  if (orderResult.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!orderResult.data) return failEnvelope("NOT_FOUND", "Order not found.");
  const { buyer_id, seller_id, status: currentStatus } = orderResult.data as {
    buyer_id: string;
    seller_id: string;
    status: string;
  };
  if (actorId !== buyer_id && actorId !== seller_id) {
    return failEnvelope("FORBIDDEN", "Only the buyer or seller may cancel this order.");
  }
  if (currentStatus !== "pending" && currentStatus !== "confirmed") {
    return failEnvelope("INVALID_STATE", `Cannot cancel order in status '${currentStatus}'. Use disputes once shipped.`);
  }

  const updateResult = await supabase
    .schema("orders_mcp")
    .from("orders")
    .update({ status: "cancelled", notes: reason, updated_at: now() })
    .eq("order_id", orderId)
    .eq("status", currentStatus);
  if (updateResult.error) return failEnvelope("DB_ERROR", "Database operation failed");

  await emitEvent(supabase, SOURCE, "orders.order.cancelled", { order_id: orderId, actor_id: actorId, reason });
  return okEnvelope({ order_id: orderId, status: "cancelled", reason });
}

Deno.serve(serveDomain({
  ping,
  create_order: createOrder,
  get_order: getOrder,
  list_orders: listOrders,
  update_order_status: updateOrderStatus,
  cancel_order: cancelOrder,
}));
