# Phase 3 - Operations (Weeks 20-27)

## Goal
Complete operational transaction chain: ship, sign, contract, notify, tax.

## Servers

- `logistics-mcp`
- `esign-mcp`
- `contracts-mcp`
- `tax-mcp`
- `notifications-mcp` (full)

## Bridges

- `carriers-bridge`
- `docusign-bridge`
- `fcm-bridge`

## Core Deliverables

- Multi-carrier quote and booking.
- Shipment tracking and delivery confirmation.
- eSign workflow for contracts and agreements.
- Auto-order contract execution support.
- Tax calculation and invoice generation by province pair.
- Multi-channel notification routing and preference handling.

## Exit Criteria

- Shipment quote -> book -> track -> delivery flow works end-to-end.
- Signed contract artifacts are hash-verifiable.
- Tax invoices are generated correctly and exportable.
- Notification channels function with user preference filters.

## Release Blockers

- Missing BOL/POD links for shipment transitions.
- Missing signing audit trail for legal documents.
- Tax calculations not traceable to seller/buyer province data.

## Implemented Artifacts (Current)

- Logistics server: `packages/mcp-servers/logistics-mcp/src/index.ts`
  - `get_quotes`, `book_shipment`, `update_tracking`, `get_shipment`, `generate_bol`, `ping`
  - Multi-carrier quote simulation with CO2 emissions
- Contracts server: `packages/mcp-servers/contracts-mcp/src/index.ts`
  - `create_contract`, `activate_contract`, `generate_order`, `negotiate_terms`, `get_contract`, `terminate_contract`, `ping`
  - Supports all 6 contract types (standing, volume, hybrid, index_linked, rfq_framework, consignment)
- Dispute server: `packages/mcp-servers/dispute-mcp/src/index.ts`
  - `file_dispute`, `submit_evidence`, `propose_settlement`, `escalate_dispute`, `resolve_dispute`, `get_dispute`, `update_pis`, `ping`
  - PIS scoring with tier calculation (excellent/good/fair/poor/critical)
- Tax server: `packages/mcp-servers/tax-mcp/src/index.ts`
  - `calculate_tax`, `generate_invoice`, `get_invoice`, `void_invoice`, `get_remittance_summary`, `ping`
  - Full provincial tax table (ON 13% HST, BC 5%+7%, QC 5%+9.975%, AB/SK/MB 5% GST)
  - Sequential MTX-YYYY-NNNNNN invoice numbering
- Notifications server: `packages/mcp-servers/notifications-mcp/src/index.ts`
  - `send_notification`, `get_notifications`, `mark_read`, `get_preferences`, `update_preferences`, `ping`
  - Multi-channel routing: email, sms, push, in_app
- Carriers bridge: `packages/bridges/carriers-bridge/src/index.ts`
  - `request_quotes`, `book_carrier`, `get_tracking`, `ping` (stub)
- DocuSign bridge: `packages/bridges/docusign-bridge/src/index.ts`
  - `create_envelope`, `send_for_signature`, `get_envelope_status`, `download_signed`, `ping` (stub)
- HTTP adapter handlers for all Phase 3 tools: `packages/shared/mcp-http-adapter/src/index.ts`
- Gateway routing: all Phase 3 domains in `apps/mcp-gateway/src/index.ts` ROUTE_MAP
- UI harness: `apps/web/app/phase3/page.tsx` (logistics, contracts, disputes, tax, notifications)
- DB smoke test: `scripts/phase3-db-smoke-sql.mjs`
  - Validates logistics lifecycle, contract lifecycle, dispute workflow, tax invoice generation, notification send/read
