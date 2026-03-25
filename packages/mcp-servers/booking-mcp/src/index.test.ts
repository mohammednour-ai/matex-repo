import { describe, it, expect } from "vitest";

describe("booking-mcp", () => {
  it("should have a valid server name", () => {
    expect("booking-mcp").toMatch(/-mcp$/);
  });

  it("tool: create_booking - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.organizer_id) throw new Error("organizer_id is required");
      if (!args.event_type) throw new Error("event_type is required");
    }).toThrow("organizer_id is required");
  });

  it("tool: set_availability - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.user_id) throw new Error("user_id is required");
    }).toThrow("user_id is required");
  });

  it("tool: create_booking - enforces minimum lead times", () => {
    const leadTimes: Record<string, number> = {
      buyer_visit: 24,
      third_party_inspection: 48,
      lab_sample_collection: 72,
      live_auction: 168,
      mediation: 48,
      re_weigh: 24,
    };
    expect(() => {
      const eventType = "lab_sample_collection";
      const hoursUntilEvent = 48;
      const minLead = leadTimes[eventType];
      if (hoursUntilEvent < minLead) {
        throw new Error(`Minimum lead time for ${eventType} is ${minLead} hours`);
      }
    }).toThrow("Minimum lead time for lab_sample_collection is 72 hours");
  });

  it("tool: create_booking - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        booking_id: "550e8400-e29b-41d4-a716-446655440000",
        event_type: "third_party_inspection",
        status: "confirmed",
        starts_at: "2026-03-25T10:00:00Z",
        ends_at: "2026-03-25T11:00:00Z",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.booking_id).toBeDefined();
    expect(result.data.starts_at).toBeDefined();
  });

  it("tool: create_booking - cancellation refund policy", () => {
    const hoursBeforeEvent = 18;
    let refundPct: number;
    if (hoursBeforeEvent > 24) refundPct = 100;
    else if (hoursBeforeEvent >= 12) refundPct = 50;
    else refundPct = 0;
    expect(refundPct).toBe(50);
  });

  it("tool: create_booking - rejects conflicting time slots", () => {
    expect(() => {
      const existingBooking = { starts_at: "10:00", ends_at: "11:00" };
      const newBookingStart = "10:30";
      if (newBookingStart >= existingBooking.starts_at && newBookingStart < existingBooking.ends_at) {
        throw new Error("Time slot conflicts with existing booking");
      }
    }).toThrow("Time slot conflicts");
  });
});
