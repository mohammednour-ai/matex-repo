# P1 / P2 plan — what's left and how I work it

**Lives at:** `docs/audit/2026-05-10/p1-p2-plan.md` (this file)
**Sibling docs:**
- `report.md` — the original 2026-05-10 audit (immutable history)
- `p0-1-stripe-elements-plan.md` — the six-PR Stripe plan (all merged)

This doc tracks everything left after the audit's nine P0 blockers shipped.
Update the **status column** as items merge.

---

## How I work each item

The pattern from the P0 + P1-1 work:

1. **Branch off `master`** — `claude/<item-id>-<slug>`. Stack branches only when one literally depends on another's file changes.
2. **Survey the affected code first** — confirm the audit's framing matches reality. The audit was right about ~80% of items but missed a few (e.g. P1-10 server-gate already existed; P1-1 backend was broken in addition to the form being a placeholder).
3. **Tight scope per PR.** One issue per PR. Defer adjacent fixes to follow-up items in this doc rather than expanding scope mid-PR.
4. **Mirror writes across transports.** When a tool changes, both `packages/mcp-servers/<domain>-mcp/src/index.ts` and `supabase/functions/<domain>/index.ts` get the same edit (the CLAUDE.md parity rule).
5. **Run `pnpm --filter @matex/web-v2 lint` + `pnpm exec tsc --noEmit` + `pnpm exec next build`** before commit.
6. **Commit with a body that explains _why_** (audit ref + observed bug shape + scope + what's NOT in this PR). Push, open PR, link back here.
7. **Stop after the PR is open**, let review happen, then pick the next item.

When a PR uncovers a bigger bug than the audit framed (e.g. broken backend tools under a "just build the form" item), I survey + report the new scope + propose a split before writing more code. P1-1 → A/B/C split was that pattern.

---

## What's left (17 items)

Statuses: ⬜ pending · 🟡 in flight · ✅ merged · ⏸ paused

### Quick wins — S effort, ~50–150 lines each, one PR each

| ID | What | Status | PR |
|---|---|---|---|
| P1-11 | `/logistics` doesn't render `logistics.generate_bol`'s URL after the call; BoL invisible to buyers | ⬜ | — |
| P1-12 | `/logistics/[shipment]` trace page calls `logistics.get_shipment` but throws the response away | ⬜ | — |
| P1-15 | Replace raw `<img>` with `next/image` in `listings/[id]/page.tsx` (4 sites, pre-existing lint warnings) | ⬜ | — |
| P1-16 | Settings page calls `kyc.get_kyc_level` twice on mount; dedupe | ⬜ | — |
| P2-1 | Persist sidebar collapsed state in localStorage | ⬜ | — |
| P2-2 | Confirm dialog before destructive admin ops (freeze/refund/release) | ⬜ | — |
| P2-4 | Sparklines on admin overview KPIs (cards exist; sparkline component exists) | ⬜ | — |
| P2-5 | Period selector + chart on revenue report (currently raw numbers only) | ⬜ | — |
| P2-6 | Inline status dropdown per row in admin orders | ⬜ | — |
| P2-7 | Toast / loading state for inspection discrepancy flag | ⬜ | — |
| P2-8 | Sign-out: surface revoke failure (currently swallowed; PR #50 partly improves this) | ⬜ | — |
| P1-8 | Inspection complete: support pass / conditional / fail (currently boolean) | ⬜ | — |
| P1-9 | Hard-coded `result: pass` in inspections complete handler | ⬜ | — |

### M effort — single PR, more design choice involved

| ID | What | Status | Notes |
|---|---|---|---|
| P1-2 | Replace static Jan–Jun contract fulfillment chart with real history | ⬜ | Needs a `contracts.get_fulfillment_history` tool or a SELECT against `contracts_mcp.contract_orders` |
| P1-3 | Auction lobby Register CTA + download terms PDF | ⬜ | Both have empty handlers today |
| P1-4 | Listing share + report buttons (currently no-op) | ⬜ | Share = native Web Share API + clipboard fallback; report = new `listing.flag_listing` tool |
| P1-5 | Compliance retention checklist: replace hardcoded checks with real DB queries | ⬜ | Each row is a one-line `SELECT count(*) FROM ...` |
| P1-6 | Post-auction "won lots" filter: use `auction.get_winning_bids` instead of client-side filter | ⬜ | Tool exists; UI doesn't call it |
| P1-7 | Auction page: subscribe to Supabase Realtime for live bid stream, drop the 2s polling | ⬜ | `event-relay` app already feeds bids onto a Realtime channel |
| P1-14 | Sentry init verification + per-domain breadcrumbs (folded the deferred Stripe breadcrumbs here) | ⬜ | Sentry configs exist; just need explicit breadcrumbs at PI lifecycle + each tool boundary |
| P2-3 | Filterable audit-trail UI in `/admin` replacing the JSON dump | ⬜ | Table + filter chips by actor / domain / action |
| P2-9 | First-time dashboard onboarding tour | ⬜ | New feature, not a fix |
| P2-10 | Server-rendered dashboard for faster TTFB | ⬜ | Requires moving the 6-tool fan-out to a server component |

### Needs scoping before code

| ID | What | Status | Why |
|---|---|---|---|
| P1-13 | Checkout 4-tool transaction boundary | ⏸ | Partly covered by recent Stripe work (#41 atomic webhook, #43 race fix, #44 reconciliation cron). Needs to be re-scoped against the current shape — the original "5 sequential tool calls can drift" framing is mostly addressed; remaining failure modes are narrow and need fresh design before a tight PR |

### Deferred follow-ups I created during the P0 / P1-1 work

| ID | What | Status | Notes |
|---|---|---|---|
| P0-1 5b | Admin "record manual purchase" card flow | ⬜ | Internal-only, low-traffic; same `<PaymentElement>` pattern as `/checkout` and `/escrow/create` |
| P1-1d | Redesign `evaluate_breach` comparison semantics | ⬜ | TODO flagged in code (PR #49). Move to scheduled-vs-delivered (read `orders_mcp.orders.quantity` via `contract_orders.order_id` FK), drive penalties off `contract_orders.status` instead of whole-contract `total_volume` |
| P1-10b | Full JWT verification on the edge + HttpOnly-only auth | ⬜ | Currently middleware checks cookie presence only; expired/forged tokens get past until the API layer 401s. Needs JWT secret in the edge runtime and login route emitting Set-Cookie directly so the access token never sits in localStorage |

---

## Recommended sequence

Easy wins to keep momentum, then design-heavier items:

1. **P1-11 + P1-12 in one PR** — both logistics-page fixes, same shape (tool returns real data, UI throws it away). ~50–80 lines, immediately user-visible.
2. **P1-15 + P1-16 in one PR** — perf cleanups, knock out pre-existing lint warnings at the same time.
3. **P1-8 + P1-9 in one PR** — inspection result is currently hardcoded `pass`; supporting pass / conditional / fail is one schema-aware refactor.
4. **P1-5 retention checklist** — compliance page; visible to operators and regulators.
5. **P1-4 listing share + report** — small but two unrelated features; could split.
6. **P1-3 auction lobby register + PDF** — needs an `auction.register_for_lobby` tool that may not exist yet; survey first.
7. **P1-14 Sentry breadcrumbs** — observability cross-cuts everything; landing this after the above means more code instrumented.
8. **P1-7 Realtime bid stream** — switches polling to Supabase Realtime; design choice on backpressure / reconnect.
9. **P1-2 contract fulfillment chart** — needs the contracts surface that PR #47–#49 already shipped.
10. **P1-6 won-lots filter** — small but depends on knowing what `auction.get_winning_bids` returns; survey first.
11. **P2 items** — polish; pick after P1 is clean.
12. **P1-13 checkout transaction boundary** — open the re-scoping conversation once everything around it is settled.
13. **The three deferred follow-ups (5b / 1d / 10b)** — pick when convenient; none blocking.

Stop after every PR. Re-confirm direction if any survey turns up a bigger problem than expected (the P1-1 split was the model — survey, report, propose split, then code).

---

## Operating notes

- This doc lives at `docs/audit/2026-05-10/p1-p2-plan.md`; commit to keep it under git.
- Update statuses inline when PRs land. Add new follow-up items as a row in the relevant section instead of as comments — keeps the doc the single source of truth.
- If the audit framing turns out wrong on an item (as it did for P1-10), record the corrected scope here, not just in the PR body.
