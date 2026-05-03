-- C7 listing-detail fields (PR #15 UI is forward-compatible with these).
--
-- Adds the optional columns that the listing-detail page reads via the
-- CertifiedWeightCard, InspectionReportSection, and ConfidenceStack
-- components shipped in PR #15.
--
-- All columns are nullable + additive. Safe to run on a populated
-- `listing_mcp.listings` table — no existing rows are touched, no defaults
-- back-filled. Until each column is populated for a given listing, the UI
-- shows a "verification pending" / "report not yet uploaded" / "reference
-- price not yet wired" placeholder.
--
-- Once these columns exist, listing-mcp.get_listing automatically surfaces
-- them (it selects *), so no MCP server change is needed.

ALTER TABLE listing_mcp.listings
  ADD COLUMN IF NOT EXISTS certified_weight_kg      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS certifier_name           VARCHAR(200),
  ADD COLUMN IF NOT EXISTS certified_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inspection_report_url    TEXT,
  ADD COLUMN IF NOT EXISTS inspector_name           VARCHAR(200),
  ADD COLUMN IF NOT EXISTS inspected_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lme_reference_cad_per_mt NUMERIC(12,2);

COMMENT ON COLUMN listing_mcp.listings.certified_weight_kg
  IS 'Independently weighed net mass in kg. Populated by certifier upload flow (deferred).';

COMMENT ON COLUMN listing_mcp.listings.certifier_name
  IS 'Name of the third party that signed the weighbridge ticket.';

COMMENT ON COLUMN listing_mcp.listings.certified_at
  IS 'When the weight was certified.';

COMMENT ON COLUMN listing_mcp.listings.inspection_report_url
  IS 'URL to the third-party inspection PDF in object storage. Populated by inspection-mcp once an inspector files the report.';

COMMENT ON COLUMN listing_mcp.listings.inspector_name
  IS 'Name of the inspector who filed the report.';

COMMENT ON COLUMN listing_mcp.listings.inspected_at
  IS 'When the inspection was completed.';

COMMENT ON COLUMN listing_mcp.listings.lme_reference_cad_per_mt
  IS 'LME / Fastmarkets reference price per metric tonne in CAD. Populated by price-mcp once the Metals-API / Fastmarkets subscription is provisioned. NULL until then; UI shows a "soft" placeholder.';
