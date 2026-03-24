# Phase 4 - Growth (Weeks 28-39)

## Goal
Mature platform controls and intelligence: disputes, pricing, analytics, admin, credit.

## Servers

- `dispute-mcp`
- `pricing-mcp`
- `analytics-mcp`
- `admin-mcp`
- `credit-mcp`

## Bridges

- `lme-bridge`
- `fastmarkets-bridge`
- `accounting-bridge`
- `equifax-bridge`

## Core Deliverables

- Three-tier dispute pipeline with enforceable outcomes.
- PIS recalculation and policy-driven restrictions.
- Matex price index and market data overlays.
- Admin control center (moderation, policy, audits).
- Credit facility lifecycle, scoring, and overdue controls.

## Exit Criteria

- Dispute lifecycle resolves with auditable decisions.
- Admin dashboard supports daily operations and interventions.
- Credit controls enforce limits and overdue state transitions.
- Analytics reports support KPI and revenue monitoring.

## Release Blockers

- Dispute decisions without evidence linkage.
- Credit drawdowns exceeding available limits.
- Missing admin audit history for privileged actions.

## Implemented Artifacts (Current)

- Analytics server: `packages/mcp-servers/analytics-mcp/src/index.ts`
  - `get_dashboard_stats`, `get_conversion_funnel`, `get_revenue_report`, `export_data`, `ping`
  - Cross-schema aggregation (read-only) across listings, escrow, auctions, payments
- Pricing server: `packages/mcp-servers/pricing-mcp/src/index.ts`
  - `capture_market_price`, `get_market_prices`, `calculate_mpi`, `create_price_alert`, `get_price_alerts`, `check_alerts`, `ping`
  - Matex Price Index calculation, LME/Fastmarkets price capture
- Credit server: `packages/mcp-servers/credit-mcp/src/index.ts`
  - `assess_credit`, `get_credit_facility`, `draw_credit`, `record_payment`, `get_credit_history`, `freeze_facility`, `ping`
  - Tier calculation (none/basic/standard/premium/enterprise), score history, facility freeze
- Admin server: `packages/mcp-servers/admin-mcp/src/index.ts`
  - `get_platform_overview`, `suspend_user`, `unsuspend_user`, `moderate_listing`, `get_audit_trail`, `update_platform_config`, `ping`
  - Cross-schema elevated access for platform operations
- LME bridge: `packages/bridges/lme-bridge/src/index.ts`
  - `get_lme_price`, `get_historical`, `ping` (stub)
- Fastmarkets bridge: `packages/bridges/fastmarkets-bridge/src/index.ts`
  - `get_fastmarkets_price`, `get_regional_data`, `ping` (stub)
- Equifax bridge: `packages/bridges/equifax-bridge/src/index.ts`
  - `check_business_credit`, `ping` (stub)
- HTTP adapter handlers for all Phase 4 tools: `packages/shared/mcp-http-adapter/src/index.ts`
- Gateway routing: all Phase 4 domains in ROUTE_MAP
- UI harness: `apps/web/app/phase4/page.tsx`
- DB smoke test: `scripts/phase4-db-smoke-sql.mjs`
