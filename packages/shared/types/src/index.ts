/**
 * MATEX Shared Types
 * 
 * Central type definitions used across all MCP servers.
 * Keep this in sync with the database schema.
 */

// ============================================================================
// Auth
// ============================================================================

export type AccountType = "individual" | "corporate" | "carrier" | "inspector";
export type AccountStatus = "active" | "suspended" | "pending_review" | "deactivated" | "banned";

export interface User {
  user_id: string;
  email: string;
  phone: string;
  account_type: AccountType;
  account_status: AccountStatus;
  email_verified: boolean;
  phone_verified: boolean;
  mfa_enabled: boolean;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// ============================================================================
// Profile
// ============================================================================

export interface Profile {
  user_id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  avatar_url?: string;
  language: string;
  timezone: string;
  address?: Address;
  province?: string;
  country: string;
}

export interface Address {
  street: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
}

export interface Company {
  company_id: string;
  user_id: string;
  company_name: string;
  business_number?: string;
  gst_hst_number?: string;
  industry?: string;
}

// ============================================================================
// KYC
// ============================================================================

export type KycLevel = "level_0" | "level_1" | "level_2" | "level_3";
export type KycStatus = "pending" | "in_review" | "verified" | "rejected" | "expired";
export type RiskLevel = "low" | "medium" | "high" | "critical";

// ============================================================================
// Listings
// ============================================================================

export type PriceType = "fixed" | "auction" | "negotiable";
export type ListingStatus = "draft" | "pending_review" | "active" | "sold" | "expired" | "cancelled" | "suspended";
export type UnitType = "mt" | "kg" | "g" | "troy_oz" | "units" | "lots" | "cubic_yards";

export interface Listing {
  listing_id: string;
  seller_id: string;
  title: string;
  category_id: string;
  description: string;
  quantity: number;
  unit: UnitType;
  price_type: PriceType;
  asking_price?: number;
  reserve_price?: number;
  quality_grade?: string;
  images: ListingImage[];
  location: GeoPoint;
  pickup_address: Address;
  status: ListingStatus;
  created_at: string;
  published_at?: string;
}

export interface ListingImage {
  url: string;
  order: number;
  alt_text?: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Category {
  category_id: string;
  name: string;
  slug: string;
  parent_id?: string;
  default_unit?: UnitType;
  weight_tolerance: number;
}

// ============================================================================
// Bidding
// ============================================================================

export type BidStatus = "active" | "outbid" | "won" | "lost" | "retracted" | "cancelled";

export interface Bid {
  bid_id: string;
  listing_id: string;
  bidder_id: string;
  amount: number;
  status: BidStatus;
  server_timestamp: string;
}

// ============================================================================
// Orders
// ============================================================================

export interface Order {
  order_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  original_amount: number;
  adjusted_amount?: number;
  final_amount?: number;
  quantity: number;
  unit: UnitType;
  commission_rate: number;
  commission_amount?: number;
  currency: string;
  status: string;
  created_at: string;
}

// ============================================================================
// Escrow
// ============================================================================

export type EscrowStatus = "created" | "funds_held" | "partially_released" | "released" | "frozen" | "refunded" | "cancelled";

export interface Escrow {
  escrow_id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  original_amount: number;
  held_amount: number;
  released_amount: number;
  status: EscrowStatus;
}

// ============================================================================
// Payments
// ============================================================================

export type PaymentMethodType = "stripe_card" | "interac" | "eft" | "pad" | "wallet" | "letter_of_credit" | "credit_terms";
export type TransactionType = "purchase" | "deposit" | "bid_deposit" | "refund" | "commission" | "payout" | "wallet_topup" | "credit_payment";
export type TransactionStatus = "pending" | "processing" | "completed" | "failed" | "refunded" | "adjusted";

export interface Transaction {
  transaction_id: string;
  order_id?: string;
  payer_id: string;
  payee_id?: string;
  amount: number;
  currency: string;
  payment_method: PaymentMethodType;
  transaction_type: TransactionType;
  status: TransactionStatus;
  created_at: string;
}

// ============================================================================
// Inspection
// ============================================================================

export type InspectionType = "self" | "third_party_presale" | "buyer_onsite" | "pickup" | "delivery" | "dispute" | "lab_test";
export type InspectionResult = "pass" | "pass_with_deductions" | "fail" | "pending";
export type WeightPoint = "w1_seller" | "w2_carrier" | "w3_buyer" | "w4_third_party";

export interface WeightRecord {
  order_id: string;
  weight_point: WeightPoint;
  weight_kg: number;
  scale_certified: boolean;
  recorded_at: string;
}

// ============================================================================
// Disputes
// ============================================================================

export type DisputeCategory = "weight" | "quality" | "non_delivery" | "late_delivery" | "partial_delivery" | "damage" | "payment" | "contract_breach" | "documentation_fraud" | "environmental";
export type DisputeTier = "tier_1_negotiation" | "tier_2_mediation" | "tier_3_arbitration";
export type DisputeStatus = "open" | "in_negotiation" | "in_mediation" | "in_arbitration" | "resolved" | "closed";

// ============================================================================
// Events (Event Bus)
// ============================================================================

export interface MatexEvent<T = Record<string, unknown>> {
  event: string;
  payload: T;
  timestamp: string;
  server: string;
  trace_id?: string;
}

// ============================================================================
// Logging
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";
export type LogCategory = "tool_call" | "event" | "external_api" | "auth" | "financial" | "admin_action" | "system_health" | "security";

export interface AuditLogEntry {
  log_id: string;
  category: LogCategory;
  level: LogLevel;
  server: string;
  tool?: string;
  event_name?: string;
  user_id?: string;
  entity_type?: string;
  entity_id?: string;
  action: string;
  duration_ms?: number;
  success: boolean;
  error_message?: string;
  created_at: string;
}

// ============================================================================
// API Responses
// ============================================================================

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}
