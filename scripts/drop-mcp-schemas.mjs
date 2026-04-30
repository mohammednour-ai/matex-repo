// Drop all *_mcp schemas + log_mcp from a fresh Supabase project so we can
// re-apply the canonical schema.sql cleanly.
import pg from "pg";
const { Client } = pg;

const url = process.env.SUPABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error("SUPABASE_DIRECT_URL required"); process.exit(1); }

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows } = await c.query(`
  SELECT nspname AS schema FROM pg_namespace
  WHERE nspname LIKE '%_mcp' OR nspname IN ('orders_mcp')
`);
console.log("Found schemas:", rows.map((r) => r.schema));
for (const r of rows) {
  console.log(`DROP SCHEMA ${r.schema} CASCADE`);
  await c.query(`DROP SCHEMA IF EXISTS ${r.schema} CASCADE`);
}
// Drop dangling enum types from previous failed apply
const { rows: types } = await c.query(`
  SELECT n.nspname || '.' || t.typname AS qual
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typtype = 'e'
`);
for (const t of types) {
  console.log(`DROP TYPE ${t.qual}`);
  await c.query(`DROP TYPE IF EXISTS ${t.qual} CASCADE`);
}
await c.end();
console.log("Cleanup done.");
