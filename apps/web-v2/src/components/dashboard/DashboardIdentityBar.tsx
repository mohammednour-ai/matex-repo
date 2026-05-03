"use client";

/**
 * Compact Matex hero language (aligned with login) so the dashboard reads as on-brand.
 */
export function DashboardIdentityBar() {
  return (
    <section
      className="dashboard-identity-bar relative overflow-hidden rounded-2xl border border-sky-500/35 bg-gradient-to-br from-sky-950 via-slate-950 to-slate-950 px-5 py-4 shadow-[0_24px_60px_-36px_rgba(30,58,138,0.45)] ring-1 ring-orange-400/15 sm:px-7 sm:py-5"
      aria-labelledby="dashboard-identity-heading"
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden>
        <div className="metal-texture absolute inset-0" />
      </div>
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-orange-400/95">Matex</p>
          <h2
            id="dashboard-identity-heading"
            className="mt-1.5 font-black leading-[1.05] tracking-tight text-white"
          >
            <span className="block text-2xl sm:inline sm:text-3xl">INDUSTRIAL</span>{" "}
            <span className="block text-2xl text-orange-400 sm:inline sm:text-3xl">MATERIALS</span>
            <span className="mt-1 block text-sm font-light uppercase tracking-[0.22em] text-slate-300 sm:text-base">
              EXCHANGE
            </span>
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-right">
          Scrap & surplus · Escrow-backed settlement ·{" "}
          <span className="font-medium text-orange-200/90">MCP-connected</span> workspace
        </p>
      </div>
    </section>
  );
}
