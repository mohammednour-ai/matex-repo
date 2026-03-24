import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";

const SERVER_NAME = "fcm-bridge";
const SERVER_VERSION = "0.1.0";

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "send_push", description: "Send push notification to a device (stub)", inputSchema: { type: "object", properties: { device_token: { type: "string" }, title: { type: "string" }, body: { type: "string" }, data: { type: "object" } }, required: ["device_token", "title", "body"] } },
    { name: "send_to_topic", description: "Send push notification to a topic (stub)", inputSchema: { type: "object", properties: { topic: { type: "string" }, title: { type: "string" }, body: { type: "string" }, data: { type: "object" } }, required: ["topic", "title", "body"] } },
    { name: "subscribe_to_topic", description: "Subscribe device tokens to a topic (stub)", inputSchema: { type: "object", properties: { topic: { type: "string" }, device_tokens: { type: "array", items: { type: "string" } } }, required: ["topic", "device_tokens"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, status: "ok", server: SERVER_NAME, version: SERVER_VERSION }) }] };
  }

  if (tool === "send_push") {
    const deviceToken = String(args.device_token ?? "");
    if (!deviceToken) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "device_token is required." } }) }] };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message_id: randomUUID(),
          status: "sent",
          device_token: deviceToken,
        }),
      }],
    };
  }

  if (tool === "send_to_topic") {
    const topic = String(args.topic ?? "");
    if (!topic) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "topic is required." } }) }] };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          message_id: randomUUID(),
          status: "sent",
          topic,
        }),
      }],
    };
  }

  if (tool === "subscribe_to_topic") {
    const topic = String(args.topic ?? "");
    const deviceTokens = args.device_tokens as string[] | undefined;
    if (!topic || !deviceTokens || deviceTokens.length === 0) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "topic and device_tokens (non-empty) are required." } }) }] };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          topic,
          subscribed_count: deviceTokens.length,
          status: "subscribed",
        }),
      }],
    };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal`, error);
  process.exit(1);
});
