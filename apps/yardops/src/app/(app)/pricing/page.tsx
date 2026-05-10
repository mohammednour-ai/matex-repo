"use client";

import { useEffect, useState } from "react";
import { callTool, getUser } from "@/lib/api";
import { DollarSign, TrendingUp, Save, Plus } from "lucide-react";

type PriceLine = {
  material_id: string;
  name: string;
  category: string;
  unit: string;
  unit_price_per_kg: number;
  effective_date: string;
  lme_metal?: string;
  lme_price_usd?: number;
  lme_spread_pct?: number;
};

type LMERef = {
  metal: string;
  price_usd_per_tonne: number;
  price_cad_per_kg: number;
  source: string;
  as_of: string;
};

export default function PricingPage() {
  const user = getUser();
  const tenantId = user?.tenant_id ?? "";
  const actorId = user?.user_id ?? "";
  const canEdit = user?.role === "admin" || user?.role === "manager";

  const [prices, setPrices] = useState<PriceLine[]>([]);
  const [lme, setLme] = useState<LMERef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      callTool<{ materials: PriceLine[] }>("yardops.get_active_prices", { tenant_id: tenantId }),
      callTool<{ references: LMERef[] }>("yardops.get_lme_reference", { tenant_id: tenantId }),
    ]).then(([pRes, lmeRes]) => {
      if (pRes.success && pRes.data) setPrices(pRes.data.materials ?? []);
      if (lmeRes.success && lmeRes.data) setLme(lmeRes.data.references ?? []);
    }).finally(() => setLoading(false));
  }, [tenantId]);

  async function savePrice(materialId: string) {
    const newPrice = parseFloat(edits[materialId] ?? "");
    if (!newPrice || newPrice <= 0) {
      setError("Enter a valid price.");
      return;
    }
    setError("");
    setSaving(materialId);
    try {
      const res = await callTool("yardops.set_price_schedule", {
        tenant_id: tenantId,
        actor_id: actorId,
        material_id: materialId,
        unit_price_per_kg: newPrice,
        effective_date: new Date().toISOString().slice(0, 10),
      });
      if (!res.success) {
        setError(res.error?.message ?? "Failed to save price");
        return;
      }
      setPrices((ps) => ps.map((p) => p.material_id === materialId
        ? { ...p, unit_price_per_kg: newPrice, effective_date: new Date().toISOString().slice(0, 10) }
        : p
      ));
      setEdits((e) => { const n = { ...e }; delete n[materialId]; return n; });
      setSaved((s) => [...s, materialId]);
      setTimeout(() => setSaved((s) => s.filter((id) => id !== materialId)), 2000);
    } finally {
      setSaving(null);
    }
  }

  const grouped = prices.reduce<Record<string, PriceLine[]>>((acc, p) => {
    (acc[p.category] = acc[p.category] ?? []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-night-100 flex items-center gap-2">
          <DollarSign size={22} className="text-brand-400" />
          Pricing
        </h1>
        <p className="mt-1 text-sm text-night-400">Effective-dated material prices · Ontario CAD</p>
      </div>

      {/* LME Reference Banner */}
      {lme.length > 0 && (
        <div className="rounded-xl border border-steel-700/40 bg-steel-900/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-brand-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-night-400">LME Reference Prices</p>
            <span className="text-xs text-night-600">· {lme[0]?.as_of ?? "today"}</span>
          </div>
          <div className="flex flex-wrap gap-4">
            {lme.map((ref) => (
              <div key={ref.metal} className="text-sm">
                <p className="text-night-400 capitalize">{ref.metal}</p>
                <p className="font-bold tabular-nums text-night-100">${ref.price_cad_per_kg.toFixed(4)}<span className="text-xs text-night-500 font-normal">/kg CAD</span></p>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-night-800" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, mats]) => (
            <div key={cat} className="yard-card">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-night-400">
                {cat.replace(/_/g, " ")}
              </h2>
              <div className="space-y-3">
                {mats.map((m) => {
                  const editing = edits[m.material_id] !== undefined;
                  const isSaved = saved.includes(m.material_id);
                  return (
                    <div key={m.material_id} className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-night-100">{m.name}</p>
                        {m.lme_metal && (
                          <p className="text-xs text-night-500">
                            Linked to {m.lme_metal} · {m.lme_spread_pct != null ? `${m.lme_spread_pct > 0 ? "+" : ""}${m.lme_spread_pct}% spread` : ""}
                          </p>
                        )}
                        <p className="text-xs text-night-600 mt-0.5">Effective {m.effective_date}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {canEdit ? (
                          <>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-night-500">$</span>
                              <input
                                className="yard-input pl-6 w-28 tabular-nums text-right"
                                type="number"
                                step="0.001"
                                min="0.001"
                                value={editing ? edits[m.material_id] : m.unit_price_per_kg.toFixed(3)}
                                onChange={(e) => setEdits((prev) => ({ ...prev, [m.material_id]: e.target.value }))}
                                aria-label={`Price per kg for ${m.name}`}
                              />
                            </div>
                            <span className="text-xs text-night-500 whitespace-nowrap">/kg</span>
                            {editing ? (
                              <button
                                onClick={() => savePrice(m.material_id)}
                                disabled={saving === m.material_id}
                                className="yard-btn-primary p-2"
                                aria-label={`Save price for ${m.name}`}
                              >
                                {saving === m.material_id
                                  ? <span className="block h-4 w-4 rounded-full border-2 border-white/30 border-t-white spin-brand" />
                                  : <Save size={14} />
                                }
                              </button>
                            ) : isSaved ? (
                              <span className="badge-green text-xs">Saved</span>
                            ) : null}
                          </>
                        ) : (
                          <p className="tabular-nums font-bold text-night-100">${m.unit_price_per_kg.toFixed(3)}<span className="text-xs text-night-500 font-normal">/kg</span></p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
