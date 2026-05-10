"use client";

import { useEffect, useState } from "react";
import { callTool, getUser } from "@/lib/api";
import { ShieldAlert, Clock, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";

type CatRecord = {
  cat_id: string;
  ticket_id?: string;
  ticket_number?: string;
  seller_name?: string;
  unit_count: number;
  vin_source?: string;
  no_source_reason?: string;
  status: "hold" | "cleared" | "reported";
  hold_until: string;
  created_at: string;
  supervisor_id?: string;
};

export default function CatConvertersPage() {
  const user = getUser();
  const tenantId = user?.tenant_id ?? "";
  const actorId = user?.user_id ?? "";

  const [records, setRecords] = useState<CatRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [clearing, setClearing] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    callTool<{ records: CatRecord[] }>("yardops.list_cat_converters", {
      tenant_id: tenantId,
      limit: 50,
    }).then((res) => {
      if (res.success && res.data) setRecords(res.data.records ?? []);
    }).finally(() => setLoading(false));
  }, [tenantId]);

  async function clearRecord(catId: string) {
    setClearing(catId);
    setError("");
    const res = await callTool("yardops.update_cat_status", {
      tenant_id: tenantId,
      actor_id: actorId,
      cat_id: catId,
      status: "cleared",
    });
    if (res.success) {
      setRecords((rs) => rs.map((r) => r.cat_id === catId ? { ...r, status: "cleared" } : r));
    } else {
      setError(res.error?.message ?? "Failed to update");
    }
    setClearing(null);
  }

  const now = new Date();
  const onHold = records.filter((r) => r.status === "hold" && new Date(r.hold_until) > now);
  const releasable = records.filter((r) => r.status === "hold" && new Date(r.hold_until) <= now);
  const cleared = records.filter((r) => r.status === "cleared");

  function statusBadge(r: CatRecord) {
    if (r.status === "cleared") return <span className="badge-green">Cleared</span>;
    if (r.status === "reported") return <span className="badge-red">Reported</span>;
    const holdDate = new Date(r.hold_until);
    if (holdDate <= now) return <span className="badge-amber">Ready to Release</span>;
    const daysLeft = Math.ceil((holdDate.getTime() - now.getTime()) / 86400000);
    return <span className="badge-steel">{daysLeft}d hold remaining</span>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-night-100 flex items-center gap-2">
          <ShieldAlert size={22} className="text-warning-400" />
          Catalytic Converters
        </h1>
        <p className="mt-1 text-sm text-night-400">
          Ontario 7-day hold requirement · {onHold.length} on hold · {releasable.length} ready for release
        </p>
      </div>

      <div className="rounded-xl border border-warning-500/20 bg-warning-500/5 p-4">
        <p className="text-xs text-warning-300 leading-relaxed">
          <strong className="text-warning-200">Ontario Compliance:</strong> All catalytic converters must be held for 7 days before release.
          VIN source documentation or supervisor sign-off for no-source units is required under Ontario Reg. 390/21.
          Records are retained for audit purposes.
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-night-800" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="yard-card text-center py-12">
          <ShieldAlert size={32} className="mx-auto text-night-600 mb-3" />
          <p className="text-night-400">No catalytic converter records.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const isOpen = expanded === r.cat_id;
            const canClear = r.status === "hold" && new Date(r.hold_until) <= now;
            return (
              <div key={r.cat_id} className="rounded-xl border border-night-700 bg-night-800 overflow-hidden">
                <button
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-night-750 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : r.cat_id)}
                  aria-expanded={isOpen}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-night-100">{r.unit_count} unit{r.unit_count !== 1 ? "s" : ""}</p>
                      {statusBadge(r)}
                    </div>
                    <p className="text-xs text-night-400 mt-0.5">
                      {r.ticket_number ? `Ticket ${r.ticket_number}` : ""}
                      {r.seller_name ? ` · ${r.seller_name}` : ""}
                      {" · "}{new Date(r.created_at).toLocaleDateString("en-CA")}
                    </p>
                  </div>
                  {isOpen ? <ChevronUp size={16} className="text-night-500 flex-shrink-0" /> : <ChevronDown size={16} className="text-night-500 flex-shrink-0" />}
                </button>

                {isOpen && (
                  <div className="border-t border-night-700 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-night-500 text-xs">Hold Until</p>
                        <p className="text-night-100 font-medium flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(r.hold_until).toLocaleDateString("en-CA")}
                        </p>
                      </div>
                      <div>
                        <p className="text-night-500 text-xs">VIN Source</p>
                        <p className="text-night-100 font-medium">{r.vin_source ?? "—"}</p>
                      </div>
                      {r.no_source_reason && (
                        <div className="col-span-2">
                          <p className="text-night-500 text-xs">No-Source Reason</p>
                          <p className="text-night-100">{r.no_source_reason}</p>
                        </div>
                      )}
                    </div>

                    {canClear && (
                      <button
                        onClick={() => clearRecord(r.cat_id)}
                        disabled={clearing === r.cat_id}
                        className="yard-btn-primary flex items-center gap-2"
                      >
                        <CheckCircle size={16} />
                        {clearing === r.cat_id ? "Clearing…" : "Mark as Cleared for Release"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
