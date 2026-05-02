# Data Residency, PIPEDA, and Quebec Law 25

This document captures Matex's posture on personal-information storage, cross-border transfers, and the Canadian privacy regimes that apply.

## Applicable regimes

| Regime | Scope | Key obligations |
|---|---|---|
| **PIPEDA** (federal) | Private-sector commercial activity across Canada (except where overridden by a substantially-similar provincial law) | Consent, purpose limitation, "comparable level of protection" for cross-border transfers, breach notification |
| **Quebec Law 25** | Personal information of Quebec residents | Transfer impact assessment for cross-border transfers; explicit consent for sensitive categories; named privacy officer; right to data portability |
| **Bill 96** (Quebec) | Language of service and contracts | French-language UI for software distributed in QC (in force June 1, 2025) |
| **PIPA (BC)** + **PIPA (AB)** | Provincial private-sector commercial activity | Substantially similar to PIPEDA |

PIPEDA does **not** require that personal information be stored in Canada. It requires comparable protection wherever the data ends up and notice to data subjects when their data crosses a border. Law 25 adds a specific transfer impact assessment for personal information of QC residents.

## Where data lives

| Data | Store | Region |
|---|---|---|
| User accounts, listings, orders, escrow, KYC documents | Supabase Postgres | **Target: `ca-central-1` (Montreal).** Verify project `fdznxcqyrocznmrgxoge` region in `supabase/config.toml`; if not Montreal, open a Supabase migration ticket. |
| Listing photos, signed contracts, KYC docs | Supabase Storage | Same region as Postgres |
| Background-job state, event bus | Upstash Redis | Closest region to Postgres (eu-west-1 currently — migrate to a US-East region until Upstash adds a CA region; never store PII in Redis payloads) |
| Application server | Railway | US-East default; no PII at rest, only transit |
| Web | Vercel | Edge / global; never read PII directly, only through the gateway over HTTPS |
| Error monitoring | Sentry (target) | EU region (avoids US CLOUD-Act exposure for the EU diaspora and adds a layer for Quebec users) |
| Product analytics | PostHog (target) | EU Cloud or self-host on Railway in `ca-central` |

## Cross-border posture

- **Notice.** The privacy notice (`/privacy`) names the categories of personal information collected, the third parties to whom it is disclosed, and the regions where it is processed. Updated whenever a new vendor is added.
- **Comparable protection.** Standard contractual clauses (or vendor DPAs) signed with every processor of personal information: Stripe, Twilio, SendGrid, Persona / Onfido / Middesk, Anthropic / OpenAI when AI features are added.
- **Transfer impact assessment.** A short structured assessment is filed under `docs/privacy/tia/<vendor>.md` for each Quebec-relevant transfer (template TBD).
- **Zero data retention for AI.** When the AI Copilot is wired up, requests to Anthropic and OpenAI use the providers' zero-data-retention enterprise tiers. KYC documents are never sent to LLMs.

## Operational checklist

- [ ] Confirm Supabase project region. If not `ca-central-1`, plan a migration ticket within Q2.
- [ ] Stand up Sentry in EU region with PII scrubbing in `beforeSend`.
- [ ] PostHog instance in EU region (or self-hosted in `ca-central`).
- [ ] Privacy officer named on `/privacy` (Law 25 requirement). Add an `@matex.ca` mailbox.
- [ ] Vendor DPAs filed under `docs/privacy/dpa/`.
- [ ] Annual PIPEDA + Law 25 review on the calendar.

## What we're not doing

- We are not building a separate Canadian-only data plane today. The single Montreal-region Postgres + EU-region observability + sanitized-error pipeline is enough for Phase 1. We revisit if a Tier-1 enterprise customer demands data-residency contracts, or if the OPC or CAI issues guidance that disagrees with this posture.
