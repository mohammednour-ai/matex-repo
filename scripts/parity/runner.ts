// Sends the same {tool, args} envelope to both the edge function and the MCP
// gateway, normalises volatile fields, and reports diffs. Used by
// scripts/parity-check.ts; CI runs after deploy as a regression gate.

import { diff } from "./normalise.ts";

export interface ParityFixture {
  name: string;
  tool: string; // "<domain>.<tool>" — split on dot for edge URL
  args: Record<string, unknown>;
  // Optional: when true, expect both transports to return success=false. We
  // still diff the error code/message via the same normalisation pass.
  expectError?: boolean;
}

export interface ParityConfig {
  supabaseUrl: string;
  mcpGatewayUrl: string;
  token: string;
}

interface Envelope {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

async function callEdge(cfg: ParityConfig, tool: string, args: Record<string, unknown>): Promise<Envelope> {
  const [domain, ...rest] = tool.split(".");
  const toolName = rest.join(".");
  const res = await fetch(`${cfg.supabaseUrl}/functions/v1/${domain}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ tool: toolName, args }),
  });
  return (await res.json()) as Envelope;
}

async function callMcp(cfg: ParityConfig, tool: string, args: Record<string, unknown>): Promise<Envelope> {
  // MCP gateway exposes /tool with bearer header (apps/mcp-gateway).
  const res = await fetch(`${cfg.mcpGatewayUrl}/tool`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ tool, args }),
  });
  return (await res.json()) as Envelope;
}

export interface ParityResult {
  fixture: string;
  tool: string;
  pass: boolean;
  detail?: string;
}

export async function runFixture(cfg: ParityConfig, fx: ParityFixture): Promise<ParityResult> {
  let edge: Envelope, mcp: Envelope;
  try {
    [edge, mcp] = await Promise.all([callEdge(cfg, fx.tool, fx.args), callMcp(cfg, fx.tool, fx.args)]);
  } catch (err) {
    return { fixture: fx.name, tool: fx.tool, pass: false, detail: `transport error: ${(err as Error).message}` };
  }

  if (edge.success !== mcp.success) {
    return {
      fixture: fx.name,
      tool: fx.tool,
      pass: false,
      detail: `success mismatch: edge=${edge.success} mcp=${mcp.success}\nedge=${JSON.stringify(edge)}\nmcp=${JSON.stringify(mcp)}`,
    };
  }
  if (fx.expectError && edge.success) {
    return { fixture: fx.name, tool: fx.tool, pass: false, detail: "expected error envelope, got success" };
  }

  // For success: diff data. For error: diff code (messages may legitimately
  // differ between transports because the gateway sanitises upstream text).
  if (edge.success) {
    const d = diff(edge.data, mcp.data);
    return d.equal ? { fixture: fx.name, tool: fx.tool, pass: true } : { fixture: fx.name, tool: fx.tool, pass: false, detail: d.reason };
  }
  if (edge.error?.code !== mcp.error?.code) {
    return {
      fixture: fx.name,
      tool: fx.tool,
      pass: false,
      detail: `error code mismatch: edge=${edge.error?.code} mcp=${mcp.error?.code}`,
    };
  }
  return { fixture: fx.name, tool: fx.tool, pass: true };
}

export async function runAll(cfg: ParityConfig, fixtures: ParityFixture[]): Promise<ParityResult[]> {
  // Sequential so resource-creating fixtures can feed ids into later ones via
  // a shared context object. (Caller-supplied fixtures handle the chaining.)
  const results: ParityResult[] = [];
  for (const fx of fixtures) results.push(await runFixture(cfg, fx));
  return results;
}
