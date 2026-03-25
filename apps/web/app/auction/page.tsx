"use client";
import { useState } from "react";
import { callGatewayTool, addTrackedId } from "../harness-client";

export default function AuctionPage() {
  const lots = [
    { id: "L-18", title: "HMS #1 Scrap Steel",    grade: "HMS 1 / ISRI 200",     qty: "120 mt", start: "$25,000", current: "$28,500", bids: 12, ends: "04:22", reserve: "$30,000", status: "open"   },
    { id: "L-09", title: "Millberry Copper Coil", grade: "ISRI Bare Bright",      qty: "18 mt",  start: "$18,000", current: "$22,000", bids: 8,  ends: "11:45", reserve: "$22,000", status: "open"   },
    { id: "L-31", title: "Mixed Aluminum Solids", grade: "ISRI Tense / 99.4%",    qty: "50 mt",  start: "$55,000", current: "$61,200", bids: 21, ends: "00:58", reserve: "$58,000", status: "closing"},
    { id: "L-22", title: "Battery Scrap Class 8", grade: "Li-ion / Hazmat Cl.8",  qty: "12 mt",  start: "$38,000", current: "$44,900", bids: 6,  ends: "28:10", reserve: "$45,000", status: "open"   },
  ];

  const bidStream = [
    { user: "NorthLoop Metals",    amount: "$28,500", time: "09:18:41", winning: true  },
    { user: "OntarioScrap Co.",    amount: "$28,000", time: "09:18:33", winning: false },
    { user: "GreatLakes Recycling",amount: "$27,500", time: "09:17:58", winning: false },
    { user: "NorthLoop Metals",    amount: "$27,000", time: "09:17:22", winning: false },
    { user: "Apex Metals Inc.",    amount: "$26,500", time: "09:16:44", winning: false },
    { user: "OntarioScrap Co.",    amount: "$26,000", time: "09:16:01", winning: false },
  ];

  const activeLot = lots[0];

  const [bidAmount, setBidAmount] = useState("29000");
  const [bidLoading, setBidLoading] = useState(false);
  const [bidResult, setBidResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copilotLoading, setCopilotLoading] = useState<string | null>(null);
  const [copilotReply, setCopilotReply] = useState<string | null>(null);
  const [watchedLots, setWatchedLots] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("matex_watched_lots") ?? "[]"); } catch { return []; }
  });

  async function handlePlaceBid(): Promise<void> {
    setBidLoading(true);
    setBidResult(null);
    try {
      const numericAmount = parseFloat(bidAmount.replace(/[^0-9.]/g, ""));
      const result = await callGatewayTool("auction.place_auction_bid", {
        lot_id: activeLot.id,
        amount: numericAmount,
        bid_type: "manual",
      });
      const d = result.payload.data;
      const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const bidId = String(upstream?.bid_id ?? d?.bid_id ?? "");
      if (bidId) addTrackedId("auctionIds", bidId);
      setBidResult(result.payload.success
        ? { ok: true, msg: `Bid placed${bidId ? ` (${bidId})` : ""}` }
        : { ok: false, msg: result.payload.error?.message ?? "Bid failed" });
    } catch (err) {
      setBidResult({ ok: false, msg: String(err) });
    } finally {
      setBidLoading(false);
    }
  }

  async function handleCopilotChip(chipText: string): Promise<void> {
    setCopilotLoading(chipText);
    setCopilotReply(null);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: chipText }),
      });
      const data = await res.json();
      setCopilotReply(data?.reply ?? data?.message ?? JSON.stringify(data));
    } catch (err) {
      setCopilotReply(`Error: ${String(err)}`);
    } finally {
      setCopilotLoading(null);
    }
  }

  function toggleWatchLot(lotId: string): void {
    setWatchedLots((prev) => {
      const next = prev.includes(lotId) ? prev.filter((l) => l !== lotId) : [...prev, lotId];
      localStorage.setItem("matex_watched_lots", JSON.stringify(next));
      return next;
    });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Live auction room</div>
          <h1 className="page-title">⚡ Matex Auction — Session #A-2026-031</h1>
          <p className="page-sub">4 active lots · Realtime bid sequencing via Redis · Server timestamps only</p>
        </div>
        <div className="page-actions">
          <span className="badge badge-green"><span className="dot" />Live</span>
          <span className="badge badge-cyan">23 participants</span>
          <button className="btn btn-ghost btn-sm">Rules</button>
        </div>
      </div>

      {/* Lot picker row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        {lots.map((l) => (
          <div key={l.id} style={{
            flex: 1, padding: "12px 14px",
            borderRadius: "var(--r-md)",
            border: `1px solid ${l.status === "closing" ? "rgba(245,166,35,.4)" : l.id === "L-18" ? "rgba(46,232,245,.4)" : "var(--border)"}`,
            background: l.id === "L-18" ? "rgba(46,232,245,.08)" : "rgba(10,22,40,.75)",
            cursor: "pointer"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{l.id}</span>
              <span className={`badge ${l.status === "closing" ? "badge-amber" : "badge-cyan"} `} style={{ fontSize: 11 }}>
                {l.status === "closing" ? "⏱ Closing" : "Open"}
              </span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{l.title}</div>
            <div style={{ marginTop: 6, fontWeight: 800, color: "var(--cyan)", fontSize: 18 }}>{l.current}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{l.bids} bids · ends {l.ends}</span>
              <button
                onClick={(e) => { e.stopPropagation(); toggleWatchLot(l.id); }}
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: "2px 6px", lineHeight: 1 }}
              >
                {watchedLots.includes(l.id) ? "★ Watching" : "☆ Watch"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="auction-layout">
        {/* ── Left: Active lot ── */}
        <div style={{ display: "grid", gap: 14 }}>
          <div className="auction-lot-card">
            <div className="lot-number">Lot {activeLot.id} · {activeLot.grade}</div>
            <div className="lot-title">{activeLot.title}</div>
            <div className="lot-detail">{activeLot.qty} · Hamilton, ON · Inspection required · <span style={{ color: "var(--green)" }}>Reserve met ✓</span></div>

            {/* Countdown */}
            <div className="countdown">
              <div>
                <div className="countdown-label">Time remaining</div>
                <div className="countdown-time">{activeLot.ends}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="progress-bar" style={{ height: 8 }}>
                  <div className="progress-fill" style={{ width: "72%", background: "linear-gradient(90deg,var(--amber),var(--red))" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  <span>Session start</span><span>Auto-extend active</span>
                </div>
              </div>
            </div>

            {/* Current bid */}
            <div className="bid-current">
              <div className="bid-label">Current highest bid</div>
              <div className="bid-amount">{activeLot.current}</div>
              <div className="bid-meta">by NorthLoop Metals · {activeLot.bids} total bids · min increment $500</div>
            </div>

            {/* Quick bid */}
            <div className="bid-presets">
              {["29000", "29500", "30000"].map((amt, i) => (
                <button key={amt} className="bid-preset" onClick={() => { setBidAmount(amt); setBidResult(null); }}>
                  ${Number(amt).toLocaleString()}{i === 2 ? " 🏆" : ""}
                </button>
              ))}
            </div>

            <div className="bid-input-row">
              <input
                value={`$${Number(bidAmount).toLocaleString()}`}
                onChange={(e) => setBidAmount(e.target.value.replace(/[^0-9]/g, ""))}
              />
              <button
                className="btn btn-primary"
                style={{ whiteSpace: "nowrap" }}
                disabled={bidLoading}
                onClick={handlePlaceBid}
              >
                {bidLoading ? "Placing…" : "Place bid ➤"}
              </button>
            </div>

            {bidResult && (
              <div style={{ marginTop: 8, fontSize: 13, padding: "8px 12px", borderRadius: "var(--r-sm)",
                background: bidResult.ok ? "rgba(38,208,124,.1)" : "rgba(255,90,90,.1)",
                border: `1px solid ${bidResult.ok ? "rgba(38,208,124,.3)" : "rgba(255,90,90,.3)"}`,
                color: bidResult.ok ? "var(--green)" : "var(--red)" }}>
                {bidResult.ok ? "✓ " : "✗ "}{bidResult.msg}
              </div>
            )}

            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
              Bid deposit required: $2,850 (10%) · Escrowed funds auto-released on loss within 24h
            </div>
          </div>

          {/* Lot details table */}
          <div className="card">
            <div className="card-header"><span className="card-title">Lot details</span></div>
            <div className="card-body">
              <table className="data-table">
                <tbody>
                  {[
                    ["Grade",           activeLot.grade],
                    ["Quantity",        activeLot.qty],
                    ["Starting price",  activeLot.start],
                    ["Reserve price",   activeLot.reserve],
                    ["Inspection",      "Required — third-party presale"],
                    ["Hazmat class",    "None"],
                    ["Pickup location", "Hamilton, ON"],
                    ["Environmental",   "Permit on file"],
                  ].map(([k, v]) => (
                    <tr key={k as string}>
                      <td style={{ color: "var(--muted)", width: "46%" }}>{k}</td>
                      <td style={{ fontWeight: 600 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Right: Bid stream ── */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Live bid stream</span>
              <span className="badge badge-green"><span className="dot" />Realtime</span>
            </div>
            <div className="card-body">
              <div className="bid-stream">
                {bidStream.map((b, i) => (
                  <div key={i} className={`bid-row ${b.winning ? "winning" : ""}`}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "999px",
                      background: b.winning ? "rgba(46,232,245,.2)" : "rgba(255,255,255,.05)",
                      display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700,
                      color: b.winning ? "var(--cyan)" : "var(--muted)"
                    }}>{i + 1}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{b.user}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{b.time}</div>
                    </div>
                    <div className={`bid-row-amount ${b.winning ? "bid-row-winning" : ""}`}>{b.amount}</div>
                    {b.winning && <span className="badge badge-cyan" style={{ fontSize: 11 }}>Winning</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI copilot for auction */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">AI auction advisor</span>
              <span className="badge badge-cyan">Context: Lot {activeLot.id}</span>
            </div>
            <div className="card-body" style={{ display: "grid", gap: 10 }}>
              <div style={{
                padding: "12px", borderRadius: "var(--r-sm)",
                background: "rgba(46,232,245,.07)",
                border: "1px solid rgba(46,232,245,.18)",
                fontSize: 13
              }}>
                {copilotReply
                  ? copilotReply
                  : "Reserve met at $28,000. Current bid $28,500 is below comparable lots by ~8%. Auto-extend will trigger if a bid arrives within 5 min of close."}
              </div>
              {["Set proxy bid at $30,500", "Alert me when reserve met", "Analyse competitor pattern"].map((s) => (
                <button
                  key={s}
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: "flex-start" }}
                  disabled={copilotLoading === s}
                  onClick={() => handleCopilotChip(s)}
                >
                  {copilotLoading === s ? "Thinking…" : s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
