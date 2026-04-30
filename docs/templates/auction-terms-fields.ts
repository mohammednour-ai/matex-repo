/**
 * All placeholders used in auction-terms.html with their types.
 * Pass this object to fillAuctionTerms() to render a ready-to-print HTML.
 */
export interface AuctionTermsFields {
  // ── Document metadata ──────────────────────────────────────────────────
  DOCUMENT_ID: string;              // e.g. "DOC-2026-AUC-00123"
  GENERATED_AT: string;             // ISO datetime, e.g. "2026-04-29 14:30 EST"

  // ── Auction header ─────────────────────────────────────────────────────
  AUCTION_ID: string;               // e.g. "AUC-20260429-001"
  AUCTION_TYPE: string;             // "English" | "Sealed Bid" | "Reserve" | "No-Reserve"
  AUCTION_OPEN_DATETIME: string;    // "2026-05-01 09:00 EST"
  AUCTION_CLOSE_DATETIME: string;   // "2026-05-07 17:00 EST"
  RESERVE_PRICE_CAD: string;        // "CAD $12,500.00"
  BID_INCREMENT_CAD: string;        // "CAD $250.00"
  BUYERS_PREMIUM_PCT: string;       // "5%"
  DEPOSIT_REQUIRED_CAD: string;     // "CAD $1,000.00"
  GOVERNING_PROVINCE: string;       // "Ontario" | "Quebec" | "British Columbia" …
  AGREEMENT_DATE: string;           // "2026-04-29"

  // ── Seller ─────────────────────────────────────────────────────────────
  SELLER_NAME: string;
  SELLER_BN: string;                // Business Number (CRA 9-digit)
  SELLER_ADDRESS: string;
  SELLER_EMAIL: string;
  SELLER_KYC_LEVEL: string;         // "2" | "3"

  // ── Buyer (populated after auction close) ──────────────────────────────
  BUYER_NAME: string;
  BUYER_BN: string;
  BUYER_ADDRESS: string;
  BUYER_EMAIL: string;
  BUYER_KYC_LEVEL: string;
  WINNING_BID_CAD: string;          // "CAD $14,200.00"
  TOTAL_AMOUNT_DUE_CAD: string;     // hammer + premium + taxes

  // ── Lot rows (extend as needed) ────────────────────────────────────────
  LOT_1_DESCRIPTION: string;        // "Structural Steel I-Beams W310x97"
  LOT_1_UNIT: string;               // "Tonne" | "Piece" | "m³"
  LOT_1_QTY: string;                // "24"
  LOT_1_GRADE: string;              // "ASTM A992 / CSA G40.21 350W"
  LOT_1_LOCATION: string;           // "Ottawa, ON"
  LOT_1_VALUE: string;              // "CAD $10,800.00"

  LOT_2_DESCRIPTION: string;
  LOT_2_UNIT: string;
  LOT_2_QTY: string;
  LOT_2_GRADE: string;
  LOT_2_LOCATION: string;
  LOT_2_VALUE: string;

  TOTAL_LOT_VALUE_CAD: string;      // "CAD $21,600.00"
  LOT_CONDITION: string;            // "Used – Good" | "New – Surplus" | "Scrap"
  INSPECTION_WINDOW: string;        // "May 1–5, 2026 (9am–4pm EST)"
  DELIVERY_DEADLINE: string;        // "2026-05-14"

  // ── Bidding rules ──────────────────────────────────────────────────────
  OPENING_BID_CAD: string;          // "CAD $5,000.00"
  ANTI_SNIPE_MINUTES: string;       // "5"
  PROXY_BIDDING_ALLOWED: string;    // "permits" | "does NOT permit"

  // ── Fees ───────────────────────────────────────────────────────────────
  SELLER_COMMISSION_PCT: string;    // "3%"

  // ── Payment / Escrow ───────────────────────────────────────────────────
  PAYMENT_DEADLINE_DAYS: string;    // "3"
  ESCROW_AUTO_RELEASE_DAYS: string; // "5"

  // ── Inspection / Delivery ──────────────────────────────────────────────
  INSPECTION_ADDRESS: string;       // "123 Industrial Rd, Ottawa ON K1A 0A1"
  INSPECTION_BOOKING_DEADLINE: string; // "2026-04-30"
  INCOTERMS: string;                // "EXW" | "DAP" | "FCA"
  STORAGE_FEE_PER_DAY_CAD: string;  // "CAD $75.00"
  TITLE_TRANSFER_TRIGGER: string;   // "pickup by buyer's carrier"

  // ── Dispute ────────────────────────────────────────────────────────────
  DISPUTE_WINDOW_DAYS: string;      // "5"
  DISPUTE_REVIEW_DAYS: string;      // "3"
  ARBITRATION_LANGUAGE: string;     // "English" | "French" | "English/French"

  // ── KYC threshold ──────────────────────────────────────────────────────
  MIN_KYC_LEVEL: string;            // "2"

  // ── Signatures (filled after eSign workflow completes) ─────────────────
  SELLER_SIGNATORY_NAME: string;
  SELLER_SIGNATORY_TITLE: string;
  SELLER_SIGNATURE_DATE: string;
  SELLER_ESIGN_ID: string;          // DocuSign / Matex eSign envelope ID

  BUYER_SIGNATORY_NAME: string;
  BUYER_SIGNATORY_TITLE: string;
  BUYER_SIGNATURE_DATE: string;
  BUYER_ESIGN_ID: string;

  // ── Platform confirmation ──────────────────────────────────────────────
  ESCROW_TX_ID: string;             // Matex escrow transaction UUID
  DOCUMENT_HASH: string;           // SHA-256 of signed PDF
}

/**
 * Replaces every {{PLACEHOLDER}} in the template HTML with the matching field value.
 * Unset fields remain as {{FIELD_NAME}} for easy identification of gaps.
 */
export function fillAuctionTerms(
  templateHtml: string,
  fields: Partial<AuctionTermsFields>
): string {
  return templateHtml.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    const value = (fields as Record<string, string>)[key];
    return value !== undefined && value !== "" ? value : match;
  });
}

/**
 * Returns the list of placeholder keys that are still unfilled in a rendered document.
 */
export function findUnfilledPlaceholders(renderedHtml: string): string[] {
  const matches = renderedHtml.matchAll(/\{\{([A-Z0-9_]+)\}\}/g);
  return [...new Set([...matches].map((m) => m[1]))];
}
