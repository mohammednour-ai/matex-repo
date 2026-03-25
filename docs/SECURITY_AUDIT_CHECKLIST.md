# Security Audit Checklist — matexhub.ca

## Authentication & Authorization

- [ ] JWT secrets are min 32 chars, rotated quarterly
- [ ] Token expiry enforced (15min access, 7d refresh)
- [ ] MFA enabled for high-value operations (>$5K)
- [ ] Password hashing uses bcrypt/argon2 (currently SHA-256 -- upgrade required)
- [ ] Session tokens invalidated on password change
- [ ] Rate limiting active on auth endpoints (120 req/min)
- [ ] Account lockout after 5 failed login attempts

## Data Protection (PIPEDA)

- [ ] PII never logged in plain text (input_hash used instead)
- [ ] KYC documents encrypted at rest in Supabase Storage
- [ ] Soft-delete pattern for user data deletion requests
- [ ] Financial records retained 7 years per CRA requirement
- [ ] Data residency: all infrastructure in ca-central-1
- [ ] User consent for data collection documented

## Row Level Security

- [ ] RLS enabled on ALL 55 tables (migration 20260322000100)
- [ ] Service role key only used server-side (never in client env)
- [ ] Anon key access restricted by RLS policies
- [ ] Admin operations require authenticated service role

## API Security

- [ ] Gateway validates JWT on every non-public tool call
- [ ] CORS configured to allow only matexhub.ca origin
- [ ] Request body size limits enforced
- [ ] SQL injection prevented (parameterized queries throughout)
- [ ] No user input directly interpolated into SQL
- [ ] XSS prevention via React's default escaping

## Financial Security

- [ ] Escrow state machine prevents unauthorized transitions
- [ ] Double-spend prevention via optimistic concurrency on bids
- [ ] Commission calculations use DECIMAL(12,2), never floats
- [ ] All financial events emit audit log entries
- [ ] Stripe webhook signatures validated (when live)

## Infrastructure

- [ ] HTTPS enforced on all endpoints
- [ ] Database connections use SSL
- [ ] Environment variables never committed to git
- [ ] Secrets rotated on suspected compromise
- [ ] Dependency audit: `pnpm audit` runs clean
- [ ] No known critical CVEs in dependency tree

## Cross-Border Compliance

- [ ] OFAC SDN screening on US-bound transactions
- [ ] CBSA sanctions screening on Canada imports
- [ ] Basel Convention compliance for hazardous waste
- [ ] Anti-circumvention: transshipment pattern detection

## Monitoring & Incident Response

- [ ] Sentry error tracking with PII scrubbing
- [ ] Failed auth attempts logged and alertable
- [ ] Anomalous activity detection (unusual listing frequency, bid patterns)
- [ ] Incident response runbook documented
- [ ] Security contact: security@matexhub.ca

## Penetration Test Scope

- [ ] Gateway API fuzzing (malformed JSON, oversized payloads)
- [ ] JWT manipulation (expired, forged, wrong algorithm)
- [ ] RLS bypass attempts (direct Supabase access with anon key)
- [ ] IDOR testing (accessing other users' resources)
- [ ] Race conditions (concurrent bid placement, double payment)
- [ ] File upload validation (storage-mcp signed URLs)
