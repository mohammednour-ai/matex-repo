"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callTool, setSession, type YardUser } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await callTool<{ token: string; user: YardUser }>("yardops.login", { email, password });

      if (!res.success || !res.data?.token) {
        setError(res.error?.message ?? "Login failed. Please check your credentials.");
        return;
      }

      const { token, user } = res.data;

      // Store in localStorage
      setSession(token, user);

      // Set HTTP-only cookie for middleware
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });

      router.replace("/dashboard");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="yard-card">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10 ring-1 ring-brand-500/30">
          <svg className="h-8 w-8 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-night-100">YardOps</h1>
        <p className="mt-1 text-sm text-night-400">Scrap Yard Management · Ontario</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-night-200">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="yard-input"
            placeholder="operator@youryard.ca"
            aria-describedby={error ? "login-error" : undefined}
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-night-200">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="yard-input"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p id="login-error" role="alert" className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="yard-btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white spin-brand" aria-hidden />
              Signing in…
            </>
          ) : (
            "Sign in to YardOps"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-night-500">
        Need access? Contact your yard administrator.
      </p>
    </div>
  );
}
