"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  User,
  Building2,
  ShieldCheck,
  Bell,
  Upload,
  CheckCircle2,
  Circle,
  BadgeCheck,
} from "lucide-react";
import clsx from "clsx";
import { callTool, getUser } from "@/lib/api";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Badge } from "@/components/ui/shadcn/badge";
import { Spinner } from "@/components/ui/shadcn/spinner";
import { AppPageHeader } from "@/components/layout/AppPageHeader";

// ─── Tab definitions ────────────────────────────────────────────────────────

type Tab = "kyc" | "profile" | "company" | "notifications";

const TABS: {
  id: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  // KYC first — drives compliance + unlocks higher trade limits.
  { id: "kyc", label: "KYC & Verification", icon: ShieldCheck },
  { id: "profile", label: "Profile", icon: User },
  { id: "company", label: "Company", icon: Building2 },
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
      // 2 MB cap matches the UI copy below ("JPG, PNG or GIF. Max 2 MB.").
      const MAX_BYTES = 2 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        setError("Image is over 2 MB. Please choose a smaller file.");
        return null;
      }

      const user = getUser();
      if (!user?.userId) {
        setError("Sign in before uploading an avatar.");
        return null;
      }

      // Bucket + path. We use a dedicated public "avatars" bucket so the
      // resulting URL is stably loadable by <img> without needing a fresh
      // signed download URL on every render. Path is namespaced by user_id
      // so storage RLS can constrain writes to the owner.
      const bucket = "avatars";
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.userId}/${Date.now()}-${safeName}`;

      // Right tool: storage.generate_signed_upload_url. The previous code
      // called listing.upload_images with the wrong arg shape — the
      // listing-mcp tool requires { listing_id, actor_id, images } and is
      // for attaching photos to an existing listing, not for arbitrary
      // user uploads.
      const res = await callTool("storage.generate_signed_upload_url", {
        bucket,
        path,
      });
      if (!res.success) {
        setError(res.error?.message ?? "Could not get upload URL");
        return null;
      }
      const root = res.data as Record<string, unknown> | undefined;
      const ur = (root?.upstream_response as Record<string, unknown> | undefined)?.data as
        | Record<string, unknown>
        | undefined;
      const inner = ur ?? root;
      const signed =
        (inner?.signed_url as string | undefined) ??
        (inner?.upload_url as string | undefined);
      if (!signed) {
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
      // Construct the public URL ourselves. The "avatars" bucket must be
      // public for this to render via <img>; otherwise generate a signed
      // download URL on demand.
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      if (!supabaseUrl) {
        setError("Supabase URL is not configured.");
        return null;
      }
      return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
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
      {/* Profile illustration banner */}
      <div className="flex items-center gap-4 rounded-2xl bg-[linear-gradient(135deg,rgba(232,119,34,0.12),rgba(232,119,34,0.04)_60%,rgba(20,30,37,0.85))] border border-brand-500/30 px-5 py-4">
        <div
          aria-hidden
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-brand-500/40 bg-brand-500/15 text-brand-400"
        >
          <User size={28} />
        </div>
        <div>
          <p className="text-sm font-semibold text-brand-300">Your Profile</p>
          <p className="text-xs text-fg-muted">Manage your identity and contact details.</p>
        </div>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="relative">
          <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-brand-500/30 bg-brand-500/15 flex items-center justify-center">
            {form.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar URLs from arbitrary Supabase storage hosts
              <img
                src={form.avatar_url}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              <Image
                src="/avatar-placeholder.svg"
                alt=""
                aria-hidden
                width={96}
                height={96}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingAvatar}
            aria-label="Upload avatar"
            className="absolute -bottom-1 -right-1 rounded-full border border-line bg-surfaceBg p-1.5 shadow-sm hover:bg-canvas transition-colors disabled:opacity-50"
          >
            {uploadingAvatar ? (
              <Spinner className="h-3 w-3 text-fg-muted" />
            ) : (
              <Upload className="h-3 w-3 text-fg-muted" />
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
          <p className="font-medium text-fg">Profile Photo</p>
          <p className="text-sm text-fg-subtle">JPG, PNG or GIF. Max 2 MB.</p>
        </div>
      </div>

      <Input
        label="Display Name"
        value={form.display_name}
        onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
        placeholder="Your name as shown to buyers/sellers"
      />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-fg-muted">Province</label>
        <select
          value={form.province}
          onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
          className="w-full rounded-lg border border-line-strong bg-surfaceBg px-3 py-2 text-sm text-fg-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-fg-muted">Timezone</label>
        <select
          value={form.timezone}
          onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          className="w-full rounded-lg border border-line-strong bg-surfaceBg px-3 py-2 text-sm text-fg-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="rounded-lg border border-danger-200 bg-danger-500/15 px-3 py-2 text-xs text-danger-400">
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
        <div className="rounded-lg border border-warning-500/30 bg-warning-500/10 px-4 py-3 text-sm text-warning-400">
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
        <label className="mb-1.5 block text-sm font-medium text-fg-muted">Industry</label>
        <select
          value={form.industry}
          onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
          disabled={submitted}
          className="w-full rounded-lg border border-line-strong bg-surfaceBg px-3 py-2 text-sm text-fg-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-canvas disabled:text-fg-subtle"
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
        <label className="mb-1.5 block text-sm font-medium text-fg-muted">
          Estimated Annual Volume (CAD)
        </label>
        <select
          value={form.annual_volume}
          onChange={(e) => setForm((f) => ({ ...f, annual_volume: e.target.value }))}
          disabled={submitted}
          className="w-full rounded-lg border border-line-strong bg-surfaceBg px-3 py-2 text-sm text-fg-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-canvas disabled:text-fg-subtle"
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
        <p className="rounded-lg border border-danger-200 bg-danger-500/15 px-3 py-2 text-xs text-danger-400">
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

function KycTab({ initialLevel }: { initialLevel: number }) {
  // The parent SettingsPage owns the single kyc.get_kyc_level fetch and
  // only mounts this component once that fetch has resolved, so no second
  // round-trip happens. If the user advances levels in another tab the
  // parent state updates and the useEffect below mirrors the new value in.
  const [kycLevel, setKycLevel] = useState<KycLevelNum>(toKycLevelNum(initialLevel));
  const [uploading, setUploading] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<Set<string>>(new Set());
  const [pendingDoc, setPendingDoc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setKycLevel(toKycLevelNum(initialLevel));
  }, [initialLevel]);

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

  return (
    <div className="max-w-xl space-y-6">
      {/* KYC illustration banner */}
      <div className="flex items-center gap-4 rounded-2xl bg-[linear-gradient(135deg,rgba(232,119,34,0.12),rgba(232,119,34,0.04)_60%,rgba(20,30,37,0.85))] border border-brand-500/30 px-5 py-4">
        <div
          aria-hidden
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-brand-500/40 bg-brand-500/15 text-brand-400"
        >
          <BadgeCheck size={28} />
        </div>
        <div>
          <p className="text-sm font-semibold text-brand-300">Identity Verification</p>
          <p className="text-xs text-fg-muted">Complete KYC to unlock higher trading limits and full platform access.</p>
        </div>
      </div>

      {/* Current level */}
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-brand-500" />
        <div>
          <p className="text-sm text-fg-subtle">Current KYC Level</p>
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
                  ? "border-success-500/30 bg-success-500/50"
                  : active
                  ? "border-brand-200 bg-brand-500/50"
                  : "border-line/60 bg-surfaceBg opacity-60"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={clsx(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    completed
                      ? "bg-emerald-500 text-white"
                      : "bg-night-700 text-fg-subtle"
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
                    <h3 className="text-sm font-semibold text-fg">{step.title}</h3>
                    {completed && <Badge variant="success">Verified</Badge>}
                    {active && <Badge variant="info">Next step</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-fg-subtle">{step.description}</p>

                  {active && (
                    <div className="mt-3 space-y-2">
                      {step.docs.map((doc) => (
                        <div
                          key={doc}
                          className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surfaceBg px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2 text-sm text-fg-muted">
                            {uploadedDocs.has(doc) ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                            ) : (
                              <Upload className="h-4 w-4 shrink-0 text-fg-subtle" />
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
        checked ? "bg-brand-600" : "bg-night-700"
      )}
    >
      <span
        className={clsx(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-surfaceBg shadow ring-0 transition-transform duration-200",
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
      <div className="divide-y divide-zinc-100 rounded-xl border border-line bg-surfaceBg">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-fg-muted">Channels</h3>
        </div>
        {CHANNELS.map((item) => (
          <div key={item.key} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-fg-muted">{item.label}</p>
              <p className="text-xs text-fg-subtle">{item.desc}</p>
            </div>
            <Toggle
              checked={prefs[item.key]}
              onChange={(v) => update(item.key, v)}
            />
          </div>
        ))}
      </div>

      {/* Event types */}
      <div className="divide-y divide-zinc-100 rounded-xl border border-line bg-surfaceBg">
        <div className="px-5 py-4">
          <h3 className="text-sm font-semibold text-fg-muted">Event Types</h3>
        </div>
        {EVENT_TYPES.map((item) => (
          <div key={item.key} className="flex items-center justify-between px-5 py-4">
            <p className="text-sm font-medium text-fg-muted">{item.label}</p>
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
  const [activeTab, setActiveTab] = useState<Tab>("kyc");
  // Surface KYC level at the page so the sidebar can show an "Incomplete"
  // pip on the KYC tab without each tab refetching independently.
  const [pageKycLevel, setPageKycLevel] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    callTool("kyc.get_kyc_level", {}).then((res) => {
      if (cancelled) return;
      if (res.success) {
        const lvl = (res.data as { level?: number } | undefined)?.level ?? 0;
        setPageKycLevel(lvl);
        // If user is already KYC ≥ 2, default landing tab to Profile (more
        // commonly visited for returning users).
        if (lvl >= 2) setActiveTab("profile");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const kycIncomplete = pageKycLevel != null && pageKycLevel < 2;

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Settings"
        description="Manage your account, company profile, and preferences."
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar nav */}
        <nav className="flex shrink-0 gap-1 rounded-2xl border border-line/80 bg-surfaceBg/80 p-1 lg:w-52 lg:flex-col">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-brand-500/10 text-brand-700"
                  : "text-fg-muted hover:bg-elevated"
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
          {activeTab === "kyc" && (
            pageKycLevel == null ? (
              <div className="flex items-center gap-2 text-sm text-fg-subtle">
                <Spinner className="h-4 w-4" />
                Loading KYC status…
              </div>
            ) : (
              <KycTab initialLevel={pageKycLevel} />
            )
          )}
          {activeTab === "notifications" && <NotificationsTab />}
        </div>
      </div>
    </div>
  );
}
