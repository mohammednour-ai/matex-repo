-- ============================================================================
-- MATEX — Add bol_number column to logistics_mcp.shipments
--
-- packages/mcp-servers/logistics-mcp/src/index.ts:298 and the matching
-- supabase/functions/logistics/index.ts generate_bol both UPDATE
-- shipments SET bol_number = ... but the column doesn't exist on
-- the table (real columns include bol_document_id UUID, but no
-- bol_number TEXT). Every prior call to logistics.generate_bol has
-- silently 422'd at the DB layer. Same shape of bug as the contracts
-- and process_payment column mismatches earlier in the audit.
--
-- The tool emits a human-readable doc reference (e.g. BOL-2026-A1B2C3D4),
-- which is a string identifier — not a UUID document FK. Adding a
-- bol_number TEXT column matches the tool's emit shape and lets
-- the UI render it (P1-11 in docs/audit/2026-05-10/p1-p2-plan.md).
--
-- bol_document_id stays as the future hook for the actual signed PDF
-- artifact in storage; bol_number is the human-visible reference users
-- quote on the phone, on paperwork, etc.
-- ============================================================================

ALTER TABLE logistics_mcp.shipments
  ADD COLUMN IF NOT EXISTS bol_number TEXT;

COMMENT ON COLUMN logistics_mcp.shipments.bol_number IS
  'Human-readable Bill of Lading reference (BOL-YYYY-XXXXXXXX) emitted by logistics.generate_bol. Separate from bol_document_id which will reference the actual PDF artifact when signed BoLs are persisted to storage.';
