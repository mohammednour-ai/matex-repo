export default function ListingsLoading(): JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-48 rounded-lg bg-night-800/60 animate-pulse" />
        <div className="mt-2 h-4 w-72 rounded bg-night-800/40 animate-pulse" />
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 flex-1 min-w-[200px] rounded-lg bg-night-800/40 animate-pulse" />
          <div className="h-10 w-32 rounded-lg bg-night-800/40 animate-pulse" />
          <div className="h-10 w-32 rounded-lg bg-night-800/40 animate-pulse" />
        </div>
      </div>

      <div className="card-dense overflow-hidden">
        <div className="border-b border-night-700/60 bg-night-900/40 px-4 py-3">
          <div className="grid grid-cols-6 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-3 rounded bg-night-700/60 animate-pulse" />
            ))}
          </div>
        </div>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
          <div key={row} className="grid grid-cols-6 gap-4 border-b border-night-700/60 px-4 py-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 rounded bg-night-800/40 animate-pulse" />
            ))}
          </div>
        ))}
      </div>

      <span className="sr-only" role="status" aria-live="polite">Loading listings…</span>
    </div>
  );
}
