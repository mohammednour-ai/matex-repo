# Deferred Work — "Next 2 Weeks" Plan

Source plan: `/root/.claude/plans/matex-senior-wise-shore.md` (the senior advisory report's §6 checklist, all 25 items).

This document tracks which items shipped in the initial PR vs which are intentionally deferred. **Deferred ≠ dropped.** Each deferred item lists why it was held back and what unblocks it.

## Shipped

| ID | Task | Files |
|---|---|---|
| **A1** | Auction error leak hotfix: implement `list_auctions` + `get_auction` in `auction-mcp`; gateway-level upstream-error sanitizer; `requestId` threading | `apps/mcp-gateway/src/index.ts`, `packages/mcp-servers/auction-mcp/src/index.ts`, `packages/shared/utils/src/index.ts` |
| **A2** | Contract tests for `list_auctions` response shape + regression tests for `sanitizeUpstreamError` | `packages/mcp-servers/auction-mcp/src/index.test.ts` |
| **A3** | `callTool` sanitizes upstream errors; route-segment `error.tsx` for `(app)` group | `apps/web-v2/src/lib/api.ts`, `apps/web-v2/src/app/(app)/error.tsx` |
| **B3** | Feature-flag abstraction with env-var backing (PostHog swap-in slot prepared) | `apps/web-v2/src/lib/flags.ts` |
| **C1** | Mount existing `react-hot-toast` Toaster + typed `showError` / `showSuccess` helpers; wire auctions page | `apps/web-v2/src/app/layout.tsx`, `apps/web-v2/src/components/system/ToastProvider.tsx`, `apps/web-v2/src/lib/toast.ts`, `apps/web-v2/src/app/(app)/auctions/page.tsx` |
| **C3** | Orange-on-orange alert fix: extend `warning` palette to 200/800; repoint "Complete verification" alert | `apps/web-v2/tailwind.config.js`, `apps/web-v2/src/app/(app)/dashboard/page.tsx` |
| **G1** | KYB tier definitions doc | `docs/kyb-tiers.md` |
| **G3** | Trust & Safety promise doc | `docs/trust-and-safety.md` |
| **G4** | Launch order (province + US state phasing) doc | `docs/launch-order.md` |
| **D3** | Data-residency / PIPEDA / Law 25 doc (Supabase region verification on the checklist) | `docs/data-residency.md` |

## Deferred (with reasons)

Each of these requires either a vendor account/credential, a non-trivial dependency install with its own QA cycle, or human translation work — none of which can be reliably executed inside a single dev-session bound by sandbox network access.

| ID | Task | Blocker | Unblock |
|---|---|---|---|
| **B1** | Sentry across `web-v2`, gateway, and MCP servers | DSN credential + `@sentry/nextjs` install | Create Sentry org, add DSN to env, run `npx @sentry/wizard` |
| **B2** | PostHog + activation-funnel instrumentation | API key + `posthog-js` / `posthog-node` install | Create PostHog project (EU host), add `NEXT_PUBLIC_POSTHOG_KEY` |
| **C2 (shadcn migration)** | shadcn/ui foundation — `Skeleton`, `Sonner`, `Sheet`, `DataTable`, `Dialog` | `pnpm dlx shadcn@latest init` adds many transitive deps | Approve dependency PR; existing custom components remain in place |
| **C2 (empty-state pass)** | Action-oriented empty states with illustrations on dashboard / listings / search / auctions | The four pages already use a `<EmptyState />` component (`apps/web-v2/src/components/ui/EmptyState.tsx`) but copy + illustrations need a design pass | Design + product copy pass |
| **C4** | Listings dual-mode (cards ⇄ TanStack Table) with CSV export | `@tanstack/react-table` install + DataTable component | Approve dependency PR |
| **C5** | Mobile audit on 4 primary pages at 375 / 768 / 1280 | Manual QA on a real preview deployment | Push branch and open Vercel preview |
| **C6** | KPI cards v2 with sparkline + delta vs prior period | `@tremor/react` install | Approve dependency PR |
| **C7** | Listing-detail confidence stack + auction console redesign | Larger UX scope; depends on `@react-pdf/renderer` (PDFs), Metals-API key, design assets | Schedule a dedicated UX sprint |
| **D1** | Inngest durable functions (auction end, escrow timer, KYC poll, daily digest) | `inngest` SDK install + Inngest Cloud account or self-host | Approve account; run signing-key setup |
| **D2** | Typesense Cloud + `search-mcp` sync on `listing.created` / `listing.updated` | Typesense Cloud node ($80/mo) + `typesense` SDK install | Provision cluster; add API keys |
| **E** | `next-intl` scaffolding + EN / FR-CA messages | `next-intl` install; FR-CA legal copy must be reviewed by a Quebec-resident speaker (Bill 96 risk) | Approve install; engage QC translator |
| **F** | Freightera Shipper API adapter in `carriers-bridge` + quote widget | Freightera "select accounts" approval has a real lead time (advisory called this critical-path) | Submit access request immediately, parallel to other work |

## How to pick this up

1. Approve a dependency-add PR for Sentry, PostHog, shadcn primitives, and TanStack Table together — they share a shared QA cycle and unblock C2/C4/C6 in one go.
2. Open vendor accounts in parallel: Sentry (free), PostHog (free up to 1M events), Inngest (free starter), Typesense Cloud ($80/mo), Freightera (request access with a real lead time).
3. Engage a Quebec-resident translator for the FR-CA review on `next-intl` — block QC market opening behind `qc_market_open` until that review lands.
4. Schedule the C7 (listing detail + auction console) sprint as a dedicated 1-week UX block; it has design dependencies the engineering checklist cannot satisfy on its own.
