/**
 * Extract MCP tool names from mcp-http-adapter and mcp-gateway dev handlers.
 * Writes packages/shared/mcp-http-adapter/mcp-tools.manifest.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const CATALOG_141 = [
  "auth.register",
  "auth.login",
  "auth.request_email_otp",
  "auth.request_phone_otp",
  "auth.verify_email",
  "auth.verify_phone",
  "auth.refresh_token",
  "profile.get_profile",
  "profile.update_profile",
  "profile.add_bank_account",
  "profile.set_preferences",
  "listing.create_listing",
  "listing.update_listing",
  "listing.publish_listing",
  "listing.get_listing",
  "listing.get_my_listings",
  "listing.upload_images",
  "listing.archive_listing",
  "search.search_materials",
  "search.geo_search",
  "search.filter_by_category",
  "search.save_search",
  "search.get_saved_searches",
  "search.index_listing",
  "messaging.create_thread",
  "messaging.send_message",
  "messaging.get_thread",
  "messaging.get_unread",
  "messaging.list_threads",
  "payments.process_payment",
  "payments.get_wallet_balance",
  "payments.top_up_wallet",
  "payments.manage_payment_methods",
  "payments.get_transaction_history",
  "kyc.start_verification",
  "kyc.submit_document",
  "kyc.get_kyc_level",
  "kyc.review_verification",
  "kyc.assert_kyc_gate",
  "escrow.create_escrow",
  "escrow.hold_funds",
  "escrow.release_funds",
  "escrow.freeze_escrow",
  "escrow.refund_escrow",
  "escrow.get_escrow",
  "escrow.list_escrows",
  "auction.create_auction",
  "auction.start_auction",
  "auction.add_lot",
  "auction.close_lot",
  "auction.place_auction_bid",
  "auction.get_lot_state",
  "auction.list_auctions",
  "auction.get_auction",
  "bidding.place_bid",
  "bidding.retract_bid",
  "bidding.get_highest_bid",
  "bidding.flag_suspicious_bid",
  "inspection.request_inspection",
  "inspection.complete_inspection",
  "inspection.record_weight",
  "inspection.evaluate_discrepancy",
  "inspection.get_inspection",
  "inspection.list_inspections",
  "booking.create_booking",
  "booking.set_availability",
  "booking.update_booking_status",
  "booking.list_user_bookings",
  "booking.enqueue_reminder",
  "booking.get_available_slots",
  "logistics.get_quotes",
  "logistics.book_shipment",
  "logistics.generate_bol",
  "logistics.get_shipment",
  "logistics.list_shipments",
  "logistics.update_tracking",
  "contracts.create_contract",
  "contracts.activate_contract",
  "contracts.get_contract",
  "contracts.list_contracts",
  "contracts.terminate_contract",
  "contracts.generate_order",
  "contracts.negotiate_terms",
  "dispute.file_dispute",
  "dispute.submit_evidence",
  "dispute.escalate_dispute",
  "dispute.resolve_dispute",
  "dispute.get_dispute",
  "dispute.propose_settlement",
  "dispute.update_pis",
  "tax.calculate_tax",
  "tax.generate_invoice",
  "tax.get_invoice",
  "tax.void_invoice",
  "tax.get_remittance_summary",
  "notifications.send_notification",
  "notifications.get_notifications",
  "notifications.mark_read",
  "notifications.get_preferences",
  "notifications.update_preferences",
  "analytics.get_dashboard_stats",
  "analytics.get_revenue_report",
  "analytics.get_conversion_funnel",
  "analytics.export_data",
  "pricing.capture_market_price",
  "pricing.get_market_prices",
  "pricing.create_price_alert",
  "pricing.get_price_alerts",
  "pricing.check_alerts",
  "pricing.calculate_mpi",
  "credit.assess_credit",
  "credit.get_credit_facility",
  "credit.get_credit_history",
  "credit.freeze_facility",
  "credit.draw_credit",
  "credit.record_payment",
  "admin.get_platform_overview",
  "admin.list_users",
  "admin.update_user",
  "admin.suspend_user",
  "admin.unsuspend_user",
  "admin.list_listings",
  "admin.moderate_listing",
  "admin.update_listing_status",
  "admin.list_escrows",
  "admin.list_auctions",
  "admin.list_orders",
  "admin.update_order_status",
  "admin.list_bids",
  "admin.list_transactions",
  "admin.list_platform_config",
  "admin.update_platform_config",
  "admin.grant_platform_admin",
  "admin.revoke_platform_admin",
  "admin.get_audit_trail",
  "esign.create_document",
  "esign.send_for_signing",
  "esign.record_signature",
  "esign.get_document",
  "esign.void_document",
  "esign.verify_hash",
];

const REPO_EXTRAS = ["admin.list_lots", "listing.add_favorite", "profile.update_company", "messaging.get_messages", "auction.register_bidder"];

function extractTools(src, pattern) {
  const re = new RegExp(pattern, "g");
  const out = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    out.add(m[1]);
  }
  return [...out].sort();
}

const adapterPath = join(root, "packages/shared/mcp-http-adapter/src/index.ts");
const gatewayPath = join(root, "apps/mcp-gateway/src/index.ts");
const adapterSrc = readFileSync(adapterPath, "utf8");
const gatewaySrc = readFileSync(gatewayPath, "utf8");

const adapterTools = extractTools(adapterSrc, 'if \\(tool === "([^"]+)"');
const mergedAdapter = new Set([...adapterTools]);
for (const line of adapterSrc.matchAll(/if \(tool === "([^"]+)" \|\| tool === "([^"]+)"/g)) {
  mergedAdapter.add(line[1]);
  mergedAdapter.add(line[2]);
}
const adapterAll = [...mergedAdapter].sort();

const gatewayTools = extractTools(gatewaySrc, 'if \\(tool === "([^"]+)"');
const gwOr = [...gatewaySrc.matchAll(/if \(tool === "([^"]+)" \|\| tool === "([^"]+)"/g)];
const mergedGw = new Set(gatewayTools);
for (const g of gwOr) {
  mergedGw.add(g[1]);
  mergedGw.add(g[2]);
}
const gatewayAll = [...mergedGw].sort();

const catalogSet = new Set(CATALOG_141);
const missingFromAdapter = CATALOG_141.filter((t) => !mergedAdapter.has(t));
const extraInAdapterNotInCatalog = adapterAll.filter((t) => !catalogSet.has(t));

const manifest = {
  generatedAt: new Date().toISOString(),
  catalogOfficialCount: CATALOG_141.length,
  adapterToolCount: adapterAll.length,
  gatewayDevToolCount: gatewayAll.length,
  adapterTools: adapterAll,
  gatewayDevTools: gatewayAll,
  repoDocumentedExtras: REPO_EXTRAS,
  diff: {
    missingFromAdapter,
    extraInAdapterNotInCatalog,
    inGatewayDevButNotAdapter: gatewayAll.filter((t) => !mergedAdapter.has(t)),
    inAdapterButNotGatewayDev: adapterAll.filter((t) => !mergedGw.has(t) && t !== "auth.ping"),
  },
};

const outPath = join(root, "packages/shared/mcp-http-adapter/mcp-tools.manifest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(`Wrote ${outPath}`);
console.log(`missingFromAdapter: ${missingFromAdapter.length ? missingFromAdapter.join(", ") : "(none)"}`);
