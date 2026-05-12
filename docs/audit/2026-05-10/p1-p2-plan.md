# P1 / P2 plan — what's left and how I work it

**Lives at:** `docs/audit/2026-05-10/p1-p2-plan.md` (this file)
**Sibling docs:**
- `report.md` — the original 2026-05-10 audit (immutable history)
- `p0-1-stripe-elements-plan.md` — the six-PR Stripe plan (all merged)

This doc tracks everything left after the audit's nine P0 blockers shipped.
Status column reflects the latest PR state; doc is the source of truth.

---

## How I work each item

The pattern from the P0 + P1-1 work:

1. **Branch off `master`** — `claude/<item-id>-<slug>`. Stack branches only when one literally depends on another's file changes.
2. **Survey the affected code first** — confirm the audit's framing matches reality. The audit was right about ~80% of items but missed a few (e.g. P1-10 server-gate already existed; P1-1 backend was broken in addition to the form being a placeholder).
3. **Tight scope per PR.** One issue per PR. Defer adjacent fixes to follow-up items in this doc rather than expanding scope mid-PR.
4. **Mirror writes across transports.** When a tool changes, both `packages/mcp-servers/<domain>-mcp/src/index.ts` and `supabase/functions/<domain>/index.ts` get the same edit (the CLAUDE.md parity rule).
5. **Run `pnpm --filter @matex/web-v2 lint` + `pnpm exec tsc --noEmit` + `pnpm exec next build`** before commit.
6. **Commit with a body that explains _why_** (audit ref + observed bug shape + scope + what's NOT in this PR). Push, open PR, link back here.

When a PR uncovers a bigger bug than the audit framed (e.g. broken backend tools under a "just build the form" item), I survey + report the new scope + propose a split before writing more code. P1-1 → A/B/C split was that pattern.

---

## P1 items

| ID | What | Status | PR |
|---|---|---|---|
| P1-1 | Real /contracts/create form | ✅ shipped | #47 (backend), #48 (form) |
| P1-1c | generate_order + evaluate_breach column fixes | ✅ shipped | #49 |
| P1-2 | Real contract fulfillment chart | 🟡 open | #62 |
| P1-3 | Auction lobby Register CTA + terms PDF | 🟡 open | #58 |
| P1-4 | Listing share + report | 🟡 open | #57 |
| P1-5 | Compliance retention real DB queries | ✅ shipped | #55 |
| P1-6 | Won lots — per-user real data | 🟡 open | #63 |
| P1-7 | Bid stream tighter poll (Option A only) | 🟡 open / partial | #61 — full push tracked as P1-7b |
| P1-8 | Inspection pass / conditional / fail | ✅ shipped | #54 |
| P1-9 | Hardcoded `result:pass` removed | ✅ shipped | bundled in #54 |
| P1-10 | Server-side auth gate (gap fixes) | 🟡 open / partial | #50 — full edge JWT verify tracked as P1-10b |
| P1-11 | BoL number rendered + DB column | ✅ shipped | #52 |
| P1-12 | get_shipment response applied | ✅ shipped | bundled in #52 |
| P1-13 | Checkout 4-tool transaction boundary | ✅ closed | See "Closed without code" below |
| P1-14 | Sentry init + per-domain breadcrumbs | 🟡 open | #59 |
| P1-15 | listings detail `<img>` → next/image | ✅ shipped | #53 |
| P1-16 | Settings dedupe `kyc.get_kyc_level` | ✅ shipped | bundled in #53 |

### P1-13 — closed without code

The audit framed this as "Add transaction boundary to checkout 4-tool flow". Survey after the Stripe work concluded the original concern is now covered end-to-end:

| Original concern | Where it's addressed |
|---|---|
| Order created, payment fails halfway | `payments.create_payment_intent` (PR #39) inserts the transaction row before calling Stripe, so a Stripe failure leaves an auditable `failed` transaction. The original order stays in the matching status. |
| Payment confirmed, escrow not transitioned | Stripe webhook (PR #41) atomically updates both `transactions.status='completed'` AND `escrows.status='funds_held'` inside a single Postgres transaction with idempotent guards. |
| Escrow created AFTER webhook (race) | `escrow.create_escrow` (PR #43) reads any settled transaction for the order and auto-opens `status='funds_held'` instead of `'created'`. |
| Lost webhook | Reconciliation cron (PR #44) runs every 15 minutes against stuck `pending_capture` rows and resolves them from Stripe. |
| Wallet/credit/interac never completed | `payments.process_payment` (PR #46) is now method-aware and writes the right terminal status per method, with atomic wallet debit. |

The narrow remaining drift case is **invoice generation fails AFTER payment confirmed** (PR #35's flow surfaces the error, but the transaction is already `completed` so we land in a half-state). Adding the invoice-issue retry to the reconciliation cron is a small follow-up — tracked as **P1-13b**.

## P2 items

| ID | What | Status | PR |
|---|---|---|---|
| P2-1 | Persist sidebar collapsed state | 🟡 open | #64 |
| P2-2 | Admin destructive-op confirm dialog | 🟡 open | #66 |
| P2-3 | Filterable audit-trail UI in `/admin` | ⬜ | — |
| P2-4 | Sparklines on admin overview KPIs | ⬜ | — |
| P2-5 | Period selector + chart on revenue report | ⬜ | — |
| P2-6 | Inline status dropdown per row in admin orders | ⬜ | — |
| P2-7 | Toast / loading for inspection discrepancy flag | ⬜ | — |
| P2-8 | Sign out: surface revoke failure | ⬜ | partly improved in #50 |
| P2-9 | First-time dashboard onboarding tour | ⬜ | — |
| P2-10 | Server-rendered dashboard for faster TTFB | ⬜ | — |

## Deferred follow-ups created during the work

| ID | What | Status | Notes |
|---|---|---|---|
| P0-1 5b | Admin "record manual purchase" card flow | ⬜ | Internal-only, low-traffic; same `<PaymentElement>` pattern as `/checkout` and `/escrow/create` |
| P1-1d | Redesign `evaluate_breach` comparison semantics | ⬜ | TODO flagged in code (PR #49). Move to scheduled-vs-delivered (read `orders_mcp.orders.quantity` via `contract_orders.order_id` FK), drive penalties off `contract_orders.status` |
| P1-7b | Real push bid stream via SSE + Redis | ⬜ | L effort. New `/api/auctions/[id]/bid-stream` Next route subscribes to `event-relay` Redis stream, uses matex JWT for auth (no Supabase Auth bridge) |
| P1-10b | Full JWT verification on the edge + HttpOnly-only auth | ⬜ | Currently middleware checks cookie presence only; expired/forged tokens get past until the API layer 401s. Needs JWT secret in the edge runtime and login route emitting Set-Cookie directly |
| P1-13b | Retry tax.generate_invoice in the reconciliation cron when payment is `completed` but no invoice exists | ⬜ | Smallest of the four; narrow drift case. ~30 lines extending PR #44's cron loop |

---

## Operating notes

- Update statuses inline when PRs land. Add new follow-up items as a row in the relevant section, not comments — keeps the doc the single source of truth.
- If the audit framing turns out wrong on an item (as it did for P1-10 and P1-7), record the corrected scope here, not just in the PR body.
- Doc lives in git; commit refreshes when the state changes materially.
