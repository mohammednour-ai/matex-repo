import { HarnessBanner } from "../components/HarnessBanner";

export default function LogisticsPage() {
  const shipments = [
    {id:"SHP-9415",order:"MTX-9415",material:"Copper wire", carrier:"Day & Ross",  status:"in_transit",  pickup:"Mar 18",delivery:"Mar 20",tracking:"DR-28441-ON",weight:"18,395 kg",co2:"124 kg"},
    {id:"SHP-9402",order:"MTX-9402",material:"Aluminum",    carrier:"Manitoulin",  status:"picked_up",   pickup:"Mar 17",delivery:"Mar 19",tracking:"MAN-77231",  weight:"50,280 kg",co2:"340 kg"},
    {id:"SHP-9389",order:"MTX-9389",material:"Steel bales", carrier:"Day & Ross",  status:"delivered",   pickup:"Mar 14",delivery:"Mar 16",tracking:"DR-28110-ON",weight:"120,440 kg",co2:"810 kg"},
  ];
  const statusColor: Record<string,string> = { in_transit:"badge-cyan", picked_up:"badge-amber", delivered:"badge-green" };
  return (
    <div>
      <HarnessBanner href="/phase3" label="Test logistics flow on Phase 3" />
      <div className="page-header">
        <div>
          <div className="eyebrow">Operations</div>
          <h1 className="page-title">Logistics</h1>
          <p className="page-sub">Multi-carrier quotes · BOL generation · GPS tracking · CO₂ reporting</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm">Get quotes</button>
          <button className="btn btn-primary btn-sm">Book shipment</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header"><span className="card-title">Active shipments</span></div>
        <div className="card-body">
          <table className="data-table">
            <thead><tr><th>Shipment</th><th>Order</th><th>Material</th><th>Carrier</th><th>Weight</th><th>CO₂</th><th>Pickup</th><th>ETA</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {shipments.map((s)=>(
                <tr key={s.id}>
                  <td style={{color:"var(--cyan)",fontWeight:600}}>{s.id}</td>
                  <td>{s.order}</td><td>{s.material}</td><td>{s.carrier}</td>
                  <td>{s.weight}</td>
                  <td style={{color:"var(--teal)"}}>{s.co2}</td>
                  <td>{s.pickup}</td><td>{s.delivery}</td>
                  <td><span className={`badge ${statusColor[s.status]}`}>{s.status.replace("_"," ")}</span></td>
                  <td><button className="btn btn-ghost btn-sm">Track</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Quote a new shipment</span></div>
          <div className="card-body">
            <div className="two-col">
              {[["From","Hamilton, ON"],["To","Montreal, QC"],["Weight (kg)","18,000"],["Hazmat class","None"]].map(([l,v])=>(
                <div key={l as string} className="field-row" style={{marginBottom:0}}>
                  <div className="field-label">{l}</div>
                  <input className="field-input" defaultValue={v as string} readOnly />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{marginTop:14,width:"100%"}}>Get quotes from all carriers ➤</button>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Carrier quote matrix</span></div>
          <div className="card-body" style={{ display:"grid", gap:8 }}>
            {[
              {carrier:"Day & Ross",      price:"$1,190",eta:"2 days",rating:"4.8",selected:true},
              {carrier:"Manitoulin",      price:"$1,240",eta:"2 days",rating:"4.9",selected:false},
              {carrier:"Purolator Freight",price:"$1,305",eta:"1 day", rating:"4.7",selected:false},
              {carrier:"Canada Cartage",  price:"$1,420",eta:"3 days",rating:"4.6",selected:false},
            ].map((q)=>(
              <div key={q.carrier} style={{
                display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"12px 14px",borderRadius:"var(--r-sm)",
                border:`1px solid ${q.selected?"rgba(46,232,245,.3)":"rgba(255,255,255,.07)"}`,
                background:q.selected?"rgba(46,232,245,.06)":"rgba(255,255,255,.02)"
              }}>
                <div>
                  <div style={{fontWeight:600}}>{q.carrier}</div>
                  <div style={{fontSize:12,color:"var(--muted)"}}>★ {q.rating} · {q.eta}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontWeight:800,color:"var(--cyan)",fontSize:17}}>{q.price}</span>
                  {q.selected&&<span className="badge badge-green" style={{fontSize:11}}>Selected</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
