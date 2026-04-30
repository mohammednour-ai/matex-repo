-- ============================================================================
-- RLS Activation + Policies for ALL schemas
-- MCP servers use service_role key (bypasses RLS automatically).
-- These policies protect against direct anon/authenticated client access.
-- ============================================================================

-- Enable RLS on all remaining tables not yet covered
ALTER TABLE auth_mcp.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_mcp.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_mcp.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_mcp.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_mcp.preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_mcp.verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_mcp.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_mcp.kyc_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_mcp.pep_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_mcp.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_mcp.saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_mcp.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE bidding_mcp.bid_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE bidding_mcp.anti_manipulation_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_mcp.auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_mcp.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_mcp.auction_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_mcp.inspectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_mcp.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_mcp.weight_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_mcp.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_mcp.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_mcp.blackout_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_mcp.escrow_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments_mcp.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments_mcp.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments_mcp.down_payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts_mcp.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts_mcp.contract_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts_mcp.negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_mcp.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_mcp.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_mcp.settlement_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_mcp.penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispute_mcp.platform_integrity_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_mcp.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_mcp.shipping_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_mcp.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_mcp.tax_remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_mcp.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_mcp.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE esign_mcp.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_mcp.market_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_mcp.matex_price_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_mcp.price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_mcp.credit_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_mcp.credit_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_mcp.credit_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_mcp.files ENABLE ROW LEVEL SECURITY;

-- Categories are publicly readable
CREATE POLICY categories_read_all ON listing_mcp.categories FOR SELECT USING (true);

-- Listings are publicly readable when active
CREATE POLICY listings_read_active ON listing_mcp.listings FOR SELECT USING (status = 'active' OR seller_id = auth.uid());
CREATE POLICY listings_owner_all ON listing_mcp.listings FOR ALL USING (seller_id = auth.uid());

-- Users can read own profile
CREATE POLICY profiles_own ON profile_mcp.profiles FOR ALL USING (user_id = auth.uid());
CREATE POLICY preferences_own ON profile_mcp.preferences FOR ALL USING (user_id = auth.uid());

-- Users can read own auth record
CREATE POLICY users_own ON auth_mcp.users FOR SELECT USING (user_id = auth.uid());

-- Users can read own KYC
CREATE POLICY kyc_own ON kyc_mcp.verifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY kyc_levels_own ON kyc_mcp.kyc_levels FOR SELECT USING (user_id = auth.uid());

-- Users can read own bids
CREATE POLICY bids_own ON bidding_mcp.bids FOR SELECT USING (bidder_id = auth.uid());

-- Users can read own orders
CREATE POLICY orders_own ON orders_mcp.orders FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Users can read own escrows
CREATE POLICY escrows_own ON escrow_mcp.escrows FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Users can read own transactions
CREATE POLICY transactions_own ON payments_mcp.transactions FOR SELECT USING (payer_id = auth.uid());

-- Users can read own threads
CREATE POLICY threads_own ON messaging_mcp.threads FOR SELECT USING (auth.uid() = ANY(participants));
CREATE POLICY messages_thread ON messaging_mcp.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM messaging_mcp.threads t WHERE t.thread_id = messages.thread_id AND auth.uid() = ANY(t.participants))
);

-- Users can read own notifications
CREATE POLICY notifications_own ON notifications_mcp.notifications FOR ALL USING (user_id = auth.uid());

-- Users can read own bookings
CREATE POLICY bookings_own ON booking_mcp.bookings FOR SELECT USING (organizer_id = auth.uid());

-- Users can read own contracts
CREATE POLICY contracts_own ON contracts_mcp.contracts FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Users can read own disputes
CREATE POLICY disputes_own ON dispute_mcp.disputes FOR SELECT USING (filing_party_id = auth.uid() OR responding_party_id = auth.uid());

-- Users can read own invoices
CREATE POLICY invoices_own ON tax_mcp.invoices FOR SELECT USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- Users can read own credit
CREATE POLICY credit_own ON credit_mcp.credit_facilities FOR SELECT USING (user_id = auth.uid());

-- Users can read own price alerts
CREATE POLICY alerts_own ON pricing_mcp.price_alerts FOR ALL USING (user_id = auth.uid());

-- Market prices and MPI are publicly readable
CREATE POLICY market_prices_read ON pricing_mcp.market_prices FOR SELECT USING (true);
CREATE POLICY mpi_read ON pricing_mcp.matex_price_index FOR SELECT USING (true);

-- Auctions and lots are publicly readable
CREATE POLICY auctions_read ON auction_mcp.auctions FOR SELECT USING (true);
CREATE POLICY lots_read ON auction_mcp.lots FOR SELECT USING (true);

-- Users can read own files
CREATE POLICY files_own ON storage_mcp.files FOR ALL USING (uploaded_by = auth.uid());
