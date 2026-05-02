# Matex Environment Activation Guide

This guide explains each `.env` key category, where it is used in Matex, and how to activate it for both local development and production.

## Quick start

1. Local: copy `.env.local.example` to `.env.local`.
2. Production: use `.env.production.example` as your Railway/Vercel source.
3. Validate:
   - `pnpm validate-env` (local defaults)
   - `VALIDATE_ENV_TARGET=production VALIDATE_ENV_PROFILE=full pnpm validate-env` (strict production checks)
4. Health check:
   - `pnpm healthcheck` (defaults to `http://localhost:3001/health`)

## Runtime flow

```mermaid
flowchart LR
  WebV2["web-v2 /api/mcp"] --> Gateway["mcp-gateway /tool"]
  Gateway -->|"MCP_DOMAIN_ENDPOINTS_JSON"| Adapters["HTTP adapters 4101-4122"]
  Gateway --> Redis["Redis event stream"]
  Adapters --> DB["Postgres / Supabase"]
  Adapters --> Providers["Stripe SendGrid Twilio etc"]
```

## Key matrix (active vs reserved)

| Key | Local | Production | Status in code | Matex usage |
|---|---|---|---|---|
| `DATABASE_URL` | required | required | Active | Main DB connection for adapters and scripts |
| `JWT_SECRET` | required | required | Active | JWT signing/verification in gateway + adapter |
| `JWT_ACCESS_TOKEN_EXPIRY` | optional | recommended | Active | Access token expiry override (`15m` default) |
| `JWT_REFRESH_TOKEN_EXPIRY` | optional | recommended | Active | Refresh token expiry override (`7d` default) |
| `NEXT_PUBLIC_APP_URL` | recommended | required | Config/documentation | Canonical app URL for deploy config |
| `NEXT_PUBLIC_GATEWAY_URL` | required fallback | optional | Active | Browser/server fallback gateway origin |
| `MCP_GATEWAY_URL` | recommended | required | Active | Server-side `/api/mcp` gateway target |
| `MCP_DOMAIN_ENDPOINTS_JSON` | required for adapters | required | Active | Domain forwarding map (`auth`, `listing`, `escrow`, etc.) |
| `REDIS_URL` | optional | recommended | Active | ioredis stream/event bus (`rediss://...`) |
| `UPSTASH_REDIS_REST_URL` | optional | optional | Partially active | Optional fallback in some services |
| `UPSTASH_REDIS_REST_TOKEN` | optional | optional | Reserved | Companion token for REST usage |
| `NEXT_PUBLIC_SUPABASE_URL` | optional | recommended | Active | Supabase endpoint in server integrations |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | optional | recommended | Active/readiness | Client-facing Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | recommended | Active | Server writes/storage signing (never browser) |
| `SUPABASE_DB_URL` | optional | optional | Reserved | Alias/documentation key (use `DATABASE_URL` runtime) |
| `STRIPE_SECRET_KEY` | optional | required for live pay | Active | Stripe bridge live mode |
| `STRIPE_PUBLISHABLE_KEY` | optional | recommended | Reserved | Frontend publishable key (future wiring) |
| `STRIPE_WEBHOOK_SECRET` | optional | recommended | Reserved | Webhook signature verification (future wiring) |
| `STRIPE_CONNECT_CLIENT_ID` | optional | recommended | Reserved | Stripe Connect auth (future wiring) |
| `SENDGRID_API_KEY` | optional | required for live email | Active | SendGrid bridge live mode |
| `SENDGRID_FROM_EMAIL` | optional | required for live email | Active | Email sender address |
| `SENDGRID_FROM_NAME` | optional | recommended | Active | Email sender display name |
| `TWILIO_ACCOUNT_SID` | optional | required for live SMS | Active | Twilio bridge credentials |
| `TWILIO_AUTH_TOKEN` | optional | required for live SMS | Active | Twilio bridge credentials |
| `TWILIO_PHONE_NUMBER` | optional | required for live SMS | Active | Twilio sender phone number |
| `GOOGLE_MAPS_API_KEY` | optional | optional | Reserved | Future maps/geocoding features |
| `DOCUSIGN_INTEGRATION_KEY` | optional | optional | Reserved | Future DocuSign integration |
| `DOCUSIGN_SECRET_KEY` | optional | optional | Reserved | Future DocuSign integration |
| `DOCUSIGN_ACCOUNT_ID` | optional | optional | Reserved | Future DocuSign integration |
| `DOCUSIGN_BASE_URL` | optional | optional | Reserved | Future DocuSign API base |
| `ONFIDO_API_TOKEN` | optional | optional | Reserved | Future Onfido KYC integration |
| `SENTRY_DSN` | optional | recommended | Validation/readiness | Error telemetry readiness key |
| `UI_RESET_SECRET` | optional | optional | Active in legacy API route | Protects UI test reset endpoint |
| `MATEX_DEV_SEED_EMAIL` | optional | n/a | Active | Persist local dev login across gateway restarts |
| `MATEX_DEV_SEED_PASSWORD` | optional | n/a | Active | Dev seeded user password |
| `MATEX_DEV_SEED_PHONE` | optional | n/a | Active | Dev seeded user phone |
| `MATEX_DEV_SEED_ACCOUNT_TYPE` | optional | n/a | Active | Dev seeded user account type |
| `MATEX_DEV_ADMIN_EMAILS` | optional | n/a | Active | Comma-separated dev platform admins |
| `NODE_ENV` | optional | required | Active | Runtime mode |
| `LOG_LEVEL` | optional | recommended | Config | Logging verbosity |

## Provider usage on Matex

- Supabase: backing datastore access in MCP servers/adapter, plus storage upload URL generation.
- Redis/Upstash: gateway and services event bus for tool routing/audit events.
- Stripe: payment intent/refund/transfer bridge (stub mode when key missing).
- SendGrid: transactional and template emails (stub mode when key missing).
- Twilio: SMS/OTP delivery (stub mode when keys missing).
- DocuSign/Onfido/Maps: predeclared for roadmap integrations; currently not hard-wired in runtime.
- Sentry: prepared as deploy key, pending deeper service instrumentation.

## Local activation checklist

- Copy `.env.local.example` to `.env.local`.
- Fill at least:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `MCP_GATEWAY_URL`
  - `NEXT_PUBLIC_GATEWAY_URL`
  - `MCP_DOMAIN_ENDPOINTS_JSON`
- Optional local convenience:
  - `MATEX_DEV_SEED_*`
  - `MATEX_DEV_ADMIN_EMAILS`
- Run:
  - `pnpm validate-env`
  - `pnpm dev:gateway`
  - `pnpm dev:http-adapters`
  - `pnpm dev:web-v2-stack`
  - `pnpm healthcheck`

## Production activation checklist

- Gateway + adapters:
  - `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, `MCP_DOMAIN_ENDPOINTS_JSON`
  - `SENTRY_DSN` recommended
- Web:
  - `NEXT_PUBLIC_APP_URL`, `MCP_GATEWAY_URL`
  - Optional `NEXT_PUBLIC_GATEWAY_URL` mirror for consistency
- Providers:
  - `STRIPE_SECRET_KEY`, `SENDGRID_API_KEY`, `TWILIO_*`
  - Keep future keys populated if your ops policy requires one source-of-truth secrets inventory
- Run strict validation:
  - `VALIDATE_ENV_TARGET=production VALIDATE_ENV_PROFILE=full pnpm validate-env`
  - `HEALTHCHECK_URL=https://api.matexhub.ca/health pnpm healthcheck`

## Local Supabase wiring (DB-backed dev mode)

When you want the local stack to read/write a real Supabase Postgres (so registered users, listings, etc. survive process restarts) instead of the gateway's in-memory dev mode:

### 1. Apply the schema once

The repo ships `docs/database/matex_complete_schema.sql` (22 MCP schemas + log/orders schemas, ~64 tables). Apply it through the **session pooler** (port 5432) so session-level commands like `CREATE EXTENSION` are accepted:

```powershell
$env:SUPABASE_DIRECT_URL = "postgresql://postgres.<ref>:<urlencoded-password>@aws-1-<region>.pooler.supabase.com:5432/postgres"
node scripts/apply-supabase-schema.mjs
```

The script connects via `pg`, runs the SQL in one shot, and prints a per-schema row count so you can confirm it succeeded.

### 2. Configure `.env.local`

Two files (both gitignored). The repo-root one is the source of truth for the gateway and adapters; the web-v2 one is what Next.js bakes into the browser bundle.

`.env.local` (repo root):

```
DATABASE_URL=postgresql://postgres.<ref>:<urlencoded-password>@aws-1-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
SUPABASE_DIRECT_URL=postgresql://postgres.<ref>:<urlencoded-password>@aws-1-<region>.pooler.supabase.com:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=               # optional; only needed for storage signed URLs
JWT_SECRET=<32+ char random>
NEXT_PUBLIC_APP_URL=http://localhost:3002
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001
MCP_GATEWAY_URL=http://localhost:3001
MCP_DOMAIN_ENDPOINTS_JSON={ ...localhost map from .env.local.example... }
```

`apps/web-v2/.env.local` only needs the public keys:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_APP_URL=http://localhost:3002
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001
MCP_GATEWAY_URL=http://localhost:3001
```

### 3. Pooler endpoints — which port for what

- **Schema apply / migrations** → port `5432` (session mode pooler). Supports `CREATE EXTENSION`, advisory locks, etc.
- **Runtime adapters** → port `6543` (transaction mode pooler) with `?pgbouncer=true`. Required for free tier without IPv6.

Direct `db.<ref>.supabase.co:5432` is IPv6-only on free tier; if your network has no IPv6 (most home Windows setups don't), use the pooler for both jobs as above.

### 4. Boot the stack

The startup scripts in [package.json](../package.json) and [apps/mcp-gateway/package.json](../apps/mcp-gateway/package.json) load `.env.local` via Node's built-in `--env-file`:

- `pnpm dev:http-adapters` — 22 listeners on 4101–4122, each with a `pg.Pool` to Supabase pooler
- `pnpm dev:gateway` — gateway on 3001 (sees `MCP_DOMAIN_ENDPOINTS_JSON`, forwards to adapters)
- `pnpm --filter @matex/web-v2 dev` — UI on 3002

Or in one shot:

- `pnpm dev:db-stack` — runs all three concurrently with prefixed labels (uses `concurrently`).

### 5. Verify persistence end-to-end

```powershell
# 1) register
$body = @{ tool="auth.register"; args=@{ email="me@matex.local"; phone="+15551112222"; password="LocalDev12345!"; account_type="both" } } | ConvertTo-Json -Compress
Invoke-RestMethod "http://localhost:3001/tool" -Method POST -ContentType "application/json" -Body $body
# 2) kill adapters + gateway, restart them
# 3) login with the same email/password — must succeed
$body2 = @{ tool="auth.login"; args=@{ email="me@matex.local"; password="LocalDev12345!" } } | ConvertTo-Json -Compress
Invoke-RestMethod "http://localhost:3001/tool" -Method POST -ContentType "application/json" -Body $body2
```

If step 3 returns `success:true` with the same `user_id`, you're hitting Supabase, not in-memory dev state.

