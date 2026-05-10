export default function AuctionsLoading(): JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-40 rounded-lg bg-elevated/60 animate-pulse" />
        <div className="mt-2 h-4 w-64 rounded bg-elevated/40 animate-pulse" />
      </div>

      <div className="flex flex-wrap gap-2">
        {["Live", "Upcoming", "Completed"].map((label) => (
          <div key={label} className="h-9 w-24 rounded-full bg-elevated/40 animate-pulse" />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card p-5">
            <div className="flex items-center justify-between">
              <div className="h-5 w-20 rounded-full bg-brand-500/15 animate-pulse" />
              <div className="h-5 w-16 rounded bg-night-700/60 animate-pulse" />
            </div>
            <div className="mt-4 h-6 w-3/4 rounded bg-night-700/60 animate-pulse" />
            <div className="mt-2 h-4 w-1/2 rounded bg-night-700/40 animate-pulse" />
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[0, 1, 2].map((j) => (
                <div key={j} className="space-y-1">
                  <div className="h-3 w-12 rounded bg-night-700/60 animate-pulse" />
                  <div className="h-5 w-16 rounded bg-night-700/60 animate-pulse" />
                </div>
              ))}
            </div>
            <div className="mt-4 h-10 rounded-xl bg-elevated/40 animate-pulse" />
          </div>
        ))}
      </div>

      <span className="sr-only" role="status" aria-live="polite">Loading auctions…</span>
    </div>
  );
}
