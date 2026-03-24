import { HarnessBanner } from "../components/HarnessBanner";

export default function EscrowPage() {
  const escrows = [
    { id: "ESC-9415", lot: "Copper wire MTX-9415",    held: "$22,495",  status: "funds_held",     buyer: "NorthLoop Metals",    seller: "GreatLakes Recycling" },
    { id: "ESC-9402", lot: "Aluminum ingots MTX-9402", held: "$75,200", status: "partially_released", buyer: "Apex Metals",      seller: "Hamilton Scrap"       },
    { id: "ESC-9389", lot: "Crushed steel MTX-9389",  held: "$0",       status: "released",       buyer: "OntarioScrap Co.",    seller: "Midwest Metals"       },
    { id: "ESC-9374", lot: "Battery scrap MTX-9374",  held: "$44,900",  status: "frozen",         buyer: "BlueSky Recyclers",   seller: "CanEast Metals"       },
  ];

  const timeline = [
    { icon: "✓", label: "Escrow created",    detail: "Buyer and seller linked to order.",      state: "done"   },
    { icon: "✓", label: "Funds captured",    detail: "$22,495 held via Stripe PI.",            state: "done"   },
    { icon: "◉", label: "Inspection pending",detail: "Pickup inspection booked Tue 09:30.",    state: "active" },
    { icon: "⏳", label: "Delivery confirm",  detail: "POD upload required from carrier.",      state: "wait"   },
    { icon: "⏳", label: "Release to seller", detail: "Auto-release after all conditions met.", state: "wait"   },
  ];

  const conditions = [
    { label: "Inspection approved",  done: false },
    { label: "Delivery confirmed",   done: false },
    { label: "Dispute resolved",     done: true  },
    { label: "Buyer sign-off",       done: false },
  ];

  const statusColor: Record<string, string> = {
    funds_held: "badge-cyan", partially_released: "badge-amber",
    released: "badge-green", frozen: "badge-red",
  };
  const statusLabel: Record<string, string> = {
    funds_held: "Funds held", partially_released: "Partial release",
    released: "Released", frozen: "🔒 Frozen",
  };

  return (
    <div>
      <HarnessBanner href="/phase2" label="Test escrow flow on Phase 2" />
      <div className="page-header">
        <div>
          <div className="eyebrow">Trust layer</div>
          <h1 className="page-title">Escrow management</h1>
          <p className="page-sub">All funds held in third-party escrow. Release only after all conditions are met.</p>
        </div>
        <div className="page-actions">
          <span className="badge badge-cyan">7 open escrows</span>
          <span className="badge badge-amber">$2.48M held</span>
        </div>
      </div>

      {/* Escrow table */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header"><span className="card-title">Open escrow accounts</span></div>
        <div className="card-body">
          <table className="data-table">
            <thead>
              <tr>
                <th>Escrow ID</th><th>Order</th><th>Buyer</th><th>Seller</th><th>Held</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {escrows.map((e) => (
                <tr key={e.id}>
                  <td style={{ color: "var(--cyan)", fontWeight: 600 }}>{e.id}</td>
                  <td>{e.lot}</td>
                  <td>{e.buyer}</td>
                  <td>{e.seller}</td>
                  <td style={{ fontWeight: 700 }}>{e.held}</td>
                  <td><span className={`badge ${statusColor[e.status]}`}>{statusLabel[e.status]}</span></td>
                  <td><button className="btn btn-ghost btn-sm">Manage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="escrow-layout">
        {/* Timeline */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">ESC-9415 — Release timeline</span>
            <span className="badge badge-cyan">Funds held</span>
          </div>
          <div className="card-body">
            <div style={{ fontSize: 28, fontWeight: 900, color: "var(--cyan)", letterSpacing: "-.04em", marginBottom: 4 }}>$22,495</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>Copper wire · NorthLoop Metals → GreatLakes Recycling</div>

            <div className="escrow-timeline">
              {timeline.map((t) => (
                <div key={t.label} className="escrow-step">
                  <div className={`escrow-dot ${t.state}`}>{t.icon}</div>
                  <div>
                    <div className="escrow-step-title">{t.label}</div>
                    <div className="escrow-step-detail">{t.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Release conditions + actions */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Release conditions</span></div>
            <div className="card-body">
              {conditions.map((c) => (
                <div key={c.label} className="condition-row">
                  <span>{c.label}</span>
                  <span>{c.done ? "✅" : "⏳"}</span>
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <div className="progress-bar" style={{ height: 8 }}>
                  <div className="progress-fill" style={{ width: "25%" }} />
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>1 of 4 conditions met</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Operator actions</span></div>
            <div className="card-body" style={{ display: "grid", gap: 8 }}>
              <button className="btn btn-primary" disabled>Release to seller</button>
              <button className="btn btn-ghost">Partial release</button>
              <button className="btn btn-ghost">Refund buyer</button>
              <button className="btn btn-danger">🔒 Freeze escrow</button>
              <div className="divider" />
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Frozen escrow can only be released by admin decision, anti-manipulation trigger, or arbitration ruling.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">AI copilot</span></div>
            <div className="card-body">
              <div style={{
                padding: 12, borderRadius: "var(--r-sm)",
                background: "rgba(46,232,245,.07)", border: "1px solid rgba(46,232,245,.2)",
                fontSize: 13, marginBottom: 10
              }}>
                Inspection is the only blocking condition. The booking is confirmed for Tue 09:30. I can send a reminder to the inspector now.
              </div>
              <button className="btn btn-ghost btn-sm">Send inspector reminder</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
