import { HarnessBanner } from "../components/HarnessBanner";

export default function BookingPage() {
  const bookings = [
    {id:"BKG-441",type:"Pickup inspection",  date:"Tue Mar 18",time:"09:30",location:"Hamilton, ON",  status:"confirmed",linked:"MTX-9415"},
    {id:"BKG-438",type:"Buyer site visit",   date:"Wed Mar 19",time:"14:00",location:"Toronto, ON",   status:"confirmed",linked:"MTX-9402"},
    {id:"BKG-435",type:"Carrier pickup",     date:"Thu Mar 20",time:"14:00",location:"Hamilton, ON",  status:"pending",  linked:"MTX-9415"},
    {id:"BKG-430",type:"Delivery inspection",date:"Fri Mar 21",time:"11:00",location:"Montreal, QC", status:"pending",  linked:"MTX-9415"},
  ];
  const weights = [
    {point:"W1 Seller",    kg:"18,420",cert:true, detail:"Seller scale ticket uploaded"},
    {point:"W2 Carrier",   kg:"18,395",cert:true, detail:"CAW certified scale #ON-2241"},
    {point:"W3 Buyer",     kg:"18,380",cert:false,detail:"Receiving scale — not certified"},
    {point:"W4 Third party",kg:"—",    cert:false,detail:"Pending — only on dispute"},
  ];
  const statusColor: Record<string,string> = {confirmed:"badge-green",pending:"badge-amber"};
  return (
    <div>
      <HarnessBanner href="/phase2" label="Test booking flow on Phase 2" />
      <div className="page-header">
        <div>
          <div className="eyebrow">Scheduling</div>
          <h1 className="page-title">Booking + Inspection</h1>
          <p className="page-sub">Site visits · Inspections · Pickups · Weight verification chain</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm">+ New booking</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 380px", gap:16 }}>
        <div style={{ display:"grid", gap:14 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Scheduled events</span></div>
            <div className="card-body">
              <table className="data-table">
                <thead><tr><th>ID</th><th>Type</th><th>Date</th><th>Time</th><th>Location</th><th>Order</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {bookings.map((b)=>(
                    <tr key={b.id}>
                      <td style={{color:"var(--cyan)",fontWeight:600}}>{b.id}</td>
                      <td style={{fontWeight:600}}>{b.type}</td>
                      <td>{b.date}</td><td>{b.time}</td><td>{b.location}</td>
                      <td><span className="badge badge-muted" style={{fontSize:11}}>{b.linked}</span></td>
                      <td><span className={`badge ${statusColor[b.status]}`}>{b.status}</span></td>
                      <td><button className="btn btn-ghost btn-sm">Manage</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Weight certification chain — MTX-9415</span></div>
            <div className="card-body">
              <div style={{ fontSize:12, color:"var(--muted)", marginBottom:14 }}>
                Authority order: W4 Third-party &gt; W3 Buyer &gt; W2 Carrier &gt; W1 Seller. Certified third-party re-weigh is binding in disputes.
              </div>
              {weights.map((w,i)=>(
                <div key={w.point} style={{
                  display:"grid",gridTemplateColumns:"auto 1fr auto",gap:14,alignItems:"center",
                  padding:"14px 0",borderBottom: i<weights.length-1?"1px solid rgba(255,255,255,.05)":"none"
                }}>
                  <div style={{
                    width:36,height:36,borderRadius:"999px",flexShrink:0,
                    display:"grid",placeItems:"center",fontWeight:700,fontSize:12,
                    background:w.cert?"rgba(38,208,124,.15)":"rgba(255,255,255,.04)",
                    border:`2px solid ${w.cert?"var(--green)":"var(--border)"}`,
                    color:w.cert?"var(--green)":"var(--muted)"
                  }}>W{i+1}</div>
                  <div>
                    <div style={{fontWeight:600}}>{w.point}</div>
                    <div style={{fontSize:12,color:"var(--muted)"}}>{w.detail}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:800,color:"var(--cyan)",fontSize:18}}>{w.kg} kg</div>
                    {w.cert&&<span className="badge badge-green" style={{fontSize:11}}>CAW certified</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display:"grid", gap:14, alignContent:"start" }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Quick book</span></div>
            <div className="card-body">
              {[["Event type","Pickup inspection"],["Date","Mar 18, 2026"],["Time","09:30"],["Location","Hamilton, ON"]].map(([l,v])=>(
                <div key={l as string} className="field-row">
                  <div className="field-label">{l}</div>
                  <input className="field-input" defaultValue={v as string} readOnly />
                </div>
              ))}
              <button className="btn btn-primary" style={{width:"100%"}}>Create booking ➤</button>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">Reminders sent</span></div>
            <div className="card-body" style={{ display:"grid", gap:8 }}>
              {[["24h before","✅ Sent — Mar 17 09:30"],["2h before","⏳ Scheduled — Mar 18 07:30"],["30min before","⏳ Scheduled — Mar 18 09:00"]].map(([l,v])=>(
                <div key={l as string} className="condition-row">
                  <span style={{fontSize:13}}>{l}</span>
                  <span style={{fontSize:12,color:"var(--muted)"}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
