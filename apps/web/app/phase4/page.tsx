"use client";

import { useState } from "react";
import { addTrackedId, callGatewayTool, formatResult, readTrackedIds, requiredMessage } from "../harness-client";
import { CopyChip, StatusBanner, ValidationSummary } from "../harness-ui";

export default function Phase4Page() {
  const tracked = readTrackedIds();
  const [userId, setUserId] = useState(tracked.userIds[0] ?? "");
  const [alertId, setAlertId] = useState("");
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

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Phase 4 intelligence</div>
          <h1 className="page-title">Analytics, pricing, credit, admin</h1>
          <p className="page-sub">Platform intelligence and administrative control surface.</p>
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
        <div className="card-header"><span className="card-title">Analytics</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={() => run("analytics.get_dashboard_stats", {}, "analytics.get_dashboard_stats")}>Dashboard stats</button>
            <button className="btn btn-ghost" type="button" onClick={() => run("analytics.get_revenue_report", { period: "30d" }, "analytics.get_revenue_report")}>Revenue report (30d)</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">Pricing + market data</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={() => run("pricing.capture_market_price", { material: "copper", index_source: "lme", price: 9812, currency: "USD", unit: "mt" }, "pricing.capture_market_price")}>Capture LME copper</button>
            <button className="btn btn-ghost" type="button" onClick={() => run("pricing.get_market_prices", { material: "copper" }, "pricing.get_market_prices")}>Get copper prices</button>
            <button className="btn btn-ghost" type="button" onClick={async () => {
              const missing = requiredMessage([["user_id", userId]]);
              setValidation(missing);
              if (missing) return;
              const r = await run("pricing.create_price_alert", { user_id: userId, material: "copper", index_source: "lme", condition: "above", threshold: 10000 }, "pricing.create_price_alert");
              if (r.payload.success) setAlertId(extract(r, "alert_id"));
            }}>Create price alert</button>
            {alertId ? <CopyChip label="alert_id" value={alertId} /> : null}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">Credit facilities</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={async () => {
              const missing = requiredMessage([["user_id", userId]]);
              setValidation(missing);
              if (missing) return;
              await run("credit.assess_credit", { user_id: userId, score: 720, factors: { payment_history: 0.92, volume: 0.78, pis: 0.88, account_age: 0.65, external: 0.70 } }, "credit.assess_credit");
            }}>Assess credit (score 720)</button>
            <button className="btn btn-ghost" type="button" onClick={async () => {
              const missing = requiredMessage([["user_id", userId]]);
              setValidation(missing);
              if (missing) return;
              await run("credit.get_credit_facility", { user_id: userId }, "credit.get_credit_facility");
            }}>Get facility</button>
            <button className="btn btn-ghost" type="button" onClick={async () => {
              const missing = requiredMessage([["user_id", userId]]);
              setValidation(missing);
              if (missing) return;
              await run("credit.freeze_facility", { user_id: userId }, "credit.freeze_facility");
            }}>Freeze facility</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">Admin controls</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={() => run("admin.get_platform_overview", {}, "admin.get_platform_overview")}>Platform overview</button>
            <button className="btn btn-ghost" type="button" onClick={async () => {
              const missing = requiredMessage([["user_id", userId]]);
              setValidation(missing);
              if (missing) return;
              await run("admin.suspend_user", { user_id: userId, reason: "Test suspension from harness" }, "admin.suspend_user");
            }}>Suspend user</button>
            <button className="btn btn-ghost" type="button" onClick={async () => {
              const missing = requiredMessage([["user_id", userId]]);
              setValidation(missing);
              if (missing) return;
              await run("admin.unsuspend_user", { user_id: userId }, "admin.unsuspend_user");
            }}>Unsuspend user</button>
          </div>
        </div>
      </div>

      <pre style={{ whiteSpace: "pre-wrap" }}>{output}</pre>
    </div>
  );
}
