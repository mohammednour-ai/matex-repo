"use client";

import { useCallback, useEffect, useState } from "react";
import { callGatewayTool, readTrackedIds, addTrackedId } from "../harness-client";

type SearchResult = {
  listing_id: string;
  title: string;
  description: string;
  asking_price: number;
  quantity: number;
  unit: string;
  status: string;
  location?: string;
  seller_province?: string;
};

type SortKey = "newest" | "price_asc" | "price_desc";

function sortResults(items: SearchResult[], key: SortKey): SearchResult[] {
  const sorted = [...items];
  switch (key) {
    case "price_asc":
      return sorted.sort((a, b) => (a.asking_price ?? 0) - (b.asking_price ?? 0));
    case "price_desc":
      return sorted.sort((a, b) => (b.asking_price ?? 0) - (a.asking_price ?? 0));
    default:
      return sorted;
  }
}

export default function SearchPage() {
  const [query, setQuery] = useState("copper");
  const [category, setCategory] = useState("");
  const [province, setProvince] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugOutput, setDebugOutput] = useState<string | null>(null);

  const runSearch = useCallback(async (q?: string) => {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;
    setError(null);
    setSuccess(null);
    setDebugOutput(null);
    setLoading(true);
    setSearched(true);
    try {
      const args: Record<string, unknown> = { query: searchQuery };
      if (category.trim()) args.category = category;
      if (province.trim()) args.province = province;
      if (minPrice.trim()) args.min_price = Number(minPrice);
      if (maxPrice.trim()) args.max_price = Number(maxPrice);

      const result = await callGatewayTool("search.search_materials", args);
      setDebugOutput(JSON.stringify(result.payload, null, 2));

      if (result.payload.success) {
        const d = result.payload.data;
        const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
        const items = (upstream?.results ?? upstream?.listings ?? d?.results ?? d?.listings ?? []) as SearchResult[];
        setResults(Array.isArray(items) ? items : []);
      } else {
        setError(result.payload.error?.message ?? "Search failed.");
        setResults([]);
      }
    } catch (err) {
      setError(String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, category, province, minPrice, maxPrice]);

  useEffect(() => { runSearch("copper"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveSearch() {
    setError(null);
    setSuccess(null);
    try {
      const args: Record<string, unknown> = { query };
      if (category.trim()) args.category = category;
      if (province.trim()) args.province = province;
      if (minPrice.trim()) args.min_price = Number(minPrice);
      if (maxPrice.trim()) args.max_price = Number(maxPrice);

      const result = await callGatewayTool("search.save_search", args);
      if (result.payload.success) {
        setSuccess("Search saved! You'll be notified of new matches.");
      } else {
        setError(result.payload.error?.message ?? "Could not save search.");
      }
    } catch (err) {
      setError(String(err));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") runSearch();
  }

  const displayed = sortResults(results, sortKey);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Search materials</h1>
          <p className="page-sub">Find recycled materials from verified Canadian sellers.</p>
        </div>
      </div>

      {error && (
        <div className="error-toast">
          <div className="error-toast-header">
            <div className="error-toast-icon">!</div>
            <div className="error-toast-message">{error}</div>
            <button className="error-toast-close" onClick={() => setError(null)}>×</button>
          </div>
        </div>
      )}

      {success && (
        <div className="success-toast">
          <div className="success-toast-icon">✓</div>
          <span style={{ fontSize: 13 }}>{success}</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
        {/* Filter rail */}
        <div className="card" style={{ alignSelf: "start" }}>
          <div className="card-header">
            <div className="card-title">Filters</div>
          </div>
          <div className="card-body">
            <div className="field-row">
              <div className="field-label">Material</div>
              <input
                className="field-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. copper, aluminum"
              />
            </div>
            <div className="field-row">
              <div className="field-label">Category</div>
              <input className="field-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ferrous, Non-ferrous…" />
            </div>
            <div className="field-row">
              <div className="field-label">Province / Region</div>
              <input className="field-input" value={province} onChange={(e) => setProvince(e.target.value)} placeholder="ON, BC, QC…" />
            </div>
            <div className="two-col">
              <div className="field-row">
                <div className="field-label">Min price</div>
                <input className="field-input" type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" />
              </div>
              <div className="field-row">
                <div className="field-label">Max price</div>
                <input className="field-input" type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="∞" />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => runSearch()} disabled={loading}>
                {loading ? <span className="loading-spinner" /> : "Search"}
              </button>
              <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={handleSaveSearch}>
                Save search
              </button>
            </div>
          </div>
        </div>

        {/* Results column */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {searched ? `${displayed.length} result${displayed.length !== 1 ? "s" : ""}` : ""}
            </span>
            <select
              className="field-select"
              style={{ width: "auto", minWidth: 140 }}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price low</option>
              <option value="price_desc">Price high</option>
            </select>
          </div>

          {loading && results.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
              <span className="loading-spinner-lg" />
            </div>
          ) : searched && displayed.length === 0 ? (
            <div className="card">
              <div className="card-body" style={{ textAlign: "center", padding: 32, color: "var(--muted)", fontSize: 13 }}>
                No listings found. Try adjusting your filters.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {displayed.map((item) => (
                <div className="listing-card" key={item.listing_id}>
                  <div className="listing-card-top">
                    <div className="listing-card-title">{item.title}</div>
                    <span className={`badge ${item.status === "active" ? "badge-green" : "badge-muted"}`}>{item.status}</span>
                  </div>
                  {item.description && (
                    <div className="listing-card-detail" style={{ marginBottom: 8 }}>
                      {item.description.length > 120 ? item.description.slice(0, 120) + "…" : item.description}
                    </div>
                  )}
                  <div className="listing-card-price">
                    ${Number(item.asking_price ?? 0).toLocaleString("en-CA", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="listing-card-detail">
                    {item.quantity} {item.unit}
                    {item.location || item.seller_province ? ` · ${item.location ?? item.seller_province}` : ""}
                  </div>
                  <div className="listing-card-footer">
                    <a href="/messaging" style={{ fontSize: 12, color: "var(--cyan)" }}>Message seller →</a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {debugOutput && (
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => setShowDebug(!showDebug)}
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}
              >
                {showDebug ? "Hide debug" : "Show debug"}
              </button>
              {showDebug && (
                <pre style={{ marginTop: 6, fontSize: 10, maxHeight: 160, overflow: "auto", padding: 8, background: "rgba(0,0,0,.3)", borderRadius: 4, whiteSpace: "pre-wrap" }}>
                  {debugOutput}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
