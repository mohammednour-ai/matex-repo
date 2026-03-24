# Monthly Governance Gates

Use this checklist once per month before moving to next milestone window.

## Gate Review Format

### 1) Delivery Status
- Planned vs delivered servers/bridges/pages.
- Deferred scope and reason.
- Burn-down trend and blocker analysis.

### 2) KPI Review
- Active users
- Listings active
- Transactions/month
- GMV/month
- Revenue/month
- Repeat buyer rate

### 3) Reliability and Security
- Error rate trend and p95 latency trend.
- Unresolved Sev1/Sev2 incidents.
- RLS coverage and policy regression checks.
- Audit log integrity checks (`verify_integrity` equivalent).

### 4) Compliance
- KYC/PEP pipeline health.
- Tax/invoice report accuracy checks.
- Data retention and log archive checks.

### 5) Go / No-Go Decision
- **Go** only if current phase exit criteria are all met.
- **No-Go** if release blockers remain.
- If No-Go, define 1-2 week remediation sprint.

## Release Blocker Matrix

- Missing RLS on user-facing tables.
- Missing audit logs for tool calls/events/external APIs.
- Invalid escrow/payment/credit state transitions.
- Missing typed validation on externally callable tools.
- Unmitigated critical security issues.

## Solo Founder Guardrails

- Max 20h/week sustained pace.
- No mid-phase scope expansion.
- One recovery week every 8 weeks.
- Keep automation-first backlog for repetitive operations.
