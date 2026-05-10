-- =============================================================================
-- YardOps schema — scrap yard operations for Ontario, Canada
-- Compliance references are marked TODO(compliance): with relevant Act/Reg links
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS yardops_mcp;

-- Enable pgcrypto for AES-256 encryption of seller PII
-- TODO(compliance): PIPEDA s.7 — all seller PII must be encrypted at rest
-- Reference: https://laws-lois.justice.gc.ca/eng/acts/P-8.6/
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- ENUMs
-- =============================================================================

CREATE TYPE yardops_mcp.payout_method AS ENUM (
  'e_transfer',
  'cheque',
  'cash',
  'account_credit'
);

CREATE TYPE yardops_mcp.ticket_status AS ENUM (
  'draft',
  'weighed',
  'classified',
  'signed',
  'completed',
  'voided'
);

CREATE TYPE yardops_mcp.lot_status AS ENUM (
  'open',
  'sorted',
  'published',
  'sold',
  'archived'
);

CREATE TYPE yardops_mcp.cat_status AS ENUM (
  'received',
  'logged',
  'submitted',
  'cleared'
);

CREATE TYPE yardops_mcp.compliance_flag_type AS ENUM (
  'prohibited_item',
  'stolen_risk',
  'bylaw_hold',
  'pipeda_breach',
  'unusual_volume'
);

-- =============================================================================
-- TENANTS — one row per scrap yard
-- =============================================================================

CREATE TABLE yardops_mcp.tenants (
  tenant_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  license_number TEXT       NULL,
  address       JSONB       NOT NULL DEFAULT '{}',
  hst_number    TEXT        NULL,
  -- TODO(compliance): Ontario HST registration required for yards with >$30k annual revenue
  -- Reference: ETA s.240, https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/gst-hst-register.html
  province      CHAR(2)     NOT NULL DEFAULT 'ON',
  settings      JSONB       NOT NULL DEFAULT '{
    "cash_threshold_cad": 100,
    "cash_allowed": true,
    "cat_hold_days": 7,
    "hst_rate": 0.13,
    "data_retention_years": 7
  }',
  -- TODO(compliance): 7-year record retention per CRA requirements (ITA s.230)
  -- Reference: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/keeping-records.html
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- YARD USERS — yard staff (separate from Matex marketplace users)
-- =============================================================================

CREATE TABLE yardops_mcp.yard_users (
  user_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL,
  password_hash TEXT        NOT NULL,
  full_name     TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('admin', 'manager', 'scale_operator', 'viewer')),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE INDEX idx_yard_users_tenant ON yardops_mcp.yard_users(tenant_id);

-- Function to hash passwords on insert/update
CREATE OR REPLACE FUNCTION yardops_mcp.hash_yard_user_password()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.password_hash <> OLD.password_hash) THEN
    NEW.password_hash := crypt(NEW.password_hash, gen_salt('bf', 10));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hash_yard_password
  BEFORE INSERT OR UPDATE ON yardops_mcp.yard_users
  FOR EACH ROW EXECUTE FUNCTION yardops_mcp.hash_yard_user_password();

-- RPC for password verification
CREATE OR REPLACE FUNCTION yardops_mcp.verify_yard_user_password(p_user_id UUID, p_password TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT password_hash = crypt(p_password, password_hash)
  FROM yardops_mcp.yard_users
  WHERE user_id = p_user_id;
$$;

-- =============================================================================
-- SELLERS — individuals/companies that sell scrap to the yard
-- =============================================================================

CREATE TABLE yardops_mcp.sellers (
  seller_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  first_name        TEXT        NOT NULL,
  last_name         TEXT        NOT NULL,
  phone             VARCHAR(20) NOT NULL,
  email             VARCHAR(255) NULL,
  address           JSONB       NOT NULL DEFAULT '{}',
  notes             TEXT        NULL,
  -- TODO(compliance): PIPEDA s.4.3 — consent required before collecting PII
  -- Reference: https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/
  pipeda_consent    BOOLEAN     NOT NULL DEFAULT false,
  pipeda_consent_at TIMESTAMPTZ NULL,
  is_blocked        BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sellers_tenant ON yardops_mcp.sellers(tenant_id);
CREATE INDEX idx_sellers_name   ON yardops_mcp.sellers(tenant_id, last_name, first_name);

-- =============================================================================
-- SELLER IDS — encrypted government ID records (PIPEDA compliance)
-- =============================================================================

CREATE TABLE yardops_mcp.seller_ids (
  id_record_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id                 UUID        NOT NULL REFERENCES yardops_mcp.sellers(seller_id) ON DELETE CASCADE,
  tenant_id                 UUID        NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  id_type                   TEXT        NOT NULL CHECK (id_type IN ('drivers_license','passport','health_card','status_card','other')),
  -- AES-256 encrypted via pgcrypto pgp_sym_encrypt
  -- TODO(compliance): PIPEDA s.4.7 — personal information must be protected by security safeguards
  id_number_encrypted       TEXT        NOT NULL,
  id_expiry                 DATE        NULL,
  province_issued           CHAR(2)     NULL,
  ocr_confidence            NUMERIC(5,2) NULL,
  id_photo_storage_key      TEXT        NULL,
  face_photo_storage_key    TEXT        NULL,
  captured_by               UUID        NULL REFERENCES yardops_mcp.yard_users(user_id),
  captured_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified                  BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX idx_seller_ids_seller ON yardops_mcp.seller_ids(seller_id);
CREATE INDEX idx_seller_ids_tenant ON yardops_mcp.seller_ids(tenant_id);

-- Helper RPC to encrypt ID numbers (called from yardops-mcp server)
CREATE OR REPLACE FUNCTION yardops_mcp.encrypt_seller_id_number(p_plain_text TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pgp_sym_encrypt(p_plain_text, current_setting('app.pii_encryption_key', true));
$$;

CREATE OR REPLACE FUNCTION yardops_mcp.decrypt_seller_id_number(p_encrypted TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pgp_sym_decrypt(p_encrypted::bytea, current_setting('app.pii_encryption_key', true));
$$;

-- =============================================================================
-- VEHICLES
-- =============================================================================

CREATE TABLE yardops_mcp.vehicles (
  vehicle_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  seller_id        UUID        NOT NULL REFERENCES yardops_mcp.sellers(seller_id),
  plate            TEXT        NOT NULL,
  province         CHAR(2)     NULL,
  vin              TEXT        NULL,
  make             TEXT        NULL,
  model            TEXT        NULL,
  year             INT         NULL,
  plate_photo_storage_key TEXT NULL,
  vin_decoded_at   TIMESTAMPTZ NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_tenant   ON yardops_mcp.vehicles(tenant_id);
CREATE INDEX idx_vehicles_seller   ON yardops_mcp.vehicles(seller_id);

-- =============================================================================
-- MATERIALS — configurable catalog per tenant
-- =============================================================================

CREATE TABLE yardops_mcp.materials (
  material_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  category      TEXT        NOT NULL CHECK (category IN ('ferrous','non_ferrous','cat_converter','ewaste','hazardous','other')),
  sub_category  TEXT        NULL,
  lme_metal     TEXT        NULL, -- maps to lme-bridge metal codes: copper, aluminum, lead, zinc, nickel
  unit          TEXT        NOT NULL DEFAULT 'kg',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  sort_order    INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_materials_tenant ON yardops_mcp.materials(tenant_id);

-- =============================================================================
-- MATERIAL PRICES — effective-dated, append-only (never overwrite)
-- =============================================================================

CREATE TABLE yardops_mcp.material_prices (
  price_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  material_id          UUID        NOT NULL REFERENCES yardops_mcp.materials(material_id),
  price_per_kg         NUMERIC(10,4) NOT NULL,
  effective_date       DATE        NOT NULL,
  expires_date         DATE        NULL,
  lme_reference_price  NUMERIC(10,2) NULL,
  lme_spread           NUMERIC(10,4) NULL,
  set_by               UUID        NULL REFERENCES yardops_mcp.yard_users(user_id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No updated_at: this table is append-only per financial record requirement
);

CREATE INDEX idx_material_prices_tenant   ON yardops_mcp.material_prices(tenant_id);
CREATE INDEX idx_material_prices_material ON yardops_mcp.material_prices(material_id, effective_date DESC);

-- Prevent updates and deletes (financial table is append-only)
CREATE OR REPLACE FUNCTION yardops_mcp.prevent_price_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'material_prices is append-only. Create a new row with an updated effective_date instead.';
END;
$$;

CREATE TRIGGER trg_no_price_update BEFORE UPDATE ON yardops_mcp.material_prices FOR EACH ROW EXECUTE FUNCTION yardops_mcp.prevent_price_mutation();
CREATE TRIGGER trg_no_price_delete BEFORE DELETE ON yardops_mcp.material_prices FOR EACH ROW EXECUTE FUNCTION yardops_mcp.prevent_price_mutation();

-- =============================================================================
-- INTAKE TICKETS
-- =============================================================================

CREATE TABLE yardops_mcp.intake_tickets (
  ticket_id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID              NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  ticket_number           TEXT              NOT NULL UNIQUE,
  seller_id               UUID              NOT NULL REFERENCES yardops_mcp.sellers(seller_id),
  vehicle_id              UUID              NULL REFERENCES yardops_mcp.vehicles(vehicle_id),
  scale_operator_id       UUID              NULL REFERENCES yardops_mcp.yard_users(user_id),
  gross_weight_kg         NUMERIC(10,2)     NULL,
  tare_weight_kg          NUMERIC(10,2)     NULL,
  net_weight_kg           NUMERIC(10,2)     GENERATED ALWAYS AS (
                            CASE WHEN gross_weight_kg IS NOT NULL AND tare_weight_kg IS NOT NULL
                              THEN gross_weight_kg - tare_weight_kg
                              ELSE NULL END
                          ) STORED,
  weighed_at              TIMESTAMPTZ       NULL,
  status                  yardops_mcp.ticket_status NOT NULL DEFAULT 'draft',
  signature_svg           TEXT              NULL,
  signed_at               TIMESTAMPTZ       NULL,
  ticket_pdf_storage_key  TEXT              NULL,
  payout_id               UUID              NULL,
  notes                   TEXT              NULL,
  created_at              TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- Auto-generate ticket number
CREATE OR REPLACE FUNCTION yardops_mcp.generate_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.ticket_number := 'YD-' || EXTRACT(YEAR FROM now()) || '-' || LPAD(nextval('yardops_mcp.ticket_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$;

CREATE SEQUENCE yardops_mcp.ticket_seq START 1;
CREATE TRIGGER trg_ticket_number BEFORE INSERT ON yardops_mcp.intake_tickets FOR EACH ROW EXECUTE FUNCTION yardops_mcp.generate_ticket_number();

CREATE INDEX idx_tickets_tenant   ON yardops_mcp.intake_tickets(tenant_id);
CREATE INDEX idx_tickets_seller   ON yardops_mcp.intake_tickets(seller_id);
CREATE INDEX idx_tickets_status   ON yardops_mcp.intake_tickets(tenant_id, status);
CREATE INDEX idx_tickets_created  ON yardops_mcp.intake_tickets(tenant_id, created_at DESC);

-- =============================================================================
-- TICKET LINES — individual material lines on a ticket
-- =============================================================================

CREATE TABLE yardops_mcp.ticket_lines (
  line_id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id             UUID          NOT NULL REFERENCES yardops_mcp.intake_tickets(ticket_id) ON DELETE CASCADE,
  material_id           UUID          NOT NULL REFERENCES yardops_mcp.materials(material_id),
  quantity_kg           NUMERIC(10,2) NOT NULL,
  unit_price_per_kg     NUMERIC(10,4) NOT NULL,
  line_total            NUMERIC(10,2) GENERATED ALWAYS AS (quantity_kg * unit_price_per_kg) STORED,
  price_schedule_id     UUID          NULL REFERENCES yardops_mcp.material_prices(price_id),
  notes                 TEXT          NULL,
  photo_storage_key     TEXT          NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_lines_ticket ON yardops_mcp.ticket_lines(ticket_id);

-- =============================================================================
-- LOTS — aggregated, sellable material batches
-- =============================================================================

CREATE TABLE yardops_mcp.lots (
  lot_id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID            NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  lot_number           TEXT            NOT NULL UNIQUE,
  material_id          UUID            NOT NULL REFERENCES yardops_mcp.materials(material_id),
  total_weight_kg      NUMERIC(12,2)   NOT NULL DEFAULT 0,
  status               yardops_mcp.lot_status NOT NULL DEFAULT 'open',
  location             TEXT            NULL,
  notes                TEXT            NULL,
  parent_lot_id        UUID            NULL REFERENCES yardops_mcp.lots(lot_id),
  exchange_listing_id  TEXT            NULL,
  created_at           TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_lots_tenant   ON yardops_mcp.lots(tenant_id);
CREATE INDEX idx_lots_material ON yardops_mcp.lots(tenant_id, material_id);
CREATE INDEX idx_lots_status   ON yardops_mcp.lots(tenant_id, status);

-- =============================================================================
-- LOT MOVEMENTS — append-only lineage log
-- =============================================================================

CREATE TABLE yardops_mcp.lot_movements (
  movement_id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id       UUID          NOT NULL REFERENCES yardops_mcp.lots(lot_id),
  from_lot_id  UUID          NULL REFERENCES yardops_mcp.lots(lot_id),
  weight_kg    NUMERIC(10,2) NOT NULL,
  action       TEXT          NOT NULL CHECK (action IN ('intake','split','merge','adjustment','published','sold','manual')),
  ticket_id    UUID          NULL REFERENCES yardops_mcp.intake_tickets(ticket_id),
  actor_id     UUID          NULL REFERENCES yardops_mcp.yard_users(user_id),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_lot_movements_lot ON yardops_mcp.lot_movements(lot_id);

-- =============================================================================
-- PAYOUTS — seller payments (append-only; corrections via reversing entries)
-- =============================================================================

CREATE TABLE yardops_mcp.payouts (
  payout_id       UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID                        NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  ticket_id       UUID                        NOT NULL REFERENCES yardops_mcp.intake_tickets(ticket_id),
  seller_id       UUID                        NOT NULL REFERENCES yardops_mcp.sellers(seller_id),
  amount          NUMERIC(10,2)               NOT NULL,
  hst_collected   NUMERIC(10,2)               NOT NULL DEFAULT 0,
  -- TODO(compliance): Ontario HST 13% per ETA s.165(2), effective 2010-07-01
  method          yardops_mcp.payout_method   NOT NULL,
  etransfer_email TEXT                        NULL,
  cheque_number   TEXT                        NULL,
  notes           TEXT                        NULL,
  processed_by    UUID                        NULL REFERENCES yardops_mcp.yard_users(user_id),
  processed_at    TIMESTAMPTZ                 NOT NULL DEFAULT now(),
  status          TEXT                        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','voided'))
);

CREATE INDEX idx_payouts_tenant  ON yardops_mcp.payouts(tenant_id);
CREATE INDEX idx_payouts_ticket  ON yardops_mcp.payouts(ticket_id);
CREATE INDEX idx_payouts_seller  ON yardops_mcp.payouts(seller_id);
CREATE INDEX idx_payouts_date    ON yardops_mcp.payouts(tenant_id, processed_at DESC);

-- =============================================================================
-- CATALYTIC CONVERTERS — Ontario compliance tracking
-- =============================================================================

CREATE TABLE yardops_mcp.cat_converters (
  cat_id                           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                        UUID            NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  ticket_id                        UUID            NOT NULL REFERENCES yardops_mcp.intake_tickets(ticket_id),
  seller_id                        UUID            NOT NULL REFERENCES yardops_mcp.sellers(seller_id),
  vehicle_id                       UUID            NULL REFERENCES yardops_mcp.vehicles(vehicle_id),
  unit_count                       INT             NOT NULL,
  total_weight_kg                  NUMERIC(8,2)    NULL,
  photos                           JSONB           NOT NULL DEFAULT '[]',
  -- TODO(compliance): VIN of source vehicle required in AB (O. Reg. 390/21) and BC.
  -- Ontario legislation pending. Capturing as best practice. See:
  -- AB: https://www.qp.alberta.ca/documents/Regs/2021_390.pdf
  -- BC: Scrap Metal Dealers Act RSBC 2015 c.15
  vin_source                       TEXT            NULL,
  no_source_reason                 TEXT            NULL,
  proof_of_ownership_storage_key   TEXT            NULL,
  converter_category               TEXT            NULL CHECK (converter_category IN ('foreign','domestic','aftermarket','diesel','hybrid') OR converter_category IS NULL),
  -- TODO(compliance): Hold period — configurable per tenant settings (default 7 days)
  -- Mirrors AB requirement under Bill 90 (2024). Ontario expected to follow.
  hold_until                       TIMESTAMPTZ     NULL,
  status                           yardops_mcp.cat_status NOT NULL DEFAULT 'received',
  notes                            TEXT            NULL,
  logged_by                        UUID            NULL REFERENCES yardops_mcp.yard_users(user_id),
  logged_at                        TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_cat_converters_tenant ON yardops_mcp.cat_converters(tenant_id);
CREATE INDEX idx_cat_converters_ticket ON yardops_mcp.cat_converters(ticket_id);
CREATE INDEX idx_cat_converters_status ON yardops_mcp.cat_converters(tenant_id, status);

-- =============================================================================
-- EXCHANGE CONNECTIONS — yard's Matex Exchange Hub credentials
-- =============================================================================

CREATE TABLE yardops_mcp.exchange_connections (
  connection_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE UNIQUE,
  matex_user_id     TEXT        NOT NULL,
  matex_access_token TEXT       NOT NULL,
  token_expires_at  TIMESTAMPTZ NULL,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  last_sync_at      TIMESTAMPTZ NULL
);

-- =============================================================================
-- DOCUMENTS — storage references for generated documents
-- =============================================================================

CREATE TABLE yardops_mcp.documents (
  document_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  ref_type      TEXT        NOT NULL CHECK (ref_type IN ('ticket','lot','report','bylaw_export','compliance')),
  ref_id        UUID        NOT NULL,
  doc_type      TEXT        NOT NULL CHECK (doc_type IN ('ticket_pdf','z_report','hst_report','bylaw_pdf','compliance_brief')),
  storage_key   TEXT        NOT NULL,
  sha256_hash   TEXT        NULL,
  created_by    UUID        NULL REFERENCES yardops_mcp.yard_users(user_id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_tenant ON yardops_mcp.documents(tenant_id);
CREATE INDEX idx_documents_ref    ON yardops_mcp.documents(ref_type, ref_id);

-- =============================================================================
-- AUDIT LOG — append-only, 7-year retention
-- TODO(compliance): CRA requires 7-year record retention (ITA s.230)
-- PIPEDA requires audit trail of all PII access (s.4.7)
-- =============================================================================

CREATE TABLE yardops_mcp.audit_log (
  audit_id      UUID        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL,
  actor_id      UUID        NULL,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   UUID        NULL,
  payload       JSONB       NOT NULL DEFAULT '{}',
  ip_address    INET        NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, created_at)
) PARTITION BY RANGE (created_at);

-- Partitions covering 2026–2033 (7-year retention window starting 2026)
CREATE TABLE yardops_mcp.audit_log_2026 PARTITION OF yardops_mcp.audit_log FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE yardops_mcp.audit_log_2027 PARTITION OF yardops_mcp.audit_log FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
CREATE TABLE yardops_mcp.audit_log_2028 PARTITION OF yardops_mcp.audit_log FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');
CREATE TABLE yardops_mcp.audit_log_2029 PARTITION OF yardops_mcp.audit_log FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');
CREATE TABLE yardops_mcp.audit_log_2030 PARTITION OF yardops_mcp.audit_log FOR VALUES FROM ('2030-01-01') TO ('2031-01-01');
CREATE TABLE yardops_mcp.audit_log_2031 PARTITION OF yardops_mcp.audit_log FOR VALUES FROM ('2031-01-01') TO ('2032-01-01');
CREATE TABLE yardops_mcp.audit_log_2032 PARTITION OF yardops_mcp.audit_log FOR VALUES FROM ('2032-01-01') TO ('2033-01-01');
CREATE TABLE yardops_mcp.audit_log_2033 PARTITION OF yardops_mcp.audit_log FOR VALUES FROM ('2033-01-01') TO ('2034-01-01');

CREATE INDEX idx_audit_log_tenant   ON yardops_mcp.audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_log_actor    ON yardops_mcp.audit_log(actor_id);
CREATE INDEX idx_audit_log_resource ON yardops_mcp.audit_log(resource_type, resource_id);

-- Prevent mutation of audit records
CREATE OR REPLACE FUNCTION yardops_mcp.prevent_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only and immutable.';
END;
$$;

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON yardops_mcp.audit_log FOR EACH ROW EXECUTE FUNCTION yardops_mcp.prevent_audit_mutation();
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON yardops_mcp.audit_log FOR EACH ROW EXECUTE FUNCTION yardops_mcp.prevent_audit_mutation();

-- =============================================================================
-- COMPLIANCE FLAGS
-- =============================================================================

CREATE TABLE yardops_mcp.compliance_flags (
  flag_id       UUID                              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID                              NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  flag_type     yardops_mcp.compliance_flag_type  NOT NULL,
  ref_type      TEXT                              NOT NULL,
  ref_id        UUID                              NOT NULL,
  notes         TEXT                              NULL,
  resolved      BOOLEAN                           NOT NULL DEFAULT false,
  resolved_by   UUID                              NULL REFERENCES yardops_mcp.yard_users(user_id),
  resolved_at   TIMESTAMPTZ                       NULL,
  created_at    TIMESTAMPTZ                       NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_flags_tenant   ON yardops_mcp.compliance_flags(tenant_id);
CREATE INDEX idx_compliance_flags_resolved ON yardops_mcp.compliance_flags(tenant_id, resolved);

-- =============================================================================
-- PROHIBITED ITEMS — configurable per tenant
-- TODO(compliance): Sec. 10 Ontario Highway Traffic Act — utility/municipal items
-- =============================================================================

CREATE TABLE yardops_mcp.prohibited_items (
  item_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES yardops_mcp.tenants(tenant_id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  description   TEXT        NULL,
  requires_supervisor_override BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- SEED default prohibited items (Ontario best practices)
-- =============================================================================

-- These are inserted via a function that runs once per new tenant
CREATE OR REPLACE FUNCTION yardops_mcp.seed_tenant_defaults(p_tenant_id UUID)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Default material catalog
  INSERT INTO yardops_mcp.materials (tenant_id, name, category, sub_category, lme_metal, unit, sort_order) VALUES
    (p_tenant_id, '#1 Copper Bare Bright',   'non_ferrous', 'copper',    'copper',   'kg', 1),
    (p_tenant_id, '#2 Copper',               'non_ferrous', 'copper',    'copper',   'kg', 2),
    (p_tenant_id, 'Yellow Brass',            'non_ferrous', 'brass',     NULL,       'kg', 3),
    (p_tenant_id, 'Red Brass',               'non_ferrous', 'brass',     NULL,       'kg', 4),
    (p_tenant_id, 'Aluminum Sheet',          'non_ferrous', 'aluminum',  'aluminum', 'kg', 5),
    (p_tenant_id, 'Cast Aluminum',           'non_ferrous', 'aluminum',  'aluminum', 'kg', 6),
    (p_tenant_id, 'Aluminum Extrusion',      'non_ferrous', 'aluminum',  'aluminum', 'kg', 7),
    (p_tenant_id, 'Insulated Copper Wire',   'non_ferrous', 'copper',    'copper',   'kg', 8),
    (p_tenant_id, 'Stainless 304',           'non_ferrous', 'stainless', NULL,       'kg', 9),
    (p_tenant_id, 'Lead',                    'non_ferrous', 'lead',      'lead',     'kg', 10),
    (p_tenant_id, 'Zinc',                    'non_ferrous', 'zinc',      'zinc',     'kg', 11),
    (p_tenant_id, 'Steel HMS 1&2',           'ferrous',     'steel',     NULL,       'kg', 20),
    (p_tenant_id, 'Cast Iron',               'ferrous',     'cast',      NULL,       'kg', 21),
    (p_tenant_id, 'Auto Bodies (shredder)',  'ferrous',     'auto',      NULL,       'kg', 22),
    (p_tenant_id, 'Catalytic Converter',     'cat_converter', NULL,      NULL,       'piece', 30),
    (p_tenant_id, 'E-Scrap / Circuit Boards','ewaste',      NULL,        NULL,       'kg', 40);

  -- Default prohibited items
  INSERT INTO yardops_mcp.prohibited_items (tenant_id, name, description, requires_supervisor_override) VALUES
    (p_tenant_id, 'Manhole Cover',            'Municipal property — prohibited under local bylaws', false),
    (p_tenant_id, 'Traffic Control Hardware', 'Guardrails, signs, signals — Highway Traffic Act', false),
    (p_tenant_id, 'Beer Kegs',               'Property of brewery — Liquor Licence Act', false),
    (p_tenant_id, 'Utility Company Branded Items', 'Hydro/gas company property', false),
    (p_tenant_id, 'Fire Hydrant Parts',       'Municipal water infrastructure', false);
END;
$$;
