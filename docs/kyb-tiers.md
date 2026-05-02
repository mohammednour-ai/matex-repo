# KYB / KYC Tiers

This document defines the tiered verification model that gates marketplace activity. It maps the existing `kyc_mcp.kyc_levels` enum (see `supabase/migrations/20260423000000_initial_schema.sql`) to product permissions and to the underlying verification checks each tier requires.

> **Status:** Illustrative product policy. Final thresholds and check vendors must be reviewed by Canadian counsel against FINTRAC, Quebec corporate registry rules, and US BSA/AML obligations before launch. This document is the product source of truth; legal sign-off is tracked separately.

## Tiers

| Tier | DB level | Allowed actions | Required checks |
|---|---|---|---|
| **0 — Browse** | `level_0` | Read-only browsing of public listings. No bidding, listing creation, or messaging. | Email + business name (self-declared). |
| **1 — Standard** | `level_1` | List items + buy at fixed prices up to **CAD $5,000** per transaction. Direct messaging with verified counterparties. | KYC personal ID (driver's licence or passport) + business registration number lookup (CRA BN or provincial). |
| **2 — Verified Business** | `level_2` | Auctions (bid + organize) + sales up to **CAD $50,000** per transaction. Eligible for the **Matex Verified** badge on listings. | Tier 1 + KYB: corporate registration document, UBO (>25% beneficial owner) attestation, sanctions / PEP screening, business address verification. |
| **3 — Trade Credit** | `level_3` | Net-30 / Net-60 terms. Unlimited transaction value subject to per-counterparty credit limits. | Tier 2 + bank account verification (Plaid / Flinks micro-deposits) + business credit pull (Equifax Business or Dun & Bradstreet). |

## Default deny

Users start at Tier 0 on signup. Each tier upgrade is initiated by the user from `/settings`, executed by the `kyc-mcp` server, and recorded as an immutable event on the audit log. Downgrades on negative events (sanctions match, dispute pattern, returned ACH) are automatic and reversible only via ops review.

## Vendor mapping (current vs target)

| Check | Today | Target |
|---|---|---|
| KYC personal ID | `packages/bridges/onfido-bridge` (stub) | Persona dynamic flow (per-success pricing) |
| KYB corporate registration (Canada) | none | Trulioo or Equifax Business |
| KYB corporate registration (US) | none | Middesk |
| Sanctions / PEP | manual table in `kyc-mcp` (`pep_watchlist`) | Sumsub or Persona watchlist add-on |
| Bank verification | none | Plaid (US) + Flinks (CA) |
| Business credit | none | Equifax Business or D&B |

Bridges already exist as TypeScript stubs under `packages/bridges/`. The work to "activate" a tier is replacing the stub adapter with the real SDK call; the tier semantics in this doc remain stable.

## Marketplace facilitator note

For Tier 2+ sellers in jurisdictions where Matex is the marketplace facilitator, the platform collects and remits sales tax / GST / HST / QST on the seller's behalf. Stripe Tax handles US states + Canadian provinces today; complex resale-exempt flows (industrial scrap is often resale-exempt with cert) graduate to Avalara. Resale exemption certificates must be uploaded at Tier 2 onboarding.
