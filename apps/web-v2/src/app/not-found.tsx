import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-steel-950 px-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">
          404
        </p>
        <h1 className="text-2xl font-semibold text-white">
          We couldn&apos;t find that page
        </h1>
        <p className="max-w-md text-sm text-steel-300">
          The link may be broken or the page has moved. Head back to your
          dashboard or reach out to the Matex team if you need a hand.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_-4px_rgba(234,88,12,0.45)] hover:bg-brand-400"
        >
          Go to dashboard
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-steel-700 px-4 py-2 text-sm font-semibold text-steel-200 hover:border-steel-500"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
