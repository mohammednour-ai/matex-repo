"use client";

import { useEffect, useState } from "react";
import { callTool, getUser } from "@/lib/api";
import { Settings, Save, UserPlus, Link2 } from "lucide-react";

type YardSettings = {
  yard_name: string;
  license_number: string;
  hst_number: string;
  address: string;
  cash_threshold_cad: number;
  cat_hold_days: number;
  province: string;
};

type UserForm = {
  email: string;
  full_name: string;
  role: string;
  password: string;
};

export default function SettingsPage() {
  const user = getUser();
  const tenantId = user?.tenant_id ?? "";
  const actorId = user?.user_id ?? "";
  const isAdmin = user?.role === "admin";

  const [settings, setSettings] = useState<Partial<YardSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");

  const [userForm, setUserForm] = useState<UserForm>({ email: "", full_name: "", role: "scale_operator", password: "" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userMsg, setUserMsg] = useState("");

  const [matexEmail, setMatexEmail] = useState("");
  const [matexPassword, setMatexPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectMsg, setConnectMsg] = useState("");

  useEffect(() => {
    callTool<{ settings: YardSettings }>("yardops.get_tenant", { tenant_id: tenantId })
      .then((res) => {
        if (res.success && res.data) setSettings(res.data.settings ?? res.data as unknown as YardSettings);
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  async function saveSettings() {
    setSaving(true);
    setError("");
    setSaveMsg("");
    const res = await callTool("yardops.upsert_yard_settings", {
      tenant_id: tenantId,
      actor_id: actorId,
      ...settings,
    });
    if (res.success) {
      setSaveMsg("Settings saved.");
      setTimeout(() => setSaveMsg(""), 3000);
    } else {
      setError(res.error?.message ?? "Failed to save");
    }
    setSaving(false);
  }

  async function createUser() {
    if (!userForm.email || !userForm.full_name || !userForm.password) {
      setUserMsg("All fields required.");
      return;
    }
    setCreatingUser(true);
    setUserMsg("");
    const res = await callTool("yardops.create_yard_user", {
      tenant_id: tenantId,
      actor_id: actorId,
      ...userForm,
    });
    if (res.success) {
      setUserMsg("User created successfully.");
      setUserForm({ email: "", full_name: "", role: "scale_operator", password: "" });
    } else {
      setUserMsg(res.error?.message ?? "Failed to create user");
    }
    setCreatingUser(false);
  }

  async function connectExchange() {
    if (!matexEmail || !matexPassword) { setConnectMsg("Email and password required."); return; }
    setConnecting(true);
    setConnectMsg("");
    const res = await callTool("yardops.connect_to_exchange", {
      tenant_id: tenantId,
      actor_id: actorId,
      matex_email: matexEmail,
      matex_password: matexPassword,
    });
    if (res.success) {
      setConnectMsg("Connected to Matex Exchange.");
      setMatexEmail("");
      setMatexPassword("");
    } else {
      setConnectMsg(res.error?.message ?? "Connection failed. Check credentials.");
    }
    setConnecting(false);
  }

  if (loading) {
    return <div className="h-48 animate-pulse rounded-xl bg-night-800" />;
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-night-100 flex items-center gap-2">
          <Settings size={22} className="text-brand-400" />
          Settings
        </h1>
      </div>

      {/* Yard Info */}
      <div className="yard-card space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-night-400">Yard Information</h2>

        {[
          { key: "yard_name", label: "Yard Name" },
          { key: "license_number", label: "Dealer License Number" },
          { key: "hst_number", label: "HST Number" },
          { key: "address", label: "Address" },
          { key: "province", label: "Province" },
        ].map(({ key, label }) => (
          <div key={key}>
            <label className="mb-1.5 block text-sm font-medium text-night-200">{label}</label>
            <input
              className="yard-input"
              value={(settings as Record<string, unknown>)[key] as string ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
              disabled={!isAdmin}
            />
          </div>
        ))}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-night-200">Cash Threshold (CAD)</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-night-500">$</span>
              <input
                className="yard-input pl-6 tabular-nums"
                type="number"
                step="10"
                min="0"
                value={settings.cash_threshold_cad ?? 100}
                onChange={(e) => setSettings((s) => ({ ...s, cash_threshold_cad: parseFloat(e.target.value) || 0 }))}
                disabled={!isAdmin}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-night-200">Cat Converter Hold (days)</label>
            <input
              className="yard-input tabular-nums"
              type="number"
              min="7"
              step="1"
              value={settings.cat_hold_days ?? 7}
              onChange={(e) => setSettings((s) => ({ ...s, cat_hold_days: parseInt(e.target.value) || 7 }))}
              disabled={!isAdmin}
            />
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}
        {saveMsg && <p className="text-sm text-success-400">{saveMsg}</p>}

        {isAdmin && (
          <button onClick={saveSettings} disabled={saving} className="yard-btn-primary flex items-center gap-2">
            <Save size={15} />
            {saving ? "Saving…" : "Save Settings"}
          </button>
        )}
      </div>

      {/* Create User */}
      {isAdmin && (
        <div className="yard-card space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-night-400 flex items-center gap-2">
            <UserPlus size={15} />
            Create Staff Account
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-night-200">Full Name</label>
              <input className="yard-input" value={userForm.full_name} onChange={(e) => setUserForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-night-200">Email</label>
              <input className="yard-input" type="email" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-night-200">Role</label>
              <select className="yard-input" value={userForm.role} onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="scale_operator">Scale Operator</option>
                <option value="manager">Manager</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-night-200">Temporary Password</label>
              <input className="yard-input" type="password" value={userForm.password} onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
          </div>

          {userMsg && (
            <p className={`text-sm ${userMsg.includes("success") ? "text-success-400" : "text-danger-400"}`}>{userMsg}</p>
          )}

          <button onClick={createUser} disabled={creatingUser} className="yard-btn-primary flex items-center gap-2">
            <UserPlus size={15} />
            {creatingUser ? "Creating…" : "Create Account"}
          </button>
        </div>
      )}

      {/* Matex Exchange Connection */}
      <div className="yard-card space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-night-400 flex items-center gap-2">
          <Link2 size={15} />
          Matex Exchange Connection
        </h2>
        <p className="text-xs text-night-500">Connect this yard to the Matex Exchange to publish lots and receive bids.</p>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-night-200">Matex Account Email</label>
          <input className="yard-input" type="email" value={matexEmail} onChange={(e) => setMatexEmail(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-night-200">Matex Password</label>
          <input className="yard-input" type="password" value={matexPassword} onChange={(e) => setMatexPassword(e.target.value)} />
        </div>

        {connectMsg && (
          <p className={`text-sm ${connectMsg.includes("Connected") ? "text-success-400" : "text-danger-400"}`}>{connectMsg}</p>
        )}

        <button onClick={connectExchange} disabled={connecting} className="yard-btn-secondary flex items-center gap-2">
          <Link2 size={15} />
          {connecting ? "Connecting…" : "Connect to Exchange"}
        </button>
      </div>
    </div>
  );
}
