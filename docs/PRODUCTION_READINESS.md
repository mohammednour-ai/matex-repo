# Production Readiness Checklist — matexhub.ca

## Infrastructure

- [ ] Railway project created with gateway + adapter services
- [ ] Vercel project connected for apps/web
- [ ] Custom domain `matexhub.ca` pointed to Vercel
- [ ] Custom domain `api.matexhub.ca` pointed to Railway gateway
- [ ] SSL certificates active on both domains
- [ ] Supabase project in `ca-central-1` region

## Environment Variables

- [ ] `DATABASE_URL` set on Railway (both services)
- [ ] `JWT_SECRET` set (min 32 chars, same value on gateway + adapters)
- [ ] `REDIS_URL` set (Upstash Redis for event bus)
- [ ] `NEXT_PUBLIC_GATEWAY_URL` set to `https://api.matexhub.ca` on Vercel
- [ ] `NEXT_PUBLIC_APP_URL` set to `https://matexhub.ca` on Vercel
- [ ] `MCP_DOMAIN_ENDPOINTS_JSON` set on gateway with Railway internal URLs
- [ ] `STRIPE_SECRET_KEY` set (live key for payments)
- [ ] `SENDGRID_API_KEY` set (for transactional email)
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` set (for OTP SMS)
- [ ] `SENTRY_DSN` set on both gateway and web app
- [ ] Run `node scripts/validate-env.mjs` on each service to confirm

## Database

- [ ] Migration `20260315000100_initial_schema.sql` deployed via `supabase db push`
- [ ] Migration `20260322000100_rls_policies.sql` deployed
- [ ] Seed data deployed (`seed.sql` — 11 categories + 24 subcategories)
- [ ] RLS policies verified active on all 55 tables

## Testing

- [ ] `pnpm smoke` passes against production DB (all 24 steps)
- [ ] `pnpm --filter @matex/web test:e2e` passes
- [ ] Manual UI walkthrough: Auth -> Listings -> Search -> Messaging -> Checkout -> Phase 2 -> Phase 3 -> Phase 4 -> Copilot -> Dashboard
- [ ] Gateway health check: `GET https://api.matexhub.ca/health` returns 200

## Security

- [ ] JWT_SECRET is unique, not the default `dev-secret-change-me`
- [ ] No `.env` files committed to git
- [ ] Supabase service role key only on server-side services (not in client env)
- [ ] CORS configured on gateway if needed
- [ ] Rate limiting active on gateway (120 req/min per IP)

## Monitoring

- [ ] Sentry error tracking active
- [ ] Railway service health checks configured
- [ ] Uptime monitoring on `https://matexhub.ca` and `https://api.matexhub.ca/health`
- [ ] Log retention configured (7 days hot, archive to S3)

## Go-Live

- [ ] DNS propagation confirmed for matexhub.ca
- [ ] First user registration tested on production
- [ ] Rollback plan documented (Railway rollback + Vercel instant rollback)
