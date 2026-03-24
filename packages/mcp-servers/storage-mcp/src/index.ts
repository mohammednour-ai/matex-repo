/**
 * MATEX storage-mcp (Phase 0 foundation implementation)
 *
 * Initial tools:
 * - generate_signed_upload_url
 * - generate_signed_download_url
 * - ping
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { now, sha256 } from "@matex/utils";

const SERVER_NAME = "storage-mcp";
const SERVER_VERSION = "0.1.0";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "matex-files";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(`[${SERVER_NAME}] Supabase credentials not configured. Signed URL tools will fail until env is set.`);
}

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_signed_upload_url",
      description: "Generate signed upload URL for a storage path",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          bucket: { type: "string" },
        },
        required: ["path"],
      },
    },
    {
      name: "generate_signed_download_url",
      description: "Generate signed download URL for a storage path",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          bucket: { type: "string" },
          expires_in: { type: "number" },
        },
        required: ["path"],
      },
    },
    {
      name: "ping",
      description: "Health check",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }),
        },
      ],
    };
  }

  if (!supabase) {
    return {
      isError: true,
      content: [{ type: "text", text: "Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." }],
    };
  }

  const bucket = String(args.bucket ?? DEFAULT_BUCKET);
  const path = String(args.path ?? "");
  if (!path) {
    return { isError: true, content: [{ type: "text", text: "Missing required 'path' argument." }] };
  }

  if (tool === "generate_signed_upload_url") {
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) {
      return {
        isError: true,
        content: [{ type: "text", text: `Failed to generate upload URL: ${error?.message ?? "unknown error"}` }],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            bucket,
            path,
            token: data.token,
            signed_url: data.signedUrl,
            file_hash_hint: sha256(path),
          }),
        },
      ],
    };
  }

  if (tool === "generate_signed_download_url") {
    const expiresIn = typeof args.expires_in === "number" ? Math.max(60, Math.floor(args.expires_in)) : 60 * 30;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data) {
      return {
        isError: true,
        content: [{ type: "text", text: `Failed to generate download URL: ${error?.message ?? "unknown error"}` }],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            bucket,
            path,
            expires_in: expiresIn,
            signed_url: data.signedUrl,
          }),
        },
      ],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${tool}` }],
  };
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
