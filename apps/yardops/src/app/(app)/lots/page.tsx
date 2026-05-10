"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { callTool, getUser } from "@/lib/api";
import { Package, ChevronRight, Globe, Scale } from "lucide-react";

type Lot = {
  lot_id: string;
  lot_number: string;
  material_name: string;
  category: string;
  total_weight_kg: number;
  status: "open" | "sold" | "archived" | "published";
  exchange_listing_id?: string;
  created_at: string;
  parent_lot_id?: string;
};

export default function LotsPage() {
  const router = useRouter();
  const user = getUser();
  const tenantId = user?.tenant_id ?? "";

  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    callTool<{ lots: Lot[] }>("yardops.list_lots", {
      tenant_id: tenantId,
      status: statusFilter === "all" ? undefined : statusFilter,
    }).then((res) => {
      if (res.success && res.data) setLots(res.data.lots ?? []);
    }).finally(() => setLoading(false));
  }, [tenantId, statusFilter]);

  const filtered = lots;

  function statusBadge(lot: Lot) {
    if (lot.exchange_listing_id) return <span className="badge-brand flex items-center gap-1"><Globe size={11} /> Live on Matex</span>;
    if (lot.status === "sold") return <span className="badge-green">Sold</span>;
    if (lot.status === "archived") return <span className="badge-steel">Archived</span>;
    return <span className="badge-amber">Open</span>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-night-100 flex items-center gap-2">
          <Package size={22} className="text-brand-400" />
          Lots
        </h1>
        <p className="mt-1 text-sm text-night-400">{lots.length} lots</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "open", "published", "sold", "archived"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={statusFilter === s ? "yard-btn-primary text-sm py-1.5 px-3" : "yard-btn-secondary text-sm py-1.5 px-3"}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-night-800" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="yard-card text-center py-12">
          <Package size={32} className="mx-auto text-night-600 mb-3" />
          <p className="text-night-400">No lots found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((lot) => (
            <button
              key={lot.lot_id}
              onClick={() => router.push(`/lots/${lot.lot_id}`)}
              className="w-full flex items-center gap-4 rounded-xl border border-night-700 bg-night-800 p-4 text-left hover:border-night-600 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-night-100">{lot.lot_number}</p>
                  {statusBadge(lot)}
                  {lot.parent_lot_id && <span className="badge-steel text-xs">Split</span>}
                </div>
                <p className="text-sm text-night-300 mt-0.5">{lot.material_name}</p>
                <p className="text-xs text-night-500 mt-0.5 flex items-center gap-1">
                  <Scale size={11} />
                  {lot.total_weight_kg.toFixed(2)} kg · {(lot.total_weight_kg / 1000).toFixed(3)} t
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-night-600">{new Date(lot.created_at).toLocaleDateString("en-CA")}</p>
              </div>
              <ChevronRight size={16} className="text-night-600 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
