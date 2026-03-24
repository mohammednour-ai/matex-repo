import { startDomainHttpAdapter } from "../packages/shared/mcp-http-adapter/src";

const ports: Record<string, number> = {
  auth: 4101,
  profile: 4102,
  listing: 4103,
  search: 4104,
  messaging: 4105,
  payments: 4106,
  kyc: 4107,
  escrow: 4108,
  bidding: 4109,
  auction: 4110,
  inspection: 4111,
  booking: 4112,
  logistics: 4113,
  contracts: 4114,
  dispute: 4115,
  tax: 4116,
  notifications: 4117,
  analytics: 4118,
  pricing: 4119,
  credit: 4120,
  admin: 4121,
  esign: 4122,
};

for (const [domain, port] of Object.entries(ports)) {
  startDomainHttpAdapter(domain, port);
}

console.log("All MCP HTTP adapters started.");
