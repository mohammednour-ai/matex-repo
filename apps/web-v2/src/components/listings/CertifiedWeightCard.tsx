import { Scale, ShieldCheck, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

type CertifiedWeightCardProps = {
  declaredQuantity: number;
  unit: string;
  certifiedWeightKg?: number | null;
  certifierName?: string | null;
  certifiedAt?: string | null;
  className?: string;
};

/**
 * Surfaces the listing's certified weight when the seller has uploaded a
 * weighbridge ticket (or equivalent third-party certificate). Falls back to
 * showing the seller-declared weight with a "verification pending" notice so
 * buyers can tell at a glance whether the number is independently audited.
 */
export function CertifiedWeightCard({
  declaredQuantity,
  unit,
  certifiedWeightKg,
  certifierName,
  certifiedAt,
  className,
}: CertifiedWeightCardProps) {
  const hasCertification =
    typeof certifiedWeightKg === "number" && certifiedWeightKg > 0;

  return (
    <section
      aria-label="Certified weight"
      className={cn(
        "rounded-2xl border bg-night-850 p-5 shadow-sm",
        hasCertification ? "border-emerald-100" : "border-night-700",
        className,
      )}
    >
      <header className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            hasCertification
              ? "bg-success-500/15 text-success-400"
              : "bg-night-800 text-night-200",
          )}
          aria-hidden
        >
          <Scale className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-night-100">
            {hasCertification ? "Certified weight" : "Weight verification pending"}
          </h3>
          <p className="text-xs text-night-200">
            {hasCertification
              ? "Independently weighed and certified."
              : "Seller-declared weight. Ask for a weighbridge ticket before bidding."}
          </p>
        </div>
      </header>

      {hasCertification ? (
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="text-night-300">Net weight</dt>
            <dd className="font-semibold text-night-100">
              {certifiedWeightKg!.toLocaleString("en-CA")} kg
            </dd>
          </div>
          {certifierName && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-night-300">Certified by</dt>
              <dd className="flex items-center gap-1.5 font-medium text-night-100 truncate">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">{certifierName}</span>
              </dd>
            </div>
          )}
          {certifiedAt && (
            <div className="flex items-baseline justify-between">
              <dt className="text-night-300">Date</dt>
              <dd className="flex items-center gap-1.5 text-night-200">
                <Clock className="h-3.5 w-3.5 text-night-300" />
                {new Date(certifiedAt).toLocaleDateString("en-CA", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="text-night-300">Declared quantity</dt>
            <dd className="font-semibold text-night-200">
              {declaredQuantity.toLocaleString("en-CA")} {unit}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
