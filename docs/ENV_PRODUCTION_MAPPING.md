# Env Mapping for Production (Railway + Vercel)

This is an operator-ready mapping for where each key should be set in production.

## Railway service: `gateway`

Set:

- `PORT` (Railway-managed, usually `3001`)
- `JWT_SECRET`
- `REDIS_URL` (`rediss://...`)
- `MCP_DOMAIN_ENDPOINTS_JSON` (private adapter URLs)
- `MCP_GATEWAY_URL` (optional, for internal consistency)
- `SENTRY_DSN` (recommended)
- `NODE_ENV=production`
- `LOG_LEVEL=info`

Validate:

- `VALIDATE_ENV_TARGET=production VALIDATE_ENV_PROFILE=gateway pnpm validate-env`
- `HEALTHCHECK_URL=https://api.matexhub.ca/health pnpm healthcheck`

## Railway service: `adapters`

Set:

- `DATABASE_URL`
- `JWT_SECRET` (same value as gateway)
- `REDIS_URL` (recommended)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SENTRY_DSN` (recommended)
- `NODE_ENV=production`
- `LOG_LEVEL=info`

Provider keys (if using live bridges/adapters):

- Stripe: `STRIPE_SECRET_KEY`
- SendGrid: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

Validate:

- `VALIDATE_ENV_TARGET=production VALIDATE_ENV_PROFILE=adapters pnpm validate-env`

## Vercel service: `web-v2`

Set:

- `NEXT_PUBLIC_APP_URL=https://matexhub.ca`
- `MCP_GATEWAY_URL=https://api.matexhub.ca`
- `NEXT_PUBLIC_GATEWAY_URL=https://api.matexhub.ca` (optional mirror)
- `SENTRY_DSN` (recommended)
- `NODE_ENV=production`

Validate:

- `VALIDATE_ENV_TARGET=production VALIDATE_ENV_PROFILE=web pnpm validate-env`

## Example `MCP_DOMAIN_ENDPOINTS_JSON` for Railway private network

```json
{
  "auth": "http://adapters.railway.internal:4101/tool",
  "profile": "http://adapters.railway.internal:4102/tool",
  "listing": "http://adapters.railway.internal:4103/tool",
  "search": "http://adapters.railway.internal:4104/tool",
  "messaging": "http://adapters.railway.internal:4105/tool",
  "payments": "http://adapters.railway.internal:4106/tool",
  "kyc": "http://adapters.railway.internal:4107/tool",
  "escrow": "http://adapters.railway.internal:4108/tool",
  "bidding": "http://adapters.railway.internal:4109/tool",
  "auction": "http://adapters.railway.internal:4110/tool",
  "inspection": "http://adapters.railway.internal:4111/tool",
  "booking": "http://adapters.railway.internal:4112/tool",
  "logistics": "http://adapters.railway.internal:4113/tool",
  "contracts": "http://adapters.railway.internal:4114/tool",
  "dispute": "http://adapters.railway.internal:4115/tool",
  "tax": "http://adapters.railway.internal:4116/tool",
  "notifications": "http://adapters.railway.internal:4117/tool",
  "analytics": "http://adapters.railway.internal:4118/tool",
  "pricing": "http://adapters.railway.internal:4119/tool",
  "credit": "http://adapters.railway.internal:4120/tool",
  "admin": "http://adapters.railway.internal:4121/tool",
  "esign": "http://adapters.railway.internal:4122/tool"
}
```

## Final production preflight commands

From repo root:

```powershell
$env:VALIDATE_ENV_TARGET='production'
$env:VALIDATE_ENV_PROFILE='full'
pnpm validate-env
```

```powershell
$env:HEALTHCHECK_URL='https://api.matexhub.ca/health'
pnpm healthcheck
```
