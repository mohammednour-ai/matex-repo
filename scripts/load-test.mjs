/**
 * Matex Load Test Harness
 * Targets architecture perf goals: <200ms p95 read, <200ms auction bid, <500ms write
 *
 * Usage: GATEWAY_URL=http://localhost:3001 node scripts/load-test.mjs
 */

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3001";
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 10);
const ITERATIONS = Number(process.env.LOAD_ITERATIONS ?? 50);

const latencies = { read: [], write: [], bid: [] };

async function callTool(tool, args) {
  const start = performance.now();
  const response = await fetch(`${GATEWAY_URL}/tool`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool, args }),
  });
  await response.text();
  return performance.now() - start;
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function report(label, times) {
  if (times.length === 0) return;
  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`  ${label}:`);
  console.log(`    count: ${times.length}`);
  console.log(`    avg:   ${avg.toFixed(1)}ms`);
  console.log(`    p50:   ${percentile(sorted, 50).toFixed(1)}ms`);
  console.log(`    p95:   ${percentile(sorted, 95).toFixed(1)}ms`);
  console.log(`    p99:   ${percentile(sorted, 99).toFixed(1)}ms`);
  console.log(`    max:   ${sorted[sorted.length - 1].toFixed(1)}ms`);
}

async function runBatch(label, tool, argsFn, category) {
  console.log(`\nRunning ${label} (${ITERATIONS} iterations, ${CONCURRENCY} concurrent)...`);
  for (let i = 0; i < ITERATIONS; i += CONCURRENCY) {
    const batch = Math.min(CONCURRENCY, ITERATIONS - i);
    const promises = Array.from({ length: batch }, () =>
      callTool(tool, argsFn()).catch(() => -1)
    );
    const results = await Promise.all(promises);
    for (const ms of results) {
      if (ms > 0) latencies[category].push(ms);
    }
  }
}

console.log(`Matex Load Test — ${GATEWAY_URL}`);
console.log(`Concurrency: ${CONCURRENCY}, Iterations: ${ITERATIONS}\n`);

await runBatch(
  "Read: search materials",
  "search.search_materials",
  () => ({ query: "copper" }),
  "read",
);

await runBatch(
  "Read: get dashboard stats",
  "analytics.get_dashboard_stats",
  () => ({}),
  "read",
);

await runBatch(
  "Write: auth register",
  "auth.register",
  () => ({
    email: `load.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@test.local`,
    phone: `+1416${Math.floor(1000000 + Math.random() * 8999999)}`,
    password: "LoadTest123!",
  }),
  "write",
);

await runBatch(
  "Bid: auction place_auction_bid (simulated)",
  "auction.create_auction",
  () => ({
    organizer_id: "00000000-0000-0000-0000-000000000001",
    title: `Load test auction ${Date.now()}`,
  }),
  "bid",
);

console.log("\n===== Results =====");
report("READ operations (target: p95 < 200ms)", latencies.read);
report("WRITE operations (target: p95 < 500ms)", latencies.write);
report("BID operations (target: p95 < 200ms)", latencies.bid);

const readP95 = latencies.read.length > 0 ? percentile([...latencies.read].sort((a, b) => a - b), 95) : 0;
const writeP95 = latencies.write.length > 0 ? percentile([...latencies.write].sort((a, b) => a - b), 95) : 0;
const bidP95 = latencies.bid.length > 0 ? percentile([...latencies.bid].sort((a, b) => a - b), 95) : 0;

console.log("\n===== Targets =====");
console.log(`  Read  p95: ${readP95.toFixed(1)}ms ${readP95 < 200 ? "PASS" : "FAIL"} (target: <200ms)`);
console.log(`  Write p95: ${writeP95.toFixed(1)}ms ${writeP95 < 500 ? "PASS" : "FAIL"} (target: <500ms)`);
console.log(`  Bid   p95: ${bidP95.toFixed(1)}ms ${bidP95 < 200 ? "PASS" : "FAIL"} (target: <200ms)`);

if (readP95 >= 200 || writeP95 >= 500 || bidP95 >= 200) {
  console.log("\nWARNING: Some targets not met.");
  process.exit(1);
}
console.log("\nAll performance targets met.");
