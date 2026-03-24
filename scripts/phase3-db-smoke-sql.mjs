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

const sellerId = randomUUID();
const buyerId = randomUUID();
const listingId = randomUUID();
const orderId = randomUUID();
const categoryId = randomUUID();

await step("bootstrap users/listing/category/order", async () => {
  await pool.query(
    `insert into auth_mcp.users (user_id,email,phone,password_hash,account_type,account_status,email_verified,phone_verified,mfa_enabled)
     values ($1,$2,$3,'hash','individual','active',true,true,false)`,
    [sellerId, `p3seller.${Date.now()}@test.local`, `+1416${Math.floor(1000000+Math.random()*8999999)}`],
  );
  await pool.query(
    `insert into auth_mcp.users (user_id,email,phone,password_hash,account_type,account_status,email_verified,phone_verified,mfa_enabled)
     values ($1,$2,$3,'hash','individual','active',true,true,false)`,
    [buyerId, `p3buyer.${Date.now()}@test.local`, `+1416${Math.floor(1000000+Math.random()*8999999)}`],
  );
  await pool.query(
    `insert into listing_mcp.categories (category_id,name,slug,description,default_unit,is_active)
     values ($1,'P3 Smoke Cat',$2,'Smoke test','kg',true)`,
    [categoryId, `p3-smoke-cat-${categoryId}`],
  );
  await pool.query(
    `insert into listing_mcp.listings
      (listing_id,seller_id,title,slug,category_id,description,quantity,unit,price_type,asking_price,images,location,pickup_address,status)
     values ($1,$2,'P3 Smoke Listing',$4,$3,'smoke',100,'kg','fixed',5000,'[]'::jsonb,
     ST_SetSRID(ST_MakePoint(-79.38,43.65),4326)::geography,'{"city":"Toronto","province":"ON"}'::jsonb,'active')`,
    [listingId, sellerId, categoryId, `p3-smoke-listing-${listingId}`],
  );
  await pool.query(
    `insert into orders_mcp.orders
      (order_id,listing_id,buyer_id,seller_id,original_amount,quantity,unit,commission_rate,currency,status)
     values ($1,$2,$3,$4,5000,100,'kg',0.035,'CAD','pending')`,
    [orderId, listingId, buyerId, sellerId],
  );
  return "bootstrap complete";
});

await step("logistics: quotes + book + track", async () => {
  const quoteId = randomUUID();
  await pool.query(
    `insert into logistics_mcp.shipping_quotes (quote_id,order_id,carrier_name,carrier_api,price,currency,transit_days,service_type,valid_until)
     values ($1,$2,'Day & Ross','day_ross',1190,'CAD',2,'ltl',now() + interval '24 hours')`,
    [quoteId, orderId],
  );
  const shipmentId = randomUUID();
  await pool.query(
    `insert into logistics_mcp.shipments
      (shipment_id,order_id,carrier_name,carrier_api,origin_address,destination_address,weight_kg,hazmat,status)
     values ($1,$2,'Day & Ross','day_ross','{"city":"Hamilton","province":"ON"}'::jsonb,'{"city":"Toronto","province":"ON"}'::jsonb,18000,'none','booked')`,
    [shipmentId, orderId],
  );
  await pool.query(`update logistics_mcp.shipments set status='in_transit',tracking_number='TRK-SMOKE',updated_at=now() where shipment_id=$1`, [shipmentId]);
  await pool.query(`update logistics_mcp.shipments set status='delivered',actual_delivery=now(),updated_at=now() where shipment_id=$1`, [shipmentId]);
  const row = (await pool.query(`select status from logistics_mcp.shipments where shipment_id=$1`, [shipmentId])).rows[0];
  return `shipment ${shipmentId} status=${row.status}`;
});

await step("contracts: create + activate + terminate", async () => {
  const contractId = randomUUID();
  await pool.query(
    `insert into contracts_mcp.contracts
      (contract_id,buyer_id,seller_id,contract_type,material_category_id,quality_specs,pricing_model,total_volume,unit,start_date,end_date,status)
     values ($1,$2,$3,'volume',$4,'{"grade":"ISRI"}'::jsonb,'{"type":"index_linked"}'::jsonb,240,'mt',now()::date,(now() + interval '1 year')::date,'draft')`,
    [contractId, buyerId, sellerId, categoryId],
  );
  await pool.query(`update contracts_mcp.contracts set status='active',activated_at=now() where contract_id=$1`, [contractId]);
  await pool.query(`update contracts_mcp.contracts set status='terminated',terminated_at=now() where contract_id=$1`, [contractId]);
  const row = (await pool.query(`select status from contracts_mcp.contracts where contract_id=$1`, [contractId])).rows[0];
  return `contract ${contractId} status=${row.status}`;
});

await step("dispute: file + escalate + resolve", async () => {
  const disputeId = randomUUID();
  await pool.query(
    `insert into dispute_mcp.disputes
      (dispute_id,order_id,filing_party_id,responding_party_id,category,description,current_tier,status,resolution_deadline)
     values ($1,$2,$3,$4,'quality','Weight mismatch','tier_1_negotiation','open',now() + interval '14 days')`,
    [disputeId, orderId, buyerId, sellerId],
  );
  await pool.query(`update dispute_mcp.disputes set current_tier='tier_2_mediation',status='escalated',updated_at=now() where dispute_id=$1`, [disputeId]);
  const evidenceId = randomUUID();
  await pool.query(
    `insert into dispute_mcp.evidence (evidence_id,dispute_id,submitted_by,evidence_type,description)
     values ($1,$2,$3,'document','Scale ticket showing 5% shortage')`,
    [evidenceId, disputeId, buyerId],
  );
  await pool.query(`update dispute_mcp.disputes set status='resolved',resolution_summary='Partial refund',resolved_at=now(),updated_at=now() where dispute_id=$1`, [disputeId]);
  const row = (await pool.query(`select status,current_tier from dispute_mcp.disputes where dispute_id=$1`, [disputeId])).rows[0];
  return `dispute ${disputeId} status=${row.status} tier=${row.current_tier}`;
});

await step("tax: calculate + generate invoice", async () => {
  const invoiceId = randomUUID();
  const year = new Date().getFullYear();
  const seqRes = await pool.query(`select count(*)::int as cnt from tax_mcp.invoices where invoice_number like $1`, [`MTX-${year}-%`]);
  const seq = Number(seqRes.rows[0]?.cnt ?? 0) + 1;
  const invoiceNumber = `MTX-${year}-${String(seq).padStart(6, "0")}`;
  const subtotal = 22495;
  const hst = Math.round(subtotal * 0.13 * 100) / 100;
  await pool.query(
    `insert into tax_mcp.invoices
      (invoice_id,invoice_number,order_id,buyer_id,seller_id,subtotal,commission_amount,gst_amount,pst_amount,hst_amount,qst_amount,total_tax,total_amount,seller_province,buyer_province,status)
     values ($1,$2,$3,$4,$5,$6,$7,0,0,$8,0,$8,$9,'ON','ON','issued')`,
    [invoiceId, invoiceNumber, orderId, buyerId, sellerId, subtotal, Math.round(subtotal * 0.035 * 100) / 100, hst, Math.round((subtotal + hst) * 100) / 100],
  );
  const row = (await pool.query(`select invoice_number,total_amount,hst_amount from tax_mcp.invoices where invoice_id=$1`, [invoiceId])).rows[0];
  return `invoice=${row.invoice_number} total=${row.total_amount} hst=${row.hst_amount}`;
});

await step("notifications: send + read", async () => {
  const notifId = randomUUID();
  await pool.query(
    `insert into notifications_mcp.notifications
      (notification_id,user_id,type,title,body,data,channels_sent,priority)
     values ($1,$2,'order.shipped','Shipment update','Your copper wire lot is in transit.','{"order_id":"${orderId}"}'::jsonb,'{in_app,email}'::notification_channel[],'normal')`,
    [notifId, buyerId],
  );
  await pool.query(`update notifications_mcp.notifications set read=true,read_at=now() where notification_id=$1`, [notifId]);
  const row = (await pool.query(`select read from notifications_mcp.notifications where notification_id=$1`, [notifId])).rows[0];
  return `notification ${notifId} read=${row.read}`;
});

await pool.end();
console.log(JSON.stringify({ run_id: String(Date.now()), results }, null, 2));
const failed = results.filter(r => r.status === "FAIL");
if (failed.length > 0) process.exit(1);
