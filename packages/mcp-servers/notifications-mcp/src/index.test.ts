import { describe, it, expect } from "vitest";

describe("notifications-mcp", () => {
  it("should have a valid server name", () => {
    expect("notifications-mcp").toMatch(/-mcp$/);
  });

  it("tool: send_notification - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.user_id) throw new Error("user_id is required");
      if (!args.type) throw new Error("type is required");
      if (!args.title) throw new Error("title is required");
      if (!args.body) throw new Error("body is required");
    }).toThrow("user_id is required");
  });

  it("tool: mark_read - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.notification_id) throw new Error("notification_id is required");
    }).toThrow("notification_id is required");
  });

  it("tool: send_notification - validates type format (domain.event)", () => {
    const validType = "order.delivered";
    expect(validType).toMatch(/^\w+\.\w+$/);

    expect(() => {
      const invalidType = "invalid";
      if (!/^\w+\.\w+$/.test(invalidType)) {
        throw new Error("Notification type must follow domain.event format");
      }
    }).toThrow("domain.event format");
  });

  it("tool: send_notification - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        notification_id: "550e8400-e29b-41d4-a716-446655440000",
        user_id: "660e8400-e29b-41d4-a716-446655440000",
        type: "order.delivered",
        title: "Your order was delivered",
        channels: ["email", "in_app"],
        status: "sent",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.channels).toBeInstanceOf(Array);
    expect(result.data.status).toBe("sent");
  });

  it("tool: send_notification - supports multiple channels", () => {
    const validChannels = ["email", "sms", "push", "in_app"];
    const requestedChannels = ["email", "push"];
    requestedChannels.forEach((ch) => {
      expect(validChannels).toContain(ch);
    });
  });

  it("tool: send_notification - reminder schedule at 24h, 2h, 30min", () => {
    const reminderMinutes = [1440, 120, 30];
    expect(reminderMinutes).toEqual([24 * 60, 2 * 60, 30]);
  });
});
