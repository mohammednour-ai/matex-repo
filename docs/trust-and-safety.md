# Trust & Safety Promise

A B2B marketplace lives or dies on trust signals visible to buyers and sellers at the moment of decision. This document codifies the explicit promises Matex makes, where they appear in the UI, and which underlying systems back them.

## Promises (homepage + listing pages)

1. **Verified sellers.** Every seller above Tier 1 (see `docs/kyb-tiers.md`) is checked against corporate registration, beneficial ownership, and sanctions watchlists. Sellers who pass Tier 2 display a **Matex Verified** badge on every listing.
2. **Escrow protection.** Funds are held by Matex on the buyer's behalf until inspection passes and the buyer accepts the shipment. Sellers are paid within 15 business days of acceptance, or earlier if the buyer accepts immediately.
3. **Independent inspection.** Buyers can request a third-party inspection before release. The inspector's signed PDF report (with QR-code audit trail) is attached to the order. If the inspection fails, the buyer is refunded in full and the seller pays the inspection fee.
4. **Certified weights.** All transactions over CAD $10,000 require a certified scale ticket. Discrepancies above the configured tolerance (`config.weight_tolerance_pct`, default 2%) automatically open a dispute.
5. **Tax handled.** Matex collects and remits applicable sales tax (GST/HST/PST/QST in Canada, state-level in the US) as the marketplace facilitator. Sellers receive a tax-clean payout summary.
6. **Dispute support.** Every order has a dispute button reachable in two clicks. Tier-1 disputes are resolved by automation (refund / partial refund) within 24 hours; Tier-2 disputes are mediated by a human ops agent; Tier-3 escalates to arbitration with a written record.

## UI placement

| Surface | Element |
|---|---|
| Homepage hero | "Buy and sell with confidence" — six-icon strip linking each promise to its detail page |
| Listing card | Verified badge (orange shield icon) when seller is Tier 2+ |
| Listing detail page | Confidence stack: badge + certified-weight slot + inspection-report slot + escrow-held card + dispute history count |
| Checkout | "Your funds are held by Matex until inspection passes" line above the pay button |
| Seller dashboard | Escrow-held card with explicit "We pay you within 15 business days of buyer acceptance" copy |
| Settings → Verification | Per-tier checklist with "Why this matters" hover text |

## Underlying systems

| Promise | Owner | Code path |
|---|---|---|
| Verified sellers | `kyc-mcp` | tiered enum + `Matex Verified` badge component |
| Escrow protection | `payments-mcp` + Stripe Connect Custom accounts | manual payouts (≤90-day window per Stripe) |
| Inspection | `inspection-mcp` + future inspector network | PDF generation via `@react-pdf/renderer` (deferred — see deferred-work.md) |
| Certified weights | `inspection-mcp` weight tolerance evaluator | `evaluate_discrepancy` tool |
| Tax handled | `tax-mcp` + Stripe Tax | invoice rollup with CRA-format invoice number |
| Dispute support | `disputes-mcp` (planned) + ops console | event-store driven |

## Communication

All promises must be reviewed by Canadian counsel before they ship to the public homepage. Until then, this document is internal and the homepage uses softer language ("verified sellers," "escrow protection" without specific timelines).
