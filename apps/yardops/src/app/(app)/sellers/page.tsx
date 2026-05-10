"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { callTool, getUser } from "@/lib/api";
import { Users, Search, ChevronRight, ShieldOff, ShieldCheck } from "lucide-react";

type Seller = {
  seller_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  pipeda_consent: boolean;
  is_blocked: boolean;
  created_at: string;
  ticket_count?: number;
};

export default function SellersPage() {
  const router = useRouter();
  const user = getUser();
  const tenantId = user?.tenant_id ?? "";

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchSellers(q = "") {
    setLoading(true);
    const res = await callTool<{ sellers: Seller[] }>("yardops.list_sellers", {
      tenant_id: tenantId,
      search: q.trim() || undefined,
    });
    if (res.success && res.data) setSellers(res.data.sellers ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchSellers(); }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchSellers(search);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-night-100 flex items-center gap-2">
            <Users size={22} className="text-brand-400" />
            Sellers
          </h1>
          <p className="mt-1 text-sm text-night-400">{sellers.length} registered sellers</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-night-500" />
          <input
            className="yard-input pl-9"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search sellers"
          />
        </div>
        <button type="submit" className="yard-btn-primary px-4">Search</button>
        {search && (
          <button type="button" onClick={() => { setSearch(""); fetchSellers(); }} className="yard-btn-secondary px-4">
            Clear
          </button>
        )}
      </form>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-night-800" />
          ))}
        </div>
      ) : sellers.length === 0 ? (
        <div className="yard-card text-center py-12">
          <Users size={32} className="mx-auto text-night-600 mb-3" />
          <p className="text-night-400">No sellers found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sellers.map((s) => (
            <button
              key={s.seller_id}
              onClick={() => router.push(`/sellers/${s.seller_id}`)}
              className="w-full flex items-center gap-4 rounded-xl border border-night-700 bg-night-800 p-4 text-left hover:border-night-600 hover:bg-night-750 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-night-100">{s.first_name} {s.last_name}</p>
                  {s.is_blocked && (
                    <span className="badge-red flex items-center gap-1">
                      <ShieldOff size={11} /> Blocked
                    </span>
                  )}
                  {!s.pipeda_consent && (
                    <span className="badge-amber">No PIPEDA</span>
                  )}
                  {s.pipeda_consent && !s.is_blocked && (
                    <span className="badge-green flex items-center gap-1">
                      <ShieldCheck size={11} /> Verified
                    </span>
                  )}
                </div>
                <p className="text-sm text-night-400 mt-0.5">{s.phone}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {s.ticket_count != null && (
                  <p className="text-xs text-night-500">{s.ticket_count} tickets</p>
                )}
                <p className="text-xs text-night-600 mt-0.5">{new Date(s.created_at).toLocaleDateString("en-CA")}</p>
              </div>
              <ChevronRight size={16} className="text-night-600 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
