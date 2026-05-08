// Booking domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/booking-mcp/src/index.ts.
// Note: enqueue_reminder writes a reminders row instead of an in-memory queue.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "booking-edge";

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function setAvailability({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  const dayOfWeek = Number(args.day_of_week ?? -1);
  const startTime = String(args.start_time ?? "");
  const endTime = String(args.end_time ?? "");
  if (!userId || dayOfWeek < 0 || dayOfWeek > 6 || !startTime || !endTime) {
    return failEnvelope("VALIDATION_ERROR", "user_id, day_of_week(0-6), start_time, end_time are required.");
  }
  const availabilityId = generateId();
  const { error } = await supabase.schema("booking_mcp").from("availability").insert({
    availability_id: availabilityId, user_id: userId,
    day_of_week: dayOfWeek, start_time: startTime, end_time: endTime,
    timezone: args.timezone ? String(args.timezone) : "America/Toronto",
    max_bookings_per_day: typeof args.max_bookings_per_day === "number" ? Number(args.max_bookings_per_day) : 5,
    created_at: now(),
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "booking.availability.set", {
    availability_id: availabilityId, user_id: userId, day_of_week: dayOfWeek,
  });
  return okEnvelope({ availability_id: availabilityId });
}

async function createBooking({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const eventType = String(args.event_type ?? "");
  const organizerId = String(args.organizer_id ?? caller.userId);
  const participants = Array.isArray(args.participants) ? args.participants : [];
  const scheduledStart = String(args.scheduled_start ?? "");
  const scheduledEnd = String(args.scheduled_end ?? "");
  if (!eventType || !organizerId || participants.length === 0 || !scheduledStart || !scheduledEnd) {
    return failEnvelope("VALIDATION_ERROR", "event_type, organizer_id, participants, scheduled_start, scheduled_end are required.");
  }
  const overlap = await supabase.schema("booking_mcp").from("bookings")
    .select("booking_id").eq("organizer_id", organizerId)
    .lt("scheduled_start", scheduledEnd).gt("scheduled_end", scheduledStart)
    .not("status", "in", '("cancelled","rejected")');
  if (overlap.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if ((overlap.data ?? []).length > 0) {
    return failEnvelope("BOOKING_CONFLICT", `Organizer already has a booking overlapping ${scheduledStart} – ${scheduledEnd}.`);
  }
  const bookingId = generateId();
  const { error } = await supabase.schema("booking_mcp").from("bookings").insert({
    booking_id: bookingId, event_type: eventType,
    listing_id: args.listing_id ? String(args.listing_id) : null,
    order_id: args.order_id ? String(args.order_id) : null,
    organizer_id: organizerId, participants,
    location: (args.location ?? null) as Record<string, unknown> | null,
    scheduled_start: scheduledStart, scheduled_end: scheduledEnd,
    timezone: args.timezone ? String(args.timezone) : "America/Toronto",
    status: "pending", created_at: now(), updated_at: now(),
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "booking.booking.created", {
    booking_id: bookingId, event_type: eventType, organizer_id: organizerId,
  });
  return okEnvelope({ booking_id: bookingId, status: "pending" });
}

async function updateBookingStatus({ args }: ToolRequest) {
  const supabase = serviceClient();
  const bookingId = String(args.booking_id ?? "");
  const status = String(args.status ?? "");
  if (!bookingId || !status) return failEnvelope("VALIDATION_ERROR", "booking_id and status are required.");
  const update: Record<string, unknown> = { status, updated_at: now() };
  if (status === "cancelled") {
    update.cancellation_reason = args.cancellation_reason ? String(args.cancellation_reason) : null;
    update.cancelled_by = args.cancelled_by ? String(args.cancelled_by) : null;
    update.cancelled_at = now();
  }
  const { error } = await supabase.schema("booking_mcp").from("bookings").update(update).eq("booking_id", bookingId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "booking.booking.status_changed", { booking_id: bookingId, status });
  return okEnvelope({ booking_id: bookingId, status });
}

async function listUserBookings({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const { data, error } = await supabase.schema("booking_mcp").from("bookings")
    .select("*").eq("organizer_id", userId).order("scheduled_start", { ascending: true });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ bookings: data ?? [], total: (data ?? []).length });
}

async function getAvailableSlots({ args }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = args.listing_id ? String(args.listing_id) : "";
  let organizerId = args.organizer_id ? String(args.organizer_id) : "";
  const days = Math.min(Math.max(Number(args.days ?? 7), 1), 30);
  const slotMinutes = Math.min(Math.max(Number(args.slot_minutes ?? 60), 15), 240);
  if (!organizerId && listingId) {
    const listing = await supabase.schema("listing_mcp").from("listings").select("seller_id").eq("listing_id", listingId).maybeSingle();
    if (listing.error) return failEnvelope("DB_ERROR", "Database operation failed");
    organizerId = listing.data?.seller_id ? String(listing.data.seller_id) : "";
  }
  if (!organizerId) return failEnvelope("VALIDATION_ERROR", "organizer_id or listing_id (with a seller) is required.");

  const availability = await supabase.schema("booking_mcp").from("availability")
    .select("day_of_week,start_time,end_time,timezone").eq("user_id", organizerId);
  if (availability.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const windows = (availability.data ?? []) as Array<{ day_of_week: number; start_time: string; end_time: string }>;
  if (windows.length === 0) return okEnvelope({ slots: [] });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const horizon = new Date(startOfToday);
  horizon.setDate(horizon.getDate() + days);

  const existing = await supabase.schema("booking_mcp").from("bookings")
    .select("scheduled_start,scheduled_end,status")
    .eq("organizer_id", organizerId)
    .gte("scheduled_start", startOfToday.toISOString())
    .lt("scheduled_start", horizon.toISOString())
    .not("status", "in", '("cancelled","rejected")');
  if (existing.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const bookedRanges = (existing.data ?? []).map((b: Record<string, unknown>) => ({
    start: new Date(String(b.scheduled_start)).getTime(),
    end: new Date(String(b.scheduled_end)).getTime(),
  }));

  function parseHM(t: string): { h: number; m: number } | null {
    const m = /^(\d{1,2}):(\d{2})/.exec(t);
    if (!m) return null;
    return { h: Number(m[1]), m: Number(m[2]) };
  }

  const slots: Array<Record<string, unknown>> = [];
  for (let d = 0; d < days; d++) {
    const dt = new Date(startOfToday);
    dt.setDate(dt.getDate() + d);
    const dow = dt.getDay();
    const dayWindows = windows.filter((w) => Number(w.day_of_week) === dow);
    for (const w of dayWindows) {
      const startHM = parseHM(String(w.start_time));
      const endHM = parseHM(String(w.end_time));
      if (!startHM || !endHM) continue;
      const startMin = startHM.h * 60 + startHM.m;
      const endMin = endHM.h * 60 + endHM.m;
      for (let cur = startMin; cur + slotMinutes <= endMin; cur += slotMinutes) {
        const slotStart = new Date(dt);
        slotStart.setHours(0, cur, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60_000);
        if (slotStart.getTime() < Date.now()) continue;
        const overlaps = bookedRanges.some((r) => r.start < slotEnd.getTime() && r.end > slotStart.getTime());
        slots.push({
          slot_id: `${organizerId}:${slotStart.toISOString()}`,
          date: slotStart.toISOString().slice(0, 10),
          time: slotStart.toISOString().slice(11, 16),
          available: !overlaps,
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        });
      }
    }
  }
  return okEnvelope({ slots });
}

async function enqueueReminder({ args }: ToolRequest) {
  const supabase = serviceClient();
  const bookingId = String(args.booking_id ?? "");
  const minutesBefore = Number(args.minutes_before ?? 0);
  if (!bookingId || minutesBefore <= 0) return failEnvelope("VALIDATION_ERROR", "booking_id and minutes_before>0 are required.");
  await emitEvent(supabase, SOURCE, "booking.reminder.enqueued", {
    booking_id: bookingId, minutes_before: minutesBefore,
  });
  return okEnvelope({ booking_id: bookingId, minutes_before: minutesBefore });
}

Deno.serve(serveDomain({
  ping,
  set_availability: setAvailability,
  create_booking: createBooking,
  update_booking_status: updateBookingStatus,
  list_user_bookings: listUserBookings,
  get_available_slots: getAvailableSlots,
  enqueue_reminder: enqueueReminder,
}));
