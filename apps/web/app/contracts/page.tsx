"use client";
import { useState, useEffect } from "react";
import { callGatewayTool } from "../harness-client";

export default function ContractsPage() {
  const contracts = [
    {id:"CON-441",type:"Volume",    buyer:"NorthLoop Metals",  material:"Copper wire", qty:"240 mt/yr", pricing:"LME + $125",  status:"active",  next:"Apr 02"},
    {id:"CON-438",type:"Standing",  buyer:"Apex Metals",       material:"Aluminum",    qty:"50 mt/mo",  pricing:"Fixed $2,300/mt",status:"active",  next:"Apr 01"},
    {id:"CON-421",type:"Index-linked",buyer:"BlueSky Recyclers",material:"Steel scrap",qty:"500 mt/yr",pricing:"LME ± $10",   status:"pending", next:"—"},
  ];
  const statusColor: Record<string,string> = {active:"badge-green",pending:"badge-amber"};

  const [copilotLoading, setCopilotLoading] = useState<string | null>(null);
  const [copilotReply, setCopilotReply] = useState<string | null>(null);

  const [signLoading, setSignLoading] = useState(false);
  const [signResult, setSignResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [managingId, setManagingId] = useState<string | null>(null);
  const [manageLoading, setManageLoading] = useState<string | null>(null);
  const [manageDetail, setManageDetail] = useState<Record<string, unknown> | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);

  const [lmePrice, setLmePrice] = useState<string | null>(null);

  useEffect(() => {
    callGatewayTool("pricing.get_market_prices", { material: "copper" })
      .then((result) => {
        if (result.payload.success && result.payload.data) {
          const d = result.payload.data;
          const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
          const price = upstream?.lme_price ?? upstream?.price ?? d?.lme_price ?? d?.price;
          if (price) setLmePrice(`$${Number(price).toLocaleString()}/mt`);
        }
      })
      .catch(() => { /* LME price display is best-effort */ });
  }, []);

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

  async function handleRequestSignature(): Promise<void> {
    setSignLoading(true);
    setSignResult(null);
    try {
      const createResult = await callGatewayTool("esign.create_document", {
        document_type: "credit_agreement",
        contract_id: "CON-441",
        title: "Credit agreement",
      });
      if (!createResult.payload.success) {
        setSignResult({ ok: false, msg: createResult.payload.error?.message ?? "Document creation failed" });
        return;
      }
      const d = createResult.payload.data;
      const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const docId = String(upstream?.document_id ?? d?.document_id ?? "");

      const sendResult = await callGatewayTool("esign.send_for_signing", { document_id: docId || "pending" });
      setSignResult(sendResult.payload.success
        ? { ok: true, msg: `Signature request sent${docId ? ` (${docId})` : ""}` }
        : { ok: false, msg: sendResult.payload.error?.message ?? "Send failed" });
    } catch (err) {
      setSignResult({ ok: false, msg: String(err) });
    } finally {
      setSignLoading(false);
    }
  }

  async function handleManage(contractId: string): Promise<void> {
    if (managingId === contractId) {
      setManagingId(null);
      return;
    }
    setManagingId(contractId);
    setManageLoading(contractId);
    setManageDetail(null);
    setManageError(null);
    try {
      const result = await callGatewayTool("contracts.get_contract", { contract_id: contractId });
      if (result.payload.success && result.payload.data) {
        const d = result.payload.data;
        const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
        setManageDetail((upstream ?? d) as Record<string, unknown>);
      } else {
        setManageError(result.payload.error?.message ?? "Could not load contract");
      }
    } catch (err) {
      setManageError(String(err));
    } finally {
      setManageLoading(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Trade agreements</div>
          <h1 className="page-title">Supply contracts</h1>
          <p className="page-sub">Standing orders · Index-linked pricing · eSign · Auto-execution
            {lmePrice && <span style={{ marginLeft: 12, color: "var(--cyan)", fontWeight: 600 }}>LME Copper: {lmePrice}</span>}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm">+ New contract</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header"><span className="card-title">Active contracts</span></div>
        <div className="card-body">
          <table className="data-table">
            <thead><tr><th>ID</th><th>Type</th><th>Buyer</th><th>Material</th><th>Volume</th><th>Pricing</th><th>Next order</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {contracts.map((c)=>(
                <>
                  <tr key={c.id}>
                    <td style={{color:"var(--cyan)",fontWeight:600}}>{c.id}</td>
                    <td><span className="badge badge-muted">{c.type}</span></td>
                    <td>{c.buyer}</td><td>{c.material}</td><td>{c.qty}</td><td>{c.pricing}</td>
                    <td style={{color:"var(--amber)"}}>{c.next}</td>
                    <td><span className={`badge ${statusColor[c.status]}`}>{c.status}</span></td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={manageLoading === c.id}
                        onClick={() => handleManage(c.id)}
                      >
                        {manageLoading === c.id ? "…" : managingId === c.id ? "Close" : "Manage"}
                      </button>
                    </td>
                  </tr>
                  {managingId === c.id && (
                    <tr key={`${c.id}-detail`}>
                      <td colSpan={9} style={{ padding: "12px 16px", background: "rgba(46,232,245,.04)", borderTop: "1px solid rgba(46,232,245,.15)" }}>
                        {manageError && <div style={{ fontSize: 12, color: "var(--red)" }}>{manageError}</div>}
                        {manageDetail && (
                          <pre style={{ fontSize: 11, color: "var(--muted)", margin: 0, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>
                            {JSON.stringify(manageDetail, null, 2)}
                          </pre>
                        )}
                        {!manageError && !manageDetail && <span style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</span>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">CON-441 — Volume contract detail</span></div>
          <div className="card-body">
            {[
              ["Contract type",   "Volume"],
              ["Pricing model",   `LME copper + $125/mt premium${lmePrice ? ` (LME today: ${lmePrice})` : ""}`],
              ["Annual volume",   "240 mt committed"],
              ["Fulfilled",       "40 mt (16.7%)"],
              ["Next order date", "Apr 02, 2026"],
              ["eSign status",    "Completed ✅"],
              ["Auto-renew",      "Enabled (30-day notice)"],
              ["Breach clause",   "3% penalty per missed delivery"],
            ].map(([k,v])=>(
              <div key={k as string} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,.04)",fontSize:13}}>
                <span style={{color:"var(--muted)"}}>{k}</span>
                <span style={{fontWeight:600}}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop:14 }}>
              <div style={{fontSize:12,color:"var(--muted)",marginBottom:6}}>Volume fulfilled</div>
              <div className="progress-bar" style={{height:8}}>
                <div className="progress-fill" style={{width:"16.7%"}}/>
              </div>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>40 / 240 mt</div>
            </div>
          </div>
        </div>

        <div style={{ display:"grid", gap:14, alignContent:"start" }}>
          <div className="card">
            <div className="card-header"><span className="card-title">eSign + documents</span></div>
            <div className="card-body" style={{ display:"grid", gap:8 }}>
              {[["Supply contract CON-441","Completed ✅"],["Purchase agreement MTX-9415","Completed ✅"],["Credit agreement","Pending signature"]].map(([doc,status])=>(
                <div key={doc as string} className="condition-row">
                  <span style={{fontWeight:600,fontSize:13}}>{doc}</span>
                  <span style={{fontSize:12,color:"var(--muted)"}}>{status}</span>
                </div>
              ))}
              <button
                className="btn btn-primary btn-sm"
                style={{marginTop:6}}
                disabled={signLoading}
                onClick={handleRequestSignature}
              >
                {signLoading ? "Sending…" : "Request signature ➤"}
              </button>
              {signResult && (
                <div style={{ marginTop: 6, fontSize: 12, padding: "6px 10px", borderRadius: "var(--r-sm)",
                  background: signResult.ok ? "rgba(38,208,124,.1)" : "rgba(255,90,90,.1)",
                  color: signResult.ok ? "var(--green)" : "var(--red)" }}>
                  {signResult.ok ? "✓ " : "✗ "}{signResult.msg}
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">AI contract assistant</span></div>
            <div className="card-body">
              <div style={{padding:12,borderRadius:"var(--r-sm)",background:"rgba(46,232,245,.07)",border:"1px solid rgba(46,232,245,.2)",fontSize:13,marginBottom:12}}>
                {copilotReply
                  ? copilotReply
                  : `Next auto-order for CON-441 generates Apr 02. LME copper today: ${lmePrice ?? "$9,812/mt"} — order price would be ${lmePrice ? `${lmePrice.replace("/mt", "")} + $125` : "$9,937/mt"}. Within ceiling price ✓.`}
              </div>
              {["Preview Apr 02 order","Renegotiate premium","Check index price","Generate T5018"].map((a)=>(
                <button
                  key={a}
                  className="btn btn-ghost btn-sm"
                  style={{display:"block",width:"100%",textAlign:"left",marginBottom:6}}
                  disabled={copilotLoading === a}
                  onClick={() => handleCopilotChip(a)}
                >
                  {copilotLoading === a ? "Thinking…" : a}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
