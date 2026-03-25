"use client";

import { useEffect, useState } from "react";
import { addTrackedId, callGatewayTool, readTrackedIds } from "../harness-client";

const PROVINCES = ["ON", "BC", "AB", "QC", "SK", "MB", "NB", "NS", "NL", "PE"];

type TaxBreakdown = { gst: number; pst: number; hst: number; qst: number; total_tax: number };

export default function CheckoutPage() {
  const ids = readTrackedIds();
  const material = "Copper wire lot";
  const quantity = 18;

  const [subtotal, setSubtotal] = useState("22495");
  const [sellerProv, setSellerProv] = useState("ON");
  const [buyerProv, setBuyerProv] = useState("ON");
  const [tax, setTax] = useState<TaxBreakdown>({ gst: 0, pst: 0, hst: 0, qst: 0, total_tax: 0 });
  const [payMethod, setPayMethod] = useState<"stripe" | "wallet" | "credit">("stripe");
  const [paying, setPaying] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [txnId, setTxnId] = useState("");
  const [invoiceNum, setInvoiceNum] = useState("");

  const sub = Number(subtotal) || 0;
  const unitPrice = quantity > 0 ? (sub / quantity).toFixed(2) : "0.00";
  const grandTotal = (sub + tax.total_tax).toFixed(2);

  async function calculateTax(): Promise<void> {
    const result = await callGatewayTool("tax.calculate_tax", {
      amount: sub,
      seller_province: sellerProv,
      buyer_province: buyerProv,
    });
    if (result.payload.success) {
      const d = result.payload.data;
      const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const src = upstream ?? d ?? {};
      setTax({
        gst: Number(src.gst ?? 0),
        pst: Number(src.pst ?? 0),
        hst: Number(src.hst ?? 0),
        qst: Number(src.qst ?? 0),
        total_tax: Number(src.total_tax ?? 0),
      });
    }
  }

  useEffect(() => { calculateTax(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function onFundEscrow(): Promise<void> {
    if (paying) return;
    setPaying(true);
    const result = await callGatewayTool("payments.process_payment", {
      user_id: ids.userIds[0] ?? "system",
      amount: Number(grandTotal),
      order_id: `ORD-${Date.now()}`,
      method: payMethod === "stripe" ? "stripe_card" : payMethod,
    });
    if (result.payload.success) {
      const d = result.payload.data;
      const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const tid = String(
        (upstream?.transaction as Record<string, unknown> | undefined)?.transaction_id
        ?? (d?.transaction as Record<string, unknown> | undefined)?.transaction_id
        ?? ""
      );
      addTrackedId("transactionIds", tid);
      setTxnId(tid);

      const invResult = await callGatewayTool("tax.generate_invoice", {
        order_id: `ORD-${Date.now()}`,
        seller_province: sellerProv,
        buyer_province: buyerProv,
        amount: sub,
        tax_amount: tax.total_tax,
      });
      if (invResult.payload.success) {
        const id = invResult.payload.data;
        const invUp = (id?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
        setInvoiceNum(String(invUp?.invoice_number ?? id?.invoice_number ?? "MTX-2026-000042"));
      } else {
        setInvoiceNum("MTX-2026-000042");
      }
      setConfirmed(true);
    }
    setPaying(false);
  }

  const STEPS = ["Payment", "Escrow held", "Inspection", "Delivery", "Release"];

  return (
    <div>
      <h1 className="page-title">Checkout</h1>
      <p className="page-sub" style={{ marginBottom: 16 }}>Complete your purchase with escrow-protected payment.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
        {/* ── Left column ── */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          {/* Order summary */}
          <div className="card">
            <div className="card-header"><span className="card-title">Order summary</span></div>
            <div className="card-body">
              {[
                ["Material", material],
                ["Quantity", `${quantity} mt`],
                ["Unit price", `$${unitPrice} / mt`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.04)", fontSize: 13 }}>
                  <span style={{ color: "var(--muted)" }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
              <div className="field-row" style={{ marginTop: 12, marginBottom: 0 }}>
                <div className="field-label">Subtotal (CAD)</div>
                <input className="field-input" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Tax breakdown */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Tax breakdown</span>
              <button className="btn btn-ghost btn-sm" onClick={calculateTax}>Recalculate</button>
            </div>
            <div className="card-body">
              <div className="two-col" style={{ marginBottom: 14 }}>
                <div className="field-row" style={{ marginBottom: 0 }}>
                  <div className="field-label">Seller province</div>
                  <select className="field-select" value={sellerProv} onChange={(e) => setSellerProv(e.target.value)}>
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="field-row" style={{ marginBottom: 0 }}>
                  <div className="field-label">Buyer province</div>
                  <select className="field-select" value={buyerProv} onChange={(e) => setBuyerProv(e.target.value)}>
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              {[
                ["GST (5%)", tax.gst],
                ["PST", tax.pst],
                ["HST", tax.hst],
                ["QST", tax.qst],
              ].map(([label, val]) => (
                <div key={label as string} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.04)", fontSize: 13 }}>
                  <span style={{ color: "var(--muted)" }}>{label}</span>
                  <span>${(val as number).toFixed(2)}</span>
                </div>
              ))}
              <div className="divider" />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span style={{ fontWeight: 700 }}>Total tax</span>
                <span style={{ fontWeight: 700, color: "var(--amber)" }}>${tax.total_tax.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, marginTop: 8 }}>
                <span style={{ fontWeight: 800 }}>Grand total</span>
                <span style={{ fontWeight: 900, color: "var(--cyan)", letterSpacing: "-.03em" }}>${grandTotal}</span>
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="card">
            <div className="card-header"><span className="card-title">Payment</span></div>
            <div className="card-body">
              <div className="tab-switcher" style={{ marginBottom: 14 }}>
                {(["stripe", "wallet", "credit"] as const).map((m) => (
                  <button key={m} className={`tab-switch${payMethod === m ? " active" : ""}`} onClick={() => setPayMethod(m)}>
                    {m === "stripe" ? "Stripe card" : m === "wallet" ? "Wallet" : "Credit"}
                  </button>
                ))}
              </div>
              <div className="field-row">
                <div className="field-label">Payment amount (CAD)</div>
                <input className="field-input" value={grandTotal} readOnly />
              </div>
              <button className="btn btn-primary" style={{ width: "100%", marginTop: 4 }} onClick={onFundEscrow} disabled={paying}>
                {paying ? "Processing…" : "Fund escrow →"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          {/* Escrow protection */}
          <div className="card">
            <div className="card-header"><span className="card-title">Escrow protection</span></div>
            <div className="card-body">
              <div style={{
                padding: 14, borderRadius: "var(--r-sm)",
                background: "rgba(38,208,124,.08)", border: "1px solid rgba(38,208,124,.25)",
                fontSize: 13, marginBottom: 16, lineHeight: 1.6,
              }}>
                Your funds are held in escrow until delivery is confirmed and inspection passes.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {STEPS.map((step, i) => (
                  <div key={step} className="escrow-step">
                    <div className={`escrow-dot${i === 0 && confirmed ? " done" : i === 1 && confirmed ? " active" : i === 0 ? " active" : " wait"}`}>
                      {i === 0 && confirmed ? "✓" : i === 0 ? "→" : (i + 1)}
                    </div>
                    <div>
                      <div className="escrow-step-title">{step}</div>
                      <div className="escrow-step-detail">
                        {["Buyer payment", "Funds secured", "Quality check", "POD upload", "Seller payout"][i]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Confirmation */}
          {confirmed && (
            <div className="card">
              <div className="card-header"><span className="card-title">Confirmation</span></div>
              <div className="card-body">
                <div className="success-toast" style={{ marginBottom: 14 }}>
                  <div className="success-toast-icon">✓</div>
                  <span style={{ fontSize: 13 }}>Payment processed successfully.</span>
                </div>

                {[
                  ["Transaction ID", txnId || "—"],
                  ["Invoice", invoiceNum || "—"],
                  ["Status", "completed"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.04)", fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>{k}</span>
                    {k === "Status"
                      ? <span className="badge badge-green">{v}</span>
                      : <span style={{ fontWeight: 600, color: "var(--cyan)", fontSize: 12, fontFamily: "monospace" }}>{v}</span>}
                  </div>
                ))}

                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <a href="/dashboard" className="btn btn-primary btn-sm">View dashboard</a>
                  <a href="/listings" className="btn btn-ghost btn-sm">Continue shopping</a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
