# QA checklist — release readiness

Smoke-test sheet for the recent PR sequence (#9 → #21). Run top-to-bottom on the Railway-deployed `matex-web` and gateway. Items marked **(blocked)** depend on backend/external prerequisites tracked in `deferred-work.md`.

---

## 0. Deploy plumbing

- [ ] `matex-web` Railway service: **Settings → Source → Root Directory** is empty (monorepo root)
- [ ] `matex-web` Railway service: **Settings → Config-as-Code File** = `apps/web-v2/railway.toml`
- [ ] `matex-web` Railway service: **Settings → Variables** has no `PORT` override
- [ ] Latest deploy log shows the `▲ Next.js 14.2.35` banner with a port number
- [ ] `https://matex-web.up.railway.app/api/health` returns `{ status: "ok", service: "matex-web" }`
- [ ] `https://matex-web.up.railway.app/login` renders without JS errors in the console

## 1. UI primitives — shadcn migration (#11–#13, #18)

- [ ] No console errors mentioning `react-hot-toast` (it was deleted)
- [ ] Submit a form with a known error → toast appears top-right with rounded card + close button (Sonner)
- [ ] Open a modal (e.g. **/messages → New Message Thread**) → opens, esc closes, click backdrop closes
- [ ] On `/settings`: input fields show label + hint + error visuals identical to pre-migration
- [ ] Hover any primary button → shadow + colour transition matches the legacy look (variants: primary/secondary/accent/danger/ghost preserved)

## 2. Listing-detail redesign (#15)

- [ ] Open any listing detail
- [ ] Click main photo → lightbox opens at `max-w-5xl`, black backdrop, prev/next arrows work, esc closes
- [ ] Right rail shows **StickyBidPanel** at the top — price + countdown + CTA
- [ ] Scroll the left column → right rail sticks; CTA always visible
- [ ] Find a listing without `certified_weight_kg` → `CertifiedWeightCard` shows "Weight verification pending" with declared quantity
- [ ] Find a listing without `inspection_report_url` → `InspectionReportSection` renders the placeholder text
- [ ] Find a listing with neither LME ref price nor certs → `ConfidenceStack` still renders all six rows with "missing" indicators

## 3. Auction console (#17 + #19)

- [ ] Join a **scheduled** auction → lobby view with countdown to start
- [ ] Join a **live** auction → top bar pulses red dot; participant count + auction-end CountdownTimer visible
- [ ] **LotProgressBar** shows green when >25% time remains, amber at >75% elapsed, red in last 60s
- [ ] In the final 10s of a lot → bar pulses + caller label cycles "Going once / Going twice / Sold!"
- [ ] Place a bid as user A → bid appears in the right rail with **You** badge
- [ ] From a second browser as user B, place a bid → **within 5 s** it appears in user A's feed (proves `auction.list_bids` poll wiring)
- [ ] Headline price + bid count tick up after each bid (proves `get_auction` poll)

## 4. CI infra (#14)

- [ ] Open a throwaway PR against `master` → CI fires automatically (proves trigger fix)
- [ ] `Web E2E Happy Path` job uses `pnpm --filter @matex/web-v2` and finds the workspace

## 5. Sentry per MCP server (#19)

- [ ] `SENTRY_DSN` env var set in Railway for both `matex-web` and the gateway service
- [ ] Trigger a deliberate validation error (e.g. `place_auction_bid` with `amount: 0`)
- [ ] Sentry Issues tab shows the event tagged `serverName: auction-mcp` (not just gateway)
- [ ] Stop `SENTRY_DSN` → confirm services boot cleanly with no log spam (no-op path)

## 6. Inngest auction-end (#20) — **(blocked on Inngest signing key)**

- [ ] `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` set in Railway env
- [ ] In the Inngest dashboard, manually trigger `auction.scheduled_end_due` with `{ auction_id: "<test>" }`
- [ ] Run history shows steps `list-open-lots`, `close-lot-<id>` (one per lot), `create-escrow-<id>` (only for sold lots)
- [ ] DB after run: open lots transition to `sold`/`unsold`; new `escrows` rows exist with `order_id = "auction-<lot_id>"`
- [ ] Re-trigger the same event → step memoization kicks in, no duplicates

## 7. Server-side PostHog (#21) — **(blocked on POSTHOG_API_KEY)**

- [ ] `POSTHOG_API_KEY` (and optional `POSTHOG_HOST`) set in Railway env for both gateway and any server that emits
- [ ] From a Node REPL on the gateway: `import { serverTrack, serverAnalyticsShutdown } from "@matex/utils"; serverTrack("escrow_released", "test-user", { escrow_id: "x", amount_cents: 1000 }); await serverAnalyticsShutdown();`
- [ ] Event appears in PostHog with `distinct_id: test-user` and the right properties
- [ ] Confirm the same `distinct_id` matches the value the browser-side `identify()` is sending (so server + client events stitch into one user)

## 8. Mobile (#18) — manual sweep

Device targets: 375 × 667 (iPhone SE), 768 × 1024 (iPad portrait), 1280 × 800 (laptop).

- [ ] All three viewports: top nav doesn't horizontal-scroll
- [ ] 375 px: Copilot panel sits inside the viewport with a 1 rem inset on right + bottom
- [ ] 375 px: `/search` → tap "Filters" → drawer slides in from right via `Sheet` (focus trapped, esc closes)
- [ ] 375 px: tables on `/logistics`, `/contracts`, `/inspections` scroll horizontally inside their card (don't overflow page)
- [ ] 768 px: listing-detail two-column layout collapses to single column, sticky panel appears between gallery and trust signals

## 9. Forward-compatible items (no action — confirms graceful degradation)

- [ ] Without `SENTRY_DSN`: app boots, no Sentry events, no errors
- [ ] Without `POSTHOG_API_KEY`: server-side analytics no-op silently
- [ ] Without `NEXT_PUBLIC_POSTHOG_KEY`: browser analytics no-op silently
- [ ] Without `INNGEST_SIGNING_KEY`: `/api/inngest` mounts, functions never fire (Inngest platform won't dispatch)
- [ ] Without `MCP_GATEWAY_URL`: server-side `callGatewayTool` falls back to `localhost:3001`, returns a friendly `GATEWAY_UNREACHABLE` message
- [ ] Listings without LME reference price still render (ConfidenceStack shows "soft" placeholder)

---

## Sign-off

- [ ] All sections 0–5 + 8 pass on the Railway preview
- [ ] Sections 6 + 7 pass once the corresponding env vars are provisioned
- [ ] Owner: ____________________  Date: __________
