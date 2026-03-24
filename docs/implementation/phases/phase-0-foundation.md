# Phase 0 - Foundation (Weeks 1-3)

## Goal
Establish production-safe baseline infrastructure: gateway, logging, storage, event bus, CI/CD, staging.

## Scope

- Monorepo baseline with app and package wiring.
- Supabase bootstrap (extensions, enums, core schemas for auth/profile).
- `log-mcp` and `storage-mcp` operational first.
- Redis Streams event bus with consumer groups and DLQ.
- CI/CD with staging, production health checks, rollback policy.
- Monitoring baseline (Sentry + uptime + APM hooks).

## Week Plan

### Week 1
- Confirm `apps/web`, `apps/mcp-gateway`, and package workspace links.
- Provision Supabase (ca-central-1) and bootstrap schema.
- Create gateway routing map for existing MCP servers.

### Week 2
- Implement tool-call interception contract for all MCP servers.
- Implement `log-mcp` categories and append-only write path.
- Implement `storage-mcp` signed upload/download URL path.
- Configure Redis Streams bus and DLQ.

### Week 3
- Wire CI workflow gates (lint, typecheck, tests, staging deploy).
- Add health checks + rollback step for production.
- Validate staging environment and smoke tests.
- Prepare IRAP/CDAP submission package from docs.

## Exit Criteria

- Gateway routes authenticated tool calls.
- Every tool call emits an auditable log entry.
- Event bus publishes and consumes with retry + DLQ.
- CI/CD pipeline deploys to staging and blocks on failing checks.
- Staging environment stable for Phase 1 work.

## Implemented Artifacts (Current)

- Gateway runtime scaffold: `apps/mcp-gateway/src/index.ts`
  - `/health` endpoint for CI checks
  - JWT validation path
  - in-memory rate limiting (per IP + per user)
  - domain-to-server routing map
  - Redis Streams publish hook
- Audit server scaffold: `packages/mcp-servers/log-mcp/src/index.ts`
  - `log_tool_call`, `log_event`, `log_external_api`, `search_logs`, `verify_integrity`, `ping`
  - in-memory buffer + optional Supabase insert
- Storage server scaffold: `packages/mcp-servers/storage-mcp/src/index.ts`
  - signed upload/download URL tools
  - Supabase-backed implementation
- Event bus utility: `packages/shared/utils/src/event-bus.ts`
  - Redis Streams publish/consume/ack
  - DLQ write path
- CI health gate: `.github/workflows/ci.yml` + `scripts/health-check.mjs`
  - staging/prod health check step
  - rollback guard on failed health gate

## Release Blockers

- Any user-facing table missing RLS enablement.
- Any MCP server without audit logging interceptor.
- Any bridge call without timeout/retry/circuit breaker.
