"use client";

import { useEffect, useRef, useState } from "react";
import {
  User,
  Building2,
  ShieldCheck,
  Bell,
  Upload,
  CheckCircle2,
  Circle,
} from "lucide-react";
import clsx from "clsx";
import { callTool } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { AppPageHeader } from "@/components/layout/AppPageHeader";

// ─── Tab definitions ────────────────────────────────────────────────────────

type Tab = "profile" | "company" | "kyc" | "notifications";

const TABS: {
  id: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "company", label: "Company", icon: Building2 },
  { id: "kyc", label: "KYC & Verification", icon: ShieldCheck },
  { id: "notifications", label: "Notifications", icon: Bell },
];

// ─── Profile Tab ────────────────────────────────────────────────────────────

const PROVINCES = [
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU",
  "ON", "PE", "QC", "SK", "YT",
];

const TIMEZONES = [
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/St_Johns",
];

type ProfileForm = {
  display_name: string;
  avatar_url: string;
  province: string;
  timezone: string;
};

function ProfileTab() {
  const [form, setForm] = useState<ProfileForm>({
    display_name: "",
    avatar_url: "",
    province: "ON",
    timezone: "America/Toronto",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadAvatar(file: File): Promise<string | null> {
    setUploadingAvatar(true);
    setError("");
    try {
      const res = await callTool("listing.upload_images", {
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      });
      if (!res.success) {
        setError(res.error?.message ?? "Could not get upload URL");
        return null;
      }
      const root = res.data as Record<string, unknown> | undefined;
      const ur = (root?.upstream_response as Record<string, unknown> | undefined) ?? root;
      const inner = (ur?.data as Record<string, unknown> | undefined) ?? ur;
      const signed =
        (inner?.signed_url as string | undefined) ??
        (inner?.upload_url as string | undefined);
      const pub =
        (inner?.public_url as string | undefined) ??
        (inner?.url as string | undefined);
      if (!signed || !pub) {
        setError("Upload service did not return a signed URL");
        return null;
      }
      const put = await fetch(signed, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        setError(`Upload failed (HTTP ${put.status})`);
        return null;
      }
      return pub;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Avatar upload failed");
      return null;
    } finally {
      setUploadingAvatar(false);
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError("");
    const res = await callTool("profile.update_profile", { ...form });
    setSaving(false);
    if (!res.success) {
      setError(res.error?.message ?? "Could not save profile");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-lg">
      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="relative">
          <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-brand-200 bg-brand-100 flex items-center justify-center">
            {form.avatar_url ? (
              <img
                src={form.avatar_url}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-8 w-8 text-brand-400" />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingAvatar}
            aria-label="Upload avatar"
            className="absolute -bottom-1 -right-1 rounded-full border border-slate-200 bg-white p-1.5 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {uploadingAvatar ? (
              <Spinner className="h-3 w-3 text-slate-600" />
            ) : (
              <Upload className="h-3 w-3 text-slate-600" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const url = await uploadAvatar(file);
              if (url) setForm((f) => ({ ...f, avatar_url: url }));
              e.target.value = "";
            }}
          />
        </div>
        <div>
          <p className="font-medium text-slate-800">Profile Photo</p>
          <p className="text-sm text-slate-500">JPG, PNG or GIF. Max 2 MB.</p>
        </div>
      </div>

      <Input
        label="Display Name"
        value={form.display_name}
        onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
        placeholder="Your name as shown to buyers/sellers"
      />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Province</label>
        <select
          value={form.province}
          onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Timezone</label>
        <select
          value={form.timezone}
          onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
          {error}
        </p>
      )}

      <Button
        onClick={handleSave}
        loading={saving}
        className={saved ? "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500" : ""}
      >
        {saved ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </>
        ) : (
          "Save Changes"
        )}
      </Button>
    </div>
  );
}

// ─── Company Tab ────────────────────────────────────────────────────────────

const CRA_BN_REGEX = /^\d{9}(RT\d{4})?$/;

type CompanyForm = {
  company_name: string;
  business_number: string;
  gst_hst_number: string;
  industry: string;
  annual_volume: string;
};

function CompanyTab() {
  const [form, setForm] = useState<CompanyForm>({
    company_name: "",
    business_number: "",
    gst_hst_number: "",
    industry: "",
    annual_volume: "",
  });
  const [submitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bnError, setBnError] = useState("");

  const validateBN = (val: string): void => {
    const cleaned = val.replace(/\s/g, "");
    if (cleaned && !CRA_BN_REGEX.test(cleaned)) {
      setBnError("Must be a 9-digit CRA BN (e.g. 123456789RT0001)");
    } else {
      setBnError("");
    }
  };

  const [companySaved, setCompanySaved] = useState(false);
  const [companyError, setCompanyError] = useState("");
  const handleSave = async (): Promise<void> => {
    if (bnError) return;
    setSaving(true);
    setCompanyError("");
    const res = await callTool("profile.update_company", { ...form });
    setSaving(false);
    if (!res.success) {
      setCompanyError(res.error?.message ?? "Could not save company info");
      return;
    }
    setCompanySaved(true);
    setTimeout(() => setCompanySaved(false), 2500);
  };

  return (
    <div className="space-y-5 max-w-lg">
      {submitted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Company information is under review. Contact support to make changes.
        </div>
      )}

      <Input
        label="Company Name"
        value={form.company_name}
        onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
        readOnly={submitted}
        placeholder="Acme Recycling Inc."
      />

      <Input
        label="CRA Business Number"
        value={form.business_number}
        onChange={(e) => {
          setForm((f) => ({ ...f, business_number: e.target.value }));
          validateBN(e.target.value);
        }}
        readOnly={submitted}
        placeholder="123456789RT0001"
        error={bnError}
        hint="9-digit root + RT + 4-digit account (e.g. 123456789RT0001)"
      />

      <Input
        label="GST/HST Number"
        value={form.gst_hst_number}
        onChange={(e) => setForm((f) => ({ ...f, gst_hst_number: e.target.value }))}
        readOnly={submitted}
        placeholder="123456789RT0001"
      />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Industry</label>
        <select
          value={form.industry}
          onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
          disabled={submitted}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">Select industry</option>
          <option value="ferrous_metals">Ferrous Metals</option>
          <option value="non_ferrous_metals">Non-Ferrous Metals</option>
          <option value="plastics">Plastics</option>
          <option value="paper_cardboard">Paper &amp; Cardboard</option>
          <option value="e_waste">E-Waste</option>
          <option value="construction">Construction Materials</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Estimated Annual Volume (CAD)
        </label>
        <select
          value={form.annual_volume}
          onChange={(e) => setForm((f) => ({ ...f, annual_volume: e.target.value }))}
          disabled={submitted}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">Select range</option>
          <option value="under_100k">Under $100,000</option>
          <option value="100k_500k">$100,000 – $500,000</option>
          <option value="500k_1m">$500,000 – $1M</option>
          <option value="1m_5m">$1M – $5M</option>
          <option value="over_5m">Over $5M</option>
        </select>
      </div>

      {companyError && (
        <p className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
          {companyError}
        </p>
      )}

      {!submitted && (
        <Button onClick={handleSave} loading={saving} disabled={!!bnError}>
          {companySaved ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </>
          ) : (
            "Save Company Info"
          )}
        </Button>
      )}
    </div>
  );
}

// ─── KYC Tab ─────────────────────────────────────────────────────────────────

type KycLevelNum = 0 | 1 | 2 | 3;

const KYC_STEPS: {
  level: number;
  title: string;
  description: string;
  docs: string[];
}[] = [
  {
    level: 1,
    title: "Level 1 — Individual Identity",
    description: "Government-issued ID (passport, driver's licence, or health card).",
    docs: ["government_id"],
  },
  {
    level: 2,
    title: "Level 2 — Business Verification",
    description:
      "Business registration + proof of address + sole director declaration.",
    docs: ["business_registration", "proof_of_address"],
  },
  {
    level: 3,
    title: "Level 3 — Corporate (PEP/Sanctions)",
    description:
      "Full corporate structure, audited financials, PEP/sanctions screening.",
    docs: ["articles_of_incorporation", "corporate_structure", "audited_financials"],
  },
];

const kycBadgeVariants: Record<KycLevelNum, "danger" | "warning" | "info" | "success"> = {
  0: "danger",
  1: "warning",
  2: "info",
  3: "success",
};

// Backend may return KYC level as a number (0–3) or as a string enum such as
// "level_0" / "level_2" / "LEVEL_3". Normalize to a bounded integer so the UI
// never leaks raw enum keys like "level_2" into labels.
function toKycLevelNum(value: unknown): KycLevelNum {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(3, Math.trunc(value))) as KycLevelNum;
  }
  if (typeof value === "string") {
    const m = value.match(/(\d)/);
    if (m) {
      const n = Number(m[1]);
      if (n >= 0 && n <= 3) return n as KycLevelNum;
    }
  }
  return 0;
}

const kycLevelLabels: Record<KycLevelNum, string> = {
  0: "Unverified",
  1: "Level 1 — Individual",
  2: "Level 2 — Business",
  3: "Level 3 — Corporate",
};

function KycTab() {
  const [kycLevel, setKycLevel] = useState<KycLevelNum>(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pendingDoc, setPendingDoc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    callTool("kyc.get_kyc_level", {}).then((res) => {
      if (res.success) {
        const d = res.data as unknown as { current_level?: unknown; level?: unknown };
        setKycLevel(toKycLevelNum(d?.current_level ?? d?.level));
      }
      setLoading(false);
    });
  }, []);

  const handleUploadDoc = async (docType: string, file: File): Promise<void> => {
    setUploading(docType);
    let vid = verificationId;
    if (!vid) {
      const res = await callTool("kyc.start_verification", {
        target_level: kycLevel + 1,
      });
      if (res.success) {
        const d = res.data as unknown as { verification_id?: string };
        vid = d?.verification_id ?? null;
        setVerificationId(vid);
      }
    }
    if (vid) {
      const uploadRes = await callTool("kyc.submit_document", {
        verification_id: vid,
        document_type: docType,
        file_name: file.name,
      });
      if (uploadRes.success) {
        setUploadedDocs((s) => new Set([...s, docType]));
      }
    }
    setUploading(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner className="h-4 w-4" />
        Loading KYC status…
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Current level */}
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-brand-500" />
        <div>
          <p className="text-sm text-slate-500">Current KYC Level</p>
          <Badge variant={kycBadgeVariants[kycLevel]} className="mt-0.5">
            {kycLevelLabels[kycLevel]}
          </Badge>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {KYC_STEPS.map((step) => {
          const completed = kycLevel >= step.level;
          const active = kycLevel === step.level - 1;
          return (
            <div
              key={step.level}
              className={clsx(
                "rounded-xl border p-5 transition-colors",
                completed
                  ? "border-emerald-200 bg-emerald-50/50"
                  : active
                  ? "border-brand-200 bg-brand-50/50"
                  : "border-slate-100 bg-white opacity-60"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={clsx(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    completed
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-200 text-slate-400"
                  )}
                >
                  {completed ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">{step.title}</h3>
                    {completed && <Badge variant="success">Verified</Badge>}
                    {active && <Badge variant="info">Next step</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{step.description}</p>

                  {active && (
                    <div className="mt-3 space-y-2">
                      {step.docs.map((doc) => (
                        <div
                          key={doc}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            {uploadedDocs.has(doc) ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                            ) : (
                              <Upload className="h-4 w-4 shrink-0 text-slate-400" />
                            )}
                            <span className="capitalize">
                              {doc.replace(/_/g, " ")}
                            </span>
                          </div>
                          {!uploadedDocs.has(doc) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={uploading === doc}
                              onClick={() => {
                                setPendingDoc(doc);
                                fileRef.current?.click();
                              }}
                            >
                              Upload
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && pendingDoc) handleUploadDoc(pendingDoc, file);
        }}
      />
    </div>
  );
}

// ─── Notifications Tab ───────────────────────────────────────────────────────

type NotifPrefs = {
  email: boolean;
  sms: boolean;
  push: boolean;
  outbid_alerts: boolean;
  auction_starting: boolean;
  inspection_reminders: boolean;
  payment_received: boolean;
  dispute_updates: boolean;
};

type ChannelKey = "email" | "sms" | "push";
type EventKey =
  | "outbid_alerts"
  | "auction_starting"
  | "inspection_reminders"
  | "payment_received"
  | "dispute_updates";

const CHANNELS: { key: ChannelKey; label: string; desc: string }[] = [
  { key: "email", label: "Email Notifications", desc: "Receive updates via email" },
  { key: "sms", label: "SMS Notifications", desc: "Receive text message alerts" },
  { key: "push", label: "Push Notifications", desc: "Browser & mobile push alerts" },
];

const EVENT_TYPES: { key: EventKey; label: string }[] = [
  { key: "outbid_alerts", label: "Outbid Alerts" },
  { key: "auction_starting", label: "Auction Starting Soon" },
  { key: "inspection_reminders", label: "Inspection Reminders" },
  { key: "payment_received", label: "Payment Received" },
  { key: "dispute_updates", label: "Dispute Updates" },
];

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        checked ? "bg-brand-600" : "bg-slate-200"
      )}
    >
      <span
        className={clsx(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotifPrefs>({
    email: true,
    sms: false,
    push: true,
    outbid_alerts: true,
    auction_starting: true,
    inspection_reminders: true,
    payment_received: true,
    dispute_updates: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof NotifPrefs>(key: K, value: boolean): void =>
    setPrefs((p) => ({ ...p, [key]: value }));

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    await callTool("notifications.update_preferences", { ...prefs });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-lg space-y-6">
      {/* Channels */}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-700">Channels</h3>
        </div>
        {CHANNELS.map((item) => (
          <div key={item.key} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-slate-700">{item.label}</p>
              <p className="text-xs text-slate-500">{item.desc}</p>
            </div>
            <Toggle
              checked={prefs[item.key]}
              onChange={(v) => update(item.key, v)}
            />
          </div>
        ))}
      </div>

      {/* Event types */}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-700">Event Types</h3>
        </div>
        {EVENT_TYPES.map((item) => (
          <div key={item.key} className="flex items-center justify-between px-5 py-4">
            <p className="text-sm font-medium text-slate-700">{item.label}</p>
            <Toggle
              checked={prefs[item.key]}
              onChange={(v) => update(item.key, v)}
            />
          </div>
        ))}
      </div>

      <Button
        onClick={handleSave}
        loading={saving}
        className={
          saved
            ? "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500"
            : ""
        }
      >
        {saved ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </>
        ) : (
          "Save Preferences"
        )}
      </Button>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Settings"
        description="Manage your account, company profile, and preferences."
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar nav */}
        <nav className="flex shrink-0 gap-1 rounded-2xl border border-steel-200/80 bg-white/80 p-1 lg:w-52 lg:flex-col">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-brand-50 text-brand-700"
                  : "text-steel-600 hover:bg-steel-100"
              )}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content panel */}
        <div className="marketplace-card min-h-96 flex-1 p-6">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "company" && <CompanyTab />}
          {activeTab === "kyc" && <KycTab />}
          {activeTab === "notifications" && <NotificationsTab />}
        </div>
      </div>
    </div>
  );
}
