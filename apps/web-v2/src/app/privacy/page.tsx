import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · Matex",
  description:
    "How Matex collects, uses, and protects personal and business data across the marketplace, escrow, and AI Copilot features.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <Link
        href="/"
        className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700 hover:text-brand-900"
      >
        ← Back to Matex
      </Link>
      <h1 className="mt-6 text-3xl font-extrabold text-steel-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: April 2026</p>

      <section className="mt-8 space-y-6 text-sm leading-relaxed">
        <p>
          Matex respects the privacy of every member of the marketplace. This
          policy explains what information we collect, how we use it, and the
          choices you have. If you have questions, please contact{" "}
          <a className="text-brand-700 underline" href="mailto:privacy@matex.app">
            privacy@matex.app
          </a>
          .
        </p>

        <h2 className="text-lg font-bold text-steel-900">1. Information we collect</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account &amp; identity:</strong> name, business details,
            KYC documentation required to trade.
          </li>
          <li>
            <strong>Marketplace activity:</strong> listings, bids, orders,
            escrow milestones, and shipments.
          </li>
          <li>
            <strong>Communication:</strong> messages between members and with
            our AI Copilot, used to provide and improve the service.
          </li>
          <li>
            <strong>Technical:</strong> IP, browser, and device data needed to
            secure the platform.
          </li>
        </ul>

        <h2 className="text-lg font-bold text-steel-900">2. How we use it</h2>
        <p>
          Data is used to operate the marketplace, verify identity, settle
          escrow, route logistics, prevent fraud, and improve product
          quality. AI Copilot interactions may be reviewed in aggregate to
          improve tooling but are never sold.
        </p>

        <h2 className="text-lg font-bold text-steel-900">3. Sharing</h2>
        <p>
          We share information with payment processors, KYC vendors,
          inspection partners, and logistics carriers strictly as needed to
          execute trades you initiate. We do not sell personal information.
        </p>

        <h2 className="text-lg font-bold text-steel-900">4. Your rights</h2>
        <p>
          You can request access to or deletion of your personal data,
          subject to record-keeping requirements imposed on regulated
          marketplaces. Email{" "}
          <a className="text-brand-700 underline" href="mailto:privacy@matex.app">
            privacy@matex.app
          </a>{" "}
          to make a request.
        </p>

        <h2 className="text-lg font-bold text-steel-900">5. Security</h2>
        <p>
          Funds, KYC documents, and trade artifacts are stored encrypted at
          rest and in transit. Two-factor authentication is strongly
          recommended on all accounts.
        </p>
      </section>
    </main>
  );
}
