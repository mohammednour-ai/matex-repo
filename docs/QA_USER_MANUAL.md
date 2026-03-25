# Matex QA Manual, User Guide & Test Scenarios

**Platform:** matexhub.ca
**Version:** 1.0.0
**Date:** March 2026

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Getting Started](#2-getting-started)
3. [User Manual — UI Pages](#3-user-manual--ui-pages)
4. [Test Scenarios by Domain](#4-test-scenarios-by-domain)
5. [API Tool Reference](#5-api-tool-reference)
6. [Smoke Test Suites](#6-smoke-test-suites)
7. [AI Copilot Testing](#7-ai-copilot-testing)
8. [Error Handling & Edge Cases](#8-error-handling--edge-cases)
9. [Performance Targets](#9-performance-targets)
10. [Regression Checklist](#10-regression-checklist)

---

## 1. System Overview

Matex is a Canadian B2B recycled materials marketplace built on MCP-First architecture.

**Components:**
- **Web App:** Next.js 14 at `https://matexhub.ca` (or `http://localhost:3000` locally)
- **MCP Gateway:** API router at `https://api.matexhub.ca` (or `http://localhost:3001`)
- **HTTP Adapters:** 22 domain adapters on ports 4101-4122
- **Database:** Supabase PostgreSQL with 22 schemas, 55 tables
- **23 MCP Servers:** auth, profile, kyc, listing, search, bidding, auction, inspection, booking, escrow, payments, contracts, dispute, logistics, tax, notifications, messaging, esign, pricing, analytics, admin, storage, log
- **13 Bridges:** stripe, sendgrid, twilio, maps, onfido, carriers, docusign, adobe-sign, lme, fastmarkets, equifax, fcm, accounting

---

## 2. Getting Started

### Starting the Local Stack

```bash
# Terminal 1: HTTP Adapters (needs DATABASE_URL)
DATABASE_URL="postgresql://..." pnpm dev:http-adapters

# Terminal 2: MCP Gateway
MCP_DOMAIN_ENDPOINTS_JSON='{"auth":"http://localhost:4101/tool",...}' pnpm dev:gateway

# Terminal 3: Web App
NEXT_PUBLIC_GATEWAY_URL="http://localhost:3001" pnpm --filter @matex/web dev
```

### Accessing the App

- Open `http://localhost:3000`
- Sidebar navigation shows all available pages
- Active page is highlighted in cyan

### Navigation Structure

| Section | Pages |
|---------|-------|
| Main Flow | Overview, Dashboard, Listings, Search, Auctions, Messages, Checkout |
| Operations | Escrow, Logistics, Booking, Contracts |
| Test Harness | Phase 2 Trust, Phase 3 Ops, Phase 4 Intel, AI Copilot |
| Account | Auth + KYC |

---

## 3. User Manual — UI Pages

### 3.1 Auth Page (`/auth`)

**Purpose:** Register new accounts and login to get authentication tokens.

**Fields:**
- Email (pre-filled with unique test email)
- Phone (pre-filled with random Canadian number)
- Password (pre-filled with strong default)

**Actions:**
- **Register:** Creates a new user account. Returns `user_id`.
- **Login:** Authenticates and stores JWT token in browser. Returns `access_token`.

**After login:** Token is saved to localStorage and automatically used for all subsequent API calls across all pages.

**Copyable output:** `user_id` chip appears after successful register/login.

---

### 3.2 Listings Page (`/listings`)

**Purpose:** Create and publish material listings.

**Fields:**
- Seller ID (auto-fills from last registered user)
- Category ID (optional — auto-assigned if empty)
- Title, Quantity, Asking Price

**Actions:**
- **Create listing:** Creates a draft listing. Returns `listing_id`.
- **Publish listing:** Changes listing status to `active`. Makes it searchable.

**Copyable output:** `listing_id` chip.

---

### 3.3 Search Page (`/search`)

**Purpose:** Search for active listings by keyword.

**Fields:**
- Query (default: "copper")

**Actions:**
- **Run search:** Searches `listing_mcp.listings` where `status='active'` and title/description matches query. Returns matching results with prices.

---

### 3.4 Messaging Page (`/messaging`)

**Purpose:** Create negotiation threads and send messages between users.

**Fields:**
- Listing ID (auto-fills from last created listing)
- Participants (comma-separated user IDs, auto-fills from tracked IDs)
- Subject, Thread ID, Sender ID, Message content

**Actions:**
- **Create thread:** Creates a new messaging thread linked to a listing.
- **Send message:** Adds a message to an existing thread.

**Copyable output:** `thread_id`, `message_id` chips.

---

### 3.5 Checkout Page (`/checkout`)

**Purpose:** Process payments for orders.

**Fields:**
- User ID, Amount, Order ID, Payment Method

**Actions:**
- **Process payment:** Creates a transaction record. Returns `transaction_id`.

**Copyable output:** `transaction_id` chip.

---

### 3.6 Dashboard Page (`/dashboard`)

**Purpose:** View all captured test IDs and reset test data.

**Displays:** JSON view of all IDs captured during the session (userIds, listingIds, threadIds, messageIds, transactionIds, verificationIds, escrowIds, auctionIds, lotIds, inspectionIds, bookingIds).

**Actions:**
- **Reset test data:** Deletes all tracked entities from the database. Only works in non-production environments.

---

### 3.7 Phase 2 Trust Page (`/phase2`)

**Purpose:** Test KYC, escrow, auction, inspection, and booking workflows interactively.

**Sections:**

| Section | Actions |
|---------|---------|
| KYC | Start verification, Review verified |
| Escrow | Create escrow, Hold funds, Release funds |
| Auction + Bids | Create auction, Add lot, Place lot bid |
| Inspection + Booking | Request inspection, Evaluate discrepancy, Create booking |

All actions produce copyable ID chips and raw API output.

---

### 3.8 Phase 3 Ops Page (`/phase3`)

**Purpose:** Test logistics, contracts, disputes, tax, and notifications.

**Sections:**

| Section | Actions |
|---------|---------|
| Logistics | Get carrier quotes, Book shipment, Update tracking |
| Supply Contracts | Create contract, Activate |
| Disputes | File dispute, Escalate, Resolve |
| Tax + Invoicing | Calculate tax (ON to ON), Generate invoice |
| Notifications | Send notification |

---

### 3.9 Phase 4 Intel Page (`/phase4`)

**Purpose:** Test analytics, pricing, credit, and admin functions.

**Sections:**

| Section | Actions |
|---------|---------|
| Analytics | Dashboard stats, Revenue report (30d) |
| Pricing + Market Data | Capture LME copper price, Get copper prices, Create price alert |
| Credit Facilities | Assess credit (score 720), Get facility, Freeze facility |
| Admin Controls | Platform overview, Suspend user, Unsuspend user |

---

### 3.10 AI Copilot Page (`/copilot`)

**Purpose:** Natural language interface to all MCP tools.

**Features:**
- Chat interface with conversation history
- Quick-action suggestion chips
- Tool call details expandable per message
- Context auto-injected from session (user_id, listing_id, thread_id)

**Supported commands:** See Section 7.

---

### 3.11 Static Mockup Pages

These pages show visual mockups with a cyan banner linking to the interactive harness:

| Page | Mockup Content | Harness Link |
|------|---------------|-------------|
| `/auction` | Live auction room with bid stream | Phase 2 |
| `/escrow` | Escrow management with timeline | Phase 2 |
| `/booking` | Booking calendar with inspections | Phase 2 |
| `/logistics` | Shipment tracking with carrier quotes | Phase 3 |
| `/contracts` | Supply contract management | Phase 3 |

---

## 4. Test Scenarios by Domain

### 4.1 Authentication (auth-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| AUTH-01 | Register new user | Go to /auth, click Register | HTTP 200, user_id returned |
| AUTH-02 | Register with missing email | Clear email field, click Register | Validation error: "Missing required fields: email" |
| AUTH-03 | Login with valid credentials | Enter registered email/password, click Login | HTTP 200, JWT token stored |
| AUTH-04 | Login with invalid credentials | Enter wrong password | HTTP 400, "Invalid credentials" error |
| AUTH-05 | Token persistence | Login, navigate to /listings | Seller ID auto-fills from stored user |

### 4.2 Listings (listing-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| LIST-01 | Create listing | Fill seller_id and title, click Create | HTTP 200, listing_id returned, status "draft" |
| LIST-02 | Create without seller_id | Clear seller_id, click Create | Validation error |
| LIST-03 | Publish listing | Create a listing, then click Publish | HTTP 200, status "active", published_at timestamp |
| LIST-04 | Publish without listing_id | Clear listing_id, click Publish | Validation error |
| LIST-05 | Environmental permit expired | Create listing with expired permit data | "PERMIT_EXPIRED" error (operational rule) |

### 4.3 Search (search-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| SRCH-01 | Search active listings | Publish a listing, then search by title keyword | Published listing appears in results |
| SRCH-02 | Search with no matches | Search for random gibberish | Empty results array, total=0 |
| SRCH-03 | Search without query | Clear query field, click Search | Validation error |

### 4.4 Messaging (messaging-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| MSG-01 | Create thread | Enter 2 participant IDs, click Create thread | HTTP 200, thread_id returned |
| MSG-02 | Send message | Enter thread_id, sender_id, content, click Send | HTTP 200, message_id returned |
| MSG-03 | Create thread with < 2 participants | Enter only 1 ID | Validation error or DB error |

### 4.5 Payments (payments-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| PAY-01 | Process payment | Enter user_id and amount, click Process | HTTP 200, transaction_id returned, status "completed" |
| PAY-02 | Process with zero amount | Set amount to 0 | Transaction created (validation depends on business rules) |

### 4.6 KYC (kyc-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| KYC-01 | Start verification | On /phase2, enter user_id, click Start verification | HTTP 200, verification_id, status "pending" |
| KYC-02 | Review and verify | Click Review verified | HTTP 200, status "verified", KYC level promoted |
| KYC-03 | KYC gate check | Assert KYC gate for level_2 after verification | Gate passes, allowed=true |

### 4.7 Escrow (escrow-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| ESC-01 | Create escrow | Click Create escrow on /phase2 | HTTP 200, escrow_id, status "created" |
| ESC-02 | Hold funds | Click Hold funds | Status changes to "funds_held" |
| ESC-03 | Release funds | Click Release funds | Status changes to "released" |
| ESC-04 | Full lifecycle | Create -> Hold -> Release | Timeline has 3 entries, final status "released" |

### 4.8 Auction + Bidding (auction-mcp, bidding-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| AUC-01 | Create auction | Click Create auction on /phase2 | HTTP 200, auction_id, status "scheduled" |
| AUC-02 | Add lot | Click Add lot | HTTP 200, lot_id, lot_number |
| AUC-03 | Place bid | Click Place lot bid | HTTP 200, bid_id, amount |
| AUC-04 | Optimistic concurrency | Two concurrent bids with stale expected_highest | Second bid returns OPTIMISTIC_CONCURRENCY_CONFLICT |

### 4.9 Inspection (inspection-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| INSP-01 | Request inspection | Click Request inspection on /phase2 | HTTP 200, inspection_id, status "requested" |
| INSP-02 | Evaluate discrepancy | Click Evaluate discrepancy (1000 expected, 900 actual) | delta_pct=-10, exceeded_tolerance=true |
| INSP-03 | CAW scale validation | Record weight with scale_certified=true but no certificate | "CAW_VALIDATION" error |

### 4.10 Booking (booking-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| BOOK-01 | Create booking | Click Create booking on /phase2 | HTTP 200, booking_id, status "pending" |
| BOOK-02 | Lead time violation | Create booking with scheduled_for < minimum lead time | "LEAD_TIME_VIOLATION" error |

### 4.11 Logistics (logistics-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| LOG-01 | Get carrier quotes | Click Get carrier quotes on /phase3 | HTTP 200, array of 3 carrier quotes |
| LOG-02 | Book shipment | Click Book shipment | HTTP 200, shipment_id, status "booked" |
| LOG-03 | Update tracking | Click Update tracking | Status changes to "in_transit" |

### 4.12 Contracts (contracts-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| CON-01 | Create contract | Click Create contract on /phase3 | HTTP 200, contract_id, status "draft" |
| CON-02 | Activate contract | Click Activate | Status changes to "active" |

### 4.13 Disputes (dispute-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| DIS-01 | File dispute | Click File dispute on /phase3 | HTTP 200, dispute_id, status "open", tier "tier_1_negotiation" |
| DIS-02 | Escalate | Click Escalate | Tier changes to "tier_2_mediation", status "escalated" |
| DIS-03 | Resolve | Click Resolve | Status changes to "resolved" |

### 4.14 Tax (tax-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| TAX-01 | Calculate ON to ON | Click Calculate tax ($22,495 ON ON) on /phase3 | HST=13%, hst_amount=$2,924.35, total=$25,419.35 |
| TAX-02 | Calculate BC | Calculate tax for BC buyer | GST 5% + PST 7% applied separately |
| TAX-03 | Calculate QC | Calculate tax for QC buyer | GST 5% + QST 9.975% applied |
| TAX-04 | Generate invoice | Click Generate invoice | Sequential MTX-YYYY-NNNNNN number assigned |

### 4.15 Notifications (notifications-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| NOTIF-01 | Send notification | Click Send notification on /phase3 | HTTP 200, notification_id, channels_sent |

### 4.16 Analytics (analytics-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| ANAL-01 | Dashboard stats | Click Dashboard stats on /phase4 | Returns active_listings, total_users, escrow_held, active_auctions |
| ANAL-02 | Revenue report | Click Revenue report (30d) | Returns transactions count, volume, commission_estimate |

### 4.17 Pricing (pricing-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| PRICE-01 | Capture market price | Click Capture LME copper on /phase4 | HTTP 200, price_id |
| PRICE-02 | Get prices | Click Get copper prices | Returns array of captured prices |
| PRICE-03 | Create alert | Click Create price alert | HTTP 200, alert_id |

### 4.18 Credit (credit-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| CRED-01 | Assess credit | Click Assess credit (score 720) on /phase4 | Tier "premium", limit $200,000 |
| CRED-02 | Get facility | Click Get facility | Returns credit facility details |
| CRED-03 | Freeze facility | Click Freeze facility | Status changes to "frozen", available_credit=0 |

### 4.19 Admin (admin-mcp)

| ID | Scenario | Steps | Expected Result |
|----|----------|-------|-----------------|
| ADM-01 | Platform overview | Click Platform overview on /phase4 | Returns total_users, total_listings, total_orders, open_disputes |
| ADM-02 | Suspend user | Click Suspend user | account_status changes to "suspended" |
| ADM-03 | Unsuspend user | Click Unsuspend user | account_status changes to "active" |

---

## 5. API Tool Reference

### Complete Tool List (114 tools across 22 domains)

| Domain | Tools |
|--------|-------|
| **auth** (7) | register, login, request_email_otp, request_phone_otp, verify_email, verify_phone, refresh_token |
| **profile** (4) | get_profile, update_profile, add_bank_account, set_preferences |
| **kyc** (5) | start_verification, submit_document, review_verification, get_kyc_level, assert_kyc_gate |
| **listing** (6) | create_listing, update_listing, upload_images, publish_listing, get_listing, get_my_listings |
| **search** (5) | search_materials, geo_search, filter_by_category, save_search, get_saved_searches, index_listing |
| **bidding** (4) | place_bid, retract_bid, get_highest_bid, flag_suspicious_bid |
| **auction** (6) | create_auction, add_lot, start_auction, place_auction_bid, close_lot, get_lot_state |
| **inspection** (5) | request_inspection, record_weight, complete_inspection, evaluate_discrepancy, get_inspection |
| **booking** (5) | create_booking, set_availability, update_booking_status, list_user_bookings, enqueue_reminder |
| **escrow** (6) | create_escrow, hold_funds, release_funds, freeze_escrow, refund_escrow, get_escrow |
| **payments** (5) | process_payment, get_wallet_balance, top_up_wallet, manage_payment_methods, get_transaction_history |
| **contracts** (6) | create_contract, activate_contract, generate_order, negotiate_terms, get_contract, terminate_contract |
| **dispute** (7) | file_dispute, submit_evidence, propose_settlement, escalate_dispute, resolve_dispute, get_dispute, update_pis |
| **logistics** (5) | get_quotes, book_shipment, update_tracking, get_shipment, generate_bol |
| **tax** (5) | calculate_tax, generate_invoice, get_invoice, void_invoice, get_remittance_summary |
| **notifications** (5) | send_notification, get_notifications, mark_read, get_preferences, update_preferences |
| **messaging** (4) | create_thread, send_message, get_thread, get_unread |
| **esign** (6) | create_document, send_for_signing, record_signature, get_document, void_document, verify_hash |
| **pricing** (6) | capture_market_price, get_market_prices, calculate_mpi, create_price_alert, get_price_alerts, check_alerts |
| **analytics** (4) | get_dashboard_stats, get_conversion_funnel, get_revenue_report, export_data |
| **admin** (6) | get_platform_overview, suspend_user, unsuspend_user, moderate_listing, get_audit_trail, update_platform_config |
| **credit** (6) | assess_credit, get_credit_facility, draw_credit, record_payment, get_credit_history, freeze_facility |

### API Call Format

All tools are called via `POST /api/gateway` with body:

```json
{
  "tool": "domain.tool_name",
  "args": { "key": "value" },
  "token": "jwt-token-here"
}
```

---

## 6. Smoke Test Suites

### Running Smoke Tests

```bash
DATABASE_URL="postgresql://..." pnpm smoke
```

### Phase 1 Smoke (6 steps)
1. Auth: create seller/buyer users
2. Profile: upsert profile + preferences
3. Listing: create and publish listing
4. Search: query active listing
5. Messaging: create thread and send message
6. Payments: wallet + topup + purchase

### Phase 2 Smoke (5 steps)
1. Bootstrap users/listing/order
2. KYC verification + gate
3. Escrow lifecycle + timeline
4. Auction + bidding + optimistic conflict
5. Inspection discrepancy + booking

### Phase 3 Smoke (6 steps)
1. Bootstrap users/listing/category/order
2. Logistics: quotes + book + track
3. Contracts: create + activate + terminate
4. Dispute: file + escalate + resolve
5. Tax: calculate + generate invoice
6. Notifications: send + read

### Phase 4 Smoke (7 steps)
1. Bootstrap user
2. Analytics: dashboard stats
3. Analytics: revenue report
4. Pricing: capture + query market price
5. Pricing: create + query alert
6. Credit: assess + query + freeze
7. Admin: platform overview + suspend/unsuspend

**Total: 24 steps, all must PASS**

---

## 7. AI Copilot Testing

### Supported Commands

| Command | Tool Called | Expected Output |
|---------|-----------|-----------------|
| "search copper wire" | search.search_materials | List of matching listings |
| "check my wallet" | payments.get_wallet_balance | Wallet balance |
| "get dashboard stats" | analytics.get_dashboard_stats | Platform KPIs |
| "get revenue report" | analytics.get_revenue_report | 30-day revenue data |
| "calculate tax for $22495 ON ON" | tax.calculate_tax | Tax breakdown with HST |
| "get shipping quotes" | logistics.get_quotes | Carrier quote array |
| "check KYC status" | kyc.get_kyc_level | Current KYC level |
| "check credit" | credit.get_credit_facility | Credit facility details |
| "get market prices for copper" | pricing.get_market_prices | Market price history |
| "show my listings" | listing.get_my_listings | User's listings |
| "show my transactions" | payments.get_transaction_history | Payment history |
| "show my bookings" | booking.list_user_bookings | Booking list |
| "show my notifications" | notifications.get_notifications | Notification list |
| "show my messages" | messaging.get_unread | Unread count |
| "create listing for Steel bales" | listing.create_listing | New listing created |
| "publish listing {id}" | listing.publish_listing | Listing published |
| "file dispute for order {id}" | dispute.file_dispute | Dispute filed |
| "send notification to {id}: hello" | notifications.send_notification | Notification sent |

### Copilot Test Scenarios

| ID | Scenario | Input | Expected |
|----|----------|-------|----------|
| COP-01 | Basic search | "search copper wire" | Tool call to search.search_materials, results shown |
| COP-02 | Unknown intent | "hello how are you" | Helpful suggestion message, no tool call |
| COP-03 | Tax calculation | "calculate tax for $10000 ON BC" | Tax calculated with ON seller, BC buyer rates |
| COP-04 | Empty input | "" (empty) | "I didn't catch that" message with suggestions |
| COP-05 | Context auto-fill | Login first, then "check my wallet" | Uses stored user_id automatically |

---

## 8. Error Handling & Edge Cases

### Validation Errors
- Missing required fields show red validation summary text
- Buttons are disabled during loading state
- Status banner shows "Last action failed" on errors

### Error Boundary
- Runtime errors on any page show error recovery UI with "Try again" button
- Located at `apps/web/app/error.tsx`

### Operational Rule Enforcement

| Rule | Trigger | Expected Error |
|------|---------|---------------|
| Permit expiry | Create listing with expired environmental permit | PERMIT_EXPIRED |
| Theft cooling | First-time seller of high-theft material | COOLING_PERIOD (72h) |
| Booking lead time | Schedule booking < minimum lead time | LEAD_TIME_VIOLATION |
| CAW certificate | Record weight as certified without certificate number | CAW_VALIDATION |
| Escrow transition | Try to release from "created" state | INVALID_TRANSITION |
| Bid too low | Bid below current highest | BID_TOO_LOW |
| Optimistic concurrency | Stale expected_highest on bid | OPTIMISTIC_CONCURRENCY_CONFLICT |

---

## 9. Performance Targets

| Metric | Target | How to Test |
|--------|--------|-------------|
| API read response (p95) | < 200ms | `pnpm load-test` |
| API write response (p95) | < 500ms | `pnpm load-test` |
| Auction bid processing (p95) | < 200ms | `pnpm load-test` |
| Event bus delivery | < 500ms | Monitor Redis Streams lag |
| Platform uptime | 99.9% | Uptime monitoring on matexhub.ca |

### Running Load Tests

```bash
GATEWAY_URL=http://localhost:3001 pnpm load-test
```

---

## 10. Regression Checklist

Run before every release:

- [ ] `pnpm smoke` — all 24 steps PASS
- [ ] `pnpm --filter @matex/web test:e2e` — Playwright 10 pages PASS
- [ ] `pnpm --filter @matex/web build` — Next.js build clean (22 routes)
- [ ] Manual walkthrough: Auth -> Listings -> Search -> Messaging -> Checkout
- [ ] Manual walkthrough: Phase 2 (KYC -> Escrow -> Auction -> Inspection -> Booking)
- [ ] Manual walkthrough: Phase 3 (Logistics -> Contracts -> Disputes -> Tax -> Notifications)
- [ ] Manual walkthrough: Phase 4 (Analytics -> Pricing -> Credit -> Admin)
- [ ] AI Copilot: "search copper wire" returns results
- [ ] AI Copilot: "calculate tax for $22495 ON ON" returns correct HST
- [ ] Gateway health check: GET /health returns 200
- [ ] Reset test data works from Dashboard page
- [ ] No console errors in browser DevTools during walkthrough
