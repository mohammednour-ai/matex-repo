import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "booking-mcp";
const SERVER_VERSION = "0.1.0";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;
const eventBus = EVENT_REDIS_URL ? new MatexEventBus({ redisUrl: EVENT_REDIS_URL }) : null;
const reminderQueue: Array<{ booking_id: string; minutes_before: number; created_at: string }> = [];

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
    { name: "set_availability", description: "Set recurring availability", inputSchema: { type: "object", properties: { user_id: { type: "string" }, day_of_week: { type: "number" }, start_time: { type: "string" }, end_time: { type: "string" }, timezone: { type: "string" }, max_bookings_per_day: { type: "number" } }, required: ["user_id", "day_of_week", "start_time", "end_time"] } },
    { name: "create_booking", description: "Create booking event", inputSchema: { type: "object", properties: { event_type: { type: "string" }, organizer_id: { type: "string" }, participants: { type: "array" }, listing_id: { type: "string" }, order_id: { type: "string" }, location: { type: "object" }, scheduled_start: { type: "string" }, scheduled_end: { type: "string" }, timezone: { type: "string" } }, required: ["event_type", "organizer_id", "participants", "scheduled_start", "scheduled_end"] } },
    { name: "update_booking_status", description: "Update booking status", inputSchema: { type: "object", properties: { booking_id: { type: "string" }, status: { type: "string" }, cancellation_reason: { type: "string" }, cancelled_by: { type: "string" } }, required: ["booking_id", "status"] } },
    { name: "list_user_bookings", description: "List bookings for organizer", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "enqueue_reminder", description: "Enqueue reminder task for booking", inputSchema: { type: "object", properties: { booking_id: { type: "string" }, minutes_before: { type: "number" } }, required: ["booking_id", "minutes_before"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now(), queued_reminders: reminderQueue.length }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for booking-mcp.");

  if (tool === "set_availability") {
    const userId = String(args.user_id ?? "");
    const dayOfWeek = Number(args.day_of_week ?? -1);
    const startTime = String(args.start_time ?? "");
    const endTime = String(args.end_time ?? "");
    if (!userId || dayOfWeek < 0 || dayOfWeek > 6 || !startTime || !endTime) {
      return fail("VALIDATION_ERROR", "user_id, day_of_week(0-6), start_time, end_time are required.");
    }
    const availabilityId = generateId();
    const insertResult = await supabase.schema("booking_mcp").from("availability").insert({
      availability_id: availabilityId,
      user_id: userId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      timezone: args.timezone ? String(args.timezone) : "America/Toronto",
      max_bookings_per_day: typeof args.max_bookings_per_day === "number" ? Number(args.max_bookings_per_day) : 5,
      created_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");
    await emitEvent("booking.availability.set", { availability_id: availabilityId, user_id: userId, day_of_week: dayOfWeek });
    return { content: [{ type: "text", text: ok({ availability_id: availabilityId }) }] };
  }

  if (tool === "create_booking") {
    const eventType = String(args.event_type ?? "");
    const organizerId = String(args.organizer_id ?? "");
    const participants = Array.isArray(args.participants) ? args.participants : [];
    const scheduledStart = String(args.scheduled_start ?? "");
    const scheduledEnd = String(args.scheduled_end ?? "");
    if (!eventType || !organizerId || participants.length === 0 || !scheduledStart || !scheduledEnd) {
      return fail("VALIDATION_ERROR", "event_type, organizer_id, participants, scheduled_start, scheduled_end are required.");
    }
    // Check for overlapping bookings for the organizer.
    const { data: overlapping, error: overlapError } = await supabase
      .schema("booking_mcp")
      .from("bookings")
      .select("booking_id")
      .eq("organizer_id", organizerId)
      .lt("scheduled_start", scheduledEnd)
      .gt("scheduled_end", scheduledStart)
      .not("status", "in", '("cancelled","rejected")');
    if (overlapError) return fail("DB_ERROR", "Database operation failed");
    if (overlapping && overlapping.length > 0) {
      return fail("BOOKING_CONFLICT", `Organizer already has a booking overlapping ${scheduledStart} – ${scheduledEnd}.`);
    }

    const bookingId = generateId();
    const insertResult = await supabase.schema("booking_mcp").from("bookings").insert({
      booking_id: bookingId,
      event_type: eventType,
      listing_id: args.listing_id ? String(args.listing_id) : null,
      order_id: args.order_id ? String(args.order_id) : null,
      organizer_id: organizerId,
      participants: participants as unknown[],
      location: (args.location ?? null) as Record<string, unknown> | null,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      timezone: args.timezone ? String(args.timezone) : "America/Toronto",
      status: "pending",
      created_at: now(),
      updated_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");
    await emitEvent("booking.booking.created", { booking_id: bookingId, event_type: eventType, organizer_id: organizerId });
    return { content: [{ type: "text", text: ok({ booking_id: bookingId, status: "pending" }) }] };
  }

  if (tool === "update_booking_status") {
    const bookingId = String(args.booking_id ?? "");
    const status = String(args.status ?? "");
    if (!bookingId || !status) return fail("VALIDATION_ERROR", "booking_id and status are required.");
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: now(),
    };
    if (status === "cancelled") {
      updatePayload.cancellation_reason = args.cancellation_reason ? String(args.cancellation_reason) : null;
      updatePayload.cancelled_by = args.cancelled_by ? String(args.cancelled_by) : null;
      updatePayload.cancelled_at = now();
    }
    const updateResult = await supabase.schema("booking_mcp").from("bookings").update(updatePayload).eq("booking_id", bookingId);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");
    await emitEvent("booking.booking.status_changed", { booking_id: bookingId, status });
    return { content: [{ type: "text", text: ok({ booking_id: bookingId, status }) }] };
  }

  if (tool === "list_user_bookings") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    const rows = await supabase
      .schema("booking_mcp")
      .from("bookings")
      .select("*")
      .eq("organizer_id", userId)
      .order("scheduled_start", { ascending: true });
    if (rows.error) return fail("DB_ERROR", "Database operation failed");
    return { content: [{ type: "text", text: ok({ bookings: rows.data ?? [], total: (rows.data ?? []).length }) }] };
  }

  if (tool === "enqueue_reminder") {
    const bookingId = String(args.booking_id ?? "");
    const minutesBefore = Number(args.minutes_before ?? 0);
    if (!bookingId || minutesBefore <= 0) return fail("VALIDATION_ERROR", "booking_id and minutes_before>0 are required.");
    reminderQueue.push({ booking_id: bookingId, minutes_before: minutesBefore, created_at: now() });
    await emitEvent("booking.reminder.enqueued", { booking_id: bookingId, minutes_before: minutesBefore });
    return { content: [{ type: "text", text: ok({ booking_id: bookingId, minutes_before: minutesBefore, queue_size: reminderQueue.length }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("booking", Number(process.env.MCP_HTTP_PORT ?? 4112));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
