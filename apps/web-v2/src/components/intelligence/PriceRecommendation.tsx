"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/shadcn/button";
import { requestPriceRecommendation } from "@/lib/intelligence/client";
import { formatPrice } from "@/lib/intelligence/format";
import { getMaterial, resolveMaterialKey } from "@/lib/intelligence/materials";
import type { PriceRecommendationRow } from "@/lib/intelligence/types";

type Props = {
  /** Free-text label (`Copper #2`) or canonical key (`copper_2`). */
  material: string | null | undefined;
  quantity?: number | string | null;
  unit?: string;
  sellerRegion?: string | null;
  /** When provided, the seller can apply the suggestion to their form. */
  onApply?: (price: number) => void;
};

/**
 * Inline AI-priced suggestion shown on the listing creation pricing step.
 * Calls the AI route lazily on mount + when material/quantity change. Falls
 * back gracefully when no usable material is selected yet.
 */
export function PriceRecommendation({ material, quantity, unit, sellerRegion, onApply }: Props) {
  const materialKey = resolveMaterialKey(material ?? null);
  const [recommendation, setRecommendation] = useState<PriceRecommendationRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiSource, setAiSource] = useState<"live" | "stub" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!materialKey) {
      setRecommendation(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await requestPriceRecommendation({
          material_key: materialKey,
          quantity: quantity ?? null,
          unit: unit ?? undefined,
          seller_region: sellerRegion ?? undefined,
        });
        if (cancelled) return;
        setRecommendation(res.recommendation);
        setAiSource((res.ai.source as "live" | "stub") ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "AI suggestion unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [materialKey, quantity, unit, sellerRegion]);

  if (!material) {
    return (
      <div className="rounded-2xl border border-dashed border-steel-200 bg-surface-50 p-4 text-xs text-steel-500">
        Select a material to receive an AI-priced starting suggestion.
      </div>
    );
  }
  if (!materialKey) {
    return (
      <div className="rounded-2xl border border-dashed border-steel-200 bg-surface-50 p-4 text-xs text-steel-500">
        We don&apos;t track market data for &quot;{material}&quot; yet — set your own price.
      </div>
    );
  }

  const matMeta = getMaterial(materialKey);
  const resolvedUnit = unit ?? matMeta?.unit ?? "mt";

  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">
              Matex price intelligence
            </p>
            <p className="text-sm font-semibold text-steel-900">
              {matMeta?.label ?? material}
            </p>
          </div>
        </div>
        {aiSource && (
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              aiSource === "live"
                ? "bg-success-100 text-success-700"
                : "bg-steel-100 text-steel-600",
            )}
          >
            {aiSource === "live" ? "AI live" : "Heuristic"}
          </span>
        )}
      </div>

      {loading && (
        <p className="mt-3 text-xs text-steel-500">Estimating a competitive starting price…</p>
      )}
      {error && (
        <p className="mt-3 text-xs text-danger-700">{error}</p>
      )}

      {recommendation && !loading && (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-steel-900">
              {formatPrice(recommendation.recommended_price, resolvedUnit)}
            </span>
            <span className="text-xs text-steel-500">recommended starting price</span>
          </div>
          <p className="mt-1 text-xs text-steel-600">
            Floor {formatPrice(recommendation.floor_price, resolvedUnit)} · Ceiling{" "}
            {formatPrice(recommendation.ceiling_price, resolvedUnit)}
          </p>
          {recommendation.rationale && (
            <p className="mt-2 text-xs text-steel-600">{recommendation.rationale}</p>
          )}
          {onApply && (
            <Button
              variant="primary"
              size="sm"
              className="mt-3"
              onClick={() => onApply(recommendation.recommended_price)}
            >
              Apply suggested price
            </Button>
          )}
        </>
      )}
    </div>
  );
}
