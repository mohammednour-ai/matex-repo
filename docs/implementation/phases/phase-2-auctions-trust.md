# Phase 2 - Auctions and Trust (Weeks 12-19)

## Status
In progress: core Phase 2 runtime servers and bridge scaffolds are implemented and compiling.

## Goal
Enable trusted high-value trading via KYC, escrow, auctions, and inspection controls.

## Servers

- `kyc-mcp`
- `escrow-mcp`
- `bidding-mcp`
- `auction-mcp`
- `inspection-mcp`
- `booking-mcp`

## Bridge

- `onfido-bridge`

## Critical Architecture Requirements

- Auction server-authoritative timestamping and FIFO sequencing.
- Optimistic concurrency for simultaneous bid processing.
- Escrow state machine enforced for all transitions.
- Inspection discrepancy events auto-trigger freeze/escalation hooks.

## Week Plan

- W12-W13: KYC + onfido integration
- W13-W14: escrow lifecycle + timeline
- W14-W15: bidding + anti-manipulation flags
- W15-W16: live auction room + lot controls
- W17-W18: inspections and weight record flow
- W18-W19: booking, availability, reminders

## Exit Criteria

- KYC level gating is active for high-value operations.
- Live auctions function under concurrent bidder load.
- Escrow hold/release/freeze/refund lifecycle is complete and logged.
- Weight discrepancy path triggers correct control actions.

## Implemented Artifacts (Current)

- KYC server: `packages/mcp-servers/kyc-mcp/src/index.ts`
  - `start_verification`, `submit_document`, `review_verification`, `get_kyc_level`, `assert_kyc_gate`, `ping`
  - KYC level promotion on verified reviews
- Escrow server: `packages/mcp-servers/escrow-mcp/src/index.ts`
  - `create_escrow`, `hold_funds`, `release_funds`, `freeze_escrow`, `refund_escrow`, `get_escrow`, `ping`
  - explicit transition guard and mandatory timeline entries for transitions
- Bidding server: `packages/mcp-servers/bidding-mcp/src/index.ts`
  - `place_bid`, `retract_bid`, `get_highest_bid`, `flag_suspicious_bid`, `ping`
  - server-authoritative timestamps and optimistic concurrency checks
  - KYC gate for high-value bids
- Auction server: `packages/mcp-servers/auction-mcp/src/index.ts`
  - `create_auction`, `add_lot`, `start_auction`, `place_auction_bid`, `close_lot`, `get_lot_state`, `ping`
  - lot-level optimistic concurrency for highest bid updates
- Inspection server: `packages/mcp-servers/inspection-mcp/src/index.ts`
  - `request_inspection`, `record_weight`, `complete_inspection`, `evaluate_discrepancy`, `get_inspection`, `ping`
  - discrepancy event emission with freeze/escalation hook signal
- Booking server: `packages/mcp-servers/booking-mcp/src/index.ts`
  - `set_availability`, `create_booking`, `update_booking_status`, `list_user_bookings`, `enqueue_reminder`, `ping`
- Onfido bridge: `packages/bridges/onfido-bridge/src/index.ts`
  - `create_applicant`, `submit_check`, `get_check_status`, `ping`
- DB smoke validation script: `scripts/phase2-db-smoke-sql.mjs`
  - validates KYC gate path, escrow timeline lifecycle, auction/bid optimistic conflict handling, and inspection discrepancy + booking flow against remote DB

## Release Blockers

- Any bypass of KYC checks for bidding/payouts.
- Any escrow transition without timeline entry.
- Any auction bid using client time as source of truth.

## Manual UI Pass Runbook (Phase A)

Use this exact sequence in `apps/web`:

1) `Auth` page
- Click `Register` then `Login`.
- Confirm `HTTP 200` output and copy `user_id`.

2) `Listings` page
- Paste `user_id` as seller.
- Click `Create listing` then `Publish listing`.
- Confirm `HTTP 200` output and copy `listing_id`.

3) `Search` page
- Search for `copper` or listing title keyword.
- Confirm result payload includes the published listing.

4) `Messaging` page
- Use participants with two user IDs.
- Click `Create thread` then `Send message`.
- Confirm `HTTP 200` output and copy `thread_id` and `message_id`.

5) `Checkout` page
- Paste buyer `user_id`.
- Click `Process payment`.
- Confirm `HTTP 200` output and copy `transaction_id`.

6) `Dashboard` page
- Verify captured IDs are visible.
- Use `Reset test data` when needed (non-production only).

### Latest successful manual pass snapshot

- `auth.register` (user 1): `user_id=e14b08c5-9f58-4213-8816-cfeb7bad78d0`
- `auth.register` (user 2): `user_id=23c13c6b-b76d-4eb8-8af4-1b2d76d209f0`
- `auth.login`: `access_token=ui-token-e14b08c5-9f58-4213-8816-cfeb7bad78d0`
- `listing.create_listing`: `listing_id=d2d84cb4-a74c-4601-97b0-08847e06dd24`
- `listing.publish_listing`: status `active`
- `search.search_materials`: `total=1` and includes `listing_id=d2d84cb4-a74c-4601-97b0-08847e06dd24`
- `messaging.create_thread`: `thread_id=dcfdf632-d0dc-4cd1-b4a2-1be0b8d1ba7f`
- `messaging.send_message`: `message_id=b91e6b67-c242-43c8-b2af-3ad20e5fa403`
- `payments.process_payment`: `transaction_id=929141ca-9f4e-4156-adfd-ad1b0d09fb3e`

## Phase 2 UI surface validation snapshot

- `kyc.start_verification`: `verification_id=e1709608-5c77-4f3a-b37e-773369513dfa`
- `kyc.review_verification`: status `verified`
- `escrow.create_escrow`: `escrow_id=885a048f-1da7-4089-b886-c8c9296bd12c`, status `created`
- `escrow.hold_funds`: status `funds_held`
- `escrow.release_funds`: status `released`
- `auction.create_auction`: `auction_id=19342cdf-a3d0-4912-bb2b-59d80e8d892e`
- `auction.add_lot`: `lot_id=efe431be-e361-4d84-8da8-f89d2e2dd1fa`
- `auction.place_auction_bid`: `bid_id=0793becb-7864-4899-9328-035fd696e19c`
- `inspection.request_inspection`: `inspection_id=a6ef9d4d-f5b0-4bc1-b700-d550fab1d791`
- `inspection.evaluate_discrepancy`: `delta_pct=-10`, `exceeded_tolerance=true`
- `booking.create_booking`: `booking_id=940d1b1b-cbfd-449b-8c73-2af0721b9b89`

## Gateway Forward Wiring (Phase D)

Set `MCP_DOMAIN_ENDPOINTS_JSON` and run adapters:

- `corepack pnpm dev:http-adapters`
- `corepack pnpm dev:gateway`
- `corepack pnpm --filter @matex/web dev`

The web route `apps/web/app/api/gateway/route.ts` is now gateway-proxy-first and no longer uses DB-direct fallback for supported tools.
