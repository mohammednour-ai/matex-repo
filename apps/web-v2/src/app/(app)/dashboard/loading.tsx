/**
 * Server-rendered skeleton — streams instantly while page.tsx hydrates and
 * fetches dashboard data. Mirrors the post-load layout (hero + stats row +
 * action grid) so the swap is non-jarring.
 */
export default function DashboardLoading(): JSX.Element {
  return (
    <div className="dashboard-page">
      {/* Hero skeleton — matches the taller DashboardIdentityBar layout
          (min-h-[360px] mobile → 480px desktop, identity panel right column). */}
      <div className="relative overflow-hidden rounded-2xl border border-night-700 bg-[linear-gradient(135deg,#1a1f27,#20262f_45%,#15191f_100%)] min-h-[360px] sm:min-h-[440px] lg:min-h-[480px]">
        <div className="flex h-full min-h-[inherit] flex-col gap-6 px-5 py-6 sm:px-7 sm:py-8 lg:px-9 lg:py-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
            <div className="flex-1 space-y-3">
              <div className="h-3 w-16 rounded bg-night-700/60 animate-pulse" />
              <div className="h-9 w-3/4 max-w-lg rounded-lg bg-night-700/60 animate-pulse" />
              <div className="h-4 w-2/3 max-w-md rounded-lg bg-night-700/40 animate-pulse" />
            </div>
            <div className="h-24 w-full rounded-2xl bg-night-700/40 animate-pulse lg:w-[300px]" />
          </div>
          <div className="flex-1" aria-hidden />
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <div className="h-11 w-full rounded-xl bg-night-700/60 animate-pulse sm:w-44" />
            <div className="h-11 w-full rounded-xl bg-night-700/40 animate-pulse sm:w-44" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="dashboard-stat-card">
            <div className="h-3 w-16 rounded bg-night-700/60 animate-pulse" />
            <div className="mt-2 h-6 w-20 rounded bg-night-700/60 animate-pulse" />
          </div>
        ))}
      </div>

      <div className="dashboard-module-grid">
        <div className="card p-6">
          <div className="h-5 w-40 rounded bg-night-700/60 animate-pulse" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-elevated/40 animate-pulse" />
            ))}
          </div>
        </div>
        <div className="card p-6">
          <div className="h-5 w-32 rounded bg-night-700/60 animate-pulse" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-32 rounded-card bg-elevated/40 animate-pulse" />
            ))}
          </div>
        </div>
      </div>

      <span className="sr-only" role="status" aria-live="polite">Loading dashboard…</span>
    </div>
  );
}
