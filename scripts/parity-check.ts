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
import { storageFixtures } from "./parity/fixtures/storage.ts";
import { logFixtures } from "./parity/fixtures/log.ts";
import { profileFixtures } from "./parity/fixtures/profile.ts";
import { taxFixtures } from "./parity/fixtures/tax.ts";
import { analyticsFixtures } from "./parity/fixtures/analytics.ts";
import { biddingFixtures } from "./parity/fixtures/bidding.ts";
import { auctionFixtures } from "./parity/fixtures/auction.ts";
import { bookingFixtures } from "./parity/fixtures/booking.ts";
import { inspectionFixtures } from "./parity/fixtures/inspection.ts";
import { contractsFixtures } from "./parity/fixtures/contracts.ts";
import { disputeFixtures } from "./parity/fixtures/dispute.ts";
import { pricingFixtures } from "./parity/fixtures/pricing.ts";
import { creditFixtures } from "./parity/fixtures/credit.ts";
import { messagingFixtures } from "./parity/fixtures/messaging.ts";
import { kycFixtures } from "./parity/fixtures/kyc.ts";
import { logisticsFixtures } from "./parity/fixtures/logistics.ts";
import { notificationsFixtures } from "./parity/fixtures/notifications.ts";
import { esignFixtures } from "./parity/fixtures/esign.ts";
import { adminFixtures } from "./parity/fixtures/admin.ts";
import { listingFixtures } from "./parity/fixtures/listing.ts";
import { searchFixtures } from "./parity/fixtures/search.ts";
import { ordersFixtures } from "./parity/fixtures/orders.ts";
import { paymentsFixtures } from "./parity/fixtures/payments.ts";

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
  { name: "storage", fixtures: storageFixtures, rw: false },
  { name: "log", fixtures: logFixtures, rw: false },
  { name: "profile", fixtures: profileFixtures, rw: false },
  { name: "tax", fixtures: taxFixtures, rw: false },
  { name: "analytics", fixtures: analyticsFixtures, rw: false },
  { name: "bidding", fixtures: biddingFixtures, rw: false },
  { name: "auction", fixtures: auctionFixtures, rw: false },
  { name: "booking", fixtures: bookingFixtures, rw: false },
  { name: "inspection", fixtures: inspectionFixtures, rw: false },
  { name: "contracts", fixtures: contractsFixtures, rw: false },
  { name: "dispute", fixtures: disputeFixtures, rw: false },
  { name: "pricing", fixtures: pricingFixtures, rw: false },
  { name: "credit", fixtures: creditFixtures, rw: false },
  { name: "messaging", fixtures: messagingFixtures, rw: false },
  { name: "kyc", fixtures: kycFixtures, rw: false },
  { name: "logistics", fixtures: logisticsFixtures, rw: false },
  { name: "notifications", fixtures: notificationsFixtures, rw: false },
  { name: "esign", fixtures: esignFixtures, rw: false },
  { name: "admin", fixtures: adminFixtures, rw: false },
  { name: "listing", fixtures: listingFixtures, rw: false },
  { name: "search", fixtures: searchFixtures, rw: false },
  { name: "orders", fixtures: ordersFixtures, rw: false },
  { name: "payments", fixtures: paymentsFixtures, rw: false },
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
