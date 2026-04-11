#!/usr/bin/env node
/**
 * Seeds PostgreSQL (auth_mcp, profile_mcp, listing_mcp) from matex_seed_data.xlsx.
 *
 * Prerequisites: DATABASE_URL, Python 3 with openpyxl (`pip install openpyxl`).
 * Default password for every seeded account: MatexSeed2026!
 *
 * Usage: pnpm exec node scripts/seed-matex-from-xlsx.mjs [path-to.xlsx]
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_XLSX = path.join(REPO_ROOT, "matex_seed_data.xlsx");
const PY_EXPORT = path.join(__dirname, "xlsx-export-seed.py");

const SEED_PASSWORD = "MatexSeed2026!";
const PASSWORD_HASH = createHash("sha256").update(SEED_PASSWORD).digest("hex");

function uuidFromSeed(seed) {
  const h = createHash("sha256").update(seed).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function slugify(s) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 200);
}

function splitName(primaryContact) {
  const p = String(primaryContact ?? "").trim();
  if (!p) return { first: "User", last: "Company" };
  const parts = p.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "." };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** @type {Record<string, [number, number]>} lng, lat */
const PROVINCE_NAME_TO_CODE = {
  ontario: "ON",
  "british columbia": "BC",
  alberta: "AB",
  quebec: "QC",
  "québec": "QC",
  "nova scotia": "NS",
  "new brunswick": "NB",
  manitoba: "MB",
  saskatchewan: "SK",
  "newfoundland and labrador": "NL",
  "newfoundland & labrador": "NL",
  "prince edward island": "PE",
  "northwest territories": "NT",
  nunavut: "NU",
  yukon: "YT",
};

function provinceCode(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "ON";
  if (s.length === 2) return s.toUpperCase();
  const key = s.toLowerCase();
  return PROVINCE_NAME_TO_CODE[key] ?? s.slice(0, 2).toUpperCase();
}

const GEO_BY_PROVINCE = {
  ON: [-79.3832, 43.6532],
  BC: [-123.1216, 49.2827],
  AB: [-114.0719, 51.0447],
  QC: [-73.5673, 45.5019],
  NS: [-63.5753, 44.6488],
  NB: [-66.6431, 45.9636],
  MB: [-97.1384, 49.8951],
  SK: [-106.67, 52.1332],
  NL: [-52.7126, 47.5615],
  PE: [-63.1311, 46.2382],
  NT: [-114.3717, 62.454],
  NU: [-68.52, 63.7467],
  YT: [-135.0531, 60.7212],
};

const CATEGORY_SLUGS = {
  "Ferrous Metals": "ferrous-metals",
  "Non-Ferrous Metals": "non-ferrous-metals",
  "Stainless Steel": "stainless-steel",
  "Precious Metals": "precious-metals",
  "E-Waste & Electronics": "e-waste-electronics",
  Plastics: "plastics",
  "Paper & Cardboard": "paper-cardboard",
  Construction: "construction",
  Other: "other-materials",
};

const CATEGORY_IMAGES = {
  "Ferrous Metals": "https://images.unsplash.com/photo-1565194251566-0202c61d7df6?w=1200&q=85",
  "Non-Ferrous Metals": "https://images.unsplash.com/photo-1615752660341-ca5e0c5d0b2b?w=1200&q=85",
  "Stainless Steel": "https://images.unsplash.com/photo-1587294977648-53900adc2d35?w=1200&q=85",
  "Precious Metals": "https://images.unsplash.com/photo-1610375461246-768a59d40813?w=1200&q=85",
  "E-Waste & Electronics": "https://images.unsplash.com/photo-1558346546-4432707c5b97?w=1200&q=85",
  default: "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=1200&q=85",
};

function categoryImageUrl(categoryName) {
  return CATEGORY_IMAGES[categoryName] ?? CATEGORY_IMAGES.default;
}

function parseLocation(locationStr, provinceFallback) {
  const s = String(locationStr ?? "").trim();
  let province = provinceCode(provinceFallback);
  const m = s.match(/,\s*([A-Z]{2})\s*$/i);
  if (m) province = m[1].toUpperCase();
  const geo = GEO_BY_PROVINCE[province] ?? GEO_BY_PROVINCE.ON;
  const city = s.replace(/,\s*[A-Z]{2}\s*$/i, "").trim() || "Unknown";
  return { city, province, lng: geo[0], lat: geo[1] };
}

function mapUnit(u) {
  const x = String(u ?? "").toLowerCase().trim();
  if (x === "tonnes" || x === "tonne" || x === "mt" || x === "metric tons") return "mt";
  if (x === "kg" || x === "kilograms") return "kg";
  if (x === "lbs" || x === "lb") return "kg";
  if (x === "units" || x === "unit") return "units";
  if (x === "lots" || x === "lot") return "lots";
  return "mt";
}

function listingImages(categoryName, listingSeed) {
  const primary = categoryImageUrl(categoryName);
  const secondary = `https://picsum.photos/seed/${slugify(listingSeed)}/1200/800`;
  return JSON.stringify([
    { url: primary, order: 1, alt_text: String(categoryName) },
    { url: secondary, order: 2, alt_text: "Material lot" },
  ]);
}

function loadWorkbook(xlsxPath) {
  const r = spawnSync("python", [PY_EXPORT, xlsxPath], {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(r.stderr || `Python exited ${r.status}`);
  }
  return JSON.parse(r.stdout);
}

function sheetRows(data, name) {
  const rows = data[name];
  if (!Array.isArray(rows) || rows.length < 2) return { headers: [], records: [] };
  const headers = rows[0].map((h) => String(h ?? "").trim());
  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;
    const obj = {};
    headers.forEach((h, j) => {
      obj[h] = row[j];
    });
    records.push(obj);
  }
  return { headers, records };
}

async function main() {
  const xlsxPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_XLSX;
  if (!existsSync(xlsxPath)) {
    console.error("XLSX not found:", xlsxPath);
    process.exit(1);
  }
  if (!existsSync(PY_EXPORT)) {
    console.error("Missing", PY_EXPORT);
    process.exit(1);
  }

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("Set DATABASE_URL to your Postgres connection string.");
    process.exit(1);
  }

  console.log("Reading", xlsxPath);
  const wb = loadWorkbook(xlsxPath);
  const companies = sheetRows(wb, "Companies").records;
  const listings = sheetRows(wb, "Listings").records;
  const demand = sheetRows(wb, "Buyer Demand").records;

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("BEGIN");

    const categoryIds = new Map();

    const categoryNames = new Set();
    for (const L of listings) {
      if (L.Category) categoryNames.add(String(L.Category).trim());
    }

    for (const name of categoryNames) {
      const slug = CATEGORY_SLUGS[name] ?? slugify(name);
      const slugFinal = slug || "general-materials";
      const cid = uuidFromSeed(`matex:category:${slugFinal}`);
      const defaultUnit = name.includes("E-Waste") ? "units" : "mt";
      const res = await client.query(
        `INSERT INTO listing_mcp.categories (category_id, name, slug, description, default_unit, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5::unit_type, 0, true)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           default_unit = EXCLUDED.default_unit,
           description = EXCLUDED.description,
           is_active = true
         RETURNING category_id`,
        [cid, name.slice(0, 100), slugFinal, `Seeded: ${name}`, defaultUnit],
      );
      categoryIds.set(name, res.rows[0].category_id);
    }

    const companyUserId = new Map();

    for (const row of companies) {
      const cid = String(row["Company ID"] ?? "").trim();
      if (!cid) continue;
      const email = String(row.Email ?? "").toLowerCase().trim();
      const phone = String(row.Phone ?? "").replace(/\s/g, "").slice(0, 20);
      if (!email || !phone) {
        console.warn("Skip company row (missing email/phone):", cid);
        continue;
      }

      const userId = uuidFromSeed(`matex:company:${cid}`);

      const { first, last } = splitName(row["Primary Contact"]);
      const role = String(row.Role ?? "Seller");
      const accountType = "corporate";

      await client.query(
        `INSERT INTO auth_mcp.users
          (user_id, email, phone, password_hash, account_type, account_status, email_verified, phone_verified, mfa_enabled)
         VALUES ($1, $2, $3, $4, $5::account_type, 'active', true, true, false)
         ON CONFLICT (email) DO UPDATE SET
           phone = EXCLUDED.phone,
           password_hash = EXCLUDED.password_hash,
           account_status = 'active',
           email_verified = true,
           phone_verified = true
         RETURNING user_id`,
        [userId, email, phone, PASSWORD_HASH, accountType],
      );

      const actual = await client.query(`SELECT user_id FROM auth_mcp.users WHERE email = $1`, [email]);
      const uid = actual.rows[0].user_id;
      companyUserId.set(cid, uid);

      const province = provinceCode(row.Province);
      const city = String(row.City ?? "").trim() || "Unknown";

      await client.query(
        `INSERT INTO profile_mcp.profiles
          (user_id, first_name, last_name, display_name, language, timezone, country, province, bio, website)
         VALUES ($1, $2, $3, $4, 'en', 'America/Toronto', 'CA', $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           display_name = EXCLUDED.display_name,
           province = EXCLUDED.province,
           bio = EXCLUDED.bio,
           website = EXCLUDED.website,
           updated_at = now()`,
        [
          uid,
          first.slice(0, 100),
          last.slice(0, 100),
          String(row["Company Name"] ?? "").slice(0, 200),
          province.slice(0, 2),
          `${String(row["Business Type"] ?? "")}. Role: ${role}.`.slice(0, 2000),
          row.Website ? String(row.Website).slice(0, 500) : null,
        ],
      );

      const bn = String(row["CRA Business #"] ?? "")
        .replace(/\D/g, "")
        .slice(0, 15);
      const companyRowId = uuidFromSeed(`matex:company-row:${cid}`);
      await client.query(
        `INSERT INTO profile_mcp.companies
          (company_id, user_id, company_name, business_number, industry, website, address)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (company_id) DO UPDATE SET
           company_name = EXCLUDED.company_name,
           business_number = EXCLUDED.business_number,
           industry = EXCLUDED.industry,
           website = EXCLUDED.website,
           address = EXCLUDED.address,
           updated_at = now()`,
        [
          companyRowId,
          uid,
          String(row["Company Name"] ?? "Company").slice(0, 255),
          bn || null,
          String(row["Business Type"] ?? "").slice(0, 100),
          row.Website ? String(row.Website).slice(0, 500) : null,
          JSON.stringify({
            city,
            province,
            country: "CA",
            street: "",
            postal_code: "",
          }),
        ],
      );

      await client.query(
        `INSERT INTO profile_mcp.preferences (user_id, notification_prefs, display_prefs, search_prefs)
         VALUES ($1, $2::jsonb, '{}'::jsonb, '{}'::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET notification_prefs = EXCLUDED.notification_prefs, updated_at = now()`,
        [uid, JSON.stringify({ email: true, sms: false, push: true, in_app: true })],
      );
    }

    let listingCount = 0;
    let skipped = 0;

    for (const row of listings) {
      const lid = String(row["Listing ID"] ?? "").trim();
      const compId = String(row["Company ID"] ?? "").trim();
      const sellerId = companyUserId.get(compId);
      if (!lid || !sellerId) {
        skipped++;
        continue;
      }

      const categoryName = String(row.Category ?? "").trim();
      const categoryId = categoryIds.get(categoryName);
      if (!categoryId) {
        console.warn("Unknown category, skip listing", lid, categoryName);
        skipped++;
        continue;
      }

      const material = String(row.Material ?? "Listing").trim();
      const grade = String(row.Grade ?? "").trim();
      const title = `${material}${grade ? ` — ${grade}` : ""}`.slice(0, 200);
      const listingId = uuidFromSeed(`matex:listing:${lid}`);
      const slugBase = `${slugify(material)}-${lid.toLowerCase()}`.slice(0, 240);
      const quantity = Number(row.Quantity ?? 0) || 1;
      const unit = mapUnit(row.Unit);
      const price = Number(row["Price/Unit"] ?? 0) || 0;
      const minOrder = row["Min Order"] != null ? String(row["Min Order"]) : "";
      const descBase = String(row.Description ?? "").trim();
      const description = [descBase, minOrder ? `Minimum order: ${minOrder}.` : ""].filter(Boolean).join(" ").slice(0, 8000);

      const loc = parseLocation(row.Location, companies.find((c) => String(c["Company ID"]) === compId)?.Province);

      const statusRaw = String(row.Status ?? "active").toLowerCase();
      const status = ["active", "draft", "sold", "expired", "pending_review", "cancelled", "suspended"].includes(statusRaw)
        ? statusRaw
        : "active";

      const priceTypeRoll = parseInt(listingId.replace(/\D/g, "").slice(-2) || "0", 10) % 10;
      const priceType = priceTypeRoll === 0 ? "negotiable" : priceTypeRoll === 1 ? "auction" : "fixed";

      const views = 15 + (parseInt(listingId.slice(0, 8).replace(/-/g, ""), 16) % 900);

      const publishedAt = status === "active" ? new Date().toISOString() : null;

      await client.query(
        `INSERT INTO listing_mcp.listings
          (listing_id, seller_id, title, slug, category_id, description, quantity, unit, price_type, asking_price,
           reserve_price, quality_grade, quality_details, images, location, pickup_address, inspection_required,
           status, views_count, published_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8::unit_type, $9::price_type, $10, $11, $12, $13::jsonb, $14::jsonb,
           ST_SetSRID(ST_MakePoint($15, $16), 4326)::geography, $17::jsonb, false, $18::listing_status, $19, $20)
         ON CONFLICT (listing_id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           quantity = EXCLUDED.quantity,
           unit = EXCLUDED.unit,
           price_type = EXCLUDED.price_type,
           asking_price = EXCLUDED.asking_price,
           quality_grade = EXCLUDED.quality_grade,
           images = EXCLUDED.images,
           location = EXCLUDED.location,
           pickup_address = EXCLUDED.pickup_address,
           status = EXCLUDED.status,
           views_count = EXCLUDED.views_count,
           published_at = EXCLUDED.published_at,
           updated_at = now()`,
        [
          listingId,
          sellerId,
          title,
          slugBase,
          categoryId,
          description,
          quantity,
          unit,
          priceType,
          price,
          priceType === "auction" ? price * 0.85 : null,
          grade || null,
          JSON.stringify({ min_order_note: minOrder || null }),
          listingImages(categoryName, lid),
          loc.lng,
          loc.lat,
          JSON.stringify({
            street: "",
            city: loc.city,
            province: loc.province,
            postal_code: "",
            country: "CA",
          }),
          status,
          views,
          publishedAt,
        ],
      );
      listingCount++;
    }

    for (const row of demand) {
      const compId = String(row["Company ID"] ?? "").trim();
      const uid = companyUserId.get(compId);
      if (!uid) continue;
      const name = `Demand: ${String(row["Material Needed"] ?? "RFQ").slice(0, 80)}`;
      const filters = {
        demand_id: row["Demand ID"],
        company_name: row["Company Name"],
        category: row.Category,
        material_needed: row["Material Needed"],
        volume_needed: row["Volume Needed"],
        grade_required: row["Grade Required"],
        sourcing_region: row["Sourcing Region"],
        payment_terms: row["Payment Terms"],
      };
      const sid = uuidFromSeed(`matex:demand:${row["Demand ID"] ?? Math.random()}`);
      await client.query(
        `INSERT INTO listing_mcp.saved_searches
          (saved_search_id, user_id, name, query, filters, alert_enabled, alert_channels)
         VALUES ($1, $2, $3, $4, $5::jsonb, true, '["email","in_app"]'::jsonb)
         ON CONFLICT (saved_search_id) DO UPDATE SET
           name = EXCLUDED.name,
           query = EXCLUDED.query,
           filters = EXCLUDED.filters`,
        [sid, uid, name.slice(0, 100), String(row["Material Needed"] ?? ""), JSON.stringify(filters)],
      );
    }

    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          categories: categoryIds.size,
          companies: companyUserId.size,
          listings_inserted: listingCount,
          listings_skipped: skipped,
          buyer_demands: demand.length,
          login_password: SEED_PASSWORD,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
