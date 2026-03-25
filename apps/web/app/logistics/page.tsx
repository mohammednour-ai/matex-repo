"use client";
import { useState } from "react";
import { callGatewayTool } from "../harness-client";

export default function LogisticsPage() {
  const shipments = [
    {id:"SHP-9415",order:"MTX-9415",material:"Copper wire", carrier:"Day & Ross",  status:"in_transit",  pickup:"Mar 18",delivery:"Mar 20",tracking:"DR-28441-ON",weight:"18,395 kg",co2:"124 kg"},
    {id:"SHP-9402",order:"MTX-9402",material:"Aluminum",    carrier:"Manitoulin",  status:"picked_up",   pickup:"Mar 17",delivery:"Mar 19",tracking:"MAN-77231",  weight:"50,280 kg",co2:"340 kg"},
    {id:"SHP-9389",order:"MTX-9389",material:"Steel bales", carrier:"Day & Ross",  status:"delivered",   pickup:"Mar 14",delivery:"Mar 16",tracking:"DR-28110-ON",weight:"120,440 kg",co2:"810 kg"},
  ];
  const statusColor: Record<string,string> = { in_transit:"badge-cyan", picked_up:"badge-amber", delivered:"badge-green" };

  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotes, setQuotes] = useState<Array<{carrier:string;price:string;eta:string;rating:string;selected:boolean}> | null>(null);
  const [quotesError, setQuotesError] = useState<string | null>(null);

  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState<string | null>(null);
  const [trackingResult, setTrackingResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [bookLoading, setBookLoading] = useState(false);
  const [bookResult, setBookResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const defaultQuotes = [
    {carrier:"Day & Ross",      price:"$1,190",eta:"2 days",rating:"4.8",selected:true},
    {carrier:"Manitoulin",      price:"$1,240",eta:"2 days",rating:"4.9",selected:false},
    {carrier:"Purolator Freight",price:"$1,305",eta:"1 day", rating:"4.7",selected:false},
    {carrier:"Canada Cartage",  price:"$1,420",eta:"3 days",rating:"4.6",selected:false},
  ];

  async function handleGetQuotes(): Promise<void> {
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const result = await callGatewayTool("logistics.get_quotes", {
        origin: "Hamilton, ON",
        destination: "Montreal, QC",
        weight_kg: 18000,
        hazmat_class: "none",
      });
      if (result.payload.success && result.payload.data) {
        const d = result.payload.data;
        const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
        const raw = (upstream?.quotes ?? d?.quotes) as Array<Record<string,unknown>> | undefined;
        if (raw && raw.length > 0) {
          setQuotes(raw.map((q, i) => ({
            carrier: String(q.carrier_name ?? q.carrier ?? "Unknown"),
            price: String(q.price ?? q.total_price ?? "$—"),
            eta: String(q.eta ?? q.transit_days ?? "—"),
            rating: String(q.rating ?? "—"),
            selected: i === 0,
          })));
        } else {
          setQuotes(null);
          setQuotesError("No quotes returned — showing defaults");
        }
      } else {
        setQuotesError(result.payload.error?.message ?? "Quote request failed");
      }
    } catch (err) {
      setQuotesError(String(err));
    } finally {
      setQuotesLoading(false);
    }
  }

  async function handleTrack(shipmentId: string): Promise<void> {
    setTrackingId(shipmentId);
    setTrackingLoading(shipmentId);
    setTrackingResult(null);
    try {
      const result = await callGatewayTool("logistics.get_shipment", { shipment_id: shipmentId });
      if (result.payload.success) {
        const d = result.payload.data;
        const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
        const loc = upstream?.current_location ?? d?.current_location ?? "In transit";
        const eta = upstream?.eta ?? d?.eta ?? "—";
        setTrackingResult({ ok: true, msg: `Location: ${loc} · ETA: ${eta}` });
      } else {
        setTrackingResult({ ok: false, msg: result.payload.error?.message ?? "Tracking failed" });
      }
    } catch (err) {
      setTrackingResult({ ok: false, msg: String(err) });
    } finally {
      setTrackingLoading(null);
    }
  }

  async function handleBookShipment(): Promise<void> {
    setBookLoading(true);
    setBookResult(null);
    try {
      const result = await callGatewayTool("logistics.book_shipment", {
        origin: "Hamilton, ON",
        destination: "Montreal, QC",
        weight_kg: 18000,
        carrier: "Day & Ross",
      });
      setBookResult(result.payload.success
        ? { ok: true, msg: "Shipment booked — BOL generated" }
        : { ok: false, msg: result.payload.error?.message ?? "Booking failed" });
    } catch (err) {
      setBookResult({ ok: false, msg: String(err) });
    } finally {
      setBookLoading(false);
    }
  }

  const displayQuotes = quotes ?? defaultQuotes;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Operations</div>
          <h1 className="page-title">Logistics</h1>
          <p className="page-sub">Multi-carrier quotes · BOL generation · GPS tracking · CO₂ reporting</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={handleGetQuotes} disabled={quotesLoading}>
            {quotesLoading ? "Fetching…" : "Get quotes"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleBookShipment} disabled={bookLoading}>
            {bookLoading ? "Booking…" : "Book shipment"}
          </button>
        </div>
      </div>

      {bookResult && (
        <div style={{ marginBottom: 12, fontSize: 13, padding: "8px 14px", borderRadius: "var(--r-sm)",
          background: bookResult.ok ? "rgba(38,208,124,.1)" : "rgba(255,90,90,.1)",
          border: `1px solid ${bookResult.ok ? "rgba(38,208,124,.3)" : "rgba(255,90,90,.3)"}`,
          color: bookResult.ok ? "var(--green)" : "var(--red)" }}>
          {bookResult.ok ? "✓ " : "✗ "}{bookResult.msg}
        </div>
      )}

      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header"><span className="card-title">Active shipments</span></div>
        <div className="card-body">
          <table className="data-table">
            <thead><tr><th>Shipment</th><th>Order</th><th>Material</th><th>Carrier</th><th>Weight</th><th>CO₂</th><th>Pickup</th><th>ETA</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {shipments.map((s)=>(
                <>
                  <tr key={s.id}>
                    <td style={{color:"var(--cyan)",fontWeight:600}}>{s.id}</td>
                    <td>{s.order}</td><td>{s.material}</td><td>{s.carrier}</td>
                    <td>{s.weight}</td>
                    <td>
                      <span style={{color:"var(--teal)"}}>{s.co2}</span>
                      <div style={{fontSize:10,color:"var(--muted)"}}>~{Math.round(parseFloat(s.co2) * 3.2)}kg virgin equiv.</div>
                    </td>
                    <td>{s.pickup}</td><td>{s.delivery}</td>
                    <td><span className={`badge ${statusColor[s.status]}`}>{s.status.replace("_"," ")}</span></td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={trackingLoading === s.id}
                        onClick={() => handleTrack(s.id)}
                      >
                        {trackingLoading === s.id ? "…" : "Track"}
                      </button>
                    </td>
                  </tr>
                  {trackingId === s.id && trackingResult && (
                    <tr key={`${s.id}-track`}>
                      <td colSpan={10} style={{ padding: "8px 16px", fontSize: 12,
                        background: trackingResult.ok ? "rgba(46,232,245,.04)" : "rgba(255,90,90,.04)",
                        color: trackingResult.ok ? "var(--cyan)" : "var(--red)" }}>
                        {trackingResult.ok ? "📍 " : "✗ "}{trackingResult.msg}
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
            <button
              className="btn btn-primary"
              style={{marginTop:14,width:"100%"}}
              disabled={quotesLoading}
              onClick={handleGetQuotes}
            >
              {quotesLoading ? "Fetching quotes…" : "Get quotes from all carriers ➤"}
            </button>
            {quotesError && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--amber)" }}>{quotesError}</div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Carrier quote matrix</span>
            {quotes && <span className="badge badge-green" style={{ fontSize: 11 }}>Live</span>}
          </div>
          <div className="card-body" style={{ display:"grid", gap:8 }}>
            {displayQuotes.map((q)=>(
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
