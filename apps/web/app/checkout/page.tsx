"use client";

import { useState } from "react";
import { addTrackedId, callGatewayTool, formatResult, readTrackedIds, requiredMessage } from "../harness-client";
import { CopyChip, StatusBanner, ValidationSummary } from "../harness-ui";

export default function CheckoutPage() {
  const ids = readTrackedIds();
  const [userId, setUserId] = useState(ids.userIds[0] ?? "");
  const [amount, setAmount] = useState("22495");
  const [orderId, setOrderId] = useState(`ORD-${Date.now()}`);
  const [method, setMethod] = useState("stripe_card");
  const [transactionId, setTransactionId] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [validation, setValidation] = useState<string | null>(null);
  const [output, setOutput] = useState("No action yet.");

  async function onPay() {
    const missing = requiredMessage([
      ["user_id", userId],
      ["amount", amount],
      ["order_id", orderId],
    ]);
    setValidation(missing);
    if (missing) return;
    const result = await callGatewayTool("payments.process_payment", {
      user_id: userId,
      amount: Number(amount),
      order_id: orderId,
      method,
    });
    setOutput(formatResult("payments.process_payment", result));
    if (result.payload.success) {
      const id = String((((result.payload.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)?.transaction as Record<string, unknown> | undefined)?.transaction_id ?? "");
      setTransactionId(id);
      addTrackedId("transactionIds", id);
      setStatus("success");
    } else setStatus("error");
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Guided UI test</div>
          <h1 className="page-title">Checkout flow</h1>
          <p className="page-sub">Process a payment and capture a copyable transaction ID.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <StatusBanner tone={status} text={status === "success" ? "Payment succeeded." : status === "error" ? "Payment failed." : "Waiting for action."} />
          <ValidationSummary message={validation} />
          <div className="field-row"><div className="field-label">User ID</div><input className="field-input" value={userId} onChange={(e) => setUserId(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Amount</div><input className="field-input" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Order ID</div><input className="field-input" value={orderId} onChange={(e) => setOrderId(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Method</div><input className="field-input" value={method} onChange={(e) => setMethod(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="btn btn-primary" type="button" onClick={onPay}>Process payment</button>
            {transactionId ? <CopyChip label="transaction_id" value={transactionId} /> : null}
          </div>
          <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{output}</pre>
        </div>
      </div>
    </div>
  );
}
