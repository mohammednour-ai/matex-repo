"use client";

import { useState } from "react";
import { addTrackedId, callGatewayTool, formatResult, readTrackedIds, requiredMessage } from "../harness-client";
import { CopyChip, StatusBanner, ValidationSummary } from "../harness-ui";

export default function Phase3Page() {
  const tracked = readTrackedIds();
  const [userId, setUserId] = useState(tracked.userIds[0] ?? "");
  const [shipmentId, setShipmentId] = useState("");
  const [contractId, setContractId] = useState("");
  const [disputeId, setDisputeId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notificationId, setNotificationId] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [validation, setValidation] = useState<string | null>(null);
  const [output, setOutput] = useState("No action yet.");

  function extract(result: { payload: { success: boolean; data?: Record<string, unknown> } }, key: string): string {
    const upstream = (result.payload.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
    return String((upstream?.[key] as string | undefined) ?? (result.payload.data?.[key] as string | undefined) ?? "");
  }

  async function run(tool: string, args: Record<string, unknown>, title: string) {
    const result = await callGatewayTool(tool, args);
    setOutput(formatResult(title, result));
    setStatus(result.payload.success ? "success" : "error");
    return result;
  }

  async function getQuotes() {
    await run("logistics.get_quotes", { order_id: crypto.randomUUID() }, "logistics.get_quotes");
  }

  async function bookShipment() {
    const result = await run("logistics.book_shipment", {
      order_id: crypto.randomUUID(),
      carrier_name: "Day & Ross",
      weight_kg: 18000,
      origin: { city: "Hamilton", province: "ON" },
      destination: { city: "Toronto", province: "ON" },
    }, "logistics.book_shipment");
    if (result.payload.success) {
      const id = extract(result, "shipment_id");
      setShipmentId(id);
    }
  }

  async function updateTracking() {
    const missing = requiredMessage([["shipment_id", shipmentId]]);
    setValidation(missing);
    if (missing) return;
    await run("logistics.update_tracking", { shipment_id: shipmentId, status: "in_transit" }, "logistics.update_tracking");
  }

  async function createContract() {
    const missing = requiredMessage([["user_id", userId]]);
    setValidation(missing);
    if (missing) return;
    const result = await run("contracts.create_contract", {
      buyer_id: userId, seller_id: userId,
      contract_type: "volume", total_volume: 240, unit: "mt",
      pricing_model: { type: "index_linked", base: "LME", premium: 125 },
      quality_specs: { grade: "ISRI Tense", contamination_max: 0.5 },
    }, "contracts.create_contract");
    if (result.payload.success) {
      const id = extract(result, "contract_id");
      setContractId(id);
    }
  }

  async function activateContract() {
    const missing = requiredMessage([["contract_id", contractId]]);
    setValidation(missing);
    if (missing) return;
    await run("contracts.activate_contract", { contract_id: contractId }, "contracts.activate_contract");
  }

  async function fileDispute() {
    const missing = requiredMessage([["user_id", userId]]);
    setValidation(missing);
    if (missing) return;
    const result = await run("dispute.file_dispute", {
      order_id: crypto.randomUUID(),
      filing_party_id: userId, responding_party_id: userId,
      category: "quality", description: "Weight mismatch exceeds 5% tolerance",
    }, "dispute.file_dispute");
    if (result.payload.success) {
      const id = extract(result, "dispute_id");
      setDisputeId(id);
    }
  }

  async function escalateDispute() {
    const missing = requiredMessage([["dispute_id", disputeId]]);
    setValidation(missing);
    if (missing) return;
    await run("dispute.escalate_dispute", { dispute_id: disputeId, next_tier: "tier_2_mediation" }, "dispute.escalate_dispute");
  }

  async function resolveDispute() {
    const missing = requiredMessage([["dispute_id", disputeId]]);
    setValidation(missing);
    if (missing) return;
    await run("dispute.resolve_dispute", { dispute_id: disputeId, resolution_summary: "Partial refund agreed" }, "dispute.resolve_dispute");
  }

  async function calculateTax() {
    const result = await run("tax.calculate_tax", {
      seller_province: "ON", buyer_province: "ON", subtotal: 22495,
    }, "tax.calculate_tax");
    setStatus(result.payload.success ? "success" : "error");
  }

  async function generateInvoice() {
    const missing = requiredMessage([["user_id", userId]]);
    setValidation(missing);
    if (missing) return;
    const result = await run("tax.generate_invoice", {
      order_id: crypto.randomUUID(),
      buyer_id: userId, seller_id: userId,
      subtotal: 22495, seller_province: "ON", buyer_province: "ON",
    }, "tax.generate_invoice");
    if (result.payload.success) {
      const id = extract(result, "invoice_id");
      const num = extract(result, "invoice_number");
      setInvoiceId(id);
      setInvoiceNumber(num);
    }
  }

  async function sendNotification() {
    const missing = requiredMessage([["user_id", userId]]);
    setValidation(missing);
    if (missing) return;
    const result = await run("notifications.send_notification", {
      user_id: userId,
      type: "order.shipped",
      title: "Your order has shipped",
      body: "Copper wire lot is in transit via Day & Ross.",
      channels: ["in_app", "email"],
      priority: "normal",
    }, "notifications.send_notification");
    if (result.payload.success) {
      const id = extract(result, "notification_id");
      setNotificationId(id);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Phase 3 operations</div>
          <h1 className="page-title">Logistics, contracts, disputes, tax, notifications</h1>
          <p className="page-sub">Interactive operations workflow surface for the complete marketplace loop.</p>
        </div>
      </div>

      <StatusBanner tone={status} text={status === "success" ? "Last action succeeded." : status === "error" ? "Last action failed." : "Waiting for action."} />
      <ValidationSummary message={validation} />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">User context</span></div>
        <div className="card-body">
          <div className="field-row"><div className="field-label">User ID</div><input className="field-input" value={userId} onChange={(e) => setUserId(e.target.value)} /></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">Logistics</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={getQuotes}>Get carrier quotes</button>
            <button className="btn btn-ghost" type="button" onClick={bookShipment}>Book shipment</button>
            <button className="btn btn-ghost" type="button" onClick={updateTracking}>Update tracking</button>
            {shipmentId ? <CopyChip label="shipment_id" value={shipmentId} /> : null}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">Supply contracts</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={createContract}>Create contract</button>
            <button className="btn btn-ghost" type="button" onClick={activateContract}>Activate</button>
            {contractId ? <CopyChip label="contract_id" value={contractId} /> : null}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">Disputes</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={fileDispute}>File dispute</button>
            <button className="btn btn-ghost" type="button" onClick={escalateDispute}>Escalate</button>
            <button className="btn btn-ghost" type="button" onClick={resolveDispute}>Resolve</button>
            {disputeId ? <CopyChip label="dispute_id" value={disputeId} /> : null}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">Tax + invoicing</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={calculateTax}>Calculate tax (ON→ON)</button>
            <button className="btn btn-ghost" type="button" onClick={generateInvoice}>Generate invoice</button>
            {invoiceId ? <CopyChip label="invoice_id" value={invoiceId} /> : null}
            {invoiceNumber ? <CopyChip label="invoice_number" value={invoiceNumber} /> : null}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">Notifications</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={sendNotification}>Send notification</button>
            {notificationId ? <CopyChip label="notification_id" value={notificationId} /> : null}
          </div>
        </div>
      </div>

      <pre style={{ whiteSpace: "pre-wrap" }}>{output}</pre>
    </div>
  );
}
