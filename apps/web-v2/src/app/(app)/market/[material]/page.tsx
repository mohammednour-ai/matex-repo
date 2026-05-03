"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Bell, Newspaper } from "lucide-react";
import { fetchMaterialSnapshot } from "@/lib/intelligence/client";
import type { MarketIntelligenceRow } from "@/lib/intelligence/types";
import { MarketSummaryCard } from "@/components/intelligence/MarketSummaryCard";
import { PriceAlertDialog } from "@/components/intelligence/PriceAlertDialog";
import { PriceSparkline } from "@/components/intelligence/PriceSparkline";
import { formatPrice, formatRelativeAgo } from "@/lib/intelligence/format";
import { getMaterial } from "@/lib/intelligence/materials";

export default function MaterialDetailPage() {
  const params = useParams<{ material: string }>();
  const materialKey = params?.material ?? "";
  const [latest, setLatest] = useState<MarketIntelligenceRow | null>(null);
  const [history, setHistory] = useState<MarketIntelligenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const material = getMaterial(materialKey);

  useEffect(() => {
    if (!materialKey) return;
    let cancelled = false;
    setLoading(true);
    fetchMaterialSnapshot(materialKey)
      .then((data) => {
        if (cancelled) return;
        setLatest(data.latest);
        setHistory(data.history);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load material data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [materialKey]);

  if (!material) {
    return (
      <div className="rounded-2xl border border-steel-100 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-steel-700">Unknown material</p>
        <Link href="/market" className="mt-2 inline-block text-xs text-brand-700">
          Back to market dashboard
        </Link>
      </div>
    );
  }

  const series = history.map((h) => h.lme_price ?? h.matex_avg_price ?? 0).filter((n) => n > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/market" className="inline-flex items-center gap-1 text-xs font-semibold text-steel-600 hover:text-brand-700">
          <ArrowLeft className="h-3 w-3" /> Back to market
        </Link>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          <Bell className="h-3.5 w-3.5" /> Set alert
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-800">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div className="h-72 animate-pulse rounded-2xl bg-steel-100" />
          <div className="h-72 animate-pulse rounded-2xl bg-steel-100" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          {latest && <MarketSummaryCard snapshot={latest} history={history} onSetAlert={() => setDialogOpen(true)} />}

          <div className="rounded-2xl border border-steel-100 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">
              30-day price history
            </p>
            <h3 className="mt-1 text-base font-semibold text-steel-900">
              {material.label} — {material.spec}
            </h3>
            <PriceSparkline series={series} trend={latest?.trend ?? "stable"} height={140} className="mt-4" />

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <Stat
                label="High (30d)"
                value={formatPrice(series.length ? Math.max(...series) : null, material.unit)}
              />
              <Stat
                label="Low (30d)"
                value={formatPrice(series.length ? Math.min(...series) : null, material.unit)}
              />
              <Stat
                label="Snapshots"
                value={String(history.length)}
              />
              <Stat
                label="Latest"
                value={latest ? formatRelativeAgo(latest.updated_at) : "—"}
              />
            </div>
          </div>
        </div>
      )}

      {latest?.news_headlines && latest.news_headlines.length > 0 && (
        <section className="rounded-2xl border border-steel-100 bg-white p-5">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-steel-500" />
            <h3 className="text-sm font-semibold text-steel-900">Headlines feeding the model</h3>
          </div>
          <ul className="mt-3 space-y-2">
            {latest.news_headlines.map((headline) => (
              <li
                key={headline}
                className="rounded-xl border border-steel-100 bg-surface-50 px-3 py-2 text-xs text-steel-700"
              >
                {headline}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PriceAlertDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        defaultMaterialKey={materialKey}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-steel-100 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-steel-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-steel-900">{value}</p>
    </div>
  );
}
