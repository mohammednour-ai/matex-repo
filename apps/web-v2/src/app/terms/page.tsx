import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service · Matex",
  description:
    "Matex marketplace terms of service governing use of the platform, listings, auctions, escrow, and logistics.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <Link
        href="/"
        className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700 hover:text-brand-900"
      >
        ← Back to Matex
      </Link>
      <h1 className="mt-6 text-3xl font-extrabold text-sky-900">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: April 2026</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed">
        <p>
          These Terms of Service govern your use of the Matex marketplace
          (&ldquo;Matex&rdquo;, &ldquo;we&rdquo;, or &ldquo;our&rdquo;), an
          AI-native B2B platform for trading recycled materials, surplus
          inventory, and industrial logistics services. By accessing the
          platform you agree to these terms in full.
        </p>

        <h2 className="text-lg font-bold text-sky-900">1. Account &amp; verification</h2>
        <p>
          You must complete identity verification (KYC) appropriate to your
          intended trade volume. Higher KYC levels unlock larger trades, faster
          payouts, and access to escrow. Matex may suspend or remove accounts
          that fail to meet verification or compliance requirements.
        </p>

        <h2 className="text-lg font-bold text-sky-900">2. Listings &amp; auctions</h2>
        <p>
          Sellers are responsible for the accuracy of every listing, including
          material classification, weights, certifications, and logistics
          terms. Buyers are responsible for performing inspections where
          available before completing a purchase. Matex does not own,
          warehouse, or take title to listed materials.
        </p>

        <h2 className="text-lg font-bold text-sky-900">3. Escrow &amp; payments</h2>
        <p>
          Funds held in escrow are released against milestones agreed in the
          purchase contract (e.g. inspection, shipment, delivery). Disputes
          must be raised through the in-app dispute flow before funds are
          released.
        </p>

        <h2 className="text-lg font-bold text-sky-900">4. Acceptable use</h2>
        <p>
          You may not use the platform to list controlled, hazardous, or
          stolen materials, to manipulate auction prices, or to circumvent
          escrow and KYC controls. Violations may result in immediate
          suspension and reporting to the appropriate authorities.
        </p>

        <h2 className="text-lg font-bold text-sky-900">5. Liability</h2>
        <p>
          Matex provides the platform on an &ldquo;as-is&rdquo; basis. To the
          maximum extent permitted by law, Matex is not liable for indirect or
          consequential damages arising from trades executed between members.
        </p>

        <h2 className="text-lg font-bold text-sky-900">6. Contact</h2>
        <p>
          Questions about these terms? Reach us at{" "}
          <a className="text-brand-700 underline" href="mailto:legal@matex.app">
            legal@matex.app
          </a>
          .
        </p>
      </section>
    </main>
  );
}
