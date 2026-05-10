# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project identity

Matex is a Canadian B2B marketplace for scrap materials and surplus inventory, built on an **MCP-First architecture**: every business capability is an MCP server, every external integration is a bridge, and every interaction is a tool call. Stack: pnpm monorepo · TypeScript 5.4 · Next.js 14 (App Router) · Supabase (PostgreSQL 15 + PostGIS + Edge Functions) · Redis (Upstash) · Stripe Connect.

Two companion documents must be read alongside this file:
- `AGENTS.md` — repo-specific implementation rules (image slot contract, MCP envelope, data flow, routing, editing discipline). The MCP envelope rules in `AGENTS.md` are enforced in code review; do not deviate.
- `.cursor/rules/matex-*.mdc` — 11 domain rule files (architecture, mcp-servers, bridges, database, financial, security, operations, infrastructure, typescript, testing, canadian-compliance). Treat these as authoritative; CLAUDE.md only summarises.

## Repository layout

```
apps/
  web/                          legacy Next.js frontend (deprecated; do not extend)
  web-v2/                       active Next.js 14 frontend (App Router) — port 3002
  mcp-gateway/                  Node MCP gateway (auth, routing, rate limiting) — port 3001
  mobile/                       React Native + Expo app
  event-relay/                  Redis Streams → Supabase Realtime relay
packages/
  mcp-servers/<domain>-mcp/     24 local MCP servers (one per business domain)
  bridges/<vendor>-bridge/      13 external service bridges
  shared/types/                 @matex/types — branded IDs, row types
  shared/utils/                 @matex/utils
  shared/logic/                 cross-cutting business logic shared by MCP + Edge
  shared/mcp-template/          scaffold for new MCP servers
  shared/mcp-http-adapter/      HTTP transport adapter for legacy MCP servers
infrastructure/supabase/        canonical SQL migrations + seed data
supabase/                       Supabase project root: edge functions + migrations
  functions/<domain>/           per-domain Deno edge function (mirrors MCP server tools)
  functions/_shared/            edge handler.ts, auth.ts, db.ts, events.ts
  migrations/                   migrations applied to remote Supabase
docs/                           system-analysis, architecture, milestones, database, design, test-cases
scripts/                        seed, smoke, parity, env validation, MCP tools manifest
.github/workflows/              ci.yml, db-migrate.yml, functions-deploy.yml, railway-setup.yml
```

The pnpm workspace globs (`pnpm-workspace.yaml`) cover `apps/*`, `packages/mcp-servers/*`, `packages/bridges/*`, `packages/shared/*`.

## Common commands

Always use `pnpm` (≥8) and Node ≥20. Most workflows go through workspace filters.

```bash
pnpm install                              # install all workspace deps

# Development
pnpm dev                                  # @matex/web (legacy) only
pnpm dev:gateway                          # MCP gateway on :3001
pnpm dev:web-v2-stack                     # gateway + web-v2 (parallel) — preferred
pnpm dev:db-stack                         # gateway + web-v2 via concurrently with named output
pnpm dev:db-stack:legacy                  # add http-adapters for unmigrated MCP servers
pnpm dev:http-adapters                    # start HTTP adapters (legacy MCP transport)
pnpm dev:all                              # every package's dev script in parallel

# Build / quality
pnpm build                                # recursive build
pnpm lint                                 # recursive lint
pnpm typecheck                            # recursive tsc --noEmit
pnpm --filter @matex/web-v2 lint          # ALWAYS run after edits in apps/web-v2

# Database (Supabase)
pnpm db:migrate                           # supabase db push
pnpm db:reset                             # supabase db reset (DROPS DB)
pnpm db:seed                              # supabase db seed
pnpm db:seed:xlsx                         # seed from matex_seed_data.xlsx

# Smoke / parity / health
pnpm smoke                                # phase 1–4 DB smoke tests in sequence
pnpm smoke:phase1                         # individual phase smoke
pnpm test:parity                          # tsx scripts/parity-check.ts (MCP vs Edge parity)
pnpm healthcheck                          # scripts/health-check.mjs
pnpm validate-env                         # scripts/validate-env.mjs
pnpm load-test                            # scripts/load-test.mjs
pnpm mcp:tools-manifest                   # extract registered MCP tools to manifest

# E2E (apps/web-v2)
pnpm --filter @matex/web-v2 test:smoke        # <30s smoke (used as quick check)
pnpm --filter @matex/web-v2 test:e2e          # all Playwright projects (uses next dev)
pnpm --filter @matex/web-v2 test:e2e:ci       # build + next start, then all projects (CI mode)
pnpm --filter @matex/web-v2 test:functional   # functional suite only
pnpm --filter @matex/web-v2 test:regression   # regression suite
pnpm --filter @matex/web-v2 test:api          # API tests (no browser)
pnpm --filter @matex/web-v2 test:uiux         # design system + a11y
pnpm --filter @matex/web-v2 test:compliance   # Canadian compliance checks
pnpm --filter @matex/web-v2 test:legacy       # root e2e/happy-path.spec.ts only
pnpm --filter @matex/web-v2 test:report       # generate report from test-results/results.json

# Single Playwright test
pnpm --filter @matex/web-v2 exec playwright test e2e/functional/auth.spec.ts -g "AUTH-01"
PLAYWRIGHT_SKIP_WEBSERVER=1 pnpm --filter @matex/web-v2 exec playwright test ...   # reuse running server
PLAYWRIGHT_WEBSERVER=start pnpm --filter @matex/web-v2 exec playwright test ...    # force prod build path
```

The CI gate (`.github/workflows/ci.yml`) runs `pnpm --filter @matex/web-v2 lint` then `test:e2e:ci`. PRs are blocked on either failure.

## Big-picture architecture

### Four layers
1. **Clients** — `apps/web-v2` (Next.js SSR), `apps/mobile` (Expo, offline-first via WatermelonDB), AI agents direct to gateway.
2. **MCP Gateway** (`apps/mcp-gateway`) — JWT validation, rate limiting, request routing. Exposes `POST /tool` accepting `{tool, args}` with `Authorization: Bearer <jwt>`.
3. **MCP servers + bridges** — 24 local servers in `packages/mcp-servers/*-mcp` plus 13 bridges in `packages/bridges/*-bridge`. Each server owns exactly one Postgres schema named `<domain>_mcp`; cross-server data access is via tool calls, never direct SQL. Server registry and inter-server dependency map: `.cursor/rules/matex-architecture.mdc`.
4. **Infrastructure** — Supabase Postgres, Upstash Redis (event bus + cache), Supabase Storage, S3 archive (logs ≥7 days old).

### Dual transport: MCP gateway vs Supabase Edge

This is the most important runtime detail and the source of most confusion. Tools can run on either transport:

- **Path A (legacy / AI surface):** browser → `apps/web-v2/src/app/api/mcp/route.ts` → MCP gateway (`apps/mcp-gateway`) → MCP server.
- **Path B (edge-migrated):** browser → `supabase/functions/<domain>` (Deno) directly. Same `{tool, args}` envelope; same response shape.

Membership of a tool in **`TOOLS_ON_EDGE`** in `apps/web-v2/src/lib/api.ts` flips transport from A to B. `callTool(tool, args, { token })` from that file is the only sanctioned entry point — do **not** hand-roll `fetch("/api/mcp")` calls. The MCP envelope is `{tool, args, token?}` (never `input`, never `params`); never put the bearer on an `Authorization` header from the browser. See `AGENTS.md` "MCP client contract" for the full rules.

When adding a tool to a domain that has shipped to the edge, add it to **both** the MCP server (for the AI/chat surface in `apps/web-v2/src/app/api/chat/route.ts`) and to `supabase/functions/<domain>` (for the user-facing UI), then add it to `TOOLS_ON_EDGE` and run `pnpm test:parity` to confirm both transports return the same shape.

### Event bus
Redis Streams with consumer groups per server. Event name format: `{server}.{entity}.{action}` (e.g., `bidding.bid.placed`, `escrow.funds.released`). `log-mcp` subscribes to **all** events. Critical events (escrow funds movement, KYC PEP match, bidding suspicious activity, dispute resolution, payments status changes, admin user actions, contract breaches, inspection failures) trigger Datadog/Sentry alerting + Slack ops. Full critical-event catalog: `.cursor/rules/matex-mcp-servers.mdc`.

### Auction realtime path (special-cased)
`auction-mcp` is the only server with a hot path: bids hit a Supabase Edge Function + Redis FIFO with server-authoritative microsecond timestamps, processed under optimistic concurrency, broadcast via Supabase Realtime in <200ms. Auction state is replayable from `log_mcp.audit_log` if the live Redis instance dies. Never use client-provided timestamps for bid time.

## Conventions to follow

These are repo-wide rules. Full context is in `.cursor/rules/`; read the relevant `.mdc` before non-trivial changes in that domain.

### Database (`.cursor/rules/matex-database.mdc`)
- Every table lives in `<domain>_mcp` schema. Never `public`. Always schema-qualify references.
- PKs: `UUID DEFAULT uuid_generate_v4()` — never `SERIAL`.
- Money: `DECIMAL(12,2)` in CAD. Timestamps: `TIMESTAMPTZ`. Geography: `GEOGRAPHY(Point|Polygon, 4326)` with GIST index. Enums: named PostgreSQL `ENUM` (extend with `ALTER TYPE ... ADD VALUE`, never drop+recreate).
- RLS is mandatory on every user-facing table before policies are added.
- `log_mcp.audit_log` is **append-only**, partitioned monthly (`audit_log_YYYY_MM`), with `prev_hash`/`entry_hash` chain. Never `UPDATE` or `DELETE` audit rows. Add next month's partition before month start.
- Migrations live in `infrastructure/supabase/migrations/` (canonical) and `supabase/migrations/` (applied-to-remote). Forward-only — never edit an applied migration. File naming: `NNN_descriptive_name.sql` or `YYYYMMDDHHMMSS_descriptive_name.sql`.

### MCP servers (`.cursor/rules/matex-mcp-servers.mdc`)
- Tool naming: `<verb>_<noun>` registered on the server (`create_listing`, `place_bid`).
- **Every** tool call audits via `log-mcp` using the interceptor pattern — never write directly to `log_mcp.audit_log` from a domain server.
- Response shape: `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`. Some auth tools nest the upstream payload at `data.upstream_response.data`; `callTool` unwraps that on the client.
- Account-status guard runs first on every authenticated tool: reject unless `account_status === 'active'`.
- KYC level gates (level_0 read → level_3 payouts/credit/API). See the rule file for the full table; validate via `kyc-mcp.get_verification_status` before financial tools.

### Financial integrity (`.cursor/rules/matex-financial.mdc`)
- **Golden rule:** no money moves directly between buyer and seller. Every purchase creates an `escrow_mcp.escrows` record, funds via Stripe PI, releases through escrow with commission deducted before payout.
- Escrow state machine: `created → funds_held → (partially_released | frozen | refunded) → released`. Append to `escrow_mcp.escrow_timeline` at every transition; never skip states.
- Commission: 3.5% standard / 4.0% auction with min/cap floors; recalculate on weight, quality, or refund adjustments within 30 days; minimum floor always applies. Set `commission_adjusted=true` and populate `adjustment_reason`.
- Down payments stage by transaction value (100% / 25% / 20% / 15%); milestones in `payments_mcp.down_payment_schedules.milestones` JSONB.
- Wallet `balance` has DB CHECK `>= 0` — never bypass. `pending_balance` never merges into `balance` before settlement.

### Bridges (`.cursor/rules/matex-bridges.mdc`)
- Every external API is wrapped as a bridge that looks like a local MCP server to consumers.
- Mandatory: circuit breaker (5 consecutive failures → open, 30s reset), retries (3, exponential 1s base / 60s max), timeout (10s default; 30s carriers; 60s eSign), audit logging of every external call, fallback bridge on circuit open.
- Wrap external HTTP via `withCircuitBreaker(bridgeName, () => withRetry(...))`.

### TypeScript (`.cursor/rules/matex-typescript.mdc`)
- Import shared types from `@matex/types`; shared utilities from `@matex/utils`. Don't redefine.
- Use branded UUID types (`UserId`, `ListingId`, `OrderId`, `EscrowId`) — cast at the DB boundary only.
- Never `any` for Supabase rows; use the row types in `@matex/types`.
- All async functions declare return types explicitly.
- Monetary arithmetic in integers (cents) where possible.

### Security (`.cursor/rules/matex-security.mdc`)
- RLS enforced on every user-facing table (auth/profile/listing/bidding/orders/escrow/payments/messaging/notifications).
- Never expose: `password_hash`, `mfa_secret`, `account_number_enc`, KYC document URLs (use pre-signed URLs with expiry), session/refresh token hashes. `log-mcp` auto-redacts.
- Bcrypt cost ≥12 for passwords. MFA secret encrypted via `pgcrypto`. 5 failed logins → `locked_until = NOW() + interval '15 minutes'`. Refresh tokens single-use; rotate on each use; revoke on consumption.
- Step-up MFA required for any financial action > $5,000 CAD.
- Document `authenticity_score` < 0.50 → auto-reject; < 0.80 → manual review.

### Frontend (`apps/web-v2`, `AGENTS.md`)
- Every backend-driven page uses a `loading | error | empty | data` state machine. The `empty` branch uses `EmptyState` with the matching illustration in `apps/web-v2/public/illustrations/`. No mock arrays in shipped pages.
- Never `catch {}` silently — surface to existing error UI, toast, or logged warning.
- `<Image>` from `next/image`: declare `fill` (with sized parent) **or** both `width` and `height`; `fill` requires `sizes`; `priority` only for above-the-fold hero; decorative imagery uses `alt=""` + `aria-hidden`. Match intrinsic aspect ratio to the rendered slot.
- Pages depending on `isPlatformAdmin` guard at the route level (not nav-only); on guard failure `router.replace("/dashboard")`. Auth gating for `(app)` lives in `apps/web-v2/src/app/(app)/layout.tsx` with a `ready` flag — never render authed UI before client-side validation completes.
- Reusable presentation primitives → `apps/web-v2/src/components/ui/`. Layout/shell → `components/layout/`. API/data wrappers → `src/lib/`. Hooks → `src/lib/hooks/`. Public assets → `apps/web-v2/public/` only.

### Testing (`.cursor/rules/matex-testing.mdc`)
- Tests live in `apps/web-v2/e2e/{smoke,api,functional,regression,uiux,compliance,visual}` plus root `e2e/happy-path.spec.ts` (the `legacy` project).
- Naming: `e2e/<suite>/<domain>.spec.ts`; test ID `"<DOMAIN>-NN: description"` with prefixes from `docs/test-cases/MATEX_TEST_CASES.md` (AUTH-, LIST-, SRCH-, MSG-, PAY-, etc.).
- Browser tests use the shared `authenticatedPage` fixture (`e2e/fixtures/auth.ts`) — never set `localStorage` manually.
- Functional tests assert on actual MCP-tool data, not just UI text. Smoke must complete <30s total. API tests use Playwright `request` context, no browser.

## Asset and editing discipline

From `AGENTS.md`:
- Don't overwrite tracked binaries in place — copy to `*.bak` if untracked. Batch image scripts always run a `--dry-run` on 2–3 files first. Prefer reusable scripts under `scripts/` over ad-hoc shell.
- Don't rename or move anything under `apps/web-v2/public/` without updating every reference and re-running the linter.
- Read a file before editing; spot-check the rendered result; run `pnpm --filter @matex/web-v2 lint` after substantive edits. When fixing a bug in a page, fix every other instance of the same anti-pattern in the same file.
- Image generation prompts and intended slots: `docs/design/IMAGE_GENERATION_PROMPTS.md` — keep in sync when adding/replacing assets.

## Deployment

- Web (web-v2): Vercel (`apps/web-v2/vercel.json`). Sentry instrumentation via `sentry.{client,server,edge}.config.ts` + `instrumentation.ts`.
- MCP gateway: Railway (`apps/mcp-gateway`, `railway.toml`). See `RAILWAY_DEPLOY.md`.
- Edge functions: Supabase, deployed via `.github/workflows/functions-deploy.yml`. Migrations via `db-migrate.yml`.
- Env files: `.env.example` (full reference), `.env.local.example` (dev), `.env.production.example` (prod). `MCP_GATEWAY_URL` / `NEXT_PUBLIC_GATEWAY_URL` point web-v2 at the gateway origin (no trailing slash); the Next route falls back to `http://localhost:3001`.

## When in doubt

1. Check `AGENTS.md` for the rule.
2. Check the relevant `.cursor/rules/matex-*.mdc` for the domain.
3. Check `docs/system-analysis/`, `docs/architecture/`, `docs/database/` for spec-level answers.
4. Run `pnpm test:parity` after any tool change that crosses MCP↔Edge.
5. Run `pnpm --filter @matex/web-v2 lint` and the relevant Playwright project before declaring done.
