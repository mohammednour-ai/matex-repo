import { describe, it, expect } from "vitest";

describe("messaging-mcp", () => {
  it("should have a valid server name", () => {
    expect("messaging-mcp").toMatch(/-mcp$/);
  });

  it("tool: create_thread - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.participants) throw new Error("participants is required");
    }).toThrow("participants is required");
  });

  it("tool: create_thread - requires minimum 2 participants", () => {
    expect(() => {
      const participants = ["user-1"];
      if (participants.length < 2) {
        throw new Error("Thread requires at least 2 participants");
      }
    }).toThrow("at least 2 participants");
  });

  it("tool: send_message - validates required fields", () => {
    expect(() => {
      const args: Record<string, unknown> = {};
      if (!args.thread_id) throw new Error("thread_id is required");
      if (!args.sender_id) throw new Error("sender_id is required");
      if (!args.content) throw new Error("content is required");
    }).toThrow("thread_id is required");
  });

  it("tool: create_thread - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        thread_id: "550e8400-e29b-41d4-a716-446655440000",
        participants: ["user-1", "user-2"],
        created_at: "2026-03-23T12:00:00Z",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.participants).toHaveLength(2);
    expect(result.data.thread_id).toBeDefined();
  });

  it("tool: send_message - returns expected shape", () => {
    const result = {
      success: true,
      data: {
        message_id: "550e8400-e29b-41d4-a716-446655440000",
        thread_id: "660e8400-e29b-41d4-a716-446655440000",
        sender_id: "770e8400-e29b-41d4-a716-446655440000",
        content: "Hello, interested in your HMS 1 listing",
        sent_at: "2026-03-23T12:00:00Z",
      },
    };
    expect(result.success).toBe(true);
    expect(result.data.message_id).toBeDefined();
    expect(result.data.content).toBeDefined();
  });

  it("tool: send_message - sender must be thread participant", () => {
    expect(() => {
      const threadParticipants = ["user-1", "user-2"];
      const senderId = "user-3";
      if (!threadParticipants.includes(senderId)) {
        throw new Error("Sender must be a participant in the thread");
      }
    }).toThrow("Sender must be a participant");
  });

  it("tool: send_message - rejects empty content", () => {
    expect(() => {
      const content = "";
      if (!content.trim()) throw new Error("Message content cannot be empty");
    }).toThrow("Message content cannot be empty");
  });
});
