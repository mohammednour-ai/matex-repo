#!/usr/bin/env node
import pg from "pg";

const { Client } = pg;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const targetSchemas = new Set([
  "kyc_mcp",
  "escrow_mcp",
  "bidding_mcp",
  "auction_mcp",
  "inspection_mcp",
  "booking_mcp",
]);

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const schemas = await client.query(
    "select schema_name from information_schema.schemata where schema_name like '%_mcp' order by schema_name",
  );
  const tables = await client.query(
    "select table_schema, table_name from information_schema.tables where table_schema like '%_mcp' and table_type = 'BASE TABLE' order by table_schema, table_name",
  );

  console.log("Schemas:", schemas.rows.map((r) => r.schema_name));
  console.log("Total MCP tables:", tables.rowCount);
  console.log(
    "Phase2 tables:",
    tables.rows.filter((r) => targetSchemas.has(r.table_schema)),
  );
} finally {
  await client.end();
}
