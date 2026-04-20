# Matex Platform — Comprehensive Test Case Scenarios

> **Scope:** End-to-end and feature-level test cases for all major modules.  
> **Notation:** `[ROLE]` = buyer · seller · hybrid · admin. `✓ Pass` = expected outcome. `✗ Fail` = error state.

---

## Table of Contents

1. [Authentication & Registration](#1-authentication--registration)
2. [Overview / Dashboard](#2-overview--dashboard)
3. [Listings](#3-listings)
4. [Search](#4-search)
5. [Auctions](#5-auctions)
6. [Messages](#6-messages)
7. [Checkout](#7-checkout)
8. [Escrow](#8-escrow)
9. [Logistics](#9-logistics)
10. [Inspections](#10-inspections)
11. [Contracts](#11-contracts)
12. [Account & Settings](#12-account--settings)
13. [Cross-Cutting & E2E Flows](#13-cross-cutting--e2e-flows)

---

## 1. Authentication & Registration

### TC-AUTH-001 — Successful login with valid credentials
**Role:** any  
**Preconditions:** Registered account exists  
**Steps:**
1. Navigate to `/login`
2. Select "Sign in" tab
3. Enter valid email and password
4. Click "Sign in"

**Expected:** Redirected to `/dashboard`. Token stored in `localStorage`. User name visible in nav.

---

### TC-AUTH-002 — Login with invalid credentials
**Role:** any  
**Steps:**
1. Enter wrong password for a valid email
2. Click "Sign in"

**Expected:** Error banner "Invalid credentials" or equivalent. No redirect. No token stored.

---

### TC-AUTH-003 — Login with unverified account
**Role:** any  
**Steps:**
1. Attempt login with an account that has not completed OTP verification

**Expected:** Error message indicating email verification required. No dashboard access.

---

### TC-AUTH-004 — Registration — happy path (buyer)
**Role:** new user  
**Steps:**
1. Navigate to `/login`, click "Create account"
2. Enter valid email, Canadian phone (`+1 416 555 0100`), password (≥ 8 chars)
3. Select "I am primarily a: Buyer"
4. Click "Create account" → Step 2 Contact
5. Enter first name, last name, company name, job title → Next
6. Step 2/5 Trading Profile: select line of business chips → Next
7. Step 3/5 Commercial Preferences: select services and payment method → Next
8. Step 4/5 Geography: select provinces, toggle cross-border → Next
9. Step 5/5 How We Found Each Other: select referral source → Continue to verification
10. Enter 6-digit OTP from email
11. Click "Verify & enter marketplace"

**Expected:** Redirected to `/dashboard`. Profile data saved to `search_prefs`. No seller-specific fields (lot size, sell categories) in payload.

---

### TC-AUTH-005 — Registration — seller conditional fields
**Role:** new seller  
**Steps:**
1-3. Same as TC-AUTH-004 but select "Seller"
4. Proceed through profile sections
5. In Trading Profile, verify "Materials you buy" and "My purchasing decision role" are NOT shown

**Expected:** Buy-interest and decision-authority fields hidden. Sell categories and lot size visible. Payload omits `buy_interests` and `decision_authority`.

---

### TC-AUTH-006 — Registration — skip all profile sections
**Role:** new user  
**Steps:**
1. Complete Step 1 credentials → proceed to profile
2. Click "Skip all →" on first section

**Expected:** OTP request fires immediately. After verification, user reaches dashboard with no profile data saved (no `profile.update_profile` call if all skipped).

---

### TC-AUTH-007 — Registration — invalid phone number
**Role:** new user  
**Steps:**
1. Enter email and password but phone `555-1234` (no country code)
2. Click "Create account"

**Expected:** Inline error "Enter a valid +1 Canadian phone number". Form does not submit.

---

### TC-AUTH-008 — Registration — weak password
**Role:** new user  
**Steps:**
1. Enter password with 5 characters
2. Click "Create account"

**Expected:** Inline error "Password must be at least 8 characters."

---

### TC-AUTH-009 — Registration — invalid email
**Role:** new user  
**Steps:**
1. Enter `notanemail` in the email field
2. Submit

**Expected:** Error "Enter a valid email address."

---

### TC-AUTH-010 — OTP expiry / wrong code
**Role:** new user in verify step  
**Steps:**
1. Enter `000000` (wrong code) in the OTP field

**Expected:** Error "Verification failed." OTP input cleared. User stays on verify step.

---

### TC-AUTH-011 — Session persistence after page reload
**Role:** logged-in user  
**Steps:**
1. Log in successfully
2. Hard-refresh `/dashboard`

**Expected:** User remains logged in. Token read from `localStorage`. No redirect to login.

---

### TC-AUTH-012 — Unauthenticated access redirects to login
**Role:** unauthenticated  
**Steps:**
1. Navigate directly to `/dashboard`, `/listings`, `/escrow`, `/settings`

**Expected:** All redirect to `/login`. No dashboard content rendered.

---

### TC-AUTH-013 — Google / LinkedIn OAuth buttons present
**Role:** any  
**Steps:**
1. Open `/login`
2. Verify "Continue with Google" and "Continue with LinkedIn" buttons are visible

**Expected:** Both buttons render with correct branding. (Integration test: clicking initiates OAuth flow.)

---

## 2. Overview / Dashboard

### TC-DASH-001 — Dashboard loads all stat cards
**Role:** buyer or seller  
**Steps:**
1. Log in and navigate to `/dashboard`

**Expected:** Cards shown for Active Listings, Wallet Balance, Unread Messages, Escrow Held. Values come from respective MCP tools. Loading spinners appear then resolve.

---

### TC-DASH-002 — Quick actions differ by account type
**Role:** buyer vs seller  
**Steps:**
1. Log in as buyer → note quick-action order
2. Log out, log in as seller → note quick-action order

**Expected:** Buyer sees Search first. Seller sees Create Listing first. Both see all actions.

---

### TC-DASH-003 — Notification mark as read
**Role:** any  
**Steps:**
1. Dashboard has unread notifications in the list
2. Click the mark-read button (✓ icon) on a notification

**Expected:** Notification removed or marked visually. Unread message count decrements.

---

### TC-DASH-004 — KYC badge display
**Role:** user with KYC level 0  
**Steps:**
1. Log in with unverified KYC account
2. View dashboard

**Expected:** KYC warning badge visible. Link to `/settings` KYC tab.

---

### TC-DASH-005 — Dashboard with API failures (graceful degradation)
**Role:** any  
**Steps:**
1. Simulate one MCP tool failing (e.g. `analytics.get_dashboard_stats` returns 500)
2. Load dashboard

**Expected:** Failed section shows inline error string. Other sections still load. No full-page crash.

---

### TC-DASH-006 — Upcoming bookings widget
**Role:** seller with active bookings  
**Steps:**
1. Log in as seller who has booking slots set
2. View dashboard

**Expected:** Upcoming bookings listed with date/time and listing reference.

---

### TC-DASH-007 — Notification click navigates to relevant page
**Role:** any  
**Steps:**
1. Click a notification referencing a listing, escrow, or checkout item

**Expected:** Navigates to correct page with the referenced resource.

---

## 3. Listings

### TC-LIST-001 — View own listings
**Role:** seller  
**Steps:**
1. Navigate to `/listings`
2. Default tab is "All"

**Expected:** All seller's listings shown. Each card displays title, status badge (draft/active/sold/ended), sale mode badge.

---

### TC-LIST-002 — Filter listings by status tab
**Role:** seller  
**Steps:**
1. Click "Active", "Draft", "Sold", "Ended" tabs

**Expected:** Each tab filters to only that status. "All" shows everything.

---

### TC-LIST-003 — Create listing — fixed price (happy path)
**Role:** seller  
**Steps:**
1. Navigate to `/listings/create`
2. Step 1 — Material: fill title, description, category, material type, quantity, unit
3. Step 2 — Sale mode: select "Fixed Price", enter asking price
4. Step 3 — Logistics/Tax: enter location, weight; get logistics quote; enable inspection
5. Step 4 — Review: verify summary
6. Step 5 — Publish: click "Publish Listing"

**Expected:** Listing created with `listing.create_listing`, then `listing.publish_listing`. Redirected to `/listings`. New listing appears as "active".

---

### TC-LIST-004 — Create listing — auction mode
**Role:** seller  
**Steps:**
1. Step 2 — Sale mode: select "Auction"
2. Enter starting bid and bid end datetime
3. Complete remaining steps and publish

**Expected:** Listing created with `sale_mode: "auction"`. `bid_end` stored. Listing appears in auctions.

---

### TC-LIST-005 — Create listing — bidding mode
**Role:** seller  
**Steps:**
1. Step 2 — Sale mode: select "Bidding"
2. Enter starting price
3. Publish

**Expected:** Listing created with `sale_mode: "bidding"`. Bids can be placed by buyers.

---

### TC-LIST-006 — Create listing — validation errors
**Role:** seller  
**Steps:**
1. Step 1: leave title blank, click "Next"
2. Step 2: leave price blank on fixed-price mode, click "Next"

**Expected:** Step 1 error: "Complete required fields". Price validation prevents progression.

---

### TC-LIST-007 — Archive a listing
**Role:** seller  
**Steps:**
1. On `/listings`, click archive icon on an active listing
2. Confirm prompt

**Expected:** `listing.archive_listing` called. Listing moves to "ended" or disappears from active tab.

---

### TC-LIST-008 — View listing detail page
**Role:** buyer  
**Steps:**
1. Navigate to `/listings/{id}` for a published listing

**Expected:** Full detail rendered: title, gallery, description, price, seller info, logistics estimate, auction/bid section if applicable.

---

### TC-LIST-009 — Place a bid on a bidding listing
**Role:** buyer  
**Steps:**
1. Open a listing with `sale_mode: "bidding"`
2. Click "Place Bid"
3. Enter amount above current highest bid
4. Confirm

**Expected:** `bidding.place_bid` called with correct amount. Success message. Highest bid updates.

---

### TC-LIST-010 — Bid below minimum rejected
**Role:** buyer  
**Steps:**
1. Open bid modal
2. Enter amount lower than `current_bid + 1`
3. Submit

**Expected:** Validation error shown. API not called.

---

### TC-LIST-011 — Message seller from listing detail
**Role:** buyer  
**Steps:**
1. Open listing detail
2. Click "Message Seller"
3. Enter message and send

**Expected:** `messaging.create_thread` called. User redirected or modal confirms thread created.

---

### TC-LIST-012 — Add listing to favourites
**Role:** buyer  
**Steps:**
1. Open listing detail
2. Click favourite/heart icon

**Expected:** `listing.add_favorite` called. Icon changes to filled state.

---

### TC-LIST-013 — Logistics quote on listing detail
**Role:** buyer  
**Steps:**
1. Open listing detail
2. Trigger shipping quote (auto or button)

**Expected:** `logistics.get_quotes` called with listing location and buyer destination. At least one carrier quote displayed.

---

### TC-LIST-014 — Book inspection slot
**Role:** buyer  
**Steps:**
1. Open listing that has inspection enabled
2. Select available slot from booking calendar
3. Confirm booking

**Expected:** `booking.create_booking` called. Confirmation shown. Slot removed from available list.

---

### TC-LIST-015 — SaleModeBadge graceful fallback
**Role:** any  
**Steps:**
1. Load a listing whose `sale_mode` is null or an unrecognised value

**Expected:** Badge renders with fallback label (raw value or "Unknown"). No crash.

---

## 4. Search

### TC-SRCH-001 — Basic keyword search
**Role:** buyer  
**Steps:**
1. Navigate to `/search`
2. Type "steel coil" in the search box
3. Wait for debounce (300 ms) or press Enter

**Expected:** `search.search_materials` called with `q: "steel coil"`. Results list updates.

---

### TC-SRCH-002 — Filter by category
**Role:** buyer  
**Steps:**
1. Select category "Ferrous Metals" from filter panel
2. Observe results

**Expected:** Results filtered. API called with category param. Non-matching listings removed.

---

### TC-SRCH-003 — Filter by price range
**Role:** buyer  
**Steps:**
1. Set min price $500, max price $5,000
2. Observe results

**Expected:** Only listings within price range shown.

---

### TC-SRCH-004 — Filter by province
**Role:** buyer  
**Steps:**
1. Select "Ontario" from province filter

**Expected:** Results scoped to Ontario sellers.

---

### TC-SRCH-005 — Filter by sale mode
**Role:** buyer  
**Steps:**
1. Select "Auction" filter

**Expected:** Only auction-mode listings returned.

---

### TC-SRCH-006 — Inspection-required filter
**Role:** buyer  
**Steps:**
1. Toggle "Inspection only" filter on

**Expected:** Only listings with `inspection_required: true` returned.

---

### TC-SRCH-007 — Sort results
**Role:** buyer  
**Steps:**
1. Change sort to "Price: Low to High"
2. Then "Price: High to Low"
3. Then "Newest"

**Expected:** Results reorder correctly on each sort change.

---

### TC-SRCH-008 — Save search
**Role:** logged-in buyer  
**Steps:**
1. Perform a search with filters
2. Click "Save search"

**Expected:** `search.save_search` called. Search name auto-populated from query or "Saved search". Confirmation shown.

---

### TC-SRCH-009 — Load saved search
**Role:** logged-in buyer  
**Steps:**
1. Open `/search`
2. Select a previously saved search from the dropdown

**Expected:** Filters pre-populated. `search.search_materials` called immediately with saved params.

---

### TC-SRCH-010 — Message seller from search result
**Role:** buyer  
**Steps:**
1. Hover/click on a result card
2. Click "Message Seller"
3. Enter message and send

**Expected:** `messaging.create_thread` called. Thread created with correct listing context.

---

### TC-SRCH-011 — Empty results state
**Role:** buyer  
**Steps:**
1. Search for "zzxyzzy_nonexistent_material"

**Expected:** Empty state UI shown. No crash. Suggestion to clear filters or save search not offered.

---

### TC-SRCH-012 — Search with query param pre-fill
**Role:** buyer  
**Steps:**
1. Navigate to `/search?q=aluminum`

**Expected:** Search box pre-filled with "aluminum". Search fires on load.

---

## 5. Auctions

### TC-AUC-001 — View live auctions list
**Role:** buyer  
**Steps:**
1. Navigate to `/auction`
2. View "Live" tab

**Expected:** Active auctions displayed with countdown timers, lot count, and current bid.

---

### TC-AUC-002 — View upcoming auctions
**Role:** buyer  
**Steps:**
1. Click "Upcoming" tab

**Expected:** Upcoming auctions shown with start date/time.

---

### TC-AUC-003 — View completed auctions
**Role:** any  
**Steps:**
1. Click "Completed" tab

**Expected:** Past auctions shown with final price and winner (if exposed).

---

### TC-AUC-004 — Enter auction room
**Role:** registered bidder  
**Steps:**
1. Click on a live auction card
2. Navigate to `/auction/{id}`

**Expected:** Auction room opens. Current lot, bid history, and bid panel visible.

---

### TC-AUC-005 — Register as bidder
**Role:** buyer  
**Steps:**
1. Open auction detail for an upcoming/live auction
2. Click "Register to bid"

**Expected:** `auction.register_bidder` called. Registration confirmed. "Register" button changes to "Registered".

---

### TC-AUC-006 — Place bid with quick amount
**Role:** registered bidder  
**Steps:**
1. In auction room, click a quick-bid button (+$500, +$1,000, etc.)

**Expected:** `auction.place_auction_bid` called with `lot_id` and computed amount. Bid reflected in live feed.

---

### TC-AUC-007 — Place bid with custom amount
**Role:** registered bidder  
**Steps:**
1. Enter custom amount in bid input
2. Click "Place Bid"

**Expected:** API called with entered amount. Success confirmation shown.

---

### TC-AUC-008 — Bid below current highest rejected
**Role:** registered bidder  
**Steps:**
1. Enter amount lower than current highest bid
2. Submit

**Expected:** Error shown. API not called or server returns error.

---

### TC-AUC-009 — Auction room lobby (pre-start)
**Role:** buyer  
**Steps:**
1. Open an auction room before start time

**Expected:** Lobby/countdown view shown. Bid panel disabled.

---

### TC-AUC-010 — Auction room post-auction view
**Role:** any  
**Steps:**
1. Open a completed auction room

**Expected:** Results view shown with winning bid and lot summary.

---

### TC-AUC-011 — Auction search / filter on list page
**Role:** any  
**Steps:**
1. Type "steel" in the search box on `/auction`

**Expected:** Auction cards filtered to matching titles in real time.

---

## 6. Messages

### TC-MSG-001 — View message threads
**Role:** any  
**Steps:**
1. Navigate to `/messages`

**Expected:** Thread list rendered from `messaging.get_unread`. Each thread shows last message preview and listing title.

---

### TC-MSG-002 — Open a thread and read messages
**Role:** any  
**Steps:**
1. Click on a thread in the list

**Expected:** `messaging.get_messages` called. Message history displayed in chronological order.

---

### TC-MSG-003 — Send a message
**Role:** any  
**Steps:**
1. Open a thread
2. Type a message and click Send (or press Enter)

**Expected:** `messaging.send_message` called. Message appears optimistically in the thread. Server-confirmed on response.

---

### TC-MSG-004 — Send empty message blocked
**Role:** any  
**Steps:**
1. Click Send with an empty or whitespace-only message

**Expected:** API not called. No empty message added to thread.

---

### TC-MSG-005 — Create new thread
**Role:** buyer  
**Steps:**
1. Click "New message" / compose button
2. Enter listing ID and message text
3. Submit

**Expected:** `messaging.create_thread` called with `listing_id` and message. New thread appears in list.

---

### TC-MSG-006 — Create thread without listing ID blocked
**Role:** buyer  
**Steps:**
1. Open new thread modal
2. Leave listing ID blank
3. Submit

**Expected:** Early return / validation error. No API call.

---

### TC-MSG-007 — Thread opened from listing detail
**Role:** buyer  
**Steps:**
1. Click "Message Seller" on a listing
2. Navigate to `/messages`

**Expected:** Thread for that listing auto-selected (`?thread=` param) and message pane open.

---

### TC-MSG-008 — Listing sidebar in message pane
**Role:** buyer  
**Steps:**
1. Open a thread that has a listing attached

**Expected:** `listing.get_listing` called. Listing sidebar appears with image, title, price.

---

### TC-MSG-009 — Unread count badge updates
**Role:** any  
**Steps:**
1. Receive a new message (or simulate via dev)
2. Navigate to dashboard

**Expected:** Unread count in dashboard stat card and nav badge updated.

---

## 7. Checkout

### TC-CHK-001 — Checkout page loads with order review
**Role:** buyer  
**Steps:**
1. Navigate to `/checkout` (optionally from a listing's "Buy Now" action)

**Expected:** Step 1 — Order Review shown: line item, subtotal, tax (from `tax.calculate_tax`), total.

---

### TC-CHK-002 — Tax calculation on load
**Role:** buyer  
**Steps:**
1. Load `/checkout`

**Expected:** `tax.calculate_tax` called. Tax amount shown. Fallback mock tax used if API fails.

---

### TC-CHK-003 — Select payment method — credit card
**Role:** buyer  
**Steps:**
1. Proceed to Step 2 — Payment
2. Select "Credit / Debit Card"
3. Click Confirm

**Expected:** `payments.process_payment` called with `method: "card"`. Step 3 — Confirmation shown with invoice number.

---

### TC-CHK-004 — Select payment method — wallet
**Role:** buyer  
**Steps:**
1. Select "Wallet Balance" on payment step
2. Confirm

**Expected:** `payments.process_payment` called with `method: "wallet"`. Wallet balance decremented.

---

### TC-CHK-005 — Select payment method — credit
**Role:** buyer  
**Steps:**
1. Select "Trade Credit" on payment step
2. Confirm

**Expected:** `payments.process_payment` called with `method: "credit"`. Confirmation shown.

---

### TC-CHK-006 — Invoice generated after payment
**Role:** buyer  
**Steps:**
1. Complete payment step

**Expected:** `tax.generate_invoice` called. Invoice number shown on confirmation. Copy-to-clipboard works.

---

### TC-CHK-007 — Payment failure handling
**Role:** buyer  
**Steps:**
1. Simulate `payments.process_payment` returning an error

**Expected:** Error shown on payment step. User can retry. No redirect to confirmation.

---

### TC-CHK-008 — Checkout total matches tax + subtotal
**Role:** buyer  
**Steps:**
1. Note subtotal on Step 1
2. Note tax amount
3. Verify total = subtotal + tax

**Expected:** Arithmetic correct. No rounding errors shown.

---

## 8. Escrow

### TC-ESC-001 — View escrow list
**Role:** buyer or seller  
**Steps:**
1. Navigate to `/escrow`

**Expected:** Escrow cards listed with status badges (created, funds_held, released, frozen, etc.).

---

### TC-ESC-002 — Create escrow
**Role:** buyer  
**Steps:**
1. Navigate to `/escrow/create?order_id=ord-001`
2. Accept terms checkbox
3. Select payment method
4. Click "Fund Escrow"

**Expected:** `escrow.create_escrow` then `payments.process_payment` called. Escrow record created with status "created".

---

### TC-ESC-003 — Hold funds
**Role:** buyer  
**Steps:**
1. Find escrow in "created" status
2. Click "Hold Funds"

**Expected:** `escrow.hold_funds` called. Status changes to "funds_held".

---

### TC-ESC-004 — Release funds
**Role:** buyer (or admin after delivery confirmed)  
**Steps:**
1. Find escrow in "funds_held" status
2. Click "Release"

**Expected:** `escrow.release_funds` called. Status changes to "released".

---

### TC-ESC-005 — Freeze escrow
**Role:** admin or authorized user  
**Steps:**
1. Click "Freeze" on an escrow
2. Enter reason in `window.prompt`

**Expected:** `escrow.freeze_escrow` called with reason. Status changes to "frozen".

---

### TC-ESC-006 — File dispute
**Role:** buyer or seller  
**Steps:**
1. Click "Dispute" on an escrow
2. Confirm action

**Expected:** `dispute.file_dispute` called. Status changes to "disputed".

---

### TC-ESC-007 — Cancel / freeze without reason blocked
**Role:** any  
**Steps:**
1. Click "Freeze"
2. Cancel the `window.prompt` (empty reason)

**Expected:** API not called. Status unchanged.

---

### TC-ESC-008 — Create escrow without accepting terms blocked
**Role:** buyer  
**Steps:**
1. Navigate to `/escrow/create`
2. Do NOT check "Accept terms"
3. Click "Fund Escrow"

**Expected:** Button disabled or validation error. API not called.

---

### TC-ESC-009 — View escrow detail / conditions
**Role:** any  
**Steps:**
1. Click on an escrow card to expand / view detail

**Expected:** Release conditions, timeline, and amounts shown. `escrow.get_escrow` called with `escrow_id`.

---

## 9. Logistics

### TC-LOG-001 — Request shipping quote
**Role:** seller  
**Steps:**
1. Navigate to `/logistics`
2. Fill origin, destination, weight
3. Click "Get Quotes"

**Expected:** `logistics.get_quotes` called. At least one carrier quote returned with price and transit days.

---

### TC-LOG-002 — Fallback mock quotes if API returns empty
**Role:** seller  
**Steps:**
1. Simulate empty response from `logistics.get_quotes`

**Expected:** Fallback mock quotes displayed. No crash. UI still functional.

---

### TC-LOG-003 — Book a carrier
**Role:** seller  
**Steps:**
1. After receiving quotes, click "Book" on a carrier row

**Expected:** `logistics.book_shipment` called with quote details. Booking confirmed. Shipment record appears in shipment list.

---

### TC-LOG-004 — Generate Bill of Lading (BOL)
**Role:** seller  
**Steps:**
1. Find a booked shipment
2. Click "Generate BOL"

**Expected:** `logistics.generate_bol` called. BOL document URL or preview returned.

---

### TC-LOG-005 — Track shipment
**Role:** buyer or seller  
**Steps:**
1. Find an active shipment in the list
2. Click "Track" or expand the row

**Expected:** `logistics.get_shipment` called. Tracking status and location shown.

---

### TC-LOG-006 — Hazmat class selection
**Role:** seller  
**Steps:**
1. Toggle hazmat checkbox in quote form
2. Select hazmat class from dropdown
3. Request quote

**Expected:** `hazmat_class` included in `logistics.get_quotes` payload. Carriers that handle hazmat returned.

---

### TC-LOG-007 — Quote form validation — empty origin/destination
**Role:** seller  
**Steps:**
1. Leave origin or destination blank
2. Click "Get Quotes"

**Expected:** Validation error. API not called.

---

## 10. Inspections

### TC-INS-001 — View inspection list
**Role:** inspector / seller / buyer  
**Steps:**
1. Navigate to `/inspection`

**Expected:** Inspection cards or table rendered with status, type, date, and material name.

---

### TC-INS-002 — Switch to calendar view
**Role:** any  
**Steps:**
1. Click the calendar toggle on `/inspection`

**Expected:** Calendar view rendered with inspections on correct dates. No crash.

---

### TC-INS-003 — Complete inspection (pass)
**Role:** inspector  
**Steps:**
1. Find a pending inspection
2. Click "Complete"
3. Select result "Pass"
4. Submit

**Expected:** `inspection.complete_inspection` called with `result: "pass"`. Status updates to "completed".

---

### TC-INS-004 — Complete inspection (fail)
**Role:** inspector  
**Steps:**
1. Click "Complete" with result "Fail"

**Expected:** API called with `result: "fail"`. Status updated. Buyer/seller notified (notification triggered).

---

### TC-INS-005 — Flag discrepancy
**Role:** inspector  
**Steps:**
1. Find a completed inspection
2. Click "Flag Discrepancy"
3. Enter discrepancy details and submit

**Expected:** `inspection.evaluate_discrepancy` called. Discrepancy record created. Status updated accordingly.

---

### TC-INS-006 — Inspection tied to listing booking
**Role:** buyer  
**Steps:**
1. Book an inspection slot on a listing detail page
2. Navigate to `/inspection`

**Expected:** New inspection record appears linked to listing and booking.

---

## 11. Contracts

### TC-CON-001 — View contracts list
**Role:** buyer or seller  
**Steps:**
1. Navigate to `/contracts`

**Expected:** Contracts table rendered with title, parties, status, and value.

---

### TC-CON-002 — View market prices (LME widget)
**Role:** any  
**Steps:**
1. Navigate to `/contracts`
2. Observe price widget panel

**Expected:** `pricing.get_market_prices` called. Current LME/market prices for key materials displayed.

---

### TC-CON-003 — Request e-signature on a contract
**Role:** seller  
**Steps:**
1. Select a contract
2. Click "Request E-Sign"

**Expected:** `esign.create_document` then `esign.send_for_signing` called. Status updated to "pending signature". Signatories notified.

---

### TC-CON-004 — Activate a signed contract
**Role:** seller or admin  
**Steps:**
1. Find a contract with status "signed"
2. Click "Activate"

**Expected:** `contracts.activate_contract` called. Status changes to "active".

---

### TC-CON-005 — AI contract assistant
**Role:** any  
**Steps:**
1. Type a question in the AI chip input (e.g. "What are the payment terms?")
2. Submit

**Expected:** `POST /api/chat` call made. AI response rendered in the UI related to the contract context.

---

### TC-CON-006 — Contract linked to escrow and listing
**Role:** buyer  
**Steps:**
1. Create a contract from a completed checkout / escrow flow
2. View the contract

**Expected:** Contract references correct listing ID, order ID, and escrow ID.

---

## 12. Account & Settings

### TC-SET-001 — Update display name and province
**Role:** any  
**Steps:**
1. Navigate to `/settings` → Profile tab
2. Change display name
3. Select province from dropdown
4. Click Save

**Expected:** `profile.update_profile` called with updated fields. Success toast shown. Changes persist on reload.

---

### TC-SET-002 — Upload avatar
**Role:** any  
**Steps:**
1. Click avatar area
2. Select a JPG/PNG file

**Expected:** Object URL generated and preview shown. Saved to profile on form submit.

---

### TC-SET-003 — Update company details — valid CRA BN
**Role:** seller  
**Steps:**
1. Go to Company tab
2. Enter CRA Business Number `123456789RT0001`
3. Save

**Expected:** BN passes regex `^\d{9}(RT\d{4})?$`. `profile.update_company` called. No BN error.

---

### TC-SET-004 — Update company — invalid CRA BN
**Role:** seller  
**Steps:**
1. Enter `12345` as CRA BN
2. Attempt save

**Expected:** Inline BN error shown. Save button disabled/blocked. API not called.

---

### TC-SET-005 — KYC level 0 — start verification
**Role:** unverified user  
**Steps:**
1. Settings → KYC & Verification tab
2. Click "Start verification" for Level 1

**Expected:** `kyc.start_verification` called. UI transitions to document upload step.

---

### TC-SET-006 — KYC document upload
**Role:** level-0 user  
**Steps:**
1. After starting verification, upload a PDF or image ID document

**Expected:** `kyc.submit_document` called with document type and file reference. Pending review state shown.

---

### TC-SET-007 — KYC level progression display
**Role:** user with KYC level 2  
**Steps:**
1. Navigate to KYC tab

**Expected:** Level 1 and 2 shown as completed. Level 3 shows requirements.

---

### TC-SET-008 — Notification preferences — toggle channels
**Role:** any  
**Steps:**
1. Navigate to Notifications tab
2. Toggle email notifications off, SMS on
3. Save

**Expected:** `notifications.update_preferences` called with updated channel toggles. Changes reflected on next load.

---

### TC-SET-009 — Notification preferences — toggle event types
**Role:** any  
**Steps:**
1. Toggle "New bid received" notification off
2. Save

**Expected:** Preference saved. `notifications.update_preferences` called with event-type map updated.

---

### TC-SET-010 — Timezone selection
**Role:** any  
**Steps:**
1. Profile tab → change timezone to "America/Vancouver"
2. Save

**Expected:** `profile.update_profile` called with new timezone. Timestamps across app reflect timezone.

---

## 13. Cross-Cutting & E2E Flows

### TC-E2E-001 — Full buyer purchase flow (end-to-end)
**Role:** buyer  
**Steps:**
1. Register as buyer → complete onboarding → reach dashboard
2. Search for "steel coil" → find a fixed-price listing
3. Open listing detail → review price and logistics quote
4. Click "Buy Now" → navigate to `/checkout`
5. Review order → select payment method (wallet) → confirm
6. Invoice number received → navigate to `/escrow`
7. Fund escrow → hold funds
8. Await delivery → release funds
9. View updated wallet balance on dashboard

**Expected:** All MCP tools fire in order. Escrow lifecycle completes. Dashboard stats reflect final state.

---

### TC-E2E-002 — Full seller listing and sale flow (end-to-end)
**Role:** seller  
**Steps:**
1. Register as seller → complete onboarding
2. Create a new fixed-price listing → publish
3. Receive message from buyer → reply via `/messages`
4. Buyer places order → escrow funded
5. Seller receives escrow notification on dashboard
6. Ship goods → generate BOL via `/logistics`
7. Buyer releases escrow funds
8. View updated wallet balance

**Expected:** Notification pipeline triggers correctly. Escrow releases to seller wallet.

---

### TC-E2E-003 — Full auction flow (end-to-end)
**Role:** seller + buyer  
**Steps:**
1. Seller creates auction listing (sale_mode: auction) with starting bid and end date → publish
2. Buyer registers for auction → enters auction room
3. Buyer places bid
4. Auction end time reached → auction closes
5. Winning bidder proceeds to checkout
6. Escrow created and funds held
7. Inspection booked and completed (pass)
8. Funds released to seller

**Expected:** Auction lifecycle, inspection, and escrow all complete in sequence.

---

### TC-E2E-004 — Disputed transaction flow (end-to-end)
**Role:** buyer + admin  
**Steps:**
1. Buyer funds escrow for a listing
2. Delivery not received → buyer files dispute on `/escrow`
3. Admin receives dispute notification
4. Admin navigates to `/admin` → reviews dispute
5. Admin freezes escrow with reason
6. Admin resolves dispute → refunds buyer

**Expected:** Dispute flows through from buyer action to admin resolution. Escrow status transitions correctly.

---

### TC-E2E-005 — KYC gate on high-value transaction
**Role:** buyer with KYC level 0  
**Steps:**
1. Attempt to checkout on a listing requiring KYC level 2
2. Checkout blocked → redirected to settings/KYC

**Expected:** Appropriate gate message shown. User guided to complete KYC before proceeding.

---

### TC-E2E-006 — AI Copilot assists with listing search
**Role:** buyer  
**Steps:**
1. Navigate to `/chat`
2. Type "Find me steel pipe listings under $5,000 in Ontario"

**Expected:** Chat route maps to `search.search_materials` tool. Results returned in conversational format.

---

### TC-E2E-007 — Contract creation from completed sale
**Role:** seller  
**Steps:**
1. Complete a sale via checkout + escrow release
2. Navigate to `/contracts`
3. Create contract referencing the order
4. Request e-signature from buyer
5. Buyer signs
6. Seller activates contract

**Expected:** E-sign flow completes. Contract status progresses: draft → pending signature → signed → active.

---

### TC-E2E-008 — Multi-session security (token invalidation)
**Role:** any  
**Steps:**
1. Log in on device A
2. Log out on device A
3. On device B (still has token), navigate to a protected page

**Expected:** If token is invalidated server-side, device B redirected to login. (Or token expiry tested.)

---

### TC-E2E-009 — Admin user sees admin link and can access /admin
**Role:** platform admin  
**Steps:**
1. Log in as a user where `is_platform_admin: true`
2. Check navigation

**Expected:** "Platform admin" link visible in nav. `/admin` page accessible with all admin tools.

---

### TC-E2E-010 — Non-admin cannot access /admin
**Role:** buyer or seller  
**Steps:**
1. Navigate directly to `/admin`

**Expected:** Redirected to dashboard or 403 shown. Admin UI not rendered.

---

### TC-E2E-011 — Responsive layout on mobile viewport
**Role:** any  
**Steps:**
1. Open `/login`, `/dashboard`, `/listings`, `/messages` at 375 px width

**Expected:** All pages usable. No horizontal overflow. Navigation collapses to mobile menu. Forms remain tappable.

---

### TC-E2E-012 — MCP gateway health check
**Steps:**
1. `GET {GATEWAY_URL}/health`

**Expected:** `{ status: "ok" }` response with 200.

---

### TC-E2E-013 — Rate limiting on authenticated endpoints
**Role:** any  
**Steps:**
1. Send 60+ requests to `POST /tool` within 60 seconds from same IP

**Expected:** After threshold, gateway returns 429 Too Many Requests. Client shows appropriate error.

---

### TC-E2E-014 — Wallet balance visible and accurate after transactions
**Role:** buyer  
**Steps:**
1. Note wallet balance on dashboard
2. Complete a checkout using wallet payment
3. Refresh dashboard

**Expected:** Wallet balance reduced by payment amount. Stat card updated.

---

### TC-E2E-015 — Notifications real-time update (if WebSocket/Redis enabled)
**Role:** any  
**Steps:**
1. Log in on two tabs
2. Trigger an action that creates a notification (new bid, new message)
3. Observe second tab

**Expected:** Notification count badge updates without page refresh (via Redis pub/sub or polling).

---

## Summary Matrix

| Module | Happy Path | Validation | Error States | Role-Specific | E2E |
|---|---|---|---|---|---|
| Auth | TC-AUTH-004 | TC-AUTH-007–009 | TC-AUTH-002–003, 010 | TC-AUTH-005 | TC-E2E-001 |
| Dashboard | TC-DASH-001–002 | — | TC-DASH-005 | TC-DASH-002 | TC-E2E-001–002 |
| Listings | TC-LIST-003–005 | TC-LIST-006 | TC-LIST-015 | TC-LIST-003–005 | TC-E2E-002–003 |
| Search | TC-SRCH-001–007 | TC-SRCH-012 | TC-SRCH-011 | — | TC-E2E-006 |
| Auctions | TC-AUC-004–007 | TC-AUC-008 | TC-AUC-009–010 | TC-AUC-005 | TC-E2E-003 |
| Messages | TC-MSG-001–005 | TC-MSG-004, 006 | — | — | TC-E2E-002 |
| Checkout | TC-CHK-001–006 | TC-CHK-008 | TC-CHK-007 | — | TC-E2E-001 |
| Escrow | TC-ESC-001–006 | TC-ESC-007–008 | — | TC-ESC-005 | TC-E2E-001, 004 |
| Logistics | TC-LOG-001–005 | TC-LOG-007 | TC-LOG-002 | — | TC-E2E-002 |
| Inspections | TC-INS-003–005 | — | — | TC-INS-003 | TC-E2E-003 |
| Contracts | TC-CON-001–004 | — | — | TC-CON-006 | TC-E2E-007 |
| Settings | TC-SET-001–006 | TC-SET-004 | — | TC-SET-003 | TC-E2E-005 |

**Total test cases: 106**
