"use client";

/**
 * Compact Matex hero language (aligned with login) so the dashboard reads as on-brand.
 */
export function DashboardIdentityBar() {
  return (
    <section
      className="dashboard-identity-bar relative overflow-hidden rounded-2xl border border-night-700 bg-[linear-gradient(135deg,#1a1f27,#20262f_45%,#15191f_100%)] px-5 py-5 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.55)] ring-1 ring-white/5 sm:px-7 sm:py-6"
      aria-labelledby="dashboard-identity-heading"
    >
      {/* Steel grain texture overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden>
        <div className="metal-texture absolute inset-0" />
      </div>
      {/* Restrained orange wash from top-right */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl"
        aria-hidden
      />
      {/* Subtle blue wash from bottom-left for industrial-blueprint feel */}
      <div
        className="pointer-events-none absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-info-500/10 blur-3xl"
        aria-hidden
      />

      <div className="relative min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-brand-400">
          Matex
        </p>
        <h2
          id="dashboard-identity-heading"
          className="mt-1.5 font-black leading-[1.05] tracking-tight text-white"
        >
          <span className="block text-2xl sm:inline sm:text-3xl">INDUSTRIAL</span>{" "}
          <span className="block text-2xl text-brand-400 sm:inline sm:text-3xl">
            MATERIALS
          </span>
          <span className="mt-1 block text-sm font-light uppercase tracking-[0.24em] text-night-200 sm:text-base">
            EXCHANGE
          </span>
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-night-200">
          Scrap & surplus · Escrow-backed settlement ·{" "}
          <span className="font-medium text-info-400">MCP-connected</span> workspace
        </p>
      </div>
    </section>
  );
}
