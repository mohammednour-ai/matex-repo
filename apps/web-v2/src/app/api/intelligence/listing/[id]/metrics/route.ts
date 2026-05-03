import { NextResponse, type NextRequest } from "next/server";
import { getListingMetrics } from "@/lib/intelligence/db";
import { refreshListingMetrics } from "@/lib/intelligence/pipeline";
import { resolveMaterialKey } from "@/lib/intelligence/materials";

/**
 * Reads (or computes on first access) the per-listing market metrics that
 * back the seller's "Listing Performance" widget.
 *
 *   GET    → returns the row, refreshing it lazily if missing.
 *   POST   → forces a recompute. Body:
 *            { material_key?: string, material?: string, asking_price?: number }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const listingId = params.id;
  const existing = await getListingMetrics(listingId);
  if (existing) return NextResponse.json({ metrics: existing });
  const fresh = await refreshListingMetrics({
    listing_id: listingId,
    material_key: null,
    asking_price: null,
  });
  return NextResponse.json({ metrics: fresh, lazy_refresh: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const listingId = params.id;
  let body: { material_key?: string; material?: string; asking_price?: number | string } = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional.
  }
  const materialKey = body.material_key ?? resolveMaterialKey(body.material);
  const askingNum = body.asking_price === undefined || body.asking_price === ""
    ? null
    : Number(body.asking_price);
  const fresh = await refreshListingMetrics({
    listing_id: listingId,
    material_key: materialKey ?? null,
    asking_price: Number.isFinite(askingNum) ? (askingNum as number) : null,
  });
  return NextResponse.json({ metrics: fresh });
}
