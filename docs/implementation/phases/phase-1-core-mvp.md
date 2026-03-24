# Phase 1 - Core MVP (Weeks 4-11)

## Status
Completed (engineering scope): core Phase 1 servers and bridges are implemented, validated, and build clean.

## Goal
Ship first marketable flow: list -> find -> message -> buy.

## Server Delivery Order (Strict)

1. `auth-mcp`
2. `profile-mcp`
3. `listing-mcp`
4. `search-mcp`
5. `messaging-mcp`
6. `payments-mcp` (basic)

## Bridge Delivery Order

1. `sendgrid-bridge`
2. `twilio-bridge`
3. `maps-bridge`
4. `stripe-bridge`

## UI Scope (Minimum)

- Registration/Login
- Profile setup
- Create listing
- Search + listing detail
- Messaging inbox/thread
- Checkout/payment
- Basic buyer and seller dashboards

## Week Plan

- W4: auth + sendgrid/twilio OTP
- W5: profile + onboarding screens
- W6: listing creation and media upload
- W7: search/discovery + maps geocoding
- W8: messaging + realtime threads
- W9: stripe bridge + basic payments
- W10-W11: dashboards, E2E flow, stabilization

## Exit Criteria

- Seller can register and publish listing with images/location.
- Buyer can search/filter listings and start conversation.
- Buyer can checkout and payment is captured.
- Transaction and tool lifecycle are auditable.
- Closed beta can run with real users.

## Implemented Artifacts (Current)

- Auth hardening: `packages/mcp-servers/auth-mcp/src/index.ts`
  - OTP challenge issuance: `request_email_otp`, `request_phone_otp`
  - persistent in-memory OTP verification with expiry + max attempts
  - real `verify_email` and `verify_phone` update paths (Supabase or local store)
- Profile server scaffold: `packages/mcp-servers/profile-mcp/src/index.ts`
  - `get_profile`, `update_profile`, `add_bank_account`, `set_preferences`, `ping`
  - in-memory profile state for local end-to-end development
- Listing server scaffold: `packages/mcp-servers/listing-mcp/src/index.ts`
  - `create_listing`, `update_listing`, `upload_images`, `publish_listing`, `get_listing`, `get_my_listings`, `ping`
- Search server scaffold: `packages/mcp-servers/search-mcp/src/index.ts`
  - `index_listing`, `search_materials`, `geo_search`, `filter_by_category`, `save_search`, `get_saved_searches`, `ping`
- Messaging server scaffold: `packages/mcp-servers/messaging-mcp/src/index.ts`
  - `create_thread`, `send_message`, `get_thread`, `get_unread`, `ping`
- Payments server scaffold: `packages/mcp-servers/payments-mcp/src/index.ts`
  - `process_payment`, `top_up_wallet`, `manage_payment_methods`, `get_wallet_balance`, `get_transaction_history`, `ping`
  - transaction records now include `escrow_reference` metadata for escrow-compatible handoff
- Gateway forwarding runtime: `apps/mcp-gateway/src/index.ts`
  - added per-domain live forwarding via `MCP_DOMAIN_ENDPOINTS_JSON`
  - emits `gateway.tool.forwarded` and `gateway.tool.forward_failed` events
- Bridge scaffolds
  - `packages/bridges/sendgrid-bridge/src/index.ts`: `send_email`, `send_template_email`, `ping`
  - `packages/bridges/twilio-bridge/src/index.ts`: `send_sms`, `send_otp`, `ping`
  - `packages/bridges/maps-bridge/src/index.ts`: `geocode`, `reverse_geocode`, `distance_matrix`, `ping`
  - `packages/bridges/stripe-bridge/src/index.ts`: `create_payment_intent`, `confirm_payment`, `create_refund`, `create_transfer`, `ping`
- Public-tool validation coverage
  - input validation guards added for all Phase 1 server tools in `auth`, `profile`, `listing`, `search`, `messaging`, `payments`
- Critical event emission coverage
  - state-changing actions in all Phase 1 servers now publish events through Redis Streams when configured

## Release Blockers

- Missing input validation on any public tool. (Resolved for Phase 1 servers)
- Missing event emission for critical state changes. (Resolved for Phase 1 servers)
- Payment actions not linked to escrow-compatible records. (Resolved for Phase 1 basic payment flow)
