"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, Loader2, EyeOff, ShieldCheck } from "lucide-react";
import clsx from "clsx";

// ── types ──────────────────────────────────────────────────────────────
type Tab = "login" | "register";
type AccountType = "buyer" | "seller" | "both";
type RegisterStep = "form" | "profile" | "verify";

// ── helpers ────────────────────────────────────────────────────────────
async function callMcp(tool: string, input: Record<string, unknown>, token?: string) {
  const res = await fetch("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, args: input, ...(token ? { token } : {}) }),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { throw new Error("Invalid response from server"); }
  if (!res.ok || data.success === false) {
    const upstreamBody = (data.data as Record<string, unknown> | undefined)?.upstream_body as
      | Record<string, unknown>
      | undefined;
    const upstreamErr = (upstreamBody?.error as Record<string, string> | undefined)?.message;
    const directErr = (data.error as Record<string, string> | undefined)?.message;
    const rawMsg = upstreamErr ?? directErr ?? "Request failed";
    const friendlyErrors: Record<string, string> = {
      "Invalid credentials.": "Invalid email or password. Please try again.",
      "email, phone, password are required.": "Please fill in all required fields.",
    };
    const friendly = Object.entries(friendlyErrors).find(([k]) => rawMsg.includes(k));
    throw new Error(
      friendly
        ? friendly[1]
        : rawMsg.includes("duplicate key")
          ? "An account with this email or phone already exists."
          : rawMsg
    );
  }
  const upstreamData = (data.data as Record<string, unknown> | undefined)?.upstream_response as
    | Record<string, unknown>
    | undefined;
  return (upstreamData?.data as Record<string, unknown>) ?? (data.data as Record<string, unknown>) ?? data;
}

const glassInput =
  "w-full rounded-2xl border border-slate-600 bg-white/10 px-4 py-3 text-base text-white placeholder:text-slate-400 backdrop-blur-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-white";

function GlassPasswordInput({
  label,
  value,
  onChange,
  error,
  placeholder,
  id,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  id?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-slate-200">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "••••••••"}
          autoComplete={autoComplete ?? "current-password"}
          className={clsx(
            glassInput,
            "pr-10",
            error && "border-red-400 focus:ring-red-400"
          )}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function GlassEmailInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-slate-200">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="email"
          required={required}
          className={clsx(glassInput, error && "border-red-400 focus:ring-red-400")}
        />
      </div>
      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton({
  loading,
  children,
  onClick,
}: {
  loading: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      disabled={loading}
      onClick={onClick}
      className="flex w-full items-center justify-center rounded-2xl bg-white py-3 px-4 text-base font-bold text-black shadow-xl transition-all duration-300 hover:scale-[1.02] hover:bg-slate-100 hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="h-5 w-5 animate-spin text-slate-700" fill="none" viewBox="0 0 24 24" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Working…
        </span>
      ) : (
        children
      )}
    </button>
  );
}

// ── Login Tab ──────────────────────────────────────────────────────────
function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await callMcp("auth.login", { email, password });
      const token =
        (data.tokens as Record<string, string> | undefined)?.access_token ??
        String(data.access_token ?? data.token ?? "");
      const userId = String(data.user_id ?? (data.user as Record<string, string> | undefined)?.user_id ?? "");
      if (!token) throw new Error("Login failed: no token returned.");
      const accountType = String(data.account_type ?? "individual");
      const isPlatformAdmin = Boolean(data.is_platform_admin);
      localStorage.setItem("matex_token", token);
      localStorage.setItem(
        "matex_user",
        JSON.stringify({ userId, email, accountType, isPlatformAdmin }),
      );
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const clearErrorOnChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    if (error) setError(null);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <GlassEmailInput
        id="login-email"
        label="Email Address"
        value={email}
        onChange={clearErrorOnChange(setEmail)}
        placeholder="Enter your business email"
        required
      />
      <GlassPasswordInput id="login-password" label="Password" value={password} onChange={clearErrorOnChange(setPassword)} />

      <div className="flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-5 w-5 rounded border-slate-600 bg-white/10 text-brand-500 focus:ring-white focus:ring-offset-0"
          />
          <span className="text-sm font-medium text-slate-300">Remember me</span>
        </label>
        <button type="button" className="text-sm font-semibold text-white transition-colors hover:text-slate-200">
          Forgot password?
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/15 px-3 py-2.5">
          <p className="text-sm text-red-100">{error}</p>
        </div>
      )}

      <SubmitButton loading={loading}>Sign in</SubmitButton>

      <p className="text-center text-base text-slate-300">
        New to industrial trading?{" "}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="font-bold text-white underline-offset-2 hover:text-slate-100 hover:underline"
        >
          Create Account
        </button>
      </p>
    </form>
  );
}

// ── Registration profile data ───────────────────────────────────────────
const MATERIAL_CATEGORIES = [
  "Scrap Metals",
  "Surplus Equipment",
  "Heavy Machinery",
  "Electronics Scrap",
  "Pipe & Structural",
  "Chemicals & Solvents",
  "Plastics & Rubber",
  "Aggregates & Minerals",
] as const;

const MATEX_SERVICES = [
  { id: "escrow", label: "Escrow Protection" },
  { id: "live_auction", label: "Live Auctions" },
  { id: "bidding", label: "Bidding / RFQ" },
  { id: "ai_copilot", label: "AI Copilot" },
  { id: "automation", label: "Automation & API" },
] as const;

const ANNUAL_VOLUMES = [
  { id: "<100k", label: "< $100K" },
  { id: "100k-500k", label: "$100K – $500K" },
  { id: "500k-2m", label: "$500K – $2M" },
  { id: "2m-10m", label: "$2M – $10M" },
  { id: "10m+", label: "$10M+" },
] as const;

const LOT_SIZES = [
  { id: "<1t", label: "< 1 tonne" },
  { id: "1-10t", label: "1 – 10 tonnes" },
  { id: "10-100t", label: "10 – 100 tonnes" },
  { id: "100t+", label: "100+ tonnes" },
] as const;

const PAYMENT_METHODS = [
  { id: "eft_wire", label: "EFT / Wire" },
  { id: "letter_of_credit", label: "Letter of Credit" },
  { id: "net_terms", label: "Net 30/60 Terms" },
  { id: "escrow", label: "Escrow" },
  { id: "credit_card", label: "Credit Card" },
] as const;

const DECISION_ROLES = [
  { id: "i_decide", label: "I decide" },
  { id: "i_recommend", label: "I recommend" },
  { id: "needs_approval", label: "Need team approval" },
] as const;

const REFERRAL_SOURCES = [
  { id: "google", label: "Google / Search" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "trade_show", label: "Trade Show" },
  { id: "referral", label: "Industry Referral" },
  { id: "partner", label: "Partner" },
  { id: "other", label: "Other" },
] as const;

const COMM_PREFERENCES = [
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "in_app", label: "In-app chat" },
] as const;

const CA_PROVINCES = [
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
] as const;

const REGISTER_STEPS: RegisterStep[] = ["form", "profile", "verify"];
const STEP_LABELS: Record<RegisterStep, string> = {
  form: "Account",
  profile: "Business",
  verify: "Verify",
};

const PROFILE_SECTIONS = [
  "Contact",
  "Trading Profile",
  "Commercial Preferences",
  "Geography",
  "How We Found Each Other",
] as const;

function RegisterStepBar({ current }: { current: RegisterStep }) {
  const idx = REGISTER_STEPS.indexOf(current);
  return (
    <div className="mb-5 flex items-center justify-center">
      {REGISTER_STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={clsx(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                  done && "bg-orange-400 text-black",
                  active && "border-2 border-orange-400 bg-orange-500/20 text-orange-300",
                  !done && !active && "border border-white/20 bg-white/5 text-slate-500"
                )}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={clsx(
                  "text-[10px] font-semibold uppercase tracking-wide",
                  active ? "text-orange-300" : done ? "text-orange-400/70" : "text-slate-500"
                )}
              >
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < REGISTER_STEPS.length - 1 && (
              <div
                className={clsx("mx-2 mb-3.5 h-px w-6 transition-colors", i < idx ? "bg-orange-400/70" : "bg-white/15")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChipSelect({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: readonly string[] | readonly { id: string; label: string }[];
  onChange: (next: string[]) => void;
}) {
  const items = (options as ReadonlyArray<string | { id: string; label: string }>).map((o) =>
    typeof o === "string" ? { id: o, label: o } : o
  );
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ id, label }) => {
        const selected = value.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() =>
              onChange(selected ? value.filter((v) => v !== id) : [...value, id])
            }
            className={clsx(
              "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
              selected
                ? "border-orange-400/70 bg-orange-500/25 text-orange-200"
                : "border-white/20 bg-white/5 text-slate-200 hover:border-white/35 hover:bg-white/10"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Register Tab ───────────────────────────────────────────────────────
function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<RegisterStep>("form");
  const [profileSection, setProfileSection] = useState(0);

  // Step 1 — account credentials
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("buyer");

  // Step 2 — business profile (stored in state; saved after OTP verify)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [lineOfBusiness, setLineOfBusiness] = useState<string[]>([]);
  const [buyInterests, setBuyInterests] = useState<string[]>([]);
  const [sellCategories, setSellCategories] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [crossBorder, setCrossBorder] = useState(false);
  const [annualVolume, setAnnualVolume] = useState<string[]>([]);
  const [lotSize, setLotSize] = useState<string[]>([]);
  const [paymentPrefs, setPaymentPrefs] = useState<string[]>([]);
  const [decisionAuthority, setDecisionAuthority] = useState<string[]>([]);
  const [referralSource, setReferralSource] = useState<string[]>([]);
  const [commPreference, setCommPreference] = useState<string[]>([]);
  const [profileSkipped, setProfileSkipped] = useState(false);

  // Step 3 — OTP verify
  const [otpCode, setOtpCode] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const validateAccount = () => {
    const errs: Record<string, string> = {};
    if (!email.includes("@")) errs.email = "Enter a valid email address.";
    if (!/^\+1\d{10}$/.test(phone.replace(/\s/g, "")))
      errs.phone = "Enter a valid +1 Canadian phone number (e.g. +1 416 555 0100).";
    if (password.length < 12) errs.password = "Password must be at least 12 characters.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Step 1 → register → go to profile
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAccount()) return;
    setGlobalError(null);
    setLoading(true);
    try {
      const regData = await callMcp("auth.register", {
        email,
        phone: phone.replace(/\s/g, ""),
        password,
        account_type: accountType,
      });
      const userObj = regData.user as Record<string, unknown> | undefined;
      const newUserId = String(regData.user_id ?? userObj?.user_id ?? userObj?.id ?? "");
      setUserId(newUserId);
      setProfileSection(0);
      setStep("profile");
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2 → fire OTP → go to verify
  const goToVerify = async (skipped: boolean) => {
    setProfileSkipped(skipped);
    setGlobalError(null);
    setLoading(true);
    try {
      await callMcp("auth.request_email_otp", { email, user_id: userId });
      setStep("verify");
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Could not send verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 3 → verify OTP → login → (optionally) save profile → dashboard
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      setFieldErrors({ otp: "Enter the 6-digit code sent to your email." });
      return;
    }
    setFieldErrors({});
    setGlobalError(null);
    setLoading(true);
    try {
      await callMcp("auth.verify_email", { email, code: otpCode, user_id: userId });

      const loginData = await callMcp("auth.login", { email, password });
      const loginToken =
        (loginData.tokens as Record<string, string> | undefined)?.access_token ??
        String(loginData.access_token ?? loginData.token ?? "");
      const loginUserId = String(
        loginData.user_id ?? (loginData.user as Record<string, string> | undefined)?.user_id ?? ""
      );
      const loginAccountType = String(loginData.account_type ?? accountType ?? "individual");
      const loginIsAdmin = Boolean(loginData.is_platform_admin);

      localStorage.setItem("matex_token", loginToken);
      localStorage.setItem(
        "matex_user",
        JSON.stringify({ userId: loginUserId, email, accountType: loginAccountType, isPlatformAdmin: loginIsAdmin })
      );

      // Save business profile if not skipped and there is meaningful data
      const hasProfileData =
        !profileSkipped &&
        loginToken &&
        (firstName || companyName || lineOfBusiness.length || services.length || provinces.length || annualVolume.length || referralSource.length);
      if (hasProfileData) {
        try {
          await callMcp(
            "profile.update_profile",
            {
              first_name: firstName || undefined,
              last_name: lastName || undefined,
              search_prefs: {
                // Trading identity
                company_name: companyName || undefined,
                job_title: jobTitle || undefined,
                // Materials
                line_of_business: lineOfBusiness,
                ...(accountType !== "seller" && { buy_interests: buyInterests }),
                ...(accountType !== "buyer" && { sell_categories: sellCategories }),
                // Platform usage
                services,
                // Trading capacity
                annual_volume: annualVolume[0] ?? undefined,
                ...(accountType !== "buyer" && { lot_size: lotSize }),
                // Commercial preferences
                payment_prefs: paymentPrefs,
                ...(accountType !== "seller" && { decision_authority: decisionAuthority[0] ?? undefined }),
                // Geography
                provinces,
                cross_border: crossBorder,
                // Discovery & communication
                referral_source: referralSource[0] ?? undefined,
                comm_preference: commPreference,
              },
            },
            loginToken
          );
        } catch {
          // Profile save is non-fatal; user can update from settings
        }
      }

      router.push("/dashboard");
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: OTP verify ──
  if (step === "verify") {
    return (
      <div className="flex flex-col gap-4">
        <RegisterStepBar current="verify" />
        <div className="rounded-2xl border border-orange-400/30 bg-orange-500/10 px-3 py-3 backdrop-blur-sm">
          <p className="text-sm text-orange-100">
            We sent a 6-digit code to <strong className="text-white">{email}</strong>. Enter it below to activate your
            account.
          </p>
        </div>
        <form onSubmit={handleVerify} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="otp" className="text-sm font-semibold text-slate-200">
              Verification code
            </label>
            <input
              id="otp"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              className={clsx(glassInput, fieldErrors.otp && "border-red-400 focus:ring-red-400")}
            />
            {fieldErrors.otp && (
              <p className="text-xs text-red-300" role="alert">{fieldErrors.otp}</p>
            )}
          </div>
          {globalError && (
            <div className="rounded-2xl border border-red-400/40 bg-red-500/15 px-3 py-2.5">
              <p className="text-sm text-red-100">{globalError}</p>
            </div>
          )}
          <SubmitButton loading={loading}>Verify &amp; enter marketplace</SubmitButton>
          <button
            type="button"
            onClick={() => setStep("profile")}
            className="text-center text-sm text-slate-400 hover:text-white"
          >
            ← Back
          </button>
        </form>
      </div>
    );
  }

  // ── Step 2: Business profile (progressive disclosure) ──
  if (step === "profile") {
    const isLastSection = profileSection === PROFILE_SECTIONS.length - 1;
    const isFirstSection = profileSection === 0;

    const handleSectionNext = () => {
      if (isLastSection) {
        goToVerify(false);
      } else {
        setProfileSection((n) => n + 1);
      }
    };

    const handleSectionBack = () => {
      if (isFirstSection) {
        setStep("form");
      } else {
        setProfileSection((n) => n - 1);
      }
    };

    const handleSkipSection = () => {
      if (isLastSection) {
        goToVerify(false);
      } else {
        setProfileSection((n) => n + 1);
      }
    };

    return (
      <div className="flex flex-col gap-4">
        <RegisterStepBar current="profile" />

        {/* Section progress */}
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">
            {PROFILE_SECTIONS[profileSection]}
          </span>
          <span className="text-xs text-slate-500">
            {profileSection + 1} / {PROFILE_SECTIONS.length}
          </span>
        </div>
        <div className="-mt-2 mb-2 h-1 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-orange-400 transition-all duration-300"
            style={{ width: `${((profileSection + 1) / PROFILE_SECTIONS.length) * 100}%` }}
          />
        </div>

          <p className="text-sm text-slate-300">
          Helps us personalise your listings, matches, and copilot context. All optional — skip any section.
        </p>

        {/* ── Section 0: Contact ── */}
        {profileSection === 0 && (
          <div className="rounded-xl border border-white/15 bg-slate-800/60 p-4">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-orange-400">Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-base font-semibold text-slate-100">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  className={clsx(glassInput, "py-2.5")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-base font-semibold text-slate-100">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  className={clsx(glassInput, "py-2.5")}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <label className="text-base font-semibold text-slate-100">Company name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Metals Ltd."
                  className={clsx(glassInput, "py-2.5")}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-2">
                <label className="text-base font-semibold text-slate-100">Job title</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Procurement Manager"
                  className={clsx(glassInput, "py-2.5")}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Section 1: Trading Profile ── */}
        {profileSection === 1 && (
          <div className="rounded-xl border border-white/15 bg-slate-800/60 p-4">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-orange-400">Trading Profile</p>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-base font-semibold text-slate-100">Line of business</label>
                <ChipSelect value={lineOfBusiness} options={MATERIAL_CATEGORIES} onChange={setLineOfBusiness} />
              </div>
              {accountType !== "seller" && (
                <div className="flex flex-col gap-2">
                  <label className="text-base font-semibold text-slate-100">Materials you buy</label>
                  <ChipSelect value={buyInterests} options={MATERIAL_CATEGORIES} onChange={setBuyInterests} />
                </div>
              )}
              {accountType !== "buyer" && (
                <div className="flex flex-col gap-2">
                  <label className="text-base font-semibold text-slate-100">Materials you sell</label>
                  <ChipSelect value={sellCategories} options={MATERIAL_CATEGORIES} onChange={setSellCategories} />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="text-base font-semibold text-slate-100">Annual trading volume</label>
                <ChipSelect value={annualVolume} options={ANNUAL_VOLUMES} onChange={setAnnualVolume} />
              </div>
              {accountType !== "buyer" && (
                <div className="flex flex-col gap-2">
                  <label className="text-base font-semibold text-slate-100">Typical lot size</label>
                  <ChipSelect value={lotSize} options={LOT_SIZES} onChange={setLotSize} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Section 2: Commercial Preferences ── */}
        {profileSection === 2 && (
          <div className="rounded-xl border border-white/15 bg-slate-800/60 p-4">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-orange-400">Commercial Preferences</p>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-base font-semibold text-slate-100">Matex services you plan to use</label>
                <ChipSelect value={services} options={MATEX_SERVICES} onChange={setServices} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-base font-semibold text-slate-100">Preferred payment method</label>
                <ChipSelect value={paymentPrefs} options={PAYMENT_METHODS} onChange={setPaymentPrefs} />
              </div>
              {accountType !== "seller" && (
                <div className="flex flex-col gap-2">
                  <label className="text-base font-semibold text-slate-100">My purchasing decision role</label>
                  <ChipSelect value={decisionAuthority} options={DECISION_ROLES} onChange={setDecisionAuthority} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Section 3: Geography ── */}
        {profileSection === 3 && (
          <div className="rounded-xl border border-white/15 bg-slate-800/60 p-4">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-orange-400">Geography</p>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-base font-semibold text-slate-100">Primary operating provinces</label>
                <ChipSelect value={provinces} options={CA_PROVINCES} onChange={setProvinces} />
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
                <div
                  role="switch"
                  aria-checked={crossBorder}
                  onClick={() => setCrossBorder((v) => !v)}
                  className={clsx(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    crossBorder ? "bg-orange-500" : "bg-slate-600"
                  )}
                >
                  <span
                    className={clsx(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                      crossBorder ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </div>
                <span className="text-base font-medium text-slate-100">I trade Canada–US cross-border</span>
              </label>
            </div>
          </div>
        )}

        {/* ── Section 4: How We Found Each Other ── */}
        {profileSection === 4 && (
          <div className="rounded-xl border border-white/15 bg-slate-800/60 p-4">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-orange-400">How We Found Each Other</p>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-base font-semibold text-slate-100">How did you hear about Matex?</label>
                <ChipSelect value={referralSource} options={REFERRAL_SOURCES} onChange={setReferralSource} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-base font-semibold text-slate-100">Preferred way to be contacted</label>
                <ChipSelect value={commPreference} options={COMM_PREFERENCES} onChange={setCommPreference} />
              </div>
            </div>
          </div>
        )}

        {globalError && (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/15 px-3 py-2.5">
            <p className="text-sm text-red-100">{globalError}</p>
          </div>
        )}

        <SubmitButton loading={loading} onClick={handleSectionNext}>
          {isLastSection ? "Continue to verification" : "Next"}
        </SubmitButton>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleSectionBack}
            className="text-sm text-slate-400 hover:text-white"
          >
            ← Back
          </button>
          <div className="flex gap-4">
            <button
              type="button"
              disabled={loading}
              onClick={handleSkipSection}
              className="text-sm text-slate-400 hover:text-white disabled:opacity-50"
            >
              Skip section
            </button>
            {!isLastSection && (
              <button
                type="button"
                disabled={loading}
                onClick={() => goToVerify(false)}
                className="text-sm text-orange-400/70 hover:text-orange-300 disabled:opacity-50"
              >
                Skip all →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Account credentials ──
  return (
    <div className="flex flex-col gap-4">
      <RegisterStepBar current="form" />
      <form onSubmit={handleRegister} className="flex flex-col gap-4" noValidate>
        <GlassEmailInput
          id="register-email"
          label="Email address"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          error={fieldErrors.email}
          required
        />

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-200">Phone number</label>
          <div className="flex">
            <span className="inline-flex items-center rounded-l-2xl border border-r-0 border-slate-600 bg-white/5 px-3 text-sm text-slate-400 select-none">
              +1
            </span>
            <input
              type="tel"
              value={phone.startsWith("+1") ? phone.slice(2) : phone}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                setPhone(`+1${digits}`);
              }}
              placeholder="416 555 0100"
              className={clsx(
                glassInput,
                "flex-1 rounded-l-none rounded-r-2xl",
                fieldErrors.phone && "border-red-400 focus:ring-red-400"
              )}
            />
          </div>
          {fieldErrors.phone && (
            <p className="text-xs text-red-300" role="alert">{fieldErrors.phone}</p>
          )}
        </div>

        <GlassPasswordInput
          id="register-password"
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder="Min. 8 characters"
          error={fieldErrors.password}
          autoComplete="new-password"
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-slate-200">I am primarily a</span>
          <div className="flex gap-2">
            {(["buyer", "seller", "both"] as AccountType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setAccountType(type)}
                className={clsx(
                  "flex-1 rounded-xl border py-2 text-sm font-medium capitalize transition-colors",
                  accountType === type
                    ? "border-orange-400 bg-orange-500/25 text-white shadow-sm"
                    : "border-slate-600 bg-white/5 text-slate-300 hover:border-slate-500 hover:bg-white/10"
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {globalError && (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/15 px-3 py-2.5">
            <p className="text-sm text-red-100">{globalError}</p>
          </div>
        )}

        <SubmitButton loading={loading}>Create account &amp; continue</SubmitButton>

        <p className="text-center text-base text-slate-300">
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="font-bold text-white underline-offset-2 hover:text-slate-100 hover:underline"
          >
            Sign in
          </button>
        </p>
      </form>
    </div>
  );
}

/** Full-screen login videos in `public/` — played back-to-back, then repeat. */
const LOGIN_BG_VIDEOS = ["/login-bg3.mp4", "/login-bg2.mp4"] as const;

const LOGIN_HERO_TRUST_CHIPS = [
  "CAD settlement & invoicing-ready flows",
  "Canada–US trade documentation awareness",
  "Immutable audit trail for each transaction",
] as const;


const INTRO_LOAD_MS = 1850;
const INTRO_FADE_MS = 720;

const LOADER_STATUS_LINES = [
  "Syncing with Industrial Materials Exchange…",
  "Preparing a secure session…",
  "Loading marketplace tools…",
] as const;

function loginRevealDelay(ms: number): CSSProperties {
  return { "--login-delay": `${ms}ms` } as CSSProperties;
}

// ── Page ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("login");
  const [bgVideoBroken, setBgVideoBroken] = useState(false);
  const [activeVideo, setActiveVideo] = useState(0); // 0 or 1 — index into LOGIN_BG_VIDEOS
  const videoRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)];

  // When active video ends, crossfade to the next one
  function handleVideoEnded() {
    const next = (activeVideo + 1) % LOGIN_BG_VIDEOS.length;
    const nextEl = videoRefs[next].current;
    if (nextEl) {
      nextEl.currentTime = 0;
      void nextEl.play();
    }
    setActiveVideo(next);
  }
  const [introReady, setIntroReady] = useState(false);
  const [loaderDone, setLoaderDone] = useState(false);
  const [loaderLine, setLoaderLine] = useState(0);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const webdriver = Boolean((navigator as { webdriver?: boolean }).webdriver);
    if (reduceMotion || webdriver) {
      setIntroReady(true);
      setLoaderDone(true);
      return;
    }
    const rotate = window.setInterval(
      () => setLoaderLine((n) => (n + 1) % LOADER_STATUS_LINES.length),
      560
    );
    const tReveal = window.setTimeout(() => setIntroReady(true), INTRO_LOAD_MS);
    const tDone = window.setTimeout(
      () => setLoaderDone(true),
      INTRO_LOAD_MS + INTRO_FADE_MS
    );
    return () => {
      window.clearInterval(rotate);
      window.clearTimeout(tReveal);
      window.clearTimeout(tDone);
    };
  }, []);

  return (
    <main
      className="relative min-h-[100dvh] overflow-x-hidden"
      data-login-intro={loaderDone ? "done" : "loading"}
      aria-busy={loaderDone ? undefined : true}
    >
      {/* Full-page video background — crossfade between login-bg3 and login-bg2 */}
      {bgVideoBroken ? (
        <div
          className="absolute inset-0 h-full min-h-full w-full bg-cover bg-center"
          style={{ backgroundImage: "url('/login-bg.png')" }}
          aria-hidden
        />
      ) : (
        <>
          {LOGIN_BG_VIDEOS.map((src, i) => (
            <video
              key={src}
              ref={videoRefs[i]}
              autoPlay={i === 0}
              muted
              playsInline
              preload="auto"
              onEnded={i === activeVideo ? handleVideoEnded : undefined}
              onError={() => setBgVideoBroken(true)}
              className={clsx(
                "absolute inset-0 h-full min-h-full w-full object-cover transition-opacity duration-[2000ms]",
                i === activeVideo ? "opacity-100" : "opacity-0"
              )}
              aria-hidden
            >
              <source src={src} type="video/mp4" />
            </video>
          ))}
        </>
      )}
      {/* Readability overlay — lighter so more of the background video shows through */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-black/45 via-black/40 to-zinc-900/55"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]">
        <div className="metal-texture absolute inset-0" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        aria-hidden
        style={{
          backgroundImage: `linear-gradient(45deg, rgba(148, 163, 184, 0.12) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(148, 163, 184, 0.12) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.12) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.12) 75%)`,
          backgroundSize: "60px 60px",
          backgroundPosition: "0 0, 0 30px, 30px -30px, -30px 0px",
        }}
      />

      {!loaderDone && (
        <div
          className={clsx(
            "fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-black/45 px-6 backdrop-blur-[2px] transition-opacity motion-reduce:transition-none",
            introReady ? "pointer-events-none opacity-0" : "opacity-100"
          )}
          style={{ transitionDuration: `${INTRO_FADE_MS}ms` }}
          aria-hidden={introReady}
        >
          <Loader2 className="login-intro-pulse h-11 w-11 shrink-0 text-orange-400" aria-hidden />
          <p
            className="login-intro-pulse max-w-xs text-center text-sm font-medium leading-snug text-white/95"
            aria-live="polite"
          >
            {LOADER_STATUS_LINES[loaderLine]}
          </p>
          <div className="h-1.5 w-52 max-w-[80vw] overflow-hidden rounded-full bg-white/15">
            <div className="login-loader-bar-fill h-full w-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-orange-400" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
            Initializing
          </span>
        </div>
      )}

      {/* Backdrop — shown when registration is focused */}
      <div
        className={clsx(
          "pointer-events-none fixed inset-0 z-[9] hidden transition-opacity duration-500 lg:block",
          tab === "register" ? "opacity-100 bg-black/35 backdrop-blur-[2px]" : "opacity-0"
        )}
        aria-hidden
      />

      <div
        style={{
          // Animate the grid column widths — hero column collapses to 0 when registering
          gridTemplateColumns:
            tab === "register"
              ? "0fr minmax(0,1fr)"
              : "minmax(0,1fr) minmax(280px,420px)",
        }}
        className={clsx(
          "relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col-reverse gap-8 overflow-hidden px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-8 sm:pt-8 lg:grid lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-12 lg:gap-y-5 lg:px-10 lg:py-10 xl:gap-x-16 lg:[transition:grid-template-columns_500ms_ease]",
          introReady && "login-reveal-active"
        )}
      >
        {/* Hero: left column — spans both rows; slides out + fades when register tab is active */}
        <section
          className={clsx(
            "flex min-w-0 flex-1 flex-col items-start gap-4 overflow-hidden text-left text-white",
            "lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:pb-8",
            "lg:transition-[opacity,transform] lg:duration-500",
            tab === "register"
              ? "lg:opacity-0 lg:pointer-events-none lg:-translate-x-10 lg:scale-[0.97]"
              : "lg:opacity-100 lg:translate-x-0 lg:scale-100"
          )}
          aria-labelledby="login-hero-heading"
        >
          <div
            className="login-reveal-item mb-0 flex flex-col items-start"
            style={loginRevealDelay(0)}
          >
            <Image
              src="/LogoOrangeTrns.png"
              alt="Matex — Industrial Materials Exchange"
              width={220}
              height={75}
              className="block h-auto w-full max-w-[min(100%,10rem)] leading-none drop-shadow-2xl sm:max-w-[14rem]"
              priority
            />
          </div>
          <div className="flex min-w-0 w-full flex-1 flex-col items-start text-left lg:max-w-xl xl:max-w-2xl">
          <h1
            id="login-hero-heading"
            className="login-reveal-item mb-4 text-balance text-4xl font-black leading-[1.08] drop-shadow-md sm:mb-5 sm:text-5xl xl:text-6xl"
            style={loginRevealDelay(80)}
          >
            <span className="block text-white">INDUSTRIAL</span>
            <span className="block text-orange-400">MATERIALS</span>
            <span className="mt-1 block text-2xl font-light tracking-wide text-slate-200 sm:text-3xl xl:text-4xl">
              EXCHANGE
            </span>
          </h1>
          <p
            className="login-reveal-item mb-6 max-w-prose text-base font-light leading-relaxed text-slate-200 drop-shadow sm:text-lg"
            style={loginRevealDelay(240)}
          >
            A B2B marketplace for industrial materials,{" "}
            <span className="font-medium text-orange-300">scrap metals</span>, and{" "}
            <span className="font-medium text-amber-300">surplus equipment</span>
            —structured listings, live auctions, and escrow-backed settlement. An{" "}
            <span className="font-medium text-orange-200">AI copilot</span> ties it together over the same
            MCP-backed tools your team uses in production.
          </p>


          <div
            className="login-reveal-item flex w-full max-w-full flex-col items-start gap-3 border-t border-white/10 pt-4 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2 sm:pt-5"
            style={loginRevealDelay(620)}
          >
            {LOGIN_HERO_TRUST_CHIPS.map((t) => (
              <div key={t} className="flex items-start gap-2 text-xs sm:items-center sm:text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-orange-400 sm:mt-0" />
                <span className="font-medium leading-snug text-slate-100">{t}</span>
              </div>
            ))}
          </div>
          </div>
        </section>

        {/* Spacer — aligns sign-in card top with hero body (below logo); hidden when registering */}
        {tab === "login" && (
          <div
            className="hidden lg:block lg:col-start-2 lg:row-start-1"
            style={{ minHeight: "5rem" }}
            aria-hidden
          />
        )}

        {/* Sign-in — right column; slides to center and expands when registering */}
        <div
          className={clsx(
            "login-reveal-item relative z-10 flex w-full shrink-0 flex-col lg:self-start lg:sticky lg:top-8 lg:transition-all lg:duration-500",
            tab === "register"
              ? "lg:col-start-1 lg:col-span-2 lg:row-start-1 lg:row-span-2 lg:mx-auto lg:max-w-[780px] lg:px-0"
              : "lg:col-start-2 lg:row-start-2 lg:max-w-[420px] lg:pl-2 lg:pr-0"
          )}
          style={loginRevealDelay(340)}
        >
          <div className="flex max-h-[min(90dvh,900px)] flex-col overflow-hidden rounded-2xl border border-slate-500/50 bg-slate-900/80 shadow-2xl backdrop-blur-xl sm:max-h-[min(92dvh,960px)] sm:rounded-3xl lg:max-h-[calc(100dvh-4.5rem)]">
            <div className="min-h-0 flex-1 overflow-y-scroll overscroll-y-contain p-5 sm:p-6 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25 hover:[&::-webkit-scrollbar-thumb]:bg-white/40">
            <div className="mb-5 text-center sm:mb-6">
              <h2 className="mb-2 text-3xl font-bold text-white">
                {tab === "login" ? "Welcome Back" : "Get started"}
              </h2>
              <p className="text-base text-slate-300">
                {tab === "login" ? "Access your trading dashboard" : "Create your Matex marketplace account"}
              </p>
            </div>

            <div className="mb-6 space-y-3">
              <button
                type="button"
                className="group flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:px-6 sm:text-lg"
              >
                <svg className="mr-4 h-6 w-6" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </button>
              <button
                type="button"
                className="group flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-blue-600 px-5 py-3.5 text-base font-semibold text-white shadow-lg transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 sm:px-6 sm:text-lg"
              >
                <svg className="mr-4 h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                Continue with LinkedIn
              </button>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="rounded-full bg-slate-800/80 px-6 font-medium text-slate-400 backdrop-blur-sm">
                  Or continue with email
                </span>
              </div>
            </div>

            <div className="mb-4 flex rounded-2xl border border-slate-600 bg-white/5 p-1">
              {(["login", "register"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={clsx(
                    "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors",
                    tab === t
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {t === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            {tab === "login" ? (
              <LoginForm onSwitchToRegister={() => setTab("register")} />
            ) : (
              <RegisterForm onSwitchToLogin={() => setTab("login")} />
            )}

            <div className="mt-6 flex items-center justify-center gap-2 text-slate-500">
              <ShieldCheck className="h-5 w-5 shrink-0 text-slate-400" />
              <span className="text-center text-sm font-semibold text-slate-400">
                Enterprise-Grade Security &amp; Compliance
              </span>
            </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            By continuing you agree to Matex&apos;s{" "}
            <a href="/terms" className="text-slate-300 underline hover:text-white">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="text-slate-300 underline hover:text-white">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
