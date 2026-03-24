export default function HomePage() {
  const stats = [
    { label: "Active listings",   value: "1,284", change: "+12.4%",  up: true  },
    { label: "Escrow held",       value: "$2.48M", change: "42 open", up: true  },
    { label: "Live MCP tools",    value: "23",     change: "All online",up:true },
    { label: "AI guided actions", value: "318",    change: "Today",   up: true  },
  ];

  const recentOrders = [
    { id: "MTX-9415", material: "Copper wire",       amount: "$22,495", status: "Escrow held",    badge: "badge-cyan"  },
    { id: "MTX-9402", material: "Aluminum ingots",   amount: "$75,200", status: "In transit",     badge: "badge-amber" },
    { id: "MTX-9389", material: "Crushed steel",     amount: "$31,800", status: "Delivered",      badge: "badge-green" },
    { id: "MTX-9374", material: "Battery scrap",     amount: "$44,900", status: "Inspection",     badge: "badge-amber" },
    { id: "MTX-9361", material: "Paper bales",       amount: "$12,300", status: "Completed",      badge: "badge-muted" },
  ];

  const liveAuctions = [
    { title: "HMS #1 Scrap Steel", lot: "Lot 18", bid: "$28,500",  bids: 12, ends: "04:22" },
    { title: "Millberry Copper",   lot: "Lot 09", bid: "$22,000",  bids: 8,  ends: "11:45" },
    { title: "Mixed Aluminum",     lot: "Lot 31", bid: "$61,200",  bids: 21, ends: "00:58" },
  ];

  const notifications = [
    { icon: "⚡", text: "You were outbid on Lot 18 — current $28,500", time: "2m",  color: "var(--amber)" },
    { icon: "✓",  text: "Copper wire MTX-9415 escrow funded",          time: "14m", color: "var(--green)" },
    { icon: "⊞",  text: "Inspection approved — escrow release ready",   time: "1h",  color: "var(--cyan)"  },
    { icon: "✉",  text: "New message from North Loop Metals",           time: "2h",  color: "var(--text)"  },
  ];

  const chatMessages = [
    { from: "Buyer",      ai: false, text: "What's the best carrier for copper wire from Hamilton to Montreal?" },
    { from: "MATEX AI",   ai: true,  action: false, text: "Based on live quotes, Day & Ross offers the best price at $1,190 (2 days). Manitoulin is $1,240 with higher reliability rating. I can book Day & Ross now if you confirm." },
    { from: "Buyer",      ai: false, text: "Book Day & Ross and generate the BOL." },
    { from: "MATEX AI",   ai: true,  action: true,  text: "✓ logistics.book_carrier called → BOL MTX-BOL-9415 generated. Pickup confirmed Thu 14:00 at Dock 3." },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <div className="eyebrow">Platform overview</div>
          <h1 className="page-title">Matex marketplace</h1>
          <p className="page-sub">Canadian B2B recycled materials · MCP-native · Cloud AI integrated</p>
        </div>
        <div className="page-actions">
          <a href="/listings" className="btn btn-ghost btn-sm">+ New listing</a>
          <a href="/auction"  className="btn btn-primary btn-sm">⚡ Join live auction</a>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-row">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className={`stat-change ${s.up ? "stat-up" : "stat-down"}`}>▲ {s.change}</div>
          </div>
        ))}
      </div>

      {/* Main 3-col grid */}
      <div className="dashboard-grid">

        {/* Col 1+2: Recent orders */}
        <div className="card" style={{ gridColumn: "1 / 3" }}>
          <div className="card-header">
            <span className="card-title">Recent orders</span>
            <a href="/checkout" className="btn btn-ghost btn-sm">View all</a>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Material</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600, color: "var(--cyan)" }}>{o.id}</td>
                    <td>{o.material}</td>
                    <td style={{ fontWeight: 700 }}>{o.amount}</td>
                    <td><span className={`badge ${o.badge}`}>{o.status}</span></td>
                    <td><button className="btn btn-ghost btn-sm">View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Col 3: Chat panel */}
        <div className="chat-panel" style={{ gridColumn: 3, gridRow: "1 / span 3" }}>
          <div className="chat-header">
            <div className="chat-avatar">AI</div>
            <div>
              <div style={{ fontWeight: 600 }}>MATEX AI Copilot</div>
              <div style={{ fontSize: 12, color: "var(--green)" }}>● Online · context linked</div>
            </div>
          </div>

          <div className="chat-messages">
            {chatMessages.map((m, i) => (
              <div key={i} className={`msg ${m.ai ? "msg-ai" : "msg-user"}`}>
                <div className="msg-from">{m.from}</div>
                <div className={`msg-bubble${m.action ? " action" : ""}`}>{m.text}</div>
              </div>
            ))}
          </div>

          <div className="chat-chips">
            <span className="chip">Check escrow status</span>
            <span className="chip">Get carrier quotes</span>
            <span className="chip">Summarise lot 18</span>
            <span className="chip">Generate invoice</span>
            <span className="chip">KYC status</span>
            <span className="chip">Release escrow</span>
          </div>

          <div className="chat-input-row">
            <input placeholder="Ask MATEX AI — listing, escrow, logistics, bids…" readOnly />
            <button className="send-btn">➤</button>
          </div>
        </div>

        {/* Col 1: Live auctions */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">⚡ Live auctions</span>
            <a href="/auction" className="btn btn-primary btn-sm">Auction room</a>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 10 }}>
            {liveAuctions.map((a) => (
              <div key={a.title} style={{
                padding: "14px", borderRadius: "var(--r-md)",
                border: "1px solid rgba(46,232,245,.18)",
                background: "rgba(46,232,245,.04)",
                display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px",
                alignItems: "center"
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{a.lot} · {a.bids} bids</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, color: "var(--cyan)", fontSize: 18 }}>{a.bid}</div>
                  <div style={{ fontSize: 11, color: "var(--amber)" }}>⏱ {a.ends}</div>
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${Math.random() * 60 + 30}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Col 2: Notifications */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Activity feed</span>
            <span className="badge badge-red">4 new</span>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 8 }}>
            {notifications.map((n, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px", borderRadius: "var(--r-sm)",
                background: "rgba(255,255,255,.03)",
                border: "1px solid rgba(255,255,255,.05)"
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "999px",
                  background: "rgba(255,255,255,.05)", display: "grid",
                  placeItems: "center", fontSize: 16, flexShrink: 0, color: n.color
                }}>{n.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{n.text}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{n.time} ago</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
