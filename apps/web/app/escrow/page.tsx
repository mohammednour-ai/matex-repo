"use client";
import { useState } from "react";
import { callGatewayTool, addTrackedId } from "../harness-client";

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

  const [conditions, setConditions] = useState([
    { label: "Inspection approved",  done: false },
    { label: "Delivery confirmed",   done: false },
    { label: "Dispute resolved",     done: true  },
    { label: "Buyer sign-off",       done: false },
  ]);

  const statusColor: Record<string, string> = {
    funds_held: "badge-cyan", partially_released: "badge-amber",
    released: "badge-green", frozen: "badge-red",
  };
  const statusLabel: Record<string, string> = {
    funds_held: "Funds held", partially_released: "Partial release",
    released: "Released", frozen: "🔒 Frozen",
  };

  const [managingId, setManagingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotReply, setCopilotReply] = useState<string | null>(null);

  const allConditionsMet = conditions.every((c) => c.done);

  async function handleEscrowAction(action: string, escrowId: string): Promise<void> {
    const toolMap: Record<string, string> = {
      hold: "escrow.hold_funds",
      release: "escrow.release_funds",
      freeze: "escrow.freeze_escrow",
      refund: "escrow.refund_buyer",
      partial: "escrow.partial_release",
    };
    setActionLoading(action);
    setActionResult(null);
    try {
      const result = await callGatewayTool(toolMap[action] ?? action, { escrow_id: escrowId });
      const d = result.payload.data;
      const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const id = String(upstream?.escrow_id ?? d?.escrow_id ?? "");
      if (id) addTrackedId("escrowIds", id);
      setActionResult(result.payload.success
        ? { ok: true, msg: `${action} succeeded${id ? ` (${id})` : ""}` }
        : { ok: false, msg: result.payload.error?.message ?? `${action} failed` });
    } catch (err) {
      setActionResult({ ok: false, msg: String(err) });
    } finally {
      setActionLoading(null);
    }
  }

  function toggleCondition(idx: number): void {
    setConditions((prev) => prev.map((c, i) => i === idx ? { ...c, done: !c.done } : c));
  }

  async function handleCopilotReminder(): Promise<void> {
    setCopilotLoading(true);
    setCopilotReply(null);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Send inspector reminder for ESC-9415" }),
      });
      const data = await res.json();
      setCopilotReply(data?.reply ?? data?.message ?? JSON.stringify(data));
    } catch (err) {
      setCopilotReply(`Error: ${String(err)}`);
    } finally {
      setCopilotLoading(false);
    }
  }

  return (
    <div>
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
                <>
                  <tr key={e.id}>
                    <td style={{ color: "var(--cyan)", fontWeight: 600 }}>{e.id}</td>
                    <td>{e.lot}</td>
                    <td>{e.buyer}</td>
                    <td>{e.seller}</td>
                    <td style={{ fontWeight: 700 }}>{e.held}</td>
                    <td><span className={`badge ${statusColor[e.status]}`}>{statusLabel[e.status]}</span></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setManagingId(managingId === e.id ? null : e.id)}>
                        {managingId === e.id ? "Close" : "Manage"}
                      </button>
                    </td>
                  </tr>
                  {managingId === e.id && (
                    <tr key={`${e.id}-actions`}>
                      <td colSpan={7} style={{ padding: "12px 16px", background: "rgba(46,232,245,.04)", borderTop: "1px solid rgba(46,232,245,.15)" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          {[
                            { key: "hold", label: "Hold funds", cls: "btn btn-ghost btn-sm" },
                            { key: "release", label: "Release", cls: "btn btn-primary btn-sm" },
                            { key: "freeze", label: "🔒 Freeze", cls: "btn btn-danger btn-sm" },
                            { key: "refund", label: "Refund buyer", cls: "btn btn-ghost btn-sm" },
                            { key: "partial", label: "Partial release", cls: "btn btn-ghost btn-sm" },
                          ].map((a) => (
                            <button
                              key={a.key}
                              className={a.cls}
                              disabled={actionLoading === a.key}
                              onClick={() => handleEscrowAction(a.key, e.id)}
                            >
                              {actionLoading === a.key ? "…" : a.label}
                            </button>
                          ))}
                          {actionResult && (
                            <span style={{ fontSize: 12, color: actionResult.ok ? "var(--green)" : "var(--red)" }}>
                              {actionResult.ok ? "✓ " : "✗ "}{actionResult.msg}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
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
              {conditions.map((c, idx) => (
                <div
                  key={c.label}
                  className="condition-row"
                  style={{ cursor: "pointer" }}
                  onClick={() => toggleCondition(idx)}
                >
                  <span>{c.label}</span>
                  <span>{c.done ? "✅" : "⏳"}</span>
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <div className="progress-bar" style={{ height: 8 }}>
                  <div className="progress-fill" style={{ width: `${(conditions.filter((c) => c.done).length / conditions.length) * 100}%` }} />
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                  {conditions.filter((c) => c.done).length} of {conditions.length} conditions met
                </div>
              </div>
              {!allConditionsMet && (
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  <a href="/dispute" style={{ color: "var(--amber)", textDecoration: "underline" }}>File a dispute</a>
                  <span style={{ color: "var(--muted)" }}> — unmet conditions may require mediation</span>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Operator actions</span></div>
            <div className="card-body" style={{ display: "grid", gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={!allConditionsMet || actionLoading === "release"}
                onClick={() => handleEscrowAction("release", "ESC-9415")}
              >
                {actionLoading === "release" ? "Releasing…" : "Release to seller"}
              </button>
              <button className="btn btn-ghost" disabled={actionLoading === "partial"} onClick={() => handleEscrowAction("partial", "ESC-9415")}>
                {actionLoading === "partial" ? "…" : "Partial release"}
              </button>
              <button className="btn btn-ghost" disabled={actionLoading === "refund"} onClick={() => handleEscrowAction("refund", "ESC-9415")}>
                {actionLoading === "refund" ? "…" : "Refund buyer"}
              </button>
              <button className="btn btn-danger" disabled={actionLoading === "freeze"} onClick={() => handleEscrowAction("freeze", "ESC-9415")}>
                {actionLoading === "freeze" ? "…" : "🔒 Freeze escrow"}
              </button>
              {actionResult && (
                <div style={{ fontSize: 12, padding: "6px 10px", borderRadius: "var(--r-sm)",
                  background: actionResult.ok ? "rgba(38,208,124,.1)" : "rgba(255,90,90,.1)",
                  color: actionResult.ok ? "var(--green)" : "var(--red)" }}>
                  {actionResult.ok ? "✓ " : "✗ "}{actionResult.msg}
                </div>
              )}
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
                {copilotReply
                  ? copilotReply
                  : "Inspection is the only blocking condition. The booking is confirmed for Tue 09:30. I can send a reminder to the inspector now."}
              </div>
              <button className="btn btn-ghost btn-sm" disabled={copilotLoading} onClick={handleCopilotReminder}>
                {copilotLoading ? "Sending…" : "Send inspector reminder"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
