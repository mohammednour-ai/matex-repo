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
        "rounded-2xl border bg-white p-5 shadow-sm",
        hasCertification ? "border-emerald-100" : "border-sky-200",
        className,
      )}
    >
      <header className="mb-4 flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            hasCertification
              ? "bg-emerald-100 text-emerald-700"
              : "bg-sky-100 text-sky-600",
          )}
          aria-hidden
        >
          <Scale className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-sky-900">
            {hasCertification ? "Certified weight" : "Weight verification pending"}
          </h3>
          <p className="text-xs text-sky-600">
            {hasCertification
              ? "Independently weighed and certified."
              : "Seller-declared weight. Ask for a weighbridge ticket before bidding."}
          </p>
        </div>
      </header>

      {hasCertification ? (
        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="text-sky-500">Net weight</dt>
            <dd className="font-semibold text-sky-900">
              {certifiedWeightKg!.toLocaleString("en-CA")} kg
            </dd>
          </div>
          {certifierName && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sky-500">Certified by</dt>
              <dd className="flex items-center gap-1.5 font-medium text-sky-800 truncate">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">{certifierName}</span>
              </dd>
            </div>
          )}
          {certifiedAt && (
            <div className="flex items-baseline justify-between">
              <dt className="text-sky-500">Date</dt>
              <dd className="flex items-center gap-1.5 text-sky-700">
                <Clock className="h-3.5 w-3.5 text-sky-400" />
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
            <dt className="text-sky-500">Declared quantity</dt>
            <dd className="font-semibold text-sky-700">
              {declaredQuantity.toLocaleString("en-CA")} {unit}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
