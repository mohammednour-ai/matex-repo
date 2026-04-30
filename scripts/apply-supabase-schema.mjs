#!/usr/bin/env node
// Apply docs/database/matex_complete_schema.sql to a Postgres DB referenced by
// SUPABASE_DIRECT_URL (preferred) or DATABASE_URL.
//
// Why a script instead of psql: Windows dev boxes don't ship psql, but `pg`
// is already a dev dep and it can run multi-statement DDL in one shot via
// the simple-query protocol when no parameters are bound.
//
// Usage (PowerShell):
//   $env:SUPABASE_DIRECT_URL = "postgresql://postgres:Dodo%401234@db.fdznxcqyrocznmrgxoge.supabase.co:5432/postgres"
//   node scripts/apply-supabase-schema.mjs
//
// The script is idempotent for the bits that use IF NOT EXISTS (extensions)
// but the schema's CREATE TYPE / CREATE TABLE statements are NOT idempotent.
// On a fresh DB it's a clean apply; on a dirty one it will error and stop.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(here, "..", "docs", "database", "matex_complete_schema.sql");

const url = process.env.SUPABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("FATAL: Set SUPABASE_DIRECT_URL (preferred) or DATABASE_URL before running.");
  process.exit(1);
}

console.log(`Reading ${sqlPath}`);
const sql = await readFile(sqlPath, "utf8");
console.log(`Loaded ${sql.length} chars of SQL.`);

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
console.log("Connecting to Postgres...");
await client.connect();
console.log("Connected. Applying schema in one shot...");

try {
  await client.query(sql);
  console.log("Schema applied successfully.");
} catch (err) {
  console.error("Schema apply FAILED:", err.message);
  if (err.position) console.error("Position:", err.position);
  process.exitCode = 1;
} finally {
  await client.end();
}

if (process.exitCode === 1) process.exit(1);

const verifier = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await verifier.connect();
const { rows } = await verifier.query(`
  SELECT table_schema, COUNT(*)::int AS table_count
  FROM information_schema.tables
  WHERE table_schema LIKE '%_mcp'
  GROUP BY table_schema
  ORDER BY table_schema
`);
await verifier.end();
console.log("\nMCP schemas created:");
for (const r of rows) console.log(`  ${r.table_schema.padEnd(28)} ${r.table_count} tables`);
console.log(`\nTotal MCP schemas: ${rows.length}`);
