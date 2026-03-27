"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import clsx from "clsx";

// ── types ──────────────────────────────────────────────────────────────
type Tab = "login" | "register";
type AccountType = "buyer" | "seller" | "both";
type RegisterStep = "form" | "verify";

// ── helpers ────────────────────────────────────────────────────────────
async function callMcp(tool: string, input: Record<string, unknown>) {
  const res = await fetch("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, input }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? data?.message ?? "Request failed");
  }
  return data;
}

// ── sub-components ─────────────────────────────────────────────────────
function PasswordInput({
  label,
  value,
  onChange,
  error,
  placeholder,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  id?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "••••••••"}
          autoComplete="current-password"
          className={clsx(
            "w-full rounded-lg border px-3 py-2 pr-10 text-sm text-slate-900",
            "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors",
            error
              ? "border-red-400 focus:border-red-400 focus:ring-red-300"
              : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
          )}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

// ── Login Tab ──────────────────────────────────────────────────────────
function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await callMcp("auth.login", { email, password });
      localStorage.setItem("matex_token", data.access_token ?? data.token ?? "");
      localStorage.setItem(
        "matex_user",
        JSON.stringify(data.user ?? { email })
      );
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Login failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Input
        label="Email address"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        autoComplete="email"
        required
      />
      <PasswordInput
        id="login-password"
        label="Password"
        value={password}
        onChange={setPassword}
      />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Button type="submit" loading={loading} className="w-full mt-1">
        Sign in
      </Button>

      <div className="text-center">
        <button
          type="button"
          className="text-sm text-blue-600 hover:underline"
        >
          Forgot password?
        </button>
      </div>
    </form>
  );
}

// ── Register Tab ───────────────────────────────────────────────────────
function RegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<RegisterStep>("form");

  // Form fields
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("buyer");

  // OTP step
  const [otpCode, setOtpCode] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!email.includes("@")) errs.email = "Enter a valid email address.";
    if (!/^\+1\d{10}$/.test(phone.replace(/\s/g, "")))
      errs.phone = "Enter a valid +1 Canadian phone number (e.g. +1 416 555 0100).";
    if (password.length < 8) errs.password = "Password must be at least 8 characters.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setGlobalError(null);
    setLoading(true);

    try {
      const regData = await callMcp("auth.register", {
        email,
        phone: phone.replace(/\s/g, ""),
        password,
        account_type: accountType,
      });

      const newUserId = regData.user_id ?? regData.user?.id;
      setUserId(newUserId);

      await callMcp("auth.request_email_otp", { email, user_id: newUserId });
      setStep("verify");
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

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
      await callMcp("auth.verify_email", {
        email,
        code: otpCode,
        user_id: userId,
      });

      // Auto-login after verification
      const loginData = await callMcp("auth.login", { email, password });
      localStorage.setItem("matex_token", loginData.access_token ?? loginData.token ?? "");
      localStorage.setItem(
        "matex_user",
        JSON.stringify(loginData.user ?? { email })
      );
      router.push("/dashboard");
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : "Verification failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  if (step === "verify") {
    return (
      <form onSubmit={handleVerify} className="flex flex-col gap-4" noValidate>
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-3">
          <p className="text-sm text-blue-800">
            We sent a 6-digit code to <strong>{email}</strong>. Enter it below to verify your account.
          </p>
        </div>

        <Input
          label="Verification code"
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          inputMode="numeric"
          maxLength={6}
          error={fieldErrors.otp}
        />

        {globalError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <p className="text-sm text-red-700">{globalError}</p>
          </div>
        )}

        <Button type="submit" loading={loading} className="w-full">
          Verify & continue
        </Button>
        <button
          type="button"
          onClick={() => setStep("form")}
          className="text-sm text-slate-500 hover:text-slate-700 text-center"
        >
          ← Back
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleRegister} className="flex flex-col gap-4" noValidate>
      <Input
        label="Email address"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        autoComplete="email"
        error={fieldErrors.email}
        required
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700">
          Phone number
        </label>
        <div className="flex">
          <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500 select-none">
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
              "flex-1 rounded-r-lg border px-3 py-2 text-sm text-slate-900",
              "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors",
              fieldErrors.phone
                ? "border-red-400 focus:border-red-400 focus:ring-red-300"
                : "border-slate-300 focus:border-blue-500 focus:ring-blue-200"
            )}
          />
        </div>
        {fieldErrors.phone && (
          <p className="text-xs text-red-600" role="alert">{fieldErrors.phone}</p>
        )}
      </div>

      <PasswordInput
        id="register-password"
        label="Password"
        value={password}
        onChange={setPassword}
        placeholder="Min. 8 characters"
        error={fieldErrors.password}
      />

      {/* Account type */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Account type</span>
        <div className="flex gap-2">
          {(["buyer", "seller", "both"] as AccountType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setAccountType(type)}
              className={clsx(
                "flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors",
                accountType === type
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {globalError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
          <p className="text-sm text-red-700">{globalError}</p>
        </div>
      )}

      <Button type="submit" loading={loading} className="w-full mt-1">
        Create account
      </Button>
    </form>
  );
}

// ── Page ───────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("login");

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-blue-600 mb-3">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-white stroke-[2.5] strokeLinecap-round strokeLinejoin-round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Matex</h1>
          <p className="text-sm text-slate-500 mt-1">Canada's B2B recycled materials marketplace</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 ring-1 ring-slate-200 overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-slate-100">
            {(["login", "register"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  "flex-1 py-3.5 text-sm font-medium transition-colors",
                  tab === t
                    ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                )}
              >
                {t === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {/* Form area */}
          <div className="px-6 py-6">
            {tab === "login" ? <LoginForm /> : <RegisterForm />}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          By continuing you agree to Matex's{" "}
          <a href="/terms" className="underline hover:text-slate-600">Terms</a> and{" "}
          <a href="/privacy" className="underline hover:text-slate-600">Privacy Policy</a>.
        </p>
      </div>
    </main>
  );
}
