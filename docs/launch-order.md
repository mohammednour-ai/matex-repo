# Launch Order

How Matex is rolled out to provinces and the US. The order is constrained by language law (Quebec Bill 96), tax registration (state-by-state nexus in the US), and where we have inspector / carrier coverage.

## Phase 1 — English-Canada launch (current)

**Provinces:** Ontario, Alberta, British Columbia.

**Why first:** Largest scrap-metal volumes, English-only acceptable, single-language UI satisfies all current legal requirements.

**Gates:**
- Stripe Connect Canada onboarding live for sellers in ON / AB / BC.
- Carrier coverage via the `carriers-bridge` for at least three carriers (Day & Ross, Purolator, Manitoulin).
- Sales-tax registration: GST/HST as a marketplace facilitator (CRA business number obtained), PST registration in BC.

**Flag state:** `bilingual_ui = false`, `qc_market_open = false`.

## Phase 2 — Quebec opt-in

**Province:** Quebec.

**Why gated:** Bill 96 (in force June 1, 2025) requires that software UIs distributed in Quebec ship a French interface. Commercial communications must be available in French. The OQLF can pursue out-of-Quebec businesses serving QC customers.

**Gates:**
- `bilingual_ui = true`: full FR-CA UI shipped, reviewed by a Quebec-resident speaker (not just an automated translator). Legal copy (terms, privacy, escrow agreement, BOL templates) reviewed by a Quebec-based francophone lawyer.
- `qc_market_open = true`: signup form accepts QC postal codes, GST/QST tax engine registered, French version of the Trust & Safety promise (`docs/trust-and-safety.md`) live.
- Customer-support coverage: at least one ops agent capable of handling French disputes.

**Failure mode:** if `bilingual_ui` is on but `qc_market_open` is off, QC users see a "Coming soon — join the waitlist" splash. Never serve a QC user an English-only checkout.

## Phase 3 — US Northeast pilot

**States:** New York, New Jersey, Pennsylvania, Massachusetts.

**Why first US:** Cross-border lane density with Ontario / Quebec ferrous flows; most existing carriers already cross.

**Gates:**
- US KYB via Middesk live; sanctions / OFAC screening tied into Tier 2.
- Stripe Connect Custom accounts in USD; `cross-border` payout policy committed (USMCA recordkeeping = 5 years per CBP).
- Sales-tax: economic-nexus thresholds tracked per state (Stripe Tax handles registration triggers, Avalara graduation when >1k transactions/mo).
- Tariff-aware checkout: Section 232 (steel + aluminum 50%) and Section 122 surcharges shown as a separate line item, never baked into a single price.

**Flag state:** `us_northeast_open = true` (new flag).

## Phase 4 — Remaining provinces and US Midwest

Saskatchewan, Manitoba, Maritimes; then Ohio, Michigan, Illinois, Indiana, Wisconsin. Driven by carrier coverage and inspector availability.

## Out of scope (this fiscal year)

- Western US (CA, WA, OR) — different carrier profile, no near-term pull.
- Mexico — USMCA-eligible but adds Spanish locale and CBP/SAT integration; revisit post Phase 4.
