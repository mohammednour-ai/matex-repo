// Edge↔MCP parity check. Runs identical {tool, args} envelopes against both
// transports and diffs the response after stripping volatile fields.
//
//   tsx scripts/parity-check.ts                 # all domains
//   tsx scripts/parity-check.ts --domain=escrow # single domain
//
// Required env:
//   NEXT_PUBLIC_SUPABASE_URL    edge transport base
//   MCP_GATEWAY_URL             gateway transport base
//   PARITY_TEST_TOKEN           Supabase access token (any logged-in user)
//   PARITY_TEST_USER_ID         the same user's id (used by fixtures)
// Optional:
//   ESCROW_RW=1                 enable mutating fixtures (create/release flows)

import { runAll, type ParityConfig, type ParityFixture, type ParityResult } from "./parity/runner.ts";
import { escrowFixtures } from "./parity/fixtures/escrow.ts";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[parity] missing required env: ${name}`);
    process.exit(2);
  }
  return v;
}

function parseDomain(): string | null {
  const arg = process.argv.find((a) => a.startsWith("--domain="));
  return arg ? arg.slice("--domain=".length) : null;
}

interface DomainSpec {
  name: string;
  fixtures: (env: { userId: string; rw: boolean }) => ParityFixture[];
  rw: boolean;
}

const DOMAINS: DomainSpec[] = [
  { name: "escrow", fixtures: escrowFixtures, rw: process.env.ESCROW_RW === "1" },
  // listing, search, orders, payments fixtures wire in once Plan C smoke is green.
];

async function main(): Promise<void> {
  const cfg: ParityConfig = {
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, ""),
    mcpGatewayUrl: requireEnv("MCP_GATEWAY_URL").replace(/\/$/, ""),
    token: requireEnv("PARITY_TEST_TOKEN"),
  };
  const userId = requireEnv("PARITY_TEST_USER_ID");
  const only = parseDomain();
  const targets = only ? DOMAINS.filter((d) => d.name === only) : DOMAINS;
  if (targets.length === 0) {
    console.error(`[parity] no domain matched --domain=${only}`);
    process.exit(2);
  }

  let pass = 0;
  let fail = 0;
  const failures: ParityResult[] = [];
  for (const d of targets) {
    const fixtures = d.fixtures({ userId, rw: d.rw });
    console.log(`\n[parity] ${d.name} — ${fixtures.length} fixtures`);
    const results = await runAll(cfg, fixtures);
    for (const r of results) {
      if (r.pass) {
        pass++;
        console.log(`  ✓ ${r.fixture}`);
      } else {
        fail++;
        failures.push(r);
        console.log(`  ✗ ${r.fixture}\n    ${r.detail?.replace(/\n/g, "\n    ")}`);
      }
    }
  }
  console.log(`\n[parity] ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[parity] fatal:", err);
  process.exit(1);
});
