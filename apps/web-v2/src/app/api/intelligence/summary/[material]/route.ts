import { NextResponse } from "next/server";
import {
  getLatestIntelligence,
  listIntelligenceHistory,
} from "@/lib/intelligence/db";
import { getMaterial } from "@/lib/intelligence/materials";

export async function GET(
  _req: Request,
  { params }: { params: { material: string } },
) {
  const materialKey = params.material;
  const material = getMaterial(materialKey);
  if (!material) {
    return NextResponse.json({ error: "unknown_material" }, { status: 404 });
  }
  const [latest, history] = await Promise.all([
    getLatestIntelligence(materialKey),
    listIntelligenceHistory(materialKey, 30),
  ]);
  return NextResponse.json({
    material: { key: material.key, label: material.label, unit: material.unit },
    latest,
    history,
  });
}
