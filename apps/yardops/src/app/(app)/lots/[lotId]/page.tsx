"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { callTool, getUser } from "@/lib/api";
import { ArrowLeft, Scale, Globe, Scissors, Merge, TrendingUp } from "lucide-react";
import { SplitLotModal } from "@/components/lots/SplitLotModal";
import { MergeLotModal } from "@/components/lots/MergeLotModal";
import { PublishToExchangeModal } from "@/components/lots/PublishToExchangeModal";

type LotDetail = {
  lot_id: string;
  lot_number: string;
  material_id: string;
  material_name: string;
  category: string;
  total_weight_kg: number;
  status: string;
  exchange_listing_id?: string;
  parent_lot_id?: string;
  created_at: string;
  description?: string;
};

type Movement = {
  movement_id: string;
  movement_type: string;
  weight_kg?: number;
  notes?: string;
  created_at: string;
  actor_name?: string;
};

export default function LotDetailPage() {
  const { lotId } = useParams<{ lotId: string }>();
  const router = useRouter();
  const user = getUser();
  const tenantId = user?.tenant_id ?? "";
  const actorId = user?.user_id ?? "";

  const [lot, setLot] = useState<LotDetail | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"split" | "merge" | "publish" | null>(null);
  const [error, setError] = useState("");

  async function reload() {
    const [lotRes, mvRes] = await Promise.all([
      callTool<{ lot: LotDetail }>("yardops.get_lot", { tenant_id: tenantId, lot_id: lotId }),
      callTool<{ movements: Movement[] }>("yardops.get_lot_lineage", { tenant_id: tenantId, lot_id: lotId }),
    ]);
    if (lotRes.success && lotRes.data) setLot(lotRes.data.lot);
    if (mvRes.success && mvRes.data) setMovements(mvRes.data.movements ?? []);
  }

  useEffect(() => { reload().finally(() => setLoading(false)); }, [lotId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-night-800" />
        <div className="h-48 animate-pulse rounded-xl bg-night-800" />
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="text-center py-12">
        <p className="text-night-400">Lot not found.</p>
        <button onClick={() => router.back()} className="mt-4 yard-btn-secondary">Back</button>
      </div>
    );
  }

  const isOpen = lot.status === "open";
  const isPublished = !!lot.exchange_listing_id;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="yard-btn-secondary p-2" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-night-100">{lot.lot_number}</h1>
          <p className="text-sm text-night-400">{lot.material_name} · {lot.category.replace(/_/g, " ")}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="yard-card text-center py-4">
          <Scale size={18} className="mx-auto text-brand-400 mb-2" />
          <p className="text-2xl font-black tabular-nums text-night-100">{(lot.total_weight_kg / 1000).toFixed(3)}</p>
          <p className="text-xs text-night-400">metric tonnes</p>
        </div>
        <div className="yard-card text-center py-4">
          <p className="text-2xl font-black tabular-nums text-night-100">{lot.total_weight_kg.toFixed(0)}</p>
          <p className="text-xs text-night-400">kilograms</p>
        </div>
        <div className="yard-card text-center py-4">
          <p className="text-sm font-bold text-night-100 capitalize">{lot.status}</p>
          <p className="text-xs text-night-400 mt-1">{new Date(lot.created_at).toLocaleDateString("en-CA")}</p>
        </div>
      </div>

      {isPublished && (
        <div className="flex items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-4">
          <Globe size={18} className="text-brand-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-night-100">Live on Matex Exchange</p>
            <p className="text-xs text-night-400 mt-0.5">Listing ID: {lot.exchange_listing_id}</p>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}

      {/* Actions */}
      {isOpen && (
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setModal("split")} className="yard-btn-secondary flex items-center gap-2">
            <Scissors size={16} />
            Split Lot
          </button>
          <button onClick={() => setModal("merge")} className="yard-btn-secondary flex items-center gap-2">
            <Merge size={16} />
            Merge Into
          </button>
          {!isPublished && (
            <button onClick={() => setModal("publish")} className="yard-btn-primary flex items-center gap-2">
              <Globe size={16} />
              Publish to Exchange
            </button>
          )}
        </div>
      )}

      {/* Lineage */}
      <div className="yard-card">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-night-400">Movement History</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-night-500">No movement records.</p>
        ) : (
          <div className="space-y-3">
            {movements.map((m) => (
              <div key={m.movement_id} className="flex items-start gap-3 text-sm">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-brand-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-night-200 capitalize">{m.movement_type.replace(/_/g, " ")}</p>
                  {m.weight_kg != null && <p className="text-xs text-night-400">{m.weight_kg.toFixed(2)} kg</p>}
                  {m.notes && <p className="text-xs text-night-500">{m.notes}</p>}
                  <p className="text-xs text-night-600 mt-0.5">
                    {new Date(m.created_at).toLocaleString("en-CA")}
                    {m.actor_name ? ` · ${m.actor_name}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === "split" && (
        <SplitLotModal
          lot={lot}
          tenantId={tenantId}
          actorId={actorId}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); reload(); }}
        />
      )}
      {modal === "merge" && (
        <MergeLotModal
          sourceLotId={lot.lot_id}
          tenantId={tenantId}
          actorId={actorId}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); reload(); }}
        />
      )}
      {modal === "publish" && (
        <PublishToExchangeModal
          lot={lot}
          tenantId={tenantId}
          actorId={actorId}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); reload(); }}
        />
      )}
    </div>
  );
}
