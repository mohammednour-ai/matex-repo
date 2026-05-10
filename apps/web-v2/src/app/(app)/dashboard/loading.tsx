/**
 * Server-rendered skeleton — streams instantly while page.tsx hydrates and
 * fetches dashboard data. Mirrors the post-load layout (hero + stats row +
 * action grid) so the swap is non-jarring.
 */
export default function DashboardLoading(): JSX.Element {
  return (
    <div className="dashboard-page">
      <div className="dashboard-hero">
        <div className="dashboard-hero-grid">
          <div className="h-7 w-32 rounded-full bg-elevated/60 animate-pulse" />
          <div className="mt-4 h-9 w-3/4 max-w-lg rounded-lg bg-elevated/60 animate-pulse" />
          <div className="mt-3 h-4 w-2/3 max-w-md rounded-lg bg-elevated/40 animate-pulse" />
          <div className="dashboard-hero-kpis">
            {[0, 1, 2].map((i) => (
              <div key={i} className="dashboard-mini-kpi">
                <div className="h-3 w-20 rounded bg-night-700/60 animate-pulse" />
                <div className="mt-2 h-5 w-16 rounded bg-night-700/60 animate-pulse" />
              </div>
            ))}
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
