import pg from "pg";
import { randomUUID } from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
const results = [];

async function step(name, fn) {
  try {
    const info = await fn();
    results.push({ step: name, status: "PASS", info });
  } catch (e) {
    results.push({ step: name, status: "FAIL", info: e.message });
  }
}

const userId = randomUUID();

await step("bootstrap user", async () => {
  await pool.query(
    `insert into auth_mcp.users (user_id,email,phone,password_hash,account_type,account_status,email_verified,phone_verified,mfa_enabled)
     values ($1,$2,$3,'hash','individual','active',true,true,false)`,
    [userId, `p4smoke.${Date.now()}@test.local`, `+1416${Math.floor(1000000+Math.random()*8999999)}`],
  );
  return `user_id=${userId}`;
});

await step("analytics: dashboard stats", async () => {
  const listings = (await pool.query(`select count(*)::int as cnt from listing_mcp.listings where status='active'`)).rows[0]?.cnt ?? 0;
  const users = (await pool.query(`select count(*)::int as cnt from auth_mcp.users`)).rows[0]?.cnt ?? 0;
  return `active_listings=${listings}, total_users=${users}`;
});

await step("analytics: revenue report", async () => {
  const result = await pool.query(
    `select count(*)::int as cnt, coalesce(sum(amount),0)::numeric as vol
     from payments_mcp.transactions where status='completed' and created_at > now() - interval '30 days'`,
  );
  return `transactions=${result.rows[0]?.cnt ?? 0}, volume=${result.rows[0]?.vol ?? 0}`;
});

await step("pricing: capture + query market price", async () => {
  const priceId = randomUUID();
  await pool.query(
    `insert into pricing_mcp.market_prices (price_id,material,index_source,price,currency,unit,captured_at)
     values ($1,'copper','lme',9812.50,'USD','mt',now())`,
    [priceId],
  );
  const row = (await pool.query(`select price from pricing_mcp.market_prices where price_id=$1`, [priceId])).rows[0];
  return `price_id=${priceId} price=${row.price}`;
});

await step("pricing: create + query alert", async () => {
  const alertId = randomUUID();
  await pool.query(
    `insert into pricing_mcp.price_alerts (alert_id,user_id,material,index_source,condition,threshold,is_active)
     values ($1,$2,'copper','lme','above',10000,true)`,
    [alertId, userId],
  );
  const row = (await pool.query(`select is_active from pricing_mcp.price_alerts where alert_id=$1`, [alertId])).rows[0];
  return `alert_id=${alertId} active=${row.is_active}`;
});

await step("credit: assess + query + freeze", async () => {
  const score = 720;
  const tier = "premium";
  const limit = 200000;
  await pool.query(
    `insert into credit_mcp.credit_facilities (user_id,credit_tier,credit_limit,available_credit,matex_credit_score,status,last_assessment_at)
     values ($1,$2,$3,$3,$4,'active',now())
     on conflict (user_id) do update set credit_tier=$2,credit_limit=$3,available_credit=$3,matex_credit_score=$4,status='active',updated_at=now()`,
    [userId, tier, limit, score],
  );
  const scoreId = randomUUID();
  await pool.query(
    `insert into credit_mcp.credit_score_history (score_id,user_id,score,factors,calculated_at)
     values ($1,$2,$3,'{"payment_history":0.92,"volume":0.78}'::jsonb,now())`,
    [scoreId, userId, score],
  );
  await pool.query(`update credit_mcp.credit_facilities set status='frozen',available_credit=0,updated_at=now() where user_id=$1`, [userId]);
  const row = (await pool.query(`select status,credit_tier from credit_mcp.credit_facilities where user_id=$1`, [userId])).rows[0];
  return `tier=${row.credit_tier} status=${row.status} score=${score}`;
});

await step("admin: platform overview + suspend/unsuspend", async () => {
  const users = (await pool.query(`select count(*)::int as cnt from auth_mcp.users`)).rows[0]?.cnt ?? 0;
  await pool.query(`update auth_mcp.users set account_status='suspended' where user_id=$1`, [userId]);
  const suspended = (await pool.query(`select account_status from auth_mcp.users where user_id=$1`, [userId])).rows[0];
  await pool.query(`update auth_mcp.users set account_status='active' where user_id=$1`, [userId]);
  const restored = (await pool.query(`select account_status from auth_mcp.users where user_id=$1`, [userId])).rows[0];
  return `users=${users} suspended=${suspended.account_status} restored=${restored.account_status}`;
});

await pool.end();
console.log(JSON.stringify({ run_id: String(Date.now()), results }, null, 2));
const failed = results.filter(r => r.status === "FAIL");
if (failed.length > 0) process.exit(1);
