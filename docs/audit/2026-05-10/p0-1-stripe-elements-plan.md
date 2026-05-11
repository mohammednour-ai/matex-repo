# P0-1 — Stripe Elements wiring plan

**Status:** Draft for review · no code changes yet
**Refs:** `docs/audit/2026-05-10/report.md` (P0-1, OI-3), `.cursor/rules/matex-financial.mdc`, `.cursor/rules/matex-bridges.mdc`
**Audience:** the engineer (or me, in a future session) executing this work

## 1. Goal

Replace every "Stripe Elements — Card input (placeholder)" surface in `apps/web-v2` with a real, server-confirmed PaymentIntent flow that is observably correct end-to-end:

- The card the buyer types into is collected by Stripe.js — the form value never reaches Matex servers (PCI scope stays with Stripe).
- The payment is allocated **server-side** via a PaymentIntent before any card collection; the client only confirms.
- A `payments_mcp.transactions` row is the durable record of the payment; its `status` transitions are driven by the Stripe webhook, not by client-side optimism.
- Once a transaction reaches `completed`, the order's escrow gets funded automatically (event-driven, not client-driven).
- Failures (declined card, network drop mid-confirm, 3DS abort) leave the system in a recoverable state — no orphaned escrows, no orphaned PaymentIntents, no double charges.

## 2. Non-goals (explicit)

These are real things, but **not in scope** for P0-1. Track them separately.

- **Stripe Connect seller onboarding & payout.** `STRIPE_CONNECT_CLIENT_ID` is in env templates; the `stripe-bridge.create_transfer` tool exists. Wiring sellers onto Connect is its own multi-PR effort.
- **Saved payment methods / SetupIntents.** Phase 1 = one-shot `card` payments only. The existing `payments_mcp.payment_methods` table already exists for the future SetupIntent flow.
- **Apple Pay / Google Pay / Link.** Stripe's Payment Element supports these, but turn them on only after the Card Element flow is solid.
- **Dispute / chargeback handling.** Out of scope; existing dispute-mcp covers the manual workflow.
- **Refunds UI.** `stripe-bridge.create_refund` exists; refunds today route through admin escrow refund. Real refund UX can come later.

## 3. What's already built (do not redo)

| Component | Path | State |
|---|---|---|
| Stripe HTTP bridge | `packages/bridges/stripe-bridge/src/index.ts` | Stub-mode + live-mode `create_payment_intent`, `confirm_payment`, `create_refund`, `create_transfer`. Not yet called by anyone. |
| Webhook endpoint | `apps/web-v2/src/app/api/stripe/webhook/route.ts` | Signature-verified, updates `payments_mcp.transactions.status='completed'` on `payment_intent.succeeded`. Reads `pi.metadata.transaction_id`. |
| Env templates | `.env.example`, `.env.local.example`, `.env.production.example` | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID` already declared. |
| Payments tools | `packages/mcp-servers/payments-mcp` + `supabase/functions/payments` | `process_payment` exists but doesn't talk to Stripe — currently records a "completed" transaction the moment the client calls it. This is the core lie we're replacing. |

So the work is **integration**, not greenfield. We are adding two new tools, one new env var, one new component, and re-pointing three existing pages.

## 4. Architecture decision

> **Where does PaymentIntent allocation live?**

**Decision: a new `payments.create_payment_intent` tool**, in both transports (`payments-mcp` MCP server and `supabase/functions/payments`). It calls `stripe-bridge.create_payment_intent` for the actual Stripe RPC and writes the `payments_mcp.transactions` row in `pending` status with the PaymentIntent ID and metadata. Returns `{ transaction_id, payment_intent_id, client_secret, amount }` to the caller.

Why not just call the bridge from the gateway?
- The bridge has no DB access — we still need a `transactions` row to correlate via the webhook.
- payments-mcp owns the audit envelope (every tool call audited via log-mcp) and the actor=user check for mutating tools (`packages/mcp-servers/payments-mcp/src/index.ts:94`). Going around it would skip both.

Why not extend `process_payment` instead of adding a new tool?
- `process_payment` is currently the "I clicked Pay" terminal action; for cards it now needs to be split into "allocate" (server) + "confirm" (client) + "settle" (webhook). Reusing the name muddles the state machine. New tool, clean contract.

`process_payment` for `wallet` and `credit` payment methods stays as-is — those don't need Stripe.

### State machine

```
client                  payments-mcp                      stripe              webhook
──────                  ─────────────                     ──────              ───────
                                                                            
[Pay clicked]
   │
   │── create_payment_intent ──▶ INSERT transaction(pending)
   │                              ▲                                                
   │                              │
   │                              ├──── stripe.create_payment_intent ──▶  [stripe creates PI]
   │                              │                                          │
   │                              │  metadata.transaction_id ◀──── return ──┤
   │                              │                                          
   │                              UPDATE transaction.payment_intent_id
   │
   │ ◀── { client_secret, transaction_id }
   │
[Stripe.js
  confirmCardPayment(client_secret, card)]
   │                                                       
   │ ─────────────────────────────────────────────────▶ [stripe charges card]
   │                                                       │
   │ ◀── pi.status: succeeded | requires_action | failed ──┘
   │                                                                 │
[show success / 3DS / error UI]                                       │
                                                                       │
                                          payment_intent.succeeded ────┤
                                                                       │
                            handler updates transaction.status ◀───────┘
                            = completed, emits
                            payments.transaction.completed event
                                              │
                                              ▼
                            escrow-mcp consumes event, calls hold_funds
                            (or skips if escrow already at funds_held)
```

The buyer sees "payment processing" until either Stripe.js returns `succeeded` (UI flips to `step 3`) **or** the webhook lands and a polling/realtime check observes `transaction.status === 'completed'`. The webhook is the source of truth. The Stripe.js client response is a hint.

## 5. Files we will touch (per PR)

### PR 1 — env, deps, provider scaffold

- `apps/web-v2/package.json` — add `@stripe/stripe-js` + `@stripe/react-stripe-js`.
- `.env.example`, `.env.local.example`, `.env.production.example` — add **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** (the existing `STRIPE_PUBLISHABLE_KEY` is server-side only; the `NEXT_PUBLIC_` form is needed for the client bundle).
- `apps/web-v2/src/lib/stripe.ts` — `loadStripeClient()` singleton wrapping `loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)`. Returns null in dev when the key is missing — the UI must degrade visibly rather than crashing.
- `apps/web-v2/src/components/payments/StripeProvider.tsx` — `<Elements stripe={loadStripeClient()} options={{ clientSecret }}>` wrapper. Accepts `clientSecret` as a prop and only mounts when present.

No backend changes in this PR. The smoke test is just "checkout still loads, no console errors, the placeholder card box is unchanged".

### PR 2 — `payments.create_payment_intent` tool

- `packages/mcp-servers/payments-mcp/src/index.ts` — add `create_payment_intent` to the tool list and handler. Required args: `{ user_id, actor_id, amount, currency?, order_id, escrow_id? }`. Calls `stripe-bridge.create_payment_intent` via the existing internal MCP-call convention, inserts a `transactions` row with `status='pending'`, returns `{ transaction_id, payment_intent_id, client_secret, amount }`.
- `supabase/functions/payments/index.ts` — same tool, edge parity. Uses the bridge via HTTP fetch (same pattern as other edge functions calling bridges; see how `escrow.create_escrow` already does this).
- `apps/web-v2/src/lib/api.ts` — add `payments.create_payment_intent` to `TOOLS_ON_EDGE` once the edge handler is deployed (do this in a tiny follow-up commit on the same PR or a chained PR).
- **Idempotency:** pass `Idempotency-Key: payments-pi-<order_id>-<retry_count>` to Stripe, derived server-side from the order ID + a per-order retry counter, so refresh + click does not double-create.
- The `transactions.payment_intent_id` column doesn't exist yet — add it via a migration in this PR. Probably `payment_intent_id TEXT`, indexed for the webhook lookup.

### PR 3 — Card Element on `/checkout`

- `apps/web-v2/src/app/(app)/checkout/page.tsx` — when `paymentMethod === "card"`:
  1. On step-2 "Pay" click, call `payments.create_payment_intent`. Get back `client_secret`.
  2. Mount `<StripeProvider clientSecret={client_secret}>` wrapping a new `<CardCheckoutForm>` that uses `useStripe()` + `useElements()`.
  3. Form's submit handler calls `stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement, billing_details: { name, email } } })`.
  4. Branch on result.status:
     - `succeeded` → optimistically advance to step 3 with the transaction_id; trust the webhook to settle.
     - `requires_action` → Stripe.js handles 3DS automatically (the SDK does the redirect/iframe). On return, re-check status.
     - any error → show inline error from `result.error.message`; transaction stays `pending` server-side and will be auto-cancelled by Stripe after 24h, plus a server cleanup job we'll need eventually (out of scope for P0-1).
  5. Replace the existing `payments.process_payment` call for `card` with this flow. `wallet` and `credit` keep the existing call.
  6. Replace the placeholder div at line 212 (`Stripe Elements — Card input (placeholder)`) with `<CardElement>`.

The "Continue to Payment" / "Pay" disabled-flag logic added in PR #35 stays — it gates on tax loaded; we just add card-form-valid as another precondition.

### PR 4 — Webhook hardening + escrow event handoff

- `apps/web-v2/src/app/api/stripe/webhook/route.ts`:
  - Make the `transaction.status='completed'` update **idempotent**: skip if status is already `completed` or `failed`. This matters because Stripe retries webhooks with at-least-once semantics.
  - Handle `payment_intent.payment_failed` → set status `failed`, store `last_payment_error` on metadata.
  - After the transaction update, **emit `payments.transaction.completed` on Redis Streams** so downstream consumers (escrow-mcp) can react.
- `packages/mcp-servers/escrow-mcp/src/index.ts`:
  - Add a consumer-group subscription on `payments.transaction.completed`. Body has `{ transaction_id, order_id, amount, escrow_id }`. If the order has an escrow in `created` state, transition it to `funds_held` (this is what `process_payment` lies about doing today). Idempotent.
- The webhook MUST run before the buyer sees the success step in production. The Stripe.js result is a hint; the canonical source is the DB row updated by the webhook. UI can poll the transaction's status until completed (existing realtime infra via Supabase Realtime is already in the codebase — see `apps/event-relay/`).

### PR 5 — `/escrow/create` + `/admin` parity

- `apps/web-v2/src/app/(app)/escrow/create/page.tsx`:
  - Same Card Element treatment for the "Fund Escrow" flow. The escrow_id is known up front (page param), so PaymentIntent metadata includes both `transaction_id` AND `escrow_id`.
- `apps/web-v2/src/app/(app)/admin/page.tsx`:
  - Currently `payments.process_payment` is called from the Purchases tab to "record a manual purchase". For card, route through `create_payment_intent`. For other methods, leave alone. This is admin-only and lower-traffic, so do it last.

### PR 6 — Edge cases + observability

- Surface the `requires_action` branch correctly. Stripe.js mostly handles it but there are edge cases (popup-blocked 3DS, network loss mid-action). Add a "We're verifying with your bank…" intermediate state.
- Add a server-side reconciliation cron (Supabase Edge Function on a schedule, or a manual admin tool) that lists `transactions` with `status='pending' AND created_at < NOW() - INTERVAL '15 minutes'` and queries Stripe for the actual `pi.status`. This catches lost webhooks.
- Sentry breadcrumbs for: PI created, confirm submitted, confirm result received, webhook received. The existing `instrumentation.ts` already wires Sentry for the app.

## 6. Open questions to resolve before PR 1

1. **Stripe API version.** The bridge currently posts to bare `/v1/...` paths without a version pin in `Stripe-Version` header — that pins to the account's default version. We should set an explicit `Stripe-Version: 2024-11-20.acacia` (or whatever is current at execution time) in `stripe-bridge` so a Stripe-side version bump doesn't silently change behaviour.
2. **PaymentIntent metadata limits.** Stripe allows 50 keys, 500-char values, 8000-char total. We're storing `transaction_id`, `order_id`, `escrow_id`, `buyer_id`, `seller_id` — all UUIDs, well under the limit. No issue, just documenting the constraint.
3. **Currency.** Bridge defaults to CAD. Confirm at decision time we're not accidentally serving a US-NE pilot user (Phase 3 per `apps/web-v2/src/lib/flags.ts`) — the flags say Phase 3 is gated, so CAD is safe today, but the new tool should accept currency as an arg.
4. **Per-PR test mode.** Stripe test cards (`4242 4242 4242 4242`) work as long as the bridge runs with a test secret key. CI doesn't have a key — so the bridge's stub mode (fires `pi_stub_<ts>`) is what CI sees. Need to ensure the new tool's tests don't depend on real Stripe responses.
5. **Webhook URL in dev.** `apps/web-v2/src/app/api/stripe/webhook/route.ts` is a Next.js route, so locally it's `http://localhost:3002/api/stripe/webhook`. For Stripe to call it during dev work, either use `stripe listen --forward-to http://localhost:3002/api/stripe/webhook` (Stripe CLI) or stub the webhook in tests.
6. **Confirm via `stripe.confirmCardPayment` (deprecated path) vs `stripe.confirmPayment` with the unified Payment Element.** The newer API is `confirmPayment` + `<PaymentElement>` instead of `confirmCardPayment` + `<CardElement>`. Payment Element auto-supports Apple/Google Pay, saved cards, etc. — but our non-goals say one-shot card only. Either is fine; recommend `<PaymentElement>` for futureproofing, but `<CardElement>` is simpler if we want a faster PR 3.
7. **Failure UX during webhook delay.** If the Stripe.js confirm returns `succeeded` but the webhook hasn't landed yet (typical: 100–500ms delay; pathological: minutes), we either: (a) show success eagerly and rely on retries; (b) show a "settling…" spinner until the DB transaction flips to `completed`. (b) is more honest but slows the happy path. Recommend (a) with a polling fallback that surfaces a banner if completion takes > 30s.

## 7. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Card collected but PaymentIntent never confirmed (network drop after `confirmCardPayment` was sent but before response) | Medium | Funds may be captured without UI knowing | Reconciliation job (PR 6) + webhook is source of truth |
| Webhook signature secret misconfigured in prod → all PIs hang in pending | Low | High — checkouts silently fail to settle | Healthcheck pings `/api/stripe/webhook` with a valid test event in CI; surface the existing webhook 400 ("stripe_webhook_not_configured") to ops alerting |
| Idempotency key collision between two real (legitimate) retries | Low | Stripe returns the original PI; user might think it didn't go through | Encode `transaction_id` (server-allocated) into the key — different transactions never collide |
| `STRIPE_SECRET_KEY` leaked into the client bundle | Critical | Catastrophic | Code review + `pnpm build && grep -r 'sk_live' apps/web-v2/.next/` in CI to fail the build if the secret-key prefix appears in any client artifact |
| Sandbox testing leaks into production: a `pk_test_` key shipping with a `live` mode webhook | Medium | Webhooks come from live, intents come from test; total mismatch | Validate at boot: if `STRIPE_SECRET_KEY` starts with `sk_live_`, `STRIPE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` MUST start with `pk_live_`. Refuse to start otherwise |

## 8. Migration / rollout

1. Land PR 1–2 to staging. Manual test with `stripe listen` + a test card.
2. Land PR 3 behind a feature flag (`stripe_card_checkout`, default false). Real users still see the placeholder.
3. Internal QA + Sentry watch for a week. Test with all of Stripe's test card scenarios (success, declined, 3DS-required, expired).
4. Flip the flag to true for staging, then prod. Keep the flag for a release cycle as a kill switch.
5. PR 4–6 follow once PR 3 is live.

## 9. What "done" looks like

- A buyer types `4242 4242 4242 4242` into the `/checkout` step-2 form. They see a success step 3 within ~2 seconds.
- `payments_mcp.transactions` has one row with `status='completed'` and a `payment_intent_id` matching what shows up in the Stripe dashboard.
- `escrow_mcp.escrows` for that order shows `status='funds_held'`, written by the `payments.transaction.completed` event consumer, **not** by a client-side call.
- A buyer types `4000 0000 0000 0002` (Stripe's "card declined" test). They see an inline "Your card was declined" message. The transaction row exists in `pending` state and will be cleaned up by reconciliation. No order, no escrow.
- A buyer closes the tab right after typing card details. Stripe shows the PI as `requires_payment_method` and it auto-cancels after 24h. Our reconciliation marks the transaction `failed` after 15 minutes.
- The `/api/stripe/webhook` endpoint, hit twice with the same `payment_intent.succeeded` event ID, produces exactly one transaction status transition.

## 10. Estimate

Wall-clock, single engineer, including review & merge cycles:

- PR 1: half-day
- PR 2: 1 day (new tool + edge parity + migration + bridge wiring)
- PR 3: 1.5 days (Card Element + state machine + tests with stub mode)
- PR 4: 1 day (idempotent webhook + escrow consumer)
- PR 5: half-day
- PR 6: 1 day (reconciliation cron + edge cases)

**Total: ~5–6 days end-to-end**, with PRs 1–4 being the critical path to a real card flow on `/checkout` and PRs 5–6 being polish/parity.
