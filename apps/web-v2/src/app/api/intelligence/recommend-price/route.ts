import { NextResponse, type NextRequest } from "next/server";
import { recommendListingPrice, aiConfigured } from "@/lib/intelligence/ai";
import { getLatestIntelligence, insertPriceRecommendation } from "@/lib/intelligence/db";
import { getMaterial, resolveMaterialKey } from "@/lib/intelligence/materials";
import { readUserId } from "@/lib/intelligence/auth";

type Body = {
  material_key?: string;
  material?: string; // free-text fallback (matches listing form values)
  quantity?: number | string;
  unit?: string;
  seller_region?: string;
  listing_id?: string;
};

/**
 * Returns an AI-suggested starting price for a draft listing. Caches the
 * result in `intelligence_mcp.price_recommendations` so the listing can
 * later show the original suggestion alongside the seller's chosen price.
 */
export async function POST(req: NextRequest) {
  const userId = readUserId(req);
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const materialKey = body.material_key ?? resolveMaterialKey(body.material);
  if (!materialKey) {
    return NextResponse.json(
      { error: "material_required", message: "Pass material_key or a recognisable material label." },
      { status: 400 },
    );
  }
  const material = getMaterial(materialKey);
  if (!material) {
    return NextResponse.json({ error: "unknown_material" }, { status: 404 });
  }

  const quantity = parseNumeric(body.quantity);
  const intel = await getLatestIntelligence(materialKey);
  const { result, source } = await recommendListingPrice({
    material_key: materialKey,
    quantity,
    unit: body.unit ?? material.unit,
    seller_region: body.seller_region ?? null,
    intelligence: intel,
  });

  const persisted = await insertPriceRecommendation({
    listing_id: body.listing_id ?? null,
    user_id: userId,
    material_key: materialKey,
    quantity,
    unit: body.unit ?? material.unit,
    seller_region: body.seller_region ?? null,
    recommended_price: result.recommended_price,
    floor_price: result.floor_price,
    ceiling_price: result.ceiling_price,
    rationale: result.rationale,
    confidence: result.confidence,
    intelligence_id: intel?.intelligence_id ?? null,
    source,
  });

  return NextResponse.json({
    recommendation: persisted,
    intelligence: intel,
    ai: { configured: aiConfigured(), source },
  });
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
