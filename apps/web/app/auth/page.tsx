"use client";

import { useState } from "react";
import { addTrackedId, callGatewayTool, formatResult, requiredMessage } from "../harness-client";
import { CopyChip, StatusBanner, ValidationSummary } from "../harness-ui";

export default function AuthPage() {
  const [email, setEmail] = useState(`ui.test.${Date.now()}@matex.local`);
  const [phone, setPhone] = useState(`+1416${Math.floor(1000000 + Math.random() * 8999999)}`);
  const [password, setPassword] = useState("StrongPassw0rd!");
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [validation, setValidation] = useState<string | null>(null);
  const [output, setOutput] = useState("No action yet.");
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    const missing = requiredMessage([
      ["email", email],
      ["phone", phone],
      ["password", password],
    ]);
    setValidation(missing);
    if (missing) return;
    setLoading(true);
    const result = await callGatewayTool("auth.register", { email, phone, password, account_type: "individual" });
    setOutput(formatResult("auth.register", result));
    if (result.payload.success) {
      const nextUserId = String((((result.payload.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)?.user as Record<string, unknown> | undefined)?.user_id ?? "");
      if (nextUserId) {
        setUserId(nextUserId);
        addTrackedId("userIds", nextUserId);
      }
      setStatus("success");
    } else {
      setStatus("error");
    }
    setLoading(false);
  }

  async function onLogin() {
    const missing = requiredMessage([
      ["email", email],
      ["password", password],
    ]);
    setValidation(missing);
    if (missing) return;
    setLoading(true);
    const result = await callGatewayTool("auth.login", { email, password });
    setOutput(formatResult("auth.login", result));
    if (result.payload.success) {
      const upstream = (result.payload.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const token = String(((upstream?.tokens as Record<string, unknown> | undefined)?.access_token as string | undefined) ?? "");
      const nextUserId = String((upstream?.user_id as string | undefined) ?? "");
      if (token) localStorage.setItem("matex_token", token);
      if (nextUserId) {
        setUserId(nextUserId);
        addTrackedId("userIds", nextUserId);
      }
      setStatus("success");
    } else {
      setStatus("error");
    }
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Guided UI test</div>
          <h1 className="page-title">Auth flow</h1>
          <p className="page-sub">Register and login with validation, status feedback, and copyable IDs.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <StatusBanner tone={status} text={status === "idle" ? "Waiting for action." : status === "success" ? "Last action succeeded." : "Last action failed."} />
          <ValidationSummary message={validation} />
          <div className="field-row"><div className="field-label">Email</div><input className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Phone</div><input className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Password</div><input className="field-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="btn btn-primary" type="button" onClick={onRegister} disabled={loading}>Register</button>
            <button className="btn btn-ghost" type="button" onClick={onLogin} disabled={loading}>Login</button>
            {userId ? <CopyChip label="user_id" value={userId} /> : null}
          </div>
          <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{output}</pre>
        </div>
      </div>
    </div>
  );
}
