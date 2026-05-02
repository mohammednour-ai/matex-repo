# Deferred Work — "Next 2 Weeks" Plan

Source plan: `/root/.claude/plans/matex-senior-wise-shore.md` (the senior advisory report's §6 checklist, all 25 items).

This document tracks which items have shipped vs which are intentionally still deferred. **Deferred ≠ dropped.** Each deferred item lists why it was held back and what unblocks it.

## Shipped — round 1 (PR #4)

| ID | Task | Files |
|---|---|---|
| **A1** | Auction error leak hotfix | `apps/mcp-gateway/src/index.ts`, `packages/mcp-servers/auction-mcp/src/index.ts`, `packages/shared/utils/src/index.ts` |
| **A2** | Contract tests for `list_auctions` + sanitizer regression | `packages/mcp-servers/auction-mcp/src/index.test.ts` |
| **A3** | `callTool` error normalization + `(app)/error.tsx` | `apps/web-v2/src/lib/api.ts`, `apps/web-v2/src/app/(app)/error.tsx` |
| **B3** | Feature-flag abstraction (env-var, PostHog swap-in slot) | `apps/web-v2/src/lib/flags.ts` |
| **C1** | Mounted `react-hot-toast` Toaster + `showError` helper | `apps/web-v2/src/components/system/ToastProvider.tsx`, `apps/web-v2/src/lib/toast.ts` |
| **C3** | Orange-on-orange alert → amber palette | `apps/web-v2/tailwind.config.js`, `apps/web-v2/src/app/(app)/dashboard/page.tsx` |
| **G1** / **G3** / **G4** / **D3** | KYB tiers, Trust & Safety, launch order, data residency docs | `docs/*.md` |

## Shipped — round 2 (PR #5)

Production-down fix: `apps/web-v2/src/app/api/health/route.ts`, both `railway.toml` files, `RAILWAY_DEPLOY.md` troubleshooting.

## Shipped — round 3 (this PR)

| ID | Task | Files |
|---|---|---|
| **B1** | Sentry on web-v2 (`@sentry/nextjs`) + gateway (`@sentry/node`); upstream errors captured with `requestId` and PII scrubbing | `apps/web-v2/sentry.{client,server,edge}.config.ts`, `apps/web-v2/instrumentation.ts`, `apps/mcp-gateway/src/index.ts` |
| **B2** | PostHog provider (`posthog-js`) + activation funnel events (`signup_completed`, `email_verified`, `listing_created`, `identify`); EU host default | `apps/web-v2/src/components/system/PostHogProvider.tsx`, `apps/web-v2/src/lib/analytics.ts`, login + listings/create wired |
| **C2** | shadcn-style foundation: `cn()` helper, `Skeleton`, `Sheet` primitive (Radix Dialog + tailwindcss-animate) | `apps/web-v2/src/lib/cn.ts`, `apps/web-v2/src/components/ui/{Skeleton,Sheet}.tsx` |
| **C4** | TanStack Table dual-mode for Listings + CSV export, behind `listings_table_view` flag | `apps/web-v2/src/components/listings/ListingsTable.tsx`, `apps/web-v2/src/app/(app)/listings/page.tsx` |
| **C6** | `KPICardV2` with Tremor `SparkAreaChart` + delta-vs-prev | `apps/web-v2/src/components/ui/KPICardV2.tsx` |
| **D1** | Inngest client + 4 durable functions (auction-end, escrow-release-timer, kyc-poll-status, daily digest) + `/api/inngest` route | `apps/web-v2/src/lib/inngest.ts`, `apps/web-v2/src/app/api/inngest/route.ts` |
| **E** | i18n catalogs (`en.json` + `fr-CA.json`) + `t()` helper + locale detection + storage; behind `bilingual_ui` flag | `apps/web-v2/messages/{en,fr-CA}.json`, `apps/web-v2/src/lib/i18n.ts` |
| **F** | Freightera adapter wired into `carriers-bridge` (synthetic until API granted) | `packages/bridges/carriers-bridge/src/freightera.ts`, `packages/bridges/carriers-bridge/src/index.ts` |

## Shipped — round 4 (UI sprint, PRs #11–#18)

The full C2/C5/C7 UI sprint shipped across seven PRs:

| ID | What | PRs |
|---|---|---|
| **C2 (full migration)** | shadcn primitives (`Button`/`Badge`/`Input`/`Dialog`/`Modal`/`Spinner`) under `components/ui/shadcn/`; Sonner replaces `react-hot-toast`; legacy custom components deleted | #11, #12, #13, #18 |
| **C5** | Mobile-responsive sweep: `CopilotPanel` width capped to viewport, search filter drawer rebuilt on the shared `Sheet` primitive (Radix Dialog under the hood — focus trap + esc handling free) | #18 |
| **C7 (listing-detail)** | Photo lightbox (Radix Dialog), `CertifiedWeightCard` with verification-pending fallback, `InspectionReportSection` with PDF download, LME reference price wired through `Listing.lme_reference_cad_per_mt`, `StickyBidPanel` extracted to first-class component | #15 |
| **C7 (auction console)** | `BidStream` component with newest-first highlight + slide-in animation, `LotProgressBar` with green→amber→red phase escalation and "Going once / Going twice / Sold!" caller labels in the final 10 s, `useBidStream` polling hook (forward-compatible with not-yet-shipped `auction.list_bids` MCP tool) | #17 |

Plus a CI infra fix: `.github/workflows/ci.yml` now triggers on `master` and uses the correct `@matex/web-v2` pnpm filter (#14).

## Shipped — round 5 (backend reference wiring, PRs #19 + #20 + this PR)

| ID | What | Where |
|---|---|---|
| **B1 (extended)** | `initSentry(serverName)` helper in `@matex/utils`; wired into all 24 MCP servers so per-server crashes surface in Sentry tagged with `serverName` | PR #19 |
| **C7 (data plumbing — `auction.list_bids`)** | New `auction-mcp` tool that powers the live bid feed in the auction console; the UI hook from #17 starts surfacing other bidders' bids automatically | PR #19 |
| **D1 (extended)** | `auction.scheduled_end_due` Inngest function now actually closes open lots and creates escrow holds for winners (was a stub). Reference pattern for the other three Inngest functions. New `lib/gateway-server.ts` server-side `callGatewayTool` helper. | PR #20 |
| **B2 (extended — schema + helpers)** | Canonical analytics event registry in `@matex/utils/src/analytics-events.ts`; `serverTrack` / `serverIdentify` helpers using `posthog-node`. Browser client refactored to import the shared types so server + client events stitch via the same names. | this PR |

## Still deferred

| ID | Task | Blocker | Unblock |
|---|---|---|---|
| **B2 (extended — wiring)** | Attach `serverTrack` to actual gateway tool dispatches and `MatexEventBus` subscribers (event-by-event property contracts) | Per-event design pass | Use the example wirings in `server-analytics.ts` doc-block as templates; one event per follow-up PR |
| **D1 (extended — remaining 3)** | Wire `escrow.release_timer`, `kyc.poll_status`, `email.daily_digest` Inngest functions to real MCP side effects (each is a 30-min copy of `auction.scheduled_end_due`) | Per-function MCP contracts settling (escrow timing window, KYC provider polling, notifications-mcp send hook) | Apply the pattern from PR #20 |
| **C7 (data plumbing — remaining)** | `price-mcp` LME / Fastmarkets reference price, certifier upload flow, inspection PDF storage | Backend tools / external API access | UI is forward-compatible — when each backend ships, no frontend change is needed |
| **D2** | Typesense Cloud + `search-mcp` sync on `listing.created` / `listing.updated` | Typesense Cloud node ($80/mo) + cluster + API keys | Provision and add `TYPESENSE_HOST` / `TYPESENSE_API_KEY` |
| **E (full migration)** | Move `apps/web-v2/src/app` under `[locale]` segment, swap to `next-intl`'s `useTranslations`, ship language switcher in top bar | FR-CA legal copy must be reviewed by a Quebec-resident speaker (Bill 96 risk) | Engage QC translator; flip `qc_market_open` only after sign-off |
| **F (full)** | Real Freightera Shipper API (replace synthetic adapter), book + BOL flow | "Select accounts" approval has lead time | Submit Freightera access request now, in parallel |
| **D1 (extended)** | Wire Inngest functions to actual MCP-server side effects (today they're stubbed `step.run` blocks) | Need stable contract with auction-mcp, escrow-mcp, notifications-mcp | After this round merges, wire one event end-to-end as a reference |

## Activation env vars (for this PR)

To turn each feature on in a deployment, set:

| Variable | What it activates |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` (web) + `SENTRY_DSN` (gateway) | B1 — Sentry events flow |
| `NEXT_PUBLIC_POSTHOG_KEY` (+ optional `NEXT_PUBLIC_POSTHOG_HOST`) | B2 — PostHog analytics + funnel events |
| `NEXT_PUBLIC_FLAG_LISTINGS_TABLE_VIEW=1` | C4 — table view on `/listings` |
| `NEXT_PUBLIC_FLAG_BILINGUAL_UI=1` | E — locale picker honors `?lang=fr-CA` |
| `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` | D1 — Inngest dispatches functions |
| `FREIGHTERA_API_KEY` | F — real Freightera quote (synthetic without it) |
| `NEXT_PUBLIC_FLAG_FREIGHT_QUOTE_WIDGET=1` | F — quote widget on listing detail (when added) |

Without these the code paths are dormant; nothing breaks.
