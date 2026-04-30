-- ============================================================================
-- MATEX B2B MARKETPLACE - COMPLETE DATABASE SCHEMA
-- MCP-First Architecture | PostgreSQL 15 + PostGIS + Supabase
-- Version: 1.0 | March 2026
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CUSTOM TYPES (ENUMS)
-- ============================================================================

-- auth-mcp
CREATE TYPE account_type AS ENUM ('individual', 'corporate', 'carrier', 'inspector');
CREATE TYPE account_status AS ENUM ('active', 'suspended', 'pending_review', 'deactivated', 'banned');
CREATE TYPE mfa_method AS ENUM ('totp', 'sms', 'email');

-- kyc-mcp
CREATE TYPE kyc_level AS ENUM ('level_0', 'level_1', 'level_2', 'level_3');
CREATE TYPE kyc_status AS ENUM ('pending', 'in_review', 'verified', 'rejected', 'expired');
CREATE TYPE kyc_doc_type AS ENUM ('passport', 'drivers_license', 'pr_card', 'selfie', 'proof_of_address', 'incorporation', 'beneficial_ownership', 'financial_statement', 'license');
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');

-- listing-mcp
CREATE TYPE price_type AS ENUM ('fixed', 'auction', 'negotiable');
CREATE TYPE listing_status AS ENUM ('draft', 'pending_review', 'active', 'sold', 'expired', 'cancelled', 'suspended');
CREATE TYPE unit_type AS ENUM ('mt', 'kg', 'g', 'troy_oz', 'units', 'lots', 'cubic_yards');

-- bidding-mcp
CREATE TYPE bid_status AS ENUM ('active', 'outbid', 'won', 'lost', 'retracted', 'cancelled');
CREATE TYPE bid_type AS ENUM ('manual', 'proxy', 'buy_now');

-- auction-mcp
CREATE TYPE auction_status AS ENUM ('scheduled', 'preview', 'live', 'paused', 'closing', 'closed', 'cancelled');
CREATE TYPE lot_status AS ENUM ('pending', 'open', 'closing', 'sold', 'unsold', 'cancelled');

-- inspection-mcp
CREATE TYPE inspection_type AS ENUM ('self', 'third_party_presale', 'buyer_onsite', 'pickup', 'delivery', 'dispute', 'lab_test');
CREATE TYPE inspection_result AS ENUM ('pass', 'pass_with_deductions', 'fail', 'pending');
CREATE TYPE inspection_status AS ENUM ('requested', 'scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE weight_point AS ENUM ('w1_seller', 'w2_carrier', 'w3_buyer', 'w4_third_party');

-- booking-mcp
CREATE TYPE event_type AS ENUM ('site_visit', 'inspection', 'lab_sample', 'pickup', 'delivery', 'auction_session', 'mediation', 'reweigh', 'onboarding');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled');

-- escrow-mcp
CREATE TYPE escrow_status AS ENUM ('created', 'funds_held', 'partially_released', 'released', 'frozen', 'refunded', 'cancelled');

-- payments-mcp
CREATE TYPE payment_method_type AS ENUM ('stripe_card', 'interac', 'eft', 'pad', 'wallet', 'letter_of_credit', 'credit_terms');
CREATE TYPE transaction_type AS ENUM ('purchase', 'deposit', 'bid_deposit', 'refund', 'commission', 'payout', 'wallet_topup', 'credit_payment', 'penalty', 'adjustment');
CREATE TYPE transaction_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded', 'adjusted', 'cancelled');

-- contracts-mcp
CREATE TYPE contract_type AS ENUM ('standing', 'volume', 'hybrid', 'index_linked', 'rfq_framework', 'consignment');
CREATE TYPE contract_status AS ENUM ('draft', 'negotiating', 'pending_signature', 'active', 'paused', 'completed', 'terminated', 'breached');
CREATE TYPE frequency_type AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'on_demand');

-- dispute-mcp
CREATE TYPE dispute_category AS ENUM ('weight', 'quality', 'non_delivery', 'late_delivery', 'partial_delivery', 'damage', 'payment', 'contract_breach', 'documentation_fraud', 'environmental');
CREATE TYPE dispute_tier AS ENUM ('tier_1_negotiation', 'tier_2_mediation', 'tier_3_arbitration');
CREATE TYPE dispute_status AS ENUM ('open', 'in_negotiation', 'in_mediation', 'in_arbitration', 'resolved', 'closed', 'escalated');

-- logistics-mcp
CREATE TYPE shipment_status AS ENUM ('quoted', 'booked', 'picked_up', 'in_transit', 'at_customs', 'delivered', 'cancelled', 'delayed');
CREATE TYPE hazmat_class AS ENUM ('none', 'class_1', 'class_2', 'class_3', 'class_4', 'class_5', 'class_6', 'class_7', 'class_8', 'class_9');

-- esign-mcp
CREATE TYPE document_template AS ENUM ('terms_of_service', 'purchase_agreement', 'supply_contract', 'credit_agreement', 'auction_terms', 'bol_acknowledgment', 'nda', 'carrier_agreement', 'dispute_resolution', 'environmental_attestation');
CREATE TYPE signing_status AS ENUM ('draft', 'sent', 'viewed', 'partially_signed', 'completed', 'voided', 'expired');

-- notifications-mcp
CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push', 'in_app');
CREATE TYPE notification_priority AS ENUM ('low', 'normal', 'high', 'critical');

-- log-mcp
CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error', 'critical');
CREATE TYPE log_category AS ENUM ('tool_call', 'event', 'external_api', 'auth', 'financial', 'admin_action', 'system_health', 'security');

-- credit
CREATE TYPE credit_tier AS ENUM ('none', 'basic', 'standard', 'premium', 'enterprise');
CREATE TYPE credit_facility_status AS ENUM ('pending', 'active', 'frozen', 'suspended', 'closed');


-- ============================================================================
-- SCHEMA: auth (auth-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS auth_mcp;

CREATE TABLE auth_mcp.users (
    user_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               VARCHAR(255) NOT NULL UNIQUE,
    phone               VARCHAR(20) NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    account_type        account_type NOT NULL,
    account_status      account_status NOT NULL DEFAULT 'pending_review',
    email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_method          mfa_method,
    mfa_secret          TEXT, -- encrypted TOTP secret
    failed_login_count  INT NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    last_login_ip       INET,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth_mcp.sessions (
    session_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    access_token_hash   TEXT NOT NULL,
    refresh_token_hash  TEXT NOT NULL UNIQUE,
    ip_address          INET,
    user_agent          TEXT,
    device_fingerprint  VARCHAR(255),
    expires_at          TIMESTAMPTZ NOT NULL,
    refresh_expires_at  TIMESTAMPTZ NOT NULL,
    revoked             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth_mcp.password_resets (
    reset_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    token_hash          TEXT NOT NULL UNIQUE,
    expires_at          TIMESTAMPTZ NOT NULL,
    used                BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON auth_mcp.users(email);
CREATE INDEX idx_users_phone ON auth_mcp.users(phone);
CREATE INDEX idx_users_status ON auth_mcp.users(account_status);
CREATE INDEX idx_sessions_user ON auth_mcp.sessions(user_id);
CREATE INDEX idx_sessions_refresh ON auth_mcp.sessions(refresh_token_hash);


-- ============================================================================
-- SCHEMA: profile (profile-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS profile_mcp;

CREATE TABLE profile_mcp.profiles (
    user_id             UUID PRIMARY KEY REFERENCES auth_mcp.users(user_id),
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    display_name        VARCHAR(200),
    avatar_url          TEXT,
    language            VARCHAR(5) NOT NULL DEFAULT 'en',
    timezone            VARCHAR(50) NOT NULL DEFAULT 'America/Toronto',
    address             JSONB, -- {street, city, province, postal_code, country}
    location            GEOGRAPHY(Point, 4326), -- PostGIS
    province            VARCHAR(2),
    country             VARCHAR(2) NOT NULL DEFAULT 'CA',
    bio                 TEXT,
    website             VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE profile_mcp.companies (
    company_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    company_name        VARCHAR(255) NOT NULL,
    business_number     VARCHAR(15), -- CRA BN: 9 digits + RT + 4 digits
    gst_hst_number      VARCHAR(15),
    industry            VARCHAR(100),
    company_size        VARCHAR(50),
    annual_volume       VARCHAR(50), -- estimated annual trade volume
    incorporation_date  DATE,
    incorporation_province VARCHAR(2),
    address             JSONB,
    location            GEOGRAPHY(Point, 4326),
    logo_url            TEXT,
    website             VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE profile_mcp.bank_accounts (
    bank_account_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    institution_name    VARCHAR(255) NOT NULL,
    institution_number  VARCHAR(3) NOT NULL, -- Canadian bank institution number
    transit_number      VARCHAR(5) NOT NULL,
    account_number_enc  TEXT NOT NULL, -- encrypted
    account_type        VARCHAR(20) NOT NULL DEFAULT 'checking',
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    is_default          BOOLEAN NOT NULL DEFAULT FALSE,
    stripe_bank_id      VARCHAR(255), -- Stripe Connect bank account ID
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE profile_mcp.preferences (
    user_id             UUID PRIMARY KEY REFERENCES auth_mcp.users(user_id),
    notification_prefs  JSONB NOT NULL DEFAULT '{}', -- {email: true, sms: true, push: true, ...}
    display_prefs       JSONB NOT NULL DEFAULT '{}', -- {currency, units, theme, ...}
    search_prefs        JSONB NOT NULL DEFAULT '{}', -- {default_radius, preferred_categories, ...}
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_province ON profile_mcp.profiles(province);
CREATE INDEX idx_profiles_location ON profile_mcp.profiles USING GIST(location);
CREATE INDEX idx_companies_user ON profile_mcp.companies(user_id);
CREATE INDEX idx_companies_bn ON profile_mcp.companies(business_number);
CREATE INDEX idx_bank_accounts_user ON profile_mcp.bank_accounts(user_id);


-- ============================================================================
-- SCHEMA: kyc (kyc-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS kyc_mcp;

CREATE TABLE kyc_mcp.verifications (
    verification_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    target_level        kyc_level NOT NULL,
    current_status      kyc_status NOT NULL DEFAULT 'pending',
    risk_score          risk_level NOT NULL DEFAULT 'low',
    onfido_check_id     VARCHAR(255), -- External provider reference
    reviewer_id         UUID, -- Admin who reviewed (if manual)
    reviewer_notes      TEXT,
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at         TIMESTAMPTZ,
    verified_at         TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kyc_mcp.documents (
    document_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    verification_id     UUID NOT NULL REFERENCES kyc_mcp.verifications(verification_id),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    doc_type            kyc_doc_type NOT NULL,
    file_url            TEXT NOT NULL, -- Encrypted storage reference
    file_hash           VARCHAR(64) NOT NULL, -- SHA-256 of original file
    ocr_data            JSONB, -- Extracted data from OCR
    authenticity_score  DECIMAL(5,4), -- 0.0000 to 1.0000
    expires_at          DATE, -- Document expiry (e.g., passport)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kyc_mcp.kyc_levels (
    user_id             UUID PRIMARY KEY REFERENCES auth_mcp.users(user_id),
    current_level       kyc_level NOT NULL DEFAULT 'level_0',
    level_0_at          TIMESTAMPTZ,
    level_1_at          TIMESTAMPTZ,
    level_2_at          TIMESTAMPTZ,
    level_3_at          TIMESTAMPTZ,
    next_review_at      TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kyc_mcp.pep_screenings (
    screening_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    screening_type      VARCHAR(50) NOT NULL, -- 'pep', 'sanctions', 'adverse_media'
    provider            VARCHAR(50) NOT NULL, -- 'refinitiv', 'onfido', etc.
    result              VARCHAR(20) NOT NULL, -- 'clear', 'match', 'possible_match'
    matches             JSONB, -- Details of any matches found
    screened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_verifications_user ON kyc_mcp.verifications(user_id);
CREATE INDEX idx_verifications_status ON kyc_mcp.verifications(current_status);
CREATE INDEX idx_kyc_levels_user ON kyc_mcp.kyc_levels(user_id);
CREATE INDEX idx_kyc_levels_review ON kyc_mcp.kyc_levels(next_review_at);


-- ============================================================================
-- SCHEMA: listing (listing-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS listing_mcp;

CREATE TABLE listing_mcp.categories (
    category_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100) NOT NULL,
    slug                VARCHAR(100) NOT NULL UNIQUE,
    parent_id           UUID REFERENCES listing_mcp.categories(category_id),
    description         TEXT,
    icon_url            TEXT,
    default_unit        unit_type,
    weight_tolerance    DECIMAL(5,2) NOT NULL DEFAULT 2.00, -- default % tolerance
    sort_order          INT NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE listing_mcp.listings (
    listing_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id           UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    title               VARCHAR(200) NOT NULL,
    slug                VARCHAR(250) NOT NULL UNIQUE,
    category_id         UUID NOT NULL REFERENCES listing_mcp.categories(category_id),
    subcategory_id      UUID REFERENCES listing_mcp.categories(category_id),
    description         TEXT NOT NULL,
    quantity            DECIMAL(12,2) NOT NULL,
    unit                unit_type NOT NULL,
    price_type          price_type NOT NULL,
    asking_price        DECIMAL(12,2), -- CAD
    reserve_price       DECIMAL(12,2), -- for auctions
    buy_now_price       DECIMAL(12,2), -- optional instant buy
    quality_grade       VARCHAR(50), -- ISRI code or custom
    quality_details     JSONB, -- {contamination_pct, moisture_pct, density, ...}
    images              JSONB NOT NULL DEFAULT '[]', -- [{url, order, alt_text}]
    certifications      JSONB DEFAULT '[]', -- [{type, file_url, issued_by, date}]
    chain_of_custody    JSONB DEFAULT '{}', -- {source, invoices[], processing_records[]}
    environmental_permits JSONB DEFAULT '[]', -- [{permit_type, number, expiry}]
    location            GEOGRAPHY(Point, 4326) NOT NULL,
    pickup_address      JSONB NOT NULL, -- {street, city, province, postal_code}
    inspection_required BOOLEAN NOT NULL DEFAULT FALSE,
    available_from      DATE,
    expires_at          TIMESTAMPTZ,
    status              listing_status NOT NULL DEFAULT 'draft',
    views_count         INT NOT NULL DEFAULT 0,
    saves_count         INT NOT NULL DEFAULT 0,
    is_featured         BOOLEAN NOT NULL DEFAULT FALSE,
    featured_until      TIMESTAMPTZ,
    search_vector       TSVECTOR, -- Full-text search
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at        TIMESTAMPTZ,
    sold_at             TIMESTAMPTZ
);

CREATE TABLE listing_mcp.saved_searches (
    saved_search_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    name                VARCHAR(100),
    query               TEXT,
    filters             JSONB NOT NULL, -- {category, price_range, location, radius, ...}
    alert_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    alert_channels      JSONB NOT NULL DEFAULT '["email"]',
    last_alerted_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE listing_mcp.favorites (
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    listing_id          UUID NOT NULL REFERENCES listing_mcp.listings(listing_id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, listing_id)
);

-- Full-text search trigger
CREATE OR REPLACE FUNCTION listing_mcp.update_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.quality_grade, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_listing_search_vector
    BEFORE INSERT OR UPDATE ON listing_mcp.listings
    FOR EACH ROW EXECUTE FUNCTION listing_mcp.update_search_vector();

CREATE INDEX idx_listings_seller ON listing_mcp.listings(seller_id);
CREATE INDEX idx_listings_category ON listing_mcp.listings(category_id);
CREATE INDEX idx_listings_status ON listing_mcp.listings(status);
CREATE INDEX idx_listings_price_type ON listing_mcp.listings(price_type);
CREATE INDEX idx_listings_location ON listing_mcp.listings USING GIST(location);
CREATE INDEX idx_listings_search ON listing_mcp.listings USING GIN(search_vector);
CREATE INDEX idx_listings_published ON listing_mcp.listings(published_at) WHERE status = 'active';
CREATE INDEX idx_saved_searches_user ON listing_mcp.saved_searches(user_id);
CREATE INDEX idx_favorites_user ON listing_mcp.favorites(user_id);


-- ============================================================================
-- SCHEMA: bidding (bidding-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS bidding_mcp;

CREATE TABLE bidding_mcp.bids (
    bid_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id          UUID NOT NULL REFERENCES listing_mcp.listings(listing_id),
    bidder_id           UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    amount              DECIMAL(12,2) NOT NULL,
    bid_type            bid_type NOT NULL DEFAULT 'manual',
    proxy_max_amount    DECIMAL(12,2), -- for proxy bids
    status              bid_status NOT NULL DEFAULT 'active',
    deposit_escrow_id   UUID, -- reference to escrow for bid deposit
    retracted_at        TIMESTAMPTZ,
    retraction_reason   TEXT,
    ip_address          INET,
    device_fingerprint  VARCHAR(255),
    server_timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- authoritative timestamp
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bidding_mcp.bid_deposits (
    deposit_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id          UUID NOT NULL REFERENCES listing_mcp.listings(listing_id),
    bidder_id           UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    amount              DECIMAL(12,2) NOT NULL,
    escrow_id           UUID, -- link to escrow-mcp
    status              VARCHAR(20) NOT NULL DEFAULT 'held', -- held, refunded, applied
    refunded_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bidding_mcp.anti_manipulation_flags (
    flag_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id          UUID NOT NULL REFERENCES listing_mcp.listings(listing_id),
    flagged_user_id     UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    flag_type           VARCHAR(50) NOT NULL, -- 'shill_bidding', 'bid_sniping', 'collusion', 'velocity'
    details             JSONB NOT NULL,
    severity            risk_level NOT NULL,
    reviewed            BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_by         UUID,
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bids_listing ON bidding_mcp.bids(listing_id);
CREATE INDEX idx_bids_bidder ON bidding_mcp.bids(bidder_id);
CREATE INDEX idx_bids_listing_amount ON bidding_mcp.bids(listing_id, amount DESC);
CREATE INDEX idx_bids_status ON bidding_mcp.bids(status);
CREATE INDEX idx_deposits_listing ON bidding_mcp.bid_deposits(listing_id);


-- ============================================================================
-- SCHEMA: auction (auction-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS auction_mcp;

CREATE TABLE auction_mcp.auctions (
    auction_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id        UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    title               VARCHAR(200) NOT NULL,
    description         TEXT,
    status              auction_status NOT NULL DEFAULT 'scheduled',
    scheduled_start     TIMESTAMPTZ NOT NULL,
    actual_start        TIMESTAMPTZ,
    actual_end          TIMESTAMPTZ,
    auto_extend_minutes INT NOT NULL DEFAULT 5,
    max_extensions      INT NOT NULL DEFAULT 10,
    min_bid_increment   DECIMAL(12,2) NOT NULL DEFAULT 50.00,
    config              JSONB NOT NULL DEFAULT '{}', -- additional auction settings
    total_gmv           DECIMAL(14,2) DEFAULT 0,
    total_lots          INT NOT NULL DEFAULT 0,
    lots_sold           INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auction_mcp.lots (
    lot_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auction_id          UUID NOT NULL REFERENCES auction_mcp.auctions(auction_id),
    listing_id          UUID NOT NULL REFERENCES listing_mcp.listings(listing_id),
    lot_number          INT NOT NULL,
    status              lot_status NOT NULL DEFAULT 'pending',
    starting_price      DECIMAL(12,2) NOT NULL,
    reserve_price       DECIMAL(12,2),
    current_highest_bid DECIMAL(12,2),
    highest_bidder_id   UUID REFERENCES auth_mcp.users(user_id),
    total_bids          INT NOT NULL DEFAULT 0,
    extensions_used     INT NOT NULL DEFAULT 0,
    opened_at           TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    UNIQUE (auction_id, lot_number)
);

CREATE TABLE auction_mcp.auction_participants (
    auction_id          UUID NOT NULL REFERENCES auction_mcp.auctions(auction_id),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    deposit_id          UUID, -- bid deposit reference
    registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed           BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (auction_id, user_id)
);

CREATE INDEX idx_auctions_status ON auction_mcp.auctions(status);
CREATE INDEX idx_auctions_start ON auction_mcp.auctions(scheduled_start);
CREATE INDEX idx_lots_auction ON auction_mcp.lots(auction_id, lot_number);


-- ============================================================================
-- SCHEMA: orders (shared between modules)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS orders_mcp;

CREATE TABLE orders_mcp.orders (
    order_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id          UUID NOT NULL REFERENCES listing_mcp.listings(listing_id),
    buyer_id            UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    seller_id           UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    bid_id              UUID REFERENCES bidding_mcp.bids(bid_id),
    contract_id         UUID, -- FK added after contracts table
    original_amount     DECIMAL(12,2) NOT NULL, -- agreed price
    adjusted_amount     DECIMAL(12,2), -- after weight/quality adjustments
    final_amount        DECIMAL(12,2), -- final settled amount
    quantity            DECIMAL(12,2) NOT NULL,
    unit                unit_type NOT NULL,
    commission_rate     DECIMAL(5,4) NOT NULL,
    commission_amount   DECIMAL(10,2),
    commission_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
    currency            VARCHAR(3) NOT NULL DEFAULT 'CAD',
    payment_method      payment_method_type,
    down_payment_pct    DECIMAL(5,2),
    inspection_window_hours INT NOT NULL DEFAULT 72,
    weight_tolerance_pct DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    status              VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, confirmed, shipped, delivered, inspected, completed, disputed, cancelled
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at        TIMESTAMPTZ,
    shipped_at          TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_orders_buyer ON orders_mcp.orders(buyer_id);
CREATE INDEX idx_orders_seller ON orders_mcp.orders(seller_id);
CREATE INDEX idx_orders_listing ON orders_mcp.orders(listing_id);
CREATE INDEX idx_orders_status ON orders_mcp.orders(status);
CREATE INDEX idx_orders_created ON orders_mcp.orders(created_at);


-- ============================================================================
-- SCHEMA: inspection (inspection-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS inspection_mcp;

CREATE TABLE inspection_mcp.inspectors (
    inspector_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL UNIQUE REFERENCES auth_mcp.users(user_id),
    certifications      JSONB NOT NULL DEFAULT '[]', -- [{type, issuer, number, expiry}]
    specializations     JSONB NOT NULL DEFAULT '[]', -- ['ferrous', 'non_ferrous', 'plastics', ...]
    service_area        GEOGRAPHY(Polygon, 4326), -- PostGIS coverage zone
    max_travel_km       INT NOT NULL DEFAULT 100,
    insurance_expiry    DATE NOT NULL,
    hourly_rate         DECIMAL(8,2) NOT NULL,
    travel_rate_per_km  DECIMAL(6,2) NOT NULL DEFAULT 0.65,
    rating_avg          DECIMAL(3,2) NOT NULL DEFAULT 0,
    rating_count        INT NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inspection_mcp.inspections (
    inspection_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id          UUID REFERENCES listing_mcp.listings(listing_id),
    order_id            UUID REFERENCES orders_mcp.orders(order_id),
    inspector_id        UUID REFERENCES inspection_mcp.inspectors(inspector_id),
    requested_by        UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    inspection_type     inspection_type NOT NULL,
    location            JSONB NOT NULL,
    location_geo        GEOGRAPHY(Point, 4326),
    scheduled_at        TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    -- Expected vs Actual
    grade_expected      VARCHAR(50),
    grade_actual        VARCHAR(50),
    weight_expected_kg  DECIMAL(10,2),
    weight_actual_kg    DECIMAL(10,2),
    moisture_pct        DECIMAL(5,2),
    contamination_pct   DECIMAL(5,2),
    -- Report
    photos              JSONB DEFAULT '[]',
    report_document_id  UUID, -- reference to storage-mcp
    lab_certificate_id  UUID,
    notes               TEXT,
    result              inspection_result NOT NULL DEFAULT 'pending',
    deduction_amount    DECIMAL(10,2),
    deduction_reason    TEXT,
    status              inspection_status NOT NULL DEFAULT 'requested',
    cost                DECIMAL(10,2),
    paid_by             UUID REFERENCES auth_mcp.users(user_id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inspection_mcp.weight_records (
    record_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID NOT NULL REFERENCES orders_mcp.orders(order_id),
    weight_point        weight_point NOT NULL,
    weight_kg           DECIMAL(10,2) NOT NULL,
    recorded_by         UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    scale_ticket_url    TEXT, -- photo of scale ticket
    scale_certified     BOOLEAN NOT NULL DEFAULT FALSE,
    scale_certificate   VARCHAR(100), -- CAW certification number
    notes               TEXT,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id, weight_point)
);

CREATE INDEX idx_inspections_listing ON inspection_mcp.inspections(listing_id);
CREATE INDEX idx_inspections_order ON inspection_mcp.inspections(order_id);
CREATE INDEX idx_inspections_inspector ON inspection_mcp.inspections(inspector_id);
CREATE INDEX idx_inspections_status ON inspection_mcp.inspections(status);
CREATE INDEX idx_weight_records_order ON inspection_mcp.weight_records(order_id);
CREATE INDEX idx_inspectors_area ON inspection_mcp.inspectors USING GIST(service_area);


-- ============================================================================
-- SCHEMA: booking (booking-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS booking_mcp;

CREATE TABLE booking_mcp.availability (
    availability_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    day_of_week         INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    timezone            VARCHAR(50) NOT NULL DEFAULT 'America/Toronto',
    is_recurring        BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_until     DATE,
    max_bookings_per_day INT NOT NULL DEFAULT 5,
    location_id         UUID, -- for multi-site sellers
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE booking_mcp.bookings (
    booking_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type          event_type NOT NULL,
    listing_id          UUID REFERENCES listing_mcp.listings(listing_id),
    order_id            UUID REFERENCES orders_mcp.orders(order_id),
    organizer_id        UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    participants        JSONB NOT NULL, -- [{user_id, role, status, confirmed_at}]
    location            JSONB,
    location_geo        GEOGRAPHY(Point, 4326),
    scheduled_start     TIMESTAMPTZ NOT NULL,
    scheduled_end       TIMESTAMPTZ NOT NULL,
    timezone            VARCHAR(50) NOT NULL DEFAULT 'America/Toronto',
    buffer_before_min   INT NOT NULL DEFAULT 30,
    buffer_after_min    INT NOT NULL DEFAULT 30,
    status              booking_status NOT NULL DEFAULT 'pending',
    cancellation_reason TEXT,
    cancelled_by        UUID REFERENCES auth_mcp.users(user_id),
    cancelled_at        TIMESTAMPTZ,
    rescheduled_from    UUID REFERENCES booking_mcp.bookings(booking_id),
    reschedule_count    INT NOT NULL DEFAULT 0,
    reminders_sent      JSONB DEFAULT '{}', -- {24h: timestamp, 2h: timestamp, 30m: timestamp}
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE booking_mcp.blackout_dates (
    blackout_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    reason              VARCHAR(200),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_organizer ON booking_mcp.bookings(organizer_id);
CREATE INDEX idx_bookings_start ON booking_mcp.bookings(scheduled_start);
CREATE INDEX idx_bookings_status ON booking_mcp.bookings(status);
CREATE INDEX idx_availability_user ON booking_mcp.availability(user_id);


-- ============================================================================
-- SCHEMA: escrow (escrow-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS escrow_mcp;

CREATE TABLE escrow_mcp.escrows (
    escrow_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID NOT NULL REFERENCES orders_mcp.orders(order_id),
    buyer_id            UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    seller_id           UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    original_amount     DECIMAL(12,2) NOT NULL,
    held_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
    released_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
    refunded_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
    commission_amount   DECIMAL(10,2),
    commission_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
    currency            VARCHAR(3) NOT NULL DEFAULT 'CAD',
    status              escrow_status NOT NULL DEFAULT 'created',
    stripe_payment_intent_id VARCHAR(255),
    frozen_reason       TEXT,
    frozen_by           UUID,
    frozen_at           TIMESTAMPTZ,
    release_conditions  JSONB DEFAULT '{}', -- {inspection_approved, delivery_confirmed, ...}
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at         TIMESTAMPTZ,
    refunded_at         TIMESTAMPTZ
);

CREATE TABLE escrow_mcp.escrow_timeline (
    event_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    escrow_id           UUID NOT NULL REFERENCES escrow_mcp.escrows(escrow_id),
    action              VARCHAR(50) NOT NULL, -- 'created', 'funds_held', 'frozen', 'released', 'partial_release', 'refunded', 'adjusted'
    amount              DECIMAL(12,2),
    performed_by        UUID,
    reason              TEXT,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escrows_order ON escrow_mcp.escrows(order_id);
CREATE INDEX idx_escrows_buyer ON escrow_mcp.escrows(buyer_id);
CREATE INDEX idx_escrows_seller ON escrow_mcp.escrows(seller_id);
CREATE INDEX idx_escrows_status ON escrow_mcp.escrows(status);
CREATE INDEX idx_escrow_timeline ON escrow_mcp.escrow_timeline(escrow_id);


-- ============================================================================
-- SCHEMA: payments (payments-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS payments_mcp;

CREATE TABLE payments_mcp.transactions (
    transaction_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID REFERENCES orders_mcp.orders(order_id),
    escrow_id           UUID REFERENCES escrow_mcp.escrows(escrow_id),
    payer_id            UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    payee_id            UUID REFERENCES auth_mcp.users(user_id),
    amount              DECIMAL(12,2) NOT NULL,
    original_amount     DECIMAL(12,2),
    currency            VARCHAR(3) NOT NULL DEFAULT 'CAD',
    payment_method      payment_method_type NOT NULL,
    transaction_type    transaction_type NOT NULL,
    status              transaction_status NOT NULL DEFAULT 'pending',
    stripe_payment_intent_id VARCHAR(255),
    stripe_transfer_id  VARCHAR(255),
    stripe_refund_id    VARCHAR(255),
    interac_reference   VARCHAR(100),
    adjustment_reason   TEXT,
    commission_amount   DECIMAL(10,2),
    tax_amount          DECIMAL(10,2), -- GST/HST on commission
    credit_facility_id  UUID, -- if paid via credit terms
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE TABLE payments_mcp.wallets (
    wallet_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL UNIQUE REFERENCES auth_mcp.users(user_id),
    balance             DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    pending_balance     DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency            VARCHAR(3) NOT NULL DEFAULT 'CAD',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments_mcp.payment_methods (
    method_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    type                payment_method_type NOT NULL,
    stripe_method_id    VARCHAR(255), -- Stripe payment method ID
    label               VARCHAR(100), -- "Visa ending 4242"
    details_enc         TEXT, -- encrypted method details
    is_default          BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments_mcp.down_payment_schedules (
    schedule_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID NOT NULL REFERENCES orders_mcp.orders(order_id),
    milestones          JSONB NOT NULL, -- [{milestone, pct, amount, due_date, status, paid_at}]
    total_amount        DECIMAL(12,2) NOT NULL,
    paid_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'active', -- active, completed, defaulted
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_payer ON payments_mcp.transactions(payer_id);
CREATE INDEX idx_transactions_payee ON payments_mcp.transactions(payee_id);
CREATE INDEX idx_transactions_order ON payments_mcp.transactions(order_id);
CREATE INDEX idx_transactions_status ON payments_mcp.transactions(status);
CREATE INDEX idx_transactions_type ON payments_mcp.transactions(transaction_type);
CREATE INDEX idx_transactions_created ON payments_mcp.transactions(created_at);
CREATE INDEX idx_wallets_user ON payments_mcp.wallets(user_id);
CREATE INDEX idx_payment_methods_user ON payments_mcp.payment_methods(user_id);


-- ============================================================================
-- SCHEMA: contracts (contracts-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS contracts_mcp;

CREATE TABLE contracts_mcp.contracts (
    contract_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_id            UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    seller_id           UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    contract_type       contract_type NOT NULL,
    material_category_id UUID NOT NULL REFERENCES listing_mcp.categories(category_id),
    quality_specs       JSONB NOT NULL, -- {grade, contamination_max, moisture_max, ...}
    pricing_model       JSONB NOT NULL, -- {type, base_price, index_source, premium, floor, ceiling, ...}
    total_volume        DECIMAL(12,2),
    fulfilled_volume    DECIMAL(12,2) NOT NULL DEFAULT 0,
    unit                unit_type NOT NULL,
    frequency           frequency_type,
    next_order_date     DATE,
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    auto_renew          BOOLEAN NOT NULL DEFAULT FALSE,
    renewal_notice_days INT NOT NULL DEFAULT 30,
    breach_penalties    JSONB DEFAULT '{}', -- {seller_non_delivery, buyer_non_payment, ...}
    esign_document_id   UUID,
    status              contract_status NOT NULL DEFAULT 'draft',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at        TIMESTAMPTZ,
    terminated_at       TIMESTAMPTZ
);

CREATE TABLE contracts_mcp.contract_orders (
    contract_order_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id         UUID NOT NULL REFERENCES contracts_mcp.contracts(contract_id),
    order_id            UUID REFERENCES orders_mcp.orders(order_id),
    scheduled_date      DATE NOT NULL,
    quantity            DECIMAL(12,2) NOT NULL,
    calculated_price    DECIMAL(12,2),
    index_value         DECIMAL(12,2), -- captured index price
    pricing_date        DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- scheduled, generated, confirmed, fulfilled, missed
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contracts_mcp.negotiations (
    negotiation_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id         UUID NOT NULL REFERENCES contracts_mcp.contracts(contract_id),
    proposed_by         UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    proposed_changes    JSONB NOT NULL,
    message             TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, countered
    responded_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contracts_buyer ON contracts_mcp.contracts(buyer_id);
CREATE INDEX idx_contracts_seller ON contracts_mcp.contracts(seller_id);
CREATE INDEX idx_contracts_status ON contracts_mcp.contracts(status);
CREATE INDEX idx_contracts_next_order ON contracts_mcp.contracts(next_order_date) WHERE status = 'active';
CREATE INDEX idx_contract_orders_contract ON contracts_mcp.contract_orders(contract_id);


-- ============================================================================
-- SCHEMA: dispute (dispute-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS dispute_mcp;

CREATE TABLE dispute_mcp.disputes (
    dispute_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID NOT NULL REFERENCES orders_mcp.orders(order_id),
    filing_party_id     UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    responding_party_id UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    category            dispute_category NOT NULL,
    description         TEXT NOT NULL,
    current_tier        dispute_tier NOT NULL DEFAULT 'tier_1_negotiation',
    mediator_id         UUID REFERENCES auth_mcp.users(user_id),
    arbitrator_id       UUID REFERENCES auth_mcp.users(user_id),
    escrow_hold_amount  DECIMAL(12,2),
    status              dispute_status NOT NULL DEFAULT 'open',
    resolution_deadline TIMESTAMPTZ NOT NULL,
    resolution_summary  TEXT,
    final_resolution    JSONB, -- {type, amount, decided_by, rationale, cost_allocation}
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ
);

CREATE TABLE dispute_mcp.evidence (
    evidence_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id          UUID NOT NULL REFERENCES dispute_mcp.disputes(dispute_id),
    submitted_by        UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    evidence_type       VARCHAR(50) NOT NULL, -- 'photo', 'document', 'scale_ticket', 'video', 'text'
    file_url            TEXT,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dispute_mcp.settlement_proposals (
    proposal_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id          UUID NOT NULL REFERENCES dispute_mcp.disputes(dispute_id),
    proposed_by         UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    terms               JSONB NOT NULL, -- {refund_amount, replacement, credit, other}
    message             TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, accepted, rejected, expired
    responded_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dispute_mcp.penalties (
    penalty_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    dispute_id          UUID NOT NULL REFERENCES dispute_mcp.disputes(dispute_id),
    offense_type        VARCHAR(100) NOT NULL,
    occurrence_number   INT NOT NULL DEFAULT 1, -- 1st, 2nd, 3rd...
    penalty_type        VARCHAR(50) NOT NULL, -- 'warning', 'suspension', 'ban', 'financial'
    penalty_details     JSONB,
    effective_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until     TIMESTAMPTZ, -- null for permanent
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dispute_mcp.platform_integrity_scores (
    user_id             UUID PRIMARY KEY REFERENCES auth_mcp.users(user_id),
    pis_score           INT NOT NULL DEFAULT 100 CHECK (pis_score BETWEEN 0 AND 100),
    total_transactions  INT NOT NULL DEFAULT 0,
    disputes_filed      INT NOT NULL DEFAULT 0,
    disputes_lost       INT NOT NULL DEFAULT 0,
    on_time_delivery_pct DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    payment_on_time_pct DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    no_show_count       INT NOT NULL DEFAULT 0,
    tier                VARCHAR(20) NOT NULL DEFAULT 'excellent', -- excellent, good, fair, poor, critical
    last_calculated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_disputes_order ON dispute_mcp.disputes(order_id);
CREATE INDEX idx_disputes_filing ON dispute_mcp.disputes(filing_party_id);
CREATE INDEX idx_disputes_status ON dispute_mcp.disputes(status);
CREATE INDEX idx_penalties_user ON dispute_mcp.penalties(user_id);
CREATE INDEX idx_pis_score ON dispute_mcp.platform_integrity_scores(pis_score);


-- ============================================================================
-- SCHEMA: logistics (logistics-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS logistics_mcp;

CREATE TABLE logistics_mcp.shipments (
    shipment_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID NOT NULL REFERENCES orders_mcp.orders(order_id),
    carrier_id          UUID REFERENCES auth_mcp.users(user_id), -- if Matex registered carrier
    carrier_name        VARCHAR(255), -- external carrier name
    carrier_api         VARCHAR(50), -- 'day_ross', 'manitoulin', 'purolator', 'custom', etc.
    origin_address      JSONB NOT NULL,
    origin_geo          GEOGRAPHY(Point, 4326),
    destination_address JSONB NOT NULL,
    destination_geo     GEOGRAPHY(Point, 4326),
    weight_kg           DECIMAL(10,2) NOT NULL,
    dimensions          JSONB, -- {length_cm, width_cm, height_cm}
    hazmat              hazmat_class NOT NULL DEFAULT 'none',
    freight_class       VARCHAR(10),
    quoted_price        DECIMAL(10,2),
    actual_price        DECIMAL(10,2),
    currency            VARCHAR(3) NOT NULL DEFAULT 'CAD',
    insurance_amount    DECIMAL(10,2),
    pickup_date         TIMESTAMPTZ,
    estimated_delivery  TIMESTAMPTZ,
    actual_delivery     TIMESTAMPTZ,
    tracking_number     VARCHAR(100),
    tracking_url        TEXT,
    bol_document_id     UUID,
    pod_document_id     UUID,
    pod_photos          JSONB DEFAULT '[]',
    co2_emissions_kg    DECIMAL(8,2),
    distance_km         DECIMAL(8,2),
    status              shipment_status NOT NULL DEFAULT 'quoted',
    carrier_rating      INT CHECK (carrier_rating BETWEEN 1 AND 5),
    carrier_feedback    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE logistics_mcp.shipping_quotes (
    quote_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id            UUID NOT NULL REFERENCES orders_mcp.orders(order_id),
    carrier_name        VARCHAR(255) NOT NULL,
    carrier_api         VARCHAR(50) NOT NULL,
    price               DECIMAL(10,2) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'CAD',
    transit_days        INT NOT NULL,
    service_type        VARCHAR(50), -- 'ftl', 'ltl', 'express', 'standard'
    valid_until         TIMESTAMPTZ NOT NULL,
    raw_response        JSONB, -- full carrier API response
    selected            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shipments_order ON logistics_mcp.shipments(order_id);
CREATE INDEX idx_shipments_carrier ON logistics_mcp.shipments(carrier_id);
CREATE INDEX idx_shipments_status ON logistics_mcp.shipments(status);
CREATE INDEX idx_quotes_order ON logistics_mcp.shipping_quotes(order_id);


-- ============================================================================
-- SCHEMA: tax (tax-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS tax_mcp;

CREATE TABLE tax_mcp.invoices (
    invoice_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number      VARCHAR(20) NOT NULL UNIQUE, -- MTX-2026-000001
    order_id            UUID NOT NULL REFERENCES orders_mcp.orders(order_id),
    buyer_id            UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    seller_id           UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    subtotal            DECIMAL(12,2) NOT NULL,
    commission_amount   DECIMAL(10,2) NOT NULL,
    gst_amount          DECIMAL(10,2) NOT NULL DEFAULT 0,
    pst_amount          DECIMAL(10,2) NOT NULL DEFAULT 0,
    hst_amount          DECIMAL(10,2) NOT NULL DEFAULT 0,
    qst_amount          DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_tax           DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount        DECIMAL(12,2) NOT NULL,
    seller_province     VARCHAR(2) NOT NULL,
    buyer_province      VARCHAR(2) NOT NULL,
    seller_gst_number   VARCHAR(15),
    buyer_gst_number    VARCHAR(15),
    pdf_url             TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'issued', -- issued, paid, void, adjusted
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_at              TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ
);

CREATE TABLE tax_mcp.tax_remittances (
    remittance_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    tax_type            VARCHAR(10) NOT NULL, -- 'gst', 'hst', 'pst', 'qst'
    province            VARCHAR(2),
    collected_amount    DECIMAL(12,2) NOT NULL,
    remitted_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
    input_tax_credits   DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_amount          DECIMAL(12,2) NOT NULL,
    filing_reference    VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, filed, paid
    filed_at            TIMESTAMPTZ,
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_order ON tax_mcp.invoices(order_id);
CREATE INDEX idx_invoices_buyer ON tax_mcp.invoices(buyer_id);
CREATE INDEX idx_invoices_seller ON tax_mcp.invoices(seller_id);
CREATE INDEX idx_invoices_issued ON tax_mcp.invoices(issued_at);


-- ============================================================================
-- SCHEMA: messaging (messaging-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS messaging_mcp;

CREATE TABLE messaging_mcp.threads (
    thread_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id          UUID REFERENCES listing_mcp.listings(listing_id),
    order_id            UUID REFERENCES orders_mcp.orders(order_id),
    subject             VARCHAR(200),
    participants        UUID[] NOT NULL, -- array of user_ids
    thread_type         VARCHAR(20) NOT NULL DEFAULT 'general', -- general, negotiation, support, dispute
    is_archived         BOOLEAN NOT NULL DEFAULT FALSE,
    last_message_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messaging_mcp.messages (
    message_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id           UUID NOT NULL REFERENCES messaging_mcp.threads(thread_id),
    sender_id           UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    content             TEXT NOT NULL,
    attachments         JSONB DEFAULT '[]', -- [{file_id, filename, url, type}]
    read_by             UUID[] DEFAULT '{}', -- user_ids who read this
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_threads_listing ON messaging_mcp.threads(listing_id);
CREATE INDEX idx_threads_participants ON messaging_mcp.threads USING GIN(participants);
CREATE INDEX idx_threads_last_message ON messaging_mcp.threads(last_message_at DESC);
CREATE INDEX idx_messages_thread ON messaging_mcp.messages(thread_id, created_at);
CREATE INDEX idx_messages_sender ON messaging_mcp.messages(sender_id);


-- ============================================================================
-- SCHEMA: esign (esign-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS esign_mcp;

CREATE TABLE esign_mcp.documents (
    document_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_type       document_template NOT NULL,
    order_id            UUID REFERENCES orders_mcp.orders(order_id),
    contract_id         UUID REFERENCES contracts_mcp.contracts(contract_id),
    generated_data      JSONB NOT NULL, -- data used to populate template
    preview_url         TEXT,
    provider            VARCHAR(20) NOT NULL DEFAULT 'docusign', -- docusign, adobe_sign, simple
    provider_envelope_id VARCHAR(255),
    signatories         JSONB NOT NULL, -- [{user_id, name, email, role, status, signed_at}]
    status              signing_status NOT NULL DEFAULT 'draft',
    signed_document_url TEXT,
    document_hash       VARCHAR(64), -- SHA-256 of signed document
    completed_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_esign_order ON esign_mcp.documents(order_id);
CREATE INDEX idx_esign_contract ON esign_mcp.documents(contract_id);
CREATE INDEX idx_esign_status ON esign_mcp.documents(status);


-- ============================================================================
-- SCHEMA: pricing (pricing-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS pricing_mcp;

CREATE TABLE pricing_mcp.market_prices (
    price_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material            VARCHAR(100) NOT NULL,
    index_source        VARCHAR(50) NOT NULL, -- 'lme', 'fastmarkets', 'platts', 'matex_mpi'
    price               DECIMAL(12,4) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
    unit                unit_type NOT NULL,
    captured_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pricing_mcp.matex_price_index (
    mpi_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id         UUID NOT NULL REFERENCES listing_mcp.categories(category_id),
    region              VARCHAR(20), -- 'ontario', 'bc', 'alberta', 'quebec', 'prairies', 'national'
    mpi_value           DECIMAL(12,4) NOT NULL,
    volume_weighted     BOOLEAN NOT NULL DEFAULT TRUE,
    sample_size         INT NOT NULL,
    period_start        TIMESTAMPTZ NOT NULL,
    period_end          TIMESTAMPTZ NOT NULL,
    change_24h_pct      DECIMAL(6,2),
    change_7d_pct       DECIMAL(6,2),
    calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pricing_mcp.price_alerts (
    alert_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    material            VARCHAR(100) NOT NULL,
    index_source        VARCHAR(50) NOT NULL,
    condition           VARCHAR(10) NOT NULL, -- 'above', 'below', 'change_pct'
    threshold           DECIMAL(12,4) NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_triggered_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_market_prices_material ON pricing_mcp.market_prices(material, index_source, captured_at DESC);
CREATE INDEX idx_mpi_category ON pricing_mcp.matex_price_index(category_id, region, calculated_at DESC);
CREATE INDEX idx_price_alerts_user ON pricing_mcp.price_alerts(user_id);


-- ============================================================================
-- SCHEMA: notifications (notifications-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS notifications_mcp;

CREATE TABLE notifications_mcp.notifications (
    notification_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    type                VARCHAR(100) NOT NULL, -- e.g. 'bid.outbid', 'order.delivered', 'dispute.escalated'
    title               VARCHAR(200) NOT NULL,
    body                TEXT NOT NULL,
    data                JSONB DEFAULT '{}', -- action-specific data (order_id, listing_id, etc.)
    channels_sent       notification_channel[] NOT NULL,
    priority            notification_priority NOT NULL DEFAULT 'normal',
    read                BOOLEAN NOT NULL DEFAULT FALSE,
    read_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications_mcp.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications_mcp.notifications(user_id) WHERE read = FALSE;
CREATE INDEX idx_notifications_type ON notifications_mcp.notifications(type);


-- ============================================================================
-- SCHEMA: credit (credit-mcp / future, data model ready)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS credit_mcp;

CREATE TABLE credit_mcp.credit_facilities (
    credit_facility_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL UNIQUE REFERENCES auth_mcp.users(user_id),
    credit_tier         credit_tier NOT NULL DEFAULT 'none',
    credit_limit        DECIMAL(12,2) NOT NULL DEFAULT 0,
    available_credit    DECIMAL(12,2) NOT NULL DEFAULT 0,
    matex_credit_score  INT CHECK (matex_credit_score BETWEEN 300 AND 850),
    payment_terms_days  INT NOT NULL DEFAULT 0,
    interest_rate_monthly DECIMAL(5,4) NOT NULL DEFAULT 0.0150, -- 1.5%
    total_outstanding   DECIMAL(12,2) NOT NULL DEFAULT 0,
    oldest_overdue_days INT NOT NULL DEFAULT 0,
    last_assessment_at  DATE,
    next_review_at      DATE,
    financial_docs      JSONB DEFAULT '[]',
    status              credit_facility_status NOT NULL DEFAULT 'pending',
    esign_agreement_id  UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE credit_mcp.credit_invoices (
    credit_invoice_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_facility_id  UUID NOT NULL REFERENCES credit_mcp.credit_facilities(credit_facility_id),
    order_id            UUID NOT NULL REFERENCES orders_mcp.orders(order_id),
    principal_amount    DECIMAL(12,2) NOT NULL,
    interest_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount        DECIMAL(12,2) NOT NULL,
    due_date            DATE NOT NULL,
    paid_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'outstanding', -- outstanding, paid, overdue, defaulted
    days_overdue        INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at             TIMESTAMPTZ
);

CREATE TABLE credit_mcp.credit_score_history (
    score_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    score               INT NOT NULL,
    factors             JSONB NOT NULL, -- {payment_history, volume, pis, account_age, external, financial}
    change_from         INT,
    change_reason       TEXT,
    calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_facilities_user ON credit_mcp.credit_facilities(user_id);
CREATE INDEX idx_credit_facilities_status ON credit_mcp.credit_facilities(status);
CREATE INDEX idx_credit_invoices_facility ON credit_mcp.credit_invoices(credit_facility_id);
CREATE INDEX idx_credit_invoices_due ON credit_mcp.credit_invoices(due_date) WHERE status = 'outstanding';


-- ============================================================================
-- SCHEMA: storage (storage-mcp)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS storage_mcp;

CREATE TABLE storage_mcp.files (
    file_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploaded_by         UUID NOT NULL REFERENCES auth_mcp.users(user_id),
    filename            VARCHAR(255) NOT NULL,
    mime_type           VARCHAR(100) NOT NULL,
    size_bytes          BIGINT NOT NULL,
    storage_path        TEXT NOT NULL, -- Supabase Storage path
    public_url          TEXT,
    file_hash           VARCHAR(64) NOT NULL, -- SHA-256
    context             VARCHAR(50), -- 'listing_image', 'kyc_document', 'inspection_report', 'esign_document', etc.
    context_id          UUID, -- related entity ID
    is_public           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_files_uploaded_by ON storage_mcp.files(uploaded_by);
CREATE INDEX idx_files_context ON storage_mcp.files(context, context_id);


-- ============================================================================
-- SCHEMA: log (log-mcp) - APPEND ONLY
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS log_mcp;

CREATE TABLE log_mcp.audit_log (
    log_id              UUID NOT NULL DEFAULT uuid_generate_v4(),
    category            log_category NOT NULL,
    level               log_level NOT NULL DEFAULT 'info',
    server              VARCHAR(50) NOT NULL, -- MCP server name
    tool                VARCHAR(100), -- tool name (for tool_call category)
    event_name          VARCHAR(200), -- event name (for event category)
    user_id             UUID, -- user who triggered the action
    entity_type         VARCHAR(50), -- 'order', 'listing', 'user', etc.
    entity_id           UUID,
    action              VARCHAR(100) NOT NULL,
    input_hash          VARCHAR(64), -- SHA-256 of input (for privacy)
    output_summary      TEXT, -- sanitized summary
    metadata            JSONB DEFAULT '{}',
    ip_address          INET,
    user_agent          TEXT,
    duration_ms         INT,
    success             BOOLEAN NOT NULL DEFAULT TRUE,
    error_message       TEXT,
    prev_hash           VARCHAR(64), -- hash chain for immutability
    entry_hash          VARCHAR(64) NOT NULL, -- hash of this entry
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- PK includes partition key (created_at) per Postgres rule for partitioned tables.
    PRIMARY KEY (log_id, created_at)
) PARTITION BY RANGE (created_at);

-- Monthly partitions (create programmatically in production)
CREATE TABLE log_mcp.audit_log_2026_01 PARTITION OF log_mcp.audit_log
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE log_mcp.audit_log_2026_02 PARTITION OF log_mcp.audit_log
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE log_mcp.audit_log_2026_03 PARTITION OF log_mcp.audit_log
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE log_mcp.audit_log_2026_04 PARTITION OF log_mcp.audit_log
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE log_mcp.audit_log_2026_05 PARTITION OF log_mcp.audit_log
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE log_mcp.audit_log_2026_06 PARTITION OF log_mcp.audit_log
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- CRITICAL: No UPDATE or DELETE on audit_log
REVOKE UPDATE, DELETE ON log_mcp.audit_log FROM PUBLIC;

CREATE INDEX idx_log_server ON log_mcp.audit_log(server, created_at);
CREATE INDEX idx_log_user ON log_mcp.audit_log(user_id, created_at);
CREATE INDEX idx_log_entity ON log_mcp.audit_log(entity_type, entity_id);
CREATE INDEX idx_log_level ON log_mcp.audit_log(level) WHERE level IN ('error', 'critical');
CREATE INDEX idx_log_category ON log_mcp.audit_log(category, created_at);


-- ============================================================================
-- ADD FOREIGN KEY (deferred)
-- ============================================================================
ALTER TABLE orders_mcp.orders
    ADD CONSTRAINT fk_orders_contract
    FOREIGN KEY (contract_id) REFERENCES contracts_mcp.contracts(contract_id);


-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Supabase
-- ============================================================================

-- Enable RLS on all user-facing tables
ALTER TABLE auth_mcp.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_mcp.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_mcp.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bidding_mcp.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders_mcp.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_mcp.escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments_mcp.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_mcp.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_mcp.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_mcp.notifications ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (expand per module in production)
CREATE POLICY "Users can view own profile"
    ON profile_mcp.profiles FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile"
    ON profile_mcp.profiles FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Active listings are public"
    ON listing_mcp.listings FOR SELECT
    USING (status = 'active' OR seller_id = auth.uid());

CREATE POLICY "Users can view own orders"
    ON orders_mcp.orders FOR SELECT
    USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY "Users can view own notifications"
    ON notifications_mcp.notifications FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can view own messages"
    ON messaging_mcp.messages FOR SELECT
    USING (sender_id = auth.uid() OR thread_id IN (
        SELECT thread_id FROM messaging_mcp.threads WHERE auth.uid() = ANY(participants)
    ));


-- ============================================================================
-- STATISTICS
-- ============================================================================
-- Total: 14 schemas, 48 tables, 70+ indexes
-- Schemas: auth_mcp, profile_mcp, kyc_mcp, listing_mcp, bidding_mcp,
--          auction_mcp, orders_mcp, inspection_mcp, booking_mcp, escrow_mcp,
--          payments_mcp, contracts_mcp, dispute_mcp, logistics_mcp, tax_mcp,
--          messaging_mcp, esign_mcp, pricing_mcp, notifications_mcp,
--          credit_mcp, storage_mcp, log_mcp
