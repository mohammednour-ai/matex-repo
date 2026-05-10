export default function SearchLoading(): JSX.Element {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="marketplace-card sticky top-24 h-fit max-h-[calc(100vh-7rem)] w-full lg:w-[260px] flex-shrink-0 space-y-4 overflow-y-auto p-4">
        <div className="h-5 w-24 rounded bg-night-700/60 animate-pulse" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 rounded bg-night-700/60 animate-pulse" />
            <div className="h-9 rounded-lg bg-night-800/40 animate-pulse" />
          </div>
        ))}
      </aside>

      <div className="flex-1 space-y-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 flex-1 rounded-lg bg-night-800/40 animate-pulse" />
            <div className="h-10 w-32 rounded-lg bg-night-800/40 animate-pulse" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card p-4">
              <div className="aspect-[4/3] rounded-xl bg-night-800/40 animate-pulse" />
              <div className="mt-3 h-4 w-3/4 rounded bg-night-700/60 animate-pulse" />
              <div className="mt-2 h-3 w-1/2 rounded bg-night-700/40 animate-pulse" />
              <div className="mt-3 h-6 w-20 rounded bg-night-700/60 animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only" role="status" aria-live="polite">Loading search results…</span>
    </div>
  );
}
