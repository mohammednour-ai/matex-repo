import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "sendgrid-bridge";
const SERVER_VERSION = "0.1.0";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? "noreply@matex.ca";
const SENDGRID_API = "https://api.sendgrid.com/v3";
const isLive = Boolean(SENDGRID_API_KEY);

async function sgPost(path: string, body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetch(`${SENDGRID_API}${path}`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${SENDGRID_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const status = response.status;
  let data: Record<string, unknown> = {};
  try { data = (await response.json()) as Record<string, unknown>; } catch {}
  return { status, data };
}

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, live: isLive, ...data }) }] };
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "send_email", description: "Send email via SendGrid", inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] } },
    { name: "send_template_email", description: "Send template email via SendGrid", inputSchema: { type: "object", properties: { to: { type: "string" }, template_id: { type: "string" }, dynamic_data: { type: "object" } }, required: ["to", "template_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return ok({ status: "ok", server: SERVER_NAME, mode: isLive ? "live" : "stub" });
  }

  if (tool === "send_email") {
    const to = String(args.to ?? "");
    const subject = String(args.subject ?? "");
    const body = String(args.body ?? "");
    if (isLive) {
      const result = await sgPost("/mail/send", {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: SENDGRID_FROM_EMAIL },
        subject,
        content: [{ type: "text/plain", value: body }],
      });
      return ok({ sent: result.status === 202, status_code: result.status, to });
    }
    return ok({ sent: true, message_id: `sg_stub_${Date.now()}`, to, subject });
  }

  if (tool === "send_template_email") {
    const to = String(args.to ?? "");
    const templateId = String(args.template_id ?? "");
    if (isLive) {
      const result = await sgPost("/mail/send", {
        personalizations: [{ to: [{ email: to }], dynamic_template_data: args.dynamic_data ?? {} }],
        from: { email: SENDGRID_FROM_EMAIL },
        template_id: templateId,
      });
      return ok({ sent: result.status === 202, status_code: result.status, to, template_id: templateId });
    }
    return ok({ sent: true, message_id: `sg_tmpl_stub_${Date.now()}`, to, template_id: templateId });
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
