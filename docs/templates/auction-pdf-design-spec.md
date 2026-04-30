# Matex Auction T&C — PDF Design Specification

Full description of every visual block, section, and input field for the designer.

---

## PAGE SETUP
- Size: A4 (210 × 297 mm)
- Margins: 18 mm top/sides, 24 mm bottom
- Font family: Inter (primary), fallback Arial
- Base font size: 10.5 pt, line height 1.65
- Colors:
  - Navy `#0a2540` — headings, borders, labels
  - Amber `#f5a623` — section accents, placeholders, highlights
  - White `#ffffff` — page background
  - Light grey `#f7f9fc` — card backgrounds
  - Border grey `#d0d8e8` — card/table borders
  - Placeholder amber bg `#fffbe6`, border `#f5a623`, text `#b36000`

---

## BLOCK 1 — HEADER (top of page)
Full-width row, navy bottom border 3px.

Left side:
- Square navy box (38×38px, rounded 6px) with amber letter "M" — logo mark
- Text "MATEX" in 18pt bold navy, "X" in amber

Right side (text, right-aligned, 2 lines):
- Line 1: "Auction Terms & Conditions" — 7.5pt, uppercase, grey
- Line 2: "Document ID:" + INPUT FIELD → `{{DOCUMENT_ID}}`

---

## BLOCK 2 — DOCUMENT TITLE (centered, below header)
- H1: "AUCTION TERMS & CONDITIONS AGREEMENT" — 15pt bold navy, uppercase, letter-spacing
- Subtitle: "Matex Materials Exchange Platform | B2B Industrial & Construction Materials" — 9pt grey

---

## BLOCK 3 — AUCTION SUMMARY CARD
Light grey card (`#f7f9fc`), 1.5px border `#d0d8e8`, rounded 6px, padding 14×18px.
2-column grid, 10 fields total:

| # | Label | Input Field |
|---|---|---|
| 1 | AUCTION ID | `{{AUCTION_ID}}` |
| 2 | AUCTION TYPE | `{{AUCTION_TYPE}}` |
| 3 | OPENING DATE & TIME | `{{AUCTION_OPEN_DATETIME}}` |
| 4 | CLOSING DATE & TIME | `{{AUCTION_CLOSE_DATETIME}}` |
| 5 | RESERVE PRICE | `{{RESERVE_PRICE_CAD}}` |
| 6 | BID INCREMENT | `{{BID_INCREMENT_CAD}}` |
| 7 | BUYER'S PREMIUM | `{{BUYERS_PREMIUM_PCT}}` |
| 8 | DEPOSIT REQUIRED | `{{DEPOSIT_REQUIRED_CAD}}` |
| 9 | GOVERNING PROVINCE | `{{GOVERNING_PROVINCE}}` |
| 10 | AGREEMENT DATE | `{{AGREEMENT_DATE}}` |

Each field: label in 8pt uppercase grey (min-width 105px) + value in 9.5pt bold navy with dashed underline. Unfilled = amber placeholder box.

---

## BLOCK 4 — SECTION 1: PARTIES
Section title bar: left amber 4px border, "1. PARTIES TO THIS AGREEMENT" in 10pt bold navy uppercase.

Three party boxes (1.5px border, rounded 5px):

**Box A — Platform Operator (fixed, no inputs)**
- Role badge: "🏛 Platform Operator"
- Legal Name: Matex Technologies Inc.
- Status: Platform intermediary only (NOT the auctioneer)
- Platform URL: matex.ca
- Contact: auctions@matex.ca

**Box B — Seller (top-left)**
- Role badge: "📦 Seller"
- INPUT: `{{SELLER_NAME}}` — Company / Legal Name
- INPUT: `{{SELLER_BN}}` — CRA Business Number
- INPUT: `{{SELLER_HST_NUMBER}}` — HST Registration Number
- INPUT: `{{SELLER_ADDRESS}}` — Registered Address
- INPUT: `{{SELLER_EMAIL}}` — Contact Email
- INPUT: `{{SELLER_KYC_LEVEL}}` — KYC Verification Level

**Box C — Buyer / Winning Bidder (full width, 2-column inside)**
- Role badge: "🏷 Buyer (Winning Bidder) — Filled upon auction close"
- INPUT: `{{BUYER_NAME}}` — Company / Legal Name
- INPUT: `{{BUYER_BN}}` — CRA Business Number
- INPUT: `{{BUYER_ADDRESS}}` — Address
- INPUT: `{{BUYER_EMAIL}}` — Contact Email
- INPUT: `{{BUYER_KYC_LEVEL}}` — KYC Level
- INPUT: `{{WINNING_BID_CAD}}` — Winning Bid (CAD)

---

## BLOCK 5 — SECTION 2: LOT DESCRIPTION TABLE
Navy header row. Alternating row bg `#f9fbfd`. Columns:

| Column | Width | Input Field per Row |
|---|---|---|
| # | 6% | Row number (static) |
| Material / Item | 22% | `{{LOT_n_DESCRIPTION}}` |
| Unit | 10% | `{{LOT_n_UNIT}}` |
| Quantity | 10% | `{{LOT_n_QTY}}` |
| Grade / Spec | 16% | `{{LOT_n_GRADE}}` |
| Location | 16% | `{{LOT_n_LOCATION}}` |
| Condition | 10% | `{{LOT_n_CONDITION}}` |
| Est. Value (CAD) | 10% | `{{LOT_n_VALUE}}` |

Final row (right-aligned label): "Total Estimated Value (CAD)" → `{{TOTAL_LOT_VALUE_CAD}}`

Below table (single line, 8.5pt grey):
- PPSA Status: `{{PPSA_STATUS}}`
- Environmental: `{{ENV_STATUS}}`
- Inspection Window: `{{INSPECTION_WINDOW}}`
- Delivery Deadline: `{{DELIVERY_DEADLINE}}`

---

## BLOCK 6 — SECTION 3: REGISTRATION & ELIGIBILITY
Body text with inline inputs:
- `{{MIN_KYC_LEVEL}}` — minimum KYC level to bid
- `{{DEPOSIT_REQUIRED_CAD}}` — deposit amount

Fixed legal text covering: KYC gate, deposit in escrow, Matex right to disqualify, B2B confirmation (Consumer Protection Act, 2002 does not apply), acceptance by bidding.

---

## BLOCK 7 — SECTION 4: BIDDING RULES
Body text with inline inputs:
- `{{OPENING_BID_CAD}}` — opening bid
- `{{BID_INCREMENT_CAD}}` — minimum increment
- `{{RESERVE_PRICE_CAD}}` — reserve price
- `{{ANTI_SNIPE_MINUTES}}` — auto-extend window (minutes)
- `{{PROXY_BIDDING_ALLOWED}}` — "permits" or "does NOT permit"

Includes mandatory **bid-rigging prohibition** paragraph (Competition Act s. 47 reference).

---

## BLOCK 8 — SECTION 5: BUYER'S PREMIUM & FEES
Inline inputs:
- `{{BUYERS_PREMIUM_PCT}}` — buyer's premium percentage
- `{{SELLER_COMMISSION_PCT}}` — seller commission percentage
- `{{MATEX_HST_NUMBER}}` — Matex HST registration number

Text: all CAD, Ontario HST 13%, buyer responsible for tax, both parties disclose HST numbers.

---

## BLOCK 9 — SECTION 6: PAYMENT TERMS & ESCROW
Inline inputs:
- `{{PAYMENT_DEADLINE_DAYS}}` — business days to pay after close
- `{{ESCROW_AUTO_RELEASE_DAYS}}` — days until auto-release
- `{{LATE_PAYMENT_INTEREST_RATE}}` — interest rate (default: prime + 3% p.a.)

Fixed legal text: invoice on close, EFT/Escrow only, deposit forfeiture on default (Howe v Smith principle stated explicitly — no proof of loss required).

---

## BLOCK 10 — SECTION 7: INSPECTION & DUE DILIGENCE
Inline inputs:
- `{{INSPECTION_WINDOW}}` — dates and hours
- `{{INSPECTION_ADDRESS}}` — full address
- `{{INSPECTION_BOOKING_DEADLINE}}` — booking cutoff

Fixed legal text:
- Occupiers' Liability Act release
- Explicit Sale of Goods Act ss. 13–16 exclusion ("as-is, where-is")
- Schedule A warranty exception

---

## BLOCK 11 — SECTION 8: DELIVERY, LOGISTICS & RISK OF LOSS
Inline inputs:
- `{{INCOTERMS}}` — EXW / DAP / FCA
- `{{DELIVERY_DEADLINE}}` — date
- `{{STORAGE_FEE_PER_DAY_CAD}}` — daily storage fee
- `{{TITLE_TRANSFER_TRIGGER}}` — e.g. "pickup by buyer's carrier"

---

## BLOCK 12 — SECTION 9: TITLE, WARRANTIES & PPSA
Fixed legal text:
- Seller's clear title warranty
- PPSA warranty (no registered security interests)
- Explicit Sale of Goods Act implied warranty exclusion
- Environmental warranty for scrap/hazardous lots
- Matex as intermediary only

---

## BLOCK 13 — SECTION 10: DISPUTE RESOLUTION
Inline inputs:
- `{{DISPUTE_WINDOW_DAYS}}` — filing window
- `{{DISPUTE_REVIEW_DAYS}}` — Matex review time
- `{{SEAT_OF_ARBITRATION}}` — Ontario city (default: Toronto)
- `{{ARBITRATION_LANGUAGE}}` — English / French / Bilingual

Fixed legal text:
- ADR Institute of Canada, Arbitration Act 1991 (Ontario)
- Class proceedings waiver
- Limitations Act, 2002 contractual shortening clause
- Escrow frozen during dispute

---

## BLOCK 14 — SECTION 11: CONFIDENTIALITY
Fixed text. No inputs.

---

## BLOCK 15 — SECTION 12: PRIVACY (PIPEDA)
Fixed text. No inputs. References PIPEDA and Matex Privacy Policy.

---

## BLOCK 16 — SECTION 13: GOVERNING LAW
Inline inputs:
- `{{GOVERNING_PROVINCE}}` — province (default: Ontario)
- `{{SEAT_OF_ARBITRATION}}` — city (default: Toronto)

---

## BLOCK 17 — SECTION 14: GENERAL PROVISIONS
Fixed text: entire agreement, severability, force majeure, Electronic Commerce Act 2000 (Ontario) e-signature clause, B2B scope confirmation, waiver clause. No inputs.

---

## BLOCK 18 — SIGNATURE SECTION
Full-width navy top border 2px. Title: "EXECUTION — AUTHORIZED SIGNATURES".
2-column grid for Seller + Buyer, then full-width platform row.

**Signature Box A — Seller**
- Role label: "📦 Seller"
- Signature line: 42px tall, solid 1.5px underline
  - Left ghost text: "Signature"
  - Right badge: "eSign" (navy box, 7pt)
  - Comment in HTML: `<!-- SIGNATURE PLACEHOLDER: {{SELLER_SIGNATURE}} -->`
- Below line fields:
  - `{{SELLER_SIGNATORY_NAME}}` — Full name
  - `{{SELLER_SIGNATORY_TITLE}}` — Job title
  - `{{SELLER_SIGNATURE_DATE}}` — Date signed
  - `{{SELLER_ESIGN_ID}}` — eSign Envelope ID

**Signature Box B — Buyer**
- Role label: "🏷 Buyer (Winning Bidder)"
- Signature line (same structure)
  - Comment: `<!-- SIGNATURE PLACEHOLDER: {{BUYER_SIGNATURE}} -->`
- Below line fields:
  - `{{BUYER_SIGNATORY_NAME}}`
  - `{{BUYER_SIGNATORY_TITLE}}`
  - `{{BUYER_SIGNATURE_DATE}}`
  - `{{BUYER_ESIGN_ID}}`

**Platform Confirmation Row (full width, dashed top border)**
- Role label: "🏛 Matex Platform — System Confirmation"
- 2-column inside:
  - Left: `{{AUCTION_ID}}`, `{{WINNING_BID_CAD}}`, `{{TOTAL_AMOUNT_DUE_CAD}}`
  - Right: `{{AUCTION_CLOSE_DATETIME}}`, `{{ESCROW_TX_ID}}`, `{{DOCUMENT_HASH}}`

---

## BLOCK 19 — FOOTER
Full-width, 1px top border, space-between layout, 8pt grey:
- Left: "Matex Technologies Inc. | matex.ca | auctions@matex.ca"
- Right: "Doc ID: {{DOCUMENT_ID}} | Generated: {{GENERATED_AT}} | Page 1 of 1"

---

## COMPLETE FIELD INVENTORY (43 fields)

### Auto-generated / System
| Field | Description | Example |
|---|---|---|
| `{{DOCUMENT_ID}}` | Unique doc reference | DOC-2026-AUC-00123 |
| `{{GENERATED_AT}}` | Timestamp | 2026-04-29 14:30 EST |
| `{{AUCTION_ID}}` | Auction reference | AUC-20260501-007 |
| `{{ESCROW_TX_ID}}` | Escrow transaction UUID | esc_abc123 |
| `{{DOCUMENT_HASH}}` | SHA-256 of signed PDF | a3f9c2... |

### Auction Setup (filled by Seller when creating auction)
| Field | Description | Example |
|---|---|---|
| `{{AUCTION_TYPE}}` | Auction format | English / Sealed Bid |
| `{{AUCTION_OPEN_DATETIME}}` | Start | 2026-05-01 09:00 EST |
| `{{AUCTION_CLOSE_DATETIME}}` | End | 2026-05-07 17:00 EST |
| `{{GOVERNING_PROVINCE}}` | Province | Ontario |
| `{{AGREEMENT_DATE}}` | Doc date | 2026-04-29 |
| `{{SEAT_OF_ARBITRATION}}` | Arbitration city | Toronto |
| `{{OPENING_BID_CAD}}` | Starting bid | CAD $5,000.00 |
| `{{RESERVE_PRICE_CAD}}` | Minimum sale price | CAD $12,500.00 |
| `{{BID_INCREMENT_CAD}}` | Minimum raise | CAD $250.00 |
| `{{BUYERS_PREMIUM_PCT}}` | Premium on hammer | 5% |
| `{{SELLER_COMMISSION_PCT}}` | Platform fee to seller | 3% |
| `{{DEPOSIT_REQUIRED_CAD}}` | Refundable deposit | CAD $1,000.00 |
| `{{LATE_PAYMENT_INTEREST_RATE}}` | Overdue rate | Prime + 3% p.a. |
| `{{ANTI_SNIPE_MINUTES}}` | Auto-extend window | 5 |
| `{{PROXY_BIDDING_ALLOWED}}` | Proxy status | permits / does NOT permit |
| `{{PAYMENT_DEADLINE_DAYS}}` | Days to pay | 3 |
| `{{ESCROW_AUTO_RELEASE_DAYS}}` | Auto-release days | 5 |
| `{{MIN_KYC_LEVEL}}` | KYC gate | 2 |
| `{{MATEX_HST_NUMBER}}` | Matex HST reg # | 123456789 RT0001 |
| `{{ARBITRATION_LANGUAGE}}` | Language | English |

### Lot Data (repeating, n = row number)
| Field | Description | Example |
|---|---|---|
| `{{LOT_n_DESCRIPTION}}` | Material name | Structural Steel I-Beams W310x97 |
| `{{LOT_n_UNIT}}` | Unit of measure | Tonne |
| `{{LOT_n_QTY}}` | Quantity | 24 |
| `{{LOT_n_GRADE}}` | Spec / grade | ASTM A992 / CSA G40.21 350W |
| `{{LOT_n_LOCATION}}` | Physical location | Ottawa, ON |
| `{{LOT_n_CONDITION}}` | Condition state | Used – Good |
| `{{LOT_n_VALUE}}` | Estimated value | CAD $10,800.00 |
| `{{TOTAL_LOT_VALUE_CAD}}` | Sum of all lots | CAD $21,600.00 |
| `{{PPSA_STATUS}}` | Liens registered? | Clear / See Schedule A |
| `{{ENV_STATUS}}` | Hazardous materials? | None / See Schedule A |
| `{{INSPECTION_WINDOW}}` | Inspection dates/hours | May 1–5, 9am–4pm EST |
| `{{INSPECTION_ADDRESS}}` | Site address | 123 Industrial Rd, Ottawa ON |
| `{{INSPECTION_BOOKING_DEADLINE}}` | Book by date | 2026-04-30 |
| `{{INCOTERMS}}` | Delivery terms | EXW |
| `{{DELIVERY_DEADLINE}}` | Pickup/deliver by | 2026-05-14 |
| `{{STORAGE_FEE_PER_DAY_CAD}}` | Daily late fee | CAD $75.00 |
| `{{TITLE_TRANSFER_TRIGGER}}` | When title moves | Pickup by buyer's carrier |
| `{{DISPUTE_WINDOW_DAYS}}` | Dispute deadline | 5 |
| `{{DISPUTE_REVIEW_DAYS}}` | Matex review time | 3 |

### Seller Identity
| Field | Description | Example |
|---|---|---|
| `{{SELLER_NAME}}` | Legal company name | Acier Montréal Inc. |
| `{{SELLER_BN}}` | CRA Business Number | 123456789 |
| `{{SELLER_HST_NUMBER}}` | HST reg # | 123456789 RT0001 |
| `{{SELLER_ADDRESS}}` | Registered address | 456 Rue Industrielle, Montréal QC |
| `{{SELLER_EMAIL}}` | Contact email | sells@aciermtl.ca |
| `{{SELLER_KYC_LEVEL}}` | Verified level | 3 |

### Buyer Identity (filled after auction close)
| Field | Description | Example |
|---|---|---|
| `{{BUYER_NAME}}` | Legal company name | BuildCo Ontario Ltd. |
| `{{BUYER_BN}}` | CRA Business Number | 987654321 |
| `{{BUYER_ADDRESS}}` | Address | 789 Commerce St, Toronto ON |
| `{{BUYER_EMAIL}}` | Contact email | purchasing@buildco.ca |
| `{{BUYER_KYC_LEVEL}}` | Verified level | 2 |
| `{{WINNING_BID_CAD}}` | Final hammer price | CAD $14,200.00 |
| `{{TOTAL_AMOUNT_DUE_CAD}}` | Hammer + premium + tax | CAD $16,819.00 |

### Signatures (filled by eSign workflow)
| Field | Description |
|---|---|
| `{{SELLER_SIGNATURE}}` | Signature image / eSign token |
| `{{SELLER_SIGNATORY_NAME}}` | Full name of signing officer |
| `{{SELLER_SIGNATORY_TITLE}}` | Job title (e.g. CEO, VP Sales) |
| `{{SELLER_SIGNATURE_DATE}}` | Date signed |
| `{{SELLER_ESIGN_ID}}` | DocuSign / Matex eSign ID |
| `{{BUYER_SIGNATURE}}` | Signature image / eSign token |
| `{{BUYER_SIGNATORY_NAME}}` | Full name |
| `{{BUYER_SIGNATORY_TITLE}}` | Job title |
| `{{BUYER_SIGNATURE_DATE}}` | Date signed |
| `{{BUYER_ESIGN_ID}}` | eSign ID |

---

## VISUAL STATES FOR PLACEHOLDER FIELDS

| State | Visual |
|---|---|
| **Filled** | Bold navy text, dashed navy underline |
| **Unfilled (pre-auction)** | Amber background `#fffbe6`, amber dashed border, amber text `#b36000`, italic label `[ FIELD_NAME ]` |
| **System-generated** | Grey italic, filled automatically on creation |
| **Post-close (buyer fields)** | Same as unfilled until auction closes |
