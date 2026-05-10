"use client";

import { useEffect, useState } from "react";
import { callTool, getUser } from "@/lib/api";
import { FileText, Search, ChevronDown, ChevronUp } from "lucide-react";

type AuditEvent = {
  audit_id: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  actor_id?: string;
  actor_name?: string;
  ip_address?: string;
  payload?: Record<string, unknown>;
  created_at: string;
};

const today = new Date().toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

export default function AuditPage() {
  const user = getUser();
  const tenantId = user?.tenant_id ?? "";

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [actionFilter, setActionFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function fetch() {
    setLoading(true);
    const res = await callTool<{ events: AuditEvent[] }>("yardops.query_audit_log", {
      tenant_id: tenantId,
      date_from: dateFrom,
      date_to: dateTo,
      action: actionFilter.trim() || undefined,
      limit: 100,
    });
    if (res.success && res.data) setEvents(res.data.events ?? []);
    setLoading(false);
  }

  useEffect(() => { fetch(); }, []);

  function actionColor(action: string) {
    if (action.includes("create") || action.includes("login")) return "badge-green";
    if (action.includes("void") || action.includes("block") || action.includes("delete")) return "badge-red";
    if (action.includes("update") || action.includes("complete") || action.includes("sign")) return "badge-brand";
    return "badge-steel";
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-night-100 flex items-center gap-2">
          <FileText size={22} className="text-brand-400" />
          Audit Log
        </h1>
        <p className="mt-1 text-sm text-night-400">7-year retention · Append-only · CRA compliance</p>
      </div>

      {/* Filters */}
      <div className="yard-card space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-night-300">From</label>
            <input type="date" className="yard-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={today} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-night-300">To</label>
            <input type="date" className="yard-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} max={today} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-night-300">Action Filter</label>
            <input className="yard-input" placeholder="e.g. create_ticket" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} />
          </div>
        </div>
        <button onClick={fetch} disabled={loading} className="yard-btn-primary flex items-center gap-2">
          <Search size={15} />
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-night-800" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="yard-card text-center py-10">
          <FileText size={28} className="mx-auto text-night-600 mb-2" />
          <p className="text-night-400 text-sm">No audit events found.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-night-500 mb-3">{events.length} events</p>
          {events.map((e) => {
            const isOpen = expanded === e.audit_id;
            return (
              <div key={e.audit_id} className="rounded-xl border border-night-700 bg-night-800 overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-night-750 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : e.audit_id)}
                  aria-expanded={isOpen}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`${actionColor(e.action)} font-mono text-xs`}>{e.action}</span>
                      {e.resource_type && <span className="text-xs text-night-500">{e.resource_type}</span>}
                    </div>
                    <p className="text-xs text-night-500 mt-0.5">
                      {new Date(e.created_at).toLocaleString("en-CA")}
                      {e.actor_name ? ` · ${e.actor_name}` : e.actor_id ? ` · ${e.actor_id.slice(0, 8)}` : ""}
                      {e.ip_address ? ` · ${e.ip_address}` : ""}
                    </p>
                  </div>
                  {isOpen ? <ChevronUp size={14} className="text-night-600 flex-shrink-0" /> : <ChevronDown size={14} className="text-night-600 flex-shrink-0" />}
                </button>
                {isOpen && e.payload && (
                  <div className="border-t border-night-700 bg-night-900 px-4 py-3">
                    <pre className="text-xs text-night-300 overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
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
