import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { initSentry } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

import { createTenant, getTenant, yardLogin, upsertYardSettings, listYardUsers, createYardUser } from "./tools/tenant";
import { createSeller, getSeller, listSellers, updateSeller, blockSeller, recordPipedaConsent, logSellerId, listSellerIds } from "./tools/sellers";
import { setMaterial, listMaterials, setPriceSchedule, getActivePrices, getPriceHistory } from "./tools/pricing";
import { createTicket, recordWeights, addTicketLine, removeTicketLine, attachLinePhoto, recordSignature, completeTicket, voidTicket, getTicket, listTickets } from "./tools/intake";
import { logCatConverter, updateCatStatus, listCatConverters } from "./tools/cat_converters";
import { createPayout, confirmPayout, voidPayout, listPayouts } from "./tools/payouts";
import { createLot, splitLot, mergeLots, getLot, listLots, getLotLineage } from "./tools/lots";
import { generateZReport, generateHstReport, bylawExport, flagSuspiciousTransaction } from "./tools/reports";
import { appendAuditEvent, queryAuditLog } from "./tools/audit";
import { connectToExchange, publishLotToExchange, getExchangeBids } from "./tools/exchange";

const SERVER_NAME = "yardops-mcp";
const SERVER_VERSION = "0.1.0";
initSentry(SERVER_NAME);

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Tenant / Auth
    { name: "create_tenant", description: "Create a new yard tenant and admin user", inputSchema: { type: "object", properties: { name: { type: "string" }, admin_email: { type: "string" }, admin_password: { type: "string" }, admin_name: { type: "string" } }, required: ["name", "admin_email", "admin_password", "admin_name"] } },
    { name: "get_tenant", description: "Get yard tenant details", inputSchema: { type: "object", properties: { tenant_id: { type: "string" } }, required: ["tenant_id"] } },
    { name: "login", description: "Login to YardOps (public tool)", inputSchema: { type: "object", properties: { email: { type: "string" }, password: { type: "string" } }, required: ["email", "password"] } },
    { name: "upsert_yard_settings", description: "Update yard settings", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, settings: { type: "object" } }, required: ["tenant_id", "settings"] } },
    { name: "list_yard_users", description: "List yard staff accounts", inputSchema: { type: "object", properties: { tenant_id: { type: "string" } }, required: ["tenant_id"] } },
    { name: "create_yard_user", description: "Create a yard staff account", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, email: { type: "string" }, password: { type: "string" }, full_name: { type: "string" }, role: { type: "string" } }, required: ["tenant_id", "email", "password", "full_name", "role"] } },
    // Sellers
    { name: "create_seller", description: "Register a new seller", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, first_name: { type: "string" }, last_name: { type: "string" }, phone: { type: "string" } }, required: ["tenant_id", "actor_id", "first_name", "last_name", "phone"] } },
    { name: "get_seller", description: "Get seller details", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, seller_id: { type: "string" } }, required: ["tenant_id", "seller_id"] } },
    { name: "list_sellers", description: "Search/list sellers", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, search: { type: "string" } }, required: ["tenant_id"] } },
    { name: "update_seller", description: "Update seller record", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, seller_id: { type: "string" } }, required: ["tenant_id", "actor_id", "seller_id"] } },
    { name: "block_seller", description: "Block a seller from the yard", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, seller_id: { type: "string" }, reason: { type: "string" } }, required: ["tenant_id", "actor_id", "seller_id"] } },
    { name: "record_pipeda_consent", description: "Record PIPEDA consent for a seller", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, seller_id: { type: "string" } }, required: ["tenant_id", "seller_id"] } },
    { name: "log_seller_id", description: "Log and encrypt a seller ID document", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, seller_id: { type: "string" }, id_type: { type: "string" }, id_number_plain: { type: "string" } }, required: ["tenant_id", "actor_id", "seller_id", "id_type", "id_number_plain"] } },
    { name: "list_seller_ids", description: "List ID records for a seller", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, seller_id: { type: "string" } }, required: ["tenant_id", "seller_id"] } },
    // Pricing
    { name: "set_material", description: "Create or update a material in the catalog", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, name: { type: "string" }, category: { type: "string" } }, required: ["tenant_id", "name", "category"] } },
    { name: "list_materials", description: "List materials catalog", inputSchema: { type: "object", properties: { tenant_id: { type: "string" } }, required: ["tenant_id"] } },
    { name: "set_price_schedule", description: "Set effective-dated price for a material", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, material_id: { type: "string" }, price_per_kg: { type: "number" }, effective_date: { type: "string" } }, required: ["tenant_id", "actor_id", "material_id", "price_per_kg", "effective_date"] } },
    { name: "get_active_prices", description: "Get current prices for all materials", inputSchema: { type: "object", properties: { tenant_id: { type: "string" } }, required: ["tenant_id"] } },
    { name: "get_price_history", description: "Get price history for a material", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, material_id: { type: "string" } }, required: ["tenant_id", "material_id"] } },
    // Intake
    { name: "create_ticket", description: "Start a new intake ticket", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, seller_id: { type: "string" } }, required: ["tenant_id", "actor_id", "seller_id"] } },
    { name: "record_weights", description: "Record gross and tare weights", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, ticket_id: { type: "string" }, gross_weight_kg: { type: "number" }, tare_weight_kg: { type: "number" } }, required: ["tenant_id", "actor_id", "ticket_id", "gross_weight_kg", "tare_weight_kg"] } },
    { name: "add_ticket_line", description: "Add a material line to a ticket", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, ticket_id: { type: "string" }, material_id: { type: "string" }, quantity_kg: { type: "number" }, unit_price_per_kg: { type: "number" } }, required: ["tenant_id", "actor_id", "ticket_id", "material_id", "quantity_kg", "unit_price_per_kg"] } },
    { name: "remove_ticket_line", description: "Remove a line from a ticket", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, line_id: { type: "string" }, ticket_id: { type: "string" } }, required: ["tenant_id", "actor_id", "line_id", "ticket_id"] } },
    { name: "attach_line_photo", description: "Attach a photo to a ticket line (Supabase Storage)", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, ticket_id: { type: "string" }, line_id: { type: "string" }, photo_base64: { type: "string" }, media_type: { type: "string" } }, required: ["tenant_id", "actor_id", "ticket_id", "line_id", "photo_base64"] } },
    { name: "record_signature", description: "Record seller signature SVG", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, ticket_id: { type: "string" }, signature_svg: { type: "string" } }, required: ["tenant_id", "actor_id", "ticket_id", "signature_svg"] } },
    { name: "complete_ticket", description: "Mark ticket as completed", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, ticket_id: { type: "string" } }, required: ["tenant_id", "actor_id", "ticket_id"] } },
    { name: "void_ticket", description: "Void a ticket with reason", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, ticket_id: { type: "string" }, reason: { type: "string" } }, required: ["tenant_id", "actor_id", "ticket_id", "reason"] } },
    { name: "get_ticket", description: "Get ticket details with all lines", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, ticket_id: { type: "string" } }, required: ["tenant_id", "ticket_id"] } },
    { name: "list_tickets", description: "List/filter intake tickets", inputSchema: { type: "object", properties: { tenant_id: { type: "string" } }, required: ["tenant_id"] } },
    // Cat Converters
    { name: "log_cat_converter", description: "Log catalytic converter intake record", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, ticket_id: { type: "string" }, seller_id: { type: "string" }, unit_count: { type: "number" } }, required: ["tenant_id", "actor_id", "ticket_id", "seller_id", "unit_count"] } },
    { name: "update_cat_status", description: "Update catalytic converter status", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, cat_id: { type: "string" }, status: { type: "string" } }, required: ["tenant_id", "actor_id", "cat_id", "status"] } },
    { name: "list_cat_converters", description: "List catalytic converters", inputSchema: { type: "object", properties: { tenant_id: { type: "string" } }, required: ["tenant_id"] } },
    // Payouts
    { name: "create_payout", description: "Create a seller payout record", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, ticket_id: { type: "string" }, seller_id: { type: "string" }, subtotal: { type: "number" }, method: { type: "string" } }, required: ["tenant_id", "actor_id", "ticket_id", "seller_id", "subtotal", "method"] } },
    { name: "confirm_payout", description: "Confirm payout completed", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, payout_id: { type: "string" } }, required: ["tenant_id", "actor_id", "payout_id"] } },
    { name: "void_payout", description: "Void a payout", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, payout_id: { type: "string" }, reason: { type: "string" } }, required: ["tenant_id", "actor_id", "payout_id", "reason"] } },
    { name: "list_payouts", description: "List payouts", inputSchema: { type: "object", properties: { tenant_id: { type: "string" } }, required: ["tenant_id"] } },
    // Lots
    { name: "create_lot", description: "Create a new material lot", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, material_id: { type: "string" }, initial_weight_kg: { type: "number" } }, required: ["tenant_id", "actor_id", "material_id", "initial_weight_kg"] } },
    { name: "split_lot", description: "Split weight from a lot into a new lot", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, lot_id: { type: "string" }, split_weight_kg: { type: "number" } }, required: ["tenant_id", "actor_id", "lot_id", "split_weight_kg"] } },
    { name: "merge_lots", description: "Merge multiple lots into one", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, source_lot_ids: { type: "array" }, target_lot_id: { type: "string" } }, required: ["tenant_id", "actor_id", "source_lot_ids", "target_lot_id"] } },
    { name: "get_lot", description: "Get lot details", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lot_id: { type: "string" } }, required: ["tenant_id", "lot_id"] } },
    { name: "list_lots", description: "List lots", inputSchema: { type: "object", properties: { tenant_id: { type: "string" } }, required: ["tenant_id"] } },
    { name: "get_lot_lineage", description: "Get lot movement history", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lot_id: { type: "string" } }, required: ["tenant_id", "lot_id"] } },
    // Reports
    { name: "generate_z_report", description: "Generate daily Z-report", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, business_date: { type: "string" } }, required: ["tenant_id", "business_date"] } },
    { name: "generate_hst_report", description: "Generate HST/tax report for period", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, period_start: { type: "string" }, period_end: { type: "string" } }, required: ["tenant_id", "period_start", "period_end"] } },
    { name: "bylaw_export", description: "Generate Ontario bylaw officer export with SHA-256 hash", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, date_from: { type: "string" }, date_to: { type: "string" } }, required: ["tenant_id", "date_from", "date_to"] } },
    { name: "flag_suspicious_transaction", description: "Flag a transaction as suspicious for police review", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, ticket_id: { type: "string" }, reason: { type: "string" } }, required: ["tenant_id", "actor_id", "ticket_id", "reason"] } },
    // Audit
    { name: "append_audit_event", description: "Append an audit log event", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, action: { type: "string" }, resource_type: { type: "string" } }, required: ["tenant_id", "actor_id", "action", "resource_type"] } },
    { name: "query_audit_log", description: "Query audit log events", inputSchema: { type: "object", properties: { tenant_id: { type: "string" } }, required: ["tenant_id"] } },
    // Exchange
    { name: "connect_to_exchange", description: "Connect yard to Matex Exchange Hub", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, matex_email: { type: "string" }, matex_password: { type: "string" } }, required: ["tenant_id", "actor_id", "matex_email", "matex_password"] } },
    { name: "publish_lot_to_exchange", description: "Publish a lot to Matex Exchange Hub", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, actor_id: { type: "string" }, lot_id: { type: "string" }, asking_price_per_kg: { type: "number" } }, required: ["tenant_id", "actor_id", "lot_id", "asking_price_per_kg"] } },
    { name: "get_exchange_bids", description: "Get bids for a published lot", inputSchema: { type: "object", properties: { tenant_id: { type: "string" }, lot_id: { type: "string" } }, required: ["tenant_id", "lot_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  const wrap = (result: unknown) => {
    if (result && typeof result === "object" && "isError" in result) return result as never;
    if (typeof result === "string") return { content: [{ type: "text" as const, text: result }] };
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  };

  switch (tool) {
    // Tenant
    case "create_tenant":        return wrap(await createTenant(args));
    case "get_tenant":           return wrap(await getTenant(args));
    case "login":                return wrap(await yardLogin(args));
    case "upsert_yard_settings": return wrap(await upsertYardSettings(args));
    case "list_yard_users":      return wrap(await listYardUsers(args));
    case "create_yard_user":     return wrap(await createYardUser(args));
    // Sellers
    case "create_seller":        return wrap(await createSeller(args));
    case "get_seller":           return wrap(await getSeller(args));
    case "list_sellers":         return wrap(await listSellers(args));
    case "update_seller":        return wrap(await updateSeller(args));
    case "block_seller":         return wrap(await blockSeller(args));
    case "record_pipeda_consent":return wrap(await recordPipedaConsent(args));
    case "log_seller_id":        return wrap(await logSellerId(args));
    case "list_seller_ids":      return wrap(await listSellerIds(args));
    // Pricing
    case "set_material":         return wrap(await setMaterial(args));
    case "list_materials":       return wrap(await listMaterials(args));
    case "set_price_schedule":   return wrap(await setPriceSchedule(args));
    case "get_active_prices":    return wrap(await getActivePrices(args));
    case "get_price_history":    return wrap(await getPriceHistory(args));
    // Intake
    case "create_ticket":        return wrap(await createTicket(args));
    case "record_weights":       return wrap(await recordWeights(args));
    case "add_ticket_line":      return wrap(await addTicketLine(args));
    case "remove_ticket_line":   return wrap(await removeTicketLine(args));
    case "attach_line_photo":    return wrap(await attachLinePhoto(args));
    case "record_signature":     return wrap(await recordSignature(args));
    case "complete_ticket":      return wrap(await completeTicket(args));
    case "void_ticket":          return wrap(await voidTicket(args));
    case "get_ticket":           return wrap(await getTicket(args));
    case "list_tickets":         return wrap(await listTickets(args));
    // Cat Converters
    case "log_cat_converter":    return wrap(await logCatConverter(args));
    case "update_cat_status":    return wrap(await updateCatStatus(args));
    case "list_cat_converters":  return wrap(await listCatConverters(args));
    // Payouts
    case "create_payout":        return wrap(await createPayout(args));
    case "confirm_payout":       return wrap(await confirmPayout(args));
    case "void_payout":          return wrap(await voidPayout(args));
    case "list_payouts":         return wrap(await listPayouts(args));
    // Lots
    case "create_lot":           return wrap(await createLot(args));
    case "split_lot":            return wrap(await splitLot(args));
    case "merge_lots":           return wrap(await mergeLots(args));
    case "get_lot":              return wrap(await getLot(args));
    case "list_lots":            return wrap(await listLots(args));
    case "get_lot_lineage":      return wrap(await getLotLineage(args));
    // Reports
    case "generate_z_report":    return wrap(await generateZReport(args));
    case "generate_hst_report":  return wrap(await generateHstReport(args));
    case "bylaw_export":         return wrap(await bylawExport(args));
    case "flag_suspicious_transaction": return wrap(await flagSuspiciousTransaction(args));
    // Audit
    case "append_audit_event":   return wrap(await appendAuditEvent(args));
    case "query_audit_log":      return wrap(await queryAuditLog(args));
    // Exchange
    case "connect_to_exchange":  return wrap(await connectToExchange(args));
    case "publish_lot_to_exchange": return wrap(await publishLotToExchange(args));
    case "get_exchange_bids":    return wrap(await getExchangeBids(args));
    // Health
    case "ping":
      return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, data: { pong: true, server: SERVER_NAME, version: SERVER_VERSION } }) }] };
    default:
      return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${tool}` } }) }] };
  }
});

const MCP_PORT = Number(process.env.YARDOPS_MCP_PORT ?? 4130);

async function main() {
  if (process.env.MCP_HTTP_MODE === "1" || process.env.YARDOPS_MCP_PORT) {
    startDomainHttpAdapter("yardops", MCP_PORT, server);
    console.log(`[yardops-mcp] HTTP adapter listening on port ${MCP_PORT}`);
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[yardops-mcp] Running on stdio");
  }
}

main().catch(console.error);
