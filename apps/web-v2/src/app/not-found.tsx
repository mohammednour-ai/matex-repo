import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-[linear-gradient(165deg,#dbeafe_0%,#f0f7ff_42%,#fff7ed_100%)] px-6 text-center">
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.07)_1px,transparent_1px)] bg-[length:24px_24px] opacity-60"
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
          404
        </p>
        <h1 className="text-2xl font-semibold text-sky-950">
          We couldn&apos;t find that page
        </h1>
        <p className="max-w-md text-sm text-sky-800/80">
          The link may be broken or the page has moved. Head back to your
          dashboard or reach out to the Matex team if you need a hand.
        </p>
      </div>
      <div className="relative flex items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_-4px_rgba(234,88,12,0.45)] hover:bg-brand-400"
        >
          Go to dashboard
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-800 hover:border-orange-300 hover:bg-orange-50/60"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
