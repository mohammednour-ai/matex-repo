"use client";

import { useEffect, useState } from "react";
import { callGatewayTool, readTrackedIds, addTrackedId } from "../harness-client";

type Tab = "login" | "register";

export default function AuthPage() {
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState("individual");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugOutput, setDebugOutput] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("matex_token");
    const ids = readTrackedIds();
    if (token && ids.userIds.length > 0) {
      setLoggedIn(true);
      setUserId(ids.userIds[0]);
    }
  }, []);

  function clearFeedback() {
    setError(null);
    setSuccessMsg(null);
    setDebugOutput(null);
  }

  async function handleRegister() {
    clearFeedback();
    if (!email.trim() || !phone.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setLoading(true);
    try {
      const result = await callGatewayTool("auth.register", {
        email,
        phone,
        password,
        account_type: accountType,
      });
      setDebugOutput(JSON.stringify(result.payload, null, 2));

      if (result.payload.success) {
        const d = result.payload.data;
        const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
        const user = upstream?.user as Record<string, unknown> | undefined;
        const id = String(user?.user_id ?? d?.user_id ?? "");
        if (id) {
          setUserId(id);
          addTrackedId("userIds", id);
        }
        setSuccessMsg("Account created successfully! You can now log in.");
        setTab("login");
      } else {
        setError(result.payload.error?.message ?? "Registration failed.");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    clearFeedback();
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const result = await callGatewayTool("auth.login", { email, password });
      setDebugOutput(JSON.stringify(result.payload, null, 2));

      if (result.payload.success) {
        const d = result.payload.data;
        const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
        const tokens = upstream?.tokens as Record<string, unknown> | undefined;
        const token = String(tokens?.access_token ?? "");
        const id = String(upstream?.user_id ?? d?.user_id ?? "");

        if (token) localStorage.setItem("matex_token", token);
        if (id) {
          setUserId(id);
          addTrackedId("userIds", id);
        }
        setLoggedIn(true);
        setSuccessMsg("Welcome back!");
      } else {
        setError(result.payload.error?.message ?? "Login failed. Check your credentials.");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("matex_token");
    setLoggedIn(false);
    setUserId(null);
    clearFeedback();
  }

  const passwordField = (
    <div className="field-row">
      <div className="field-label">Password</div>
      <div style={{ position: "relative" }}>
        <input
          className="field-input"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12,
          }}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Account</h1>
          <p className="page-sub">
            {loggedIn ? "You are signed in." : "Sign in or create a new account to start trading."}
          </p>
        </div>
      </div>

      {error && (
        <div className="error-toast">
          <div className="error-toast-header">
            <div className="error-toast-icon">!</div>
            <div className="error-toast-message">{error}</div>
            <button className="error-toast-close" onClick={() => setError(null)}>×</button>
          </div>
        </div>
      )}

      {successMsg && !loggedIn && (
        <div className="success-toast">
          <div className="success-toast-icon">✓</div>
          <span style={{ fontSize: 13 }}>{successMsg}</span>
        </div>
      )}

      {loggedIn ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: "32px 18px" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>👋</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Welcome back!</h2>
            {userId && (
              <div className="badge badge-cyan" style={{ marginBottom: 16 }}>
                {userId.slice(0, 8)}…
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", marginTop: 8 }}>
              <a href="/kyc" style={{ fontSize: 13, color: "var(--cyan)" }}>Check KYC status →</a>
              <a href="/dashboard" className="btn btn-primary" style={{ marginTop: 8 }}>Go to Dashboard</a>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="tab-switcher">
              <button
                className={`tab-switch${tab === "login" ? " active" : ""}`}
                onClick={() => { setTab("login"); clearFeedback(); }}
              >
                Login
              </button>
              <button
                className={`tab-switch${tab === "register" ? " active" : ""}`}
                onClick={() => { setTab("register"); clearFeedback(); }}
              >
                Register
              </button>
            </div>

            {tab === "register" && (
              <>
                <div className="field-row">
                  <div className="field-label">Email</div>
                  <input className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                </div>
                <div className="field-row">
                  <div className="field-label">Phone</div>
                  <input className="field-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 416 555 0123" />
                </div>
                {passwordField}
                <div className="field-row">
                  <div className="field-label">Account type</div>
                  <select className="field-select" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                    <option value="individual">Individual</option>
                    <option value="company">Company</option>
                  </select>
                </div>
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={handleRegister} disabled={loading}>
                  {loading ? <span className="loading-spinner" /> : "Create account"}
                </button>
              </>
            )}

            {tab === "login" && (
              <>
                <div className="field-row">
                  <div className="field-label">Email</div>
                  <input className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                </div>
                {passwordField}
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={handleLogin} disabled={loading}>
                  {loading ? <span className="loading-spinner" /> : "Sign in"}
                </button>
              </>
            )}

            {debugOutput && (
              <div style={{ marginTop: 16 }}>
                <button
                  onClick={() => setShowDebug(!showDebug)}
                  style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}
                >
                  {showDebug ? "Hide debug" : "Show debug"}
                </button>
                {showDebug && (
                  <pre style={{ marginTop: 6, fontSize: 10, maxHeight: 160, overflow: "auto", padding: 8, background: "rgba(0,0,0,.3)", borderRadius: 4, whiteSpace: "pre-wrap" }}>
                    {debugOutput}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
