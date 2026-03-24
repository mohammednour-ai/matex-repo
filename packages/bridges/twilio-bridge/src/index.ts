import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "twilio-bridge";
const SERVER_VERSION = "0.1.0";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const isLive = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);

async function twilioPost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params).toString();
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}${path}`, {
    method: "POST",
    headers: {
      "authorization": `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return (await response.json()) as Record<string, unknown>;
}

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, live: isLive, ...data }) }] };
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "send_sms", description: "Send SMS via Twilio", inputSchema: { type: "object", properties: { to: { type: "string" }, body: { type: "string" } }, required: ["to", "body"] } },
    { name: "send_otp", description: "Send OTP code via Twilio SMS", inputSchema: { type: "object", properties: { to: { type: "string" }, code: { type: "string" } }, required: ["to", "code"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return ok({ status: "ok", server: SERVER_NAME, mode: isLive ? "live" : "stub" });
  }

  if (tool === "send_sms") {
    const to = String(args.to ?? "");
    const body = String(args.body ?? "");
    if (isLive) {
      const result = await twilioPost("/Messages.json", { To: to, From: TWILIO_PHONE_NUMBER!, Body: body });
      return ok({ message_sid: result.sid, to, status: result.status });
    }
    return ok({ message_sid: `SM_stub_${Date.now()}`, to, status: "queued" });
  }

  if (tool === "send_otp") {
    const to = String(args.to ?? "");
    const code = String(args.code ?? "");
    const body = `Your Matex verification code is: ${code}. Expires in 10 minutes.`;
    if (isLive) {
      const result = await twilioPost("/Messages.json", { To: to, From: TWILIO_PHONE_NUMBER!, Body: body });
      return ok({ message_sid: result.sid, to, status: result.status, otp_sent: true });
    }
    return ok({ message_sid: `SM_otp_stub_${Date.now()}`, to, status: "queued", otp_sent: true });
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started (${isLive ? "LIVE" : "STUB"} mode)`);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal`, error);
  process.exit(1);
});
