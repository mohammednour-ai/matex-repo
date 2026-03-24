import { HarnessBanner } from "../components/HarnessBanner";

export default function ContractsPage() {
  const contracts = [
    {id:"CON-441",type:"Volume",    buyer:"NorthLoop Metals",  material:"Copper wire", qty:"240 mt/yr", pricing:"LME + $125",  status:"active",  next:"Apr 02"},
    {id:"CON-438",type:"Standing",  buyer:"Apex Metals",       material:"Aluminum",    qty:"50 mt/mo",  pricing:"Fixed $2,300/mt",status:"active",  next:"Apr 01"},
    {id:"CON-421",type:"Index-linked",buyer:"BlueSky Recyclers",material:"Steel scrap",qty:"500 mt/yr",pricing:"LME ± $10",   status:"pending", next:"—"},
  ];
  const statusColor: Record<string,string> = {active:"badge-green",pending:"badge-amber"};
  return (
    <div>
      <HarnessBanner href="/phase3" label="Test contracts flow on Phase 3" />
      <div className="page-header">
        <div>
          <div className="eyebrow">Trade agreements</div>
          <h1 className="page-title">Supply contracts</h1>
          <p className="page-sub">Standing orders · Index-linked pricing · eSign · Auto-execution</p>
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
                <tr key={c.id}>
                  <td style={{color:"var(--cyan)",fontWeight:600}}>{c.id}</td>
                  <td><span className="badge badge-muted">{c.type}</span></td>
                  <td>{c.buyer}</td><td>{c.material}</td><td>{c.qty}</td><td>{c.pricing}</td>
                  <td style={{color:"var(--amber)"}}>{c.next}</td>
                  <td><span className={`badge ${statusColor[c.status]}`}>{c.status}</span></td>
                  <td><button className="btn btn-ghost btn-sm">Manage</button></td>
                </tr>
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
              ["Pricing model",   "LME copper + $125/mt premium"],
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
              <button className="btn btn-primary btn-sm" style={{marginTop:6}}>Request signature ➤</button>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">AI contract assistant</span></div>
            <div className="card-body">
              <div style={{padding:12,borderRadius:"var(--r-sm)",background:"rgba(46,232,245,.07)",border:"1px solid rgba(46,232,245,.2)",fontSize:13,marginBottom:12}}>
                Next auto-order for CON-441 generates Apr 02. LME copper today: $9,812/mt — order price would be $9,937/mt. Within ceiling price ✓.
              </div>
              {["Preview Apr 02 order","Renegotiate premium","Check index price","Generate T5018"].map((a)=>(
                <button key={a} className="btn btn-ghost btn-sm" style={{display:"block",width:"100%",textAlign:"left",marginBottom:6}}>{a}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
