"use client";

import {
  ShieldCheck,
  Camera,
  ScrollText,
  ClipboardCheck,
  TrendingUp,
  Lock,
  Check,
  CircleAlert,
} from "lucide-react";
import clsx from "clsx";

/**
 * Trust signals displayed on the listing-detail page.
 *
 * The advisory (`docs/trust-and-safety.md`) calls these out as the highest-
 * leverage UX additions for B2B procurement: a buyer scanning a listing card
 * needs to see the seller is verified, escrow is in place, weight is
 * certifiable, an inspection is bookable, and the price has a reference.
 *
 * Signal strengths:
 *   - "ok"     → green check, the signal is satisfied
 *   - "soft"   → amber dot, the signal is partial / configurable
 *   - "missing"→ neutral dash, the signal is absent (not red — absence isn't
 *                a failure on Phase-1 listings)
 */

type Strength = "ok" | "soft" | "missing";

type SignalRowProps = {
  icon: React.ReactNode;
  title: string;
  body: string;
  strength: Strength;
};

function SignalRow({ icon, title, body, strength }: SignalRowProps) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={clsx(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          strength === "ok" && "bg-emerald-100 text-emerald-700",
          strength === "soft" && "bg-warning-100 text-warning-700",
          strength === "missing" && "bg-steel-100 text-steel-500",
        )}
        aria-hidden
      >
        {strength === "ok" ? (
          <Check className="h-3.5 w-3.5" />
        ) : strength === "soft" ? (
          <CircleAlert className="h-3.5 w-3.5" />
        ) : (
          icon
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-steel-900">{title}</p>
        <p className="mt-0.5 text-xs text-steel-600">{body}</p>
      </div>
    </li>
  );
}

export type ConfidenceStackProps = {
  sellerKycLevel: number;
  photosCount: number;
  certifications: string[];
  inspectionRequired: boolean;
  /** Optional LME or Fastmarkets reference price (CAD/mt). When null we surface a "soft" placeholder. */
  lmeReferenceCadPerMt?: number | null;
};

export function ConfidenceStack({
  sellerKycLevel,
  photosCount,
  certifications,
  inspectionRequired,
  lmeReferenceCadPerMt,
}: ConfidenceStackProps) {
  const verified: Strength = sellerKycLevel >= 2 ? "ok" : sellerKycLevel === 1 ? "soft" : "missing";
  const photoStrength: Strength = photosCount >= 3 ? "ok" : photosCount > 0 ? "soft" : "missing";
  const certStrength: Strength = certifications.length > 0 ? "ok" : "missing";
  const inspectionStrength: Strength = inspectionRequired ? "ok" : "soft";
  const lmeStrength: Strength = lmeReferenceCadPerMt && lmeReferenceCadPerMt > 0 ? "ok" : "soft";

  return (
    <section
      aria-label="Confidence signals"
      className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-5 shadow-sm"
    >
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-steel-900">Trust signals</h2>
          <p className="text-xs text-steel-600">
            What Matex verifies for you on this listing.
          </p>
        </div>
      </header>

      <ul className="space-y-3">
        <SignalRow
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          title={
            verified === "ok"
              ? "Verified seller (Tier 2+)"
              : verified === "soft"
                ? "Standard seller (Tier 1)"
                : "Unverified seller"
          }
          body={
            verified === "ok"
              ? "Corporate registration, beneficial-owner attestation, and sanctions screen all passed."
              : verified === "soft"
                ? "Personal ID + business registration verified. Higher tiers add KYB checks."
                : "Seller has not yet completed identity verification. Buy-now disabled."
          }
          strength={verified}
        />
        <SignalRow
          icon={<Lock className="h-3.5 w-3.5" />}
          title="Escrow protection"
          body="Funds are held by Matex until you accept the shipment. Typical payout within 15 business days of acceptance."
          strength="ok"
        />
        <SignalRow
          icon={<Camera className="h-3.5 w-3.5" />}
          title={photoStrength === "ok" ? `${photosCount} photos` : photosCount === 0 ? "No photos uploaded" : `${photosCount} photo${photosCount === 1 ? "" : "s"}`}
          body={
            photoStrength === "ok"
              ? "Multi-angle imagery uploaded by the seller."
              : photoStrength === "soft"
                ? "Listing has fewer than 3 photos — request more from the seller before bidding."
                : "Photos are required before purchase. Ask the seller to upload before bidding."
          }
          strength={photoStrength}
        />
        <SignalRow
          icon={<ScrollText className="h-3.5 w-3.5" />}
          title={certStrength === "ok" ? `${certifications.length} certification${certifications.length === 1 ? "" : "s"}` : "No certifications uploaded"}
          body={
            certStrength === "ok"
              ? certifications.slice(0, 4).join(" · ") + (certifications.length > 4 ? "…" : "")
              : "No third-party certifications attached. Material grade is seller-declared."
          }
          strength={certStrength}
        />
        <SignalRow
          icon={<ClipboardCheck className="h-3.5 w-3.5" />}
          title={inspectionStrength === "ok" ? "Independent inspection required" : "Inspection optional"}
          body={
            inspectionStrength === "ok"
              ? "A third-party inspector must verify the load before escrow releases."
              : "Buyer may book an independent inspection at the cost listed in the carrier widget."
          }
          strength={inspectionStrength}
        />
        <SignalRow
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          title={
            lmeStrength === "ok"
              ? `Reference price: $${(lmeReferenceCadPerMt ?? 0).toLocaleString("en-CA")} CAD/mt`
              : "Reference price not yet wired"
          }
          body={
            lmeStrength === "ok"
              ? "Compare the listing price against today's LME / Fastmarkets benchmark."
              : "Reference-price feed will be enabled once the Metals-API or Fastmarkets license is provisioned."
          }
          strength={lmeStrength}
        />
      </ul>
    </section>
  );
}
