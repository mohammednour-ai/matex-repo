import clsx from "clsx";
import type { MarketDemand } from "@/lib/intelligence/types";

const STEPS: MarketDemand[] = ["low", "medium", "high"];
const COLORS: Record<MarketDemand, string> = {
  low: "bg-steel-300",
  medium: "bg-warning-400",
  high: "bg-danger-500",
};

export function DemandGauge({ demand, className }: { demand: MarketDemand; className?: string }) {
  const activeIndex = STEPS.indexOf(demand);
  return (
    <div className={clsx("flex items-center gap-1", className)} role="img" aria-label={`Demand level: ${demand}`}>
      {STEPS.map((step, i) => (
        <span
          key={step}
          className={clsx(
            "h-2 w-6 rounded-full transition-colors",
            i <= activeIndex ? COLORS[demand] : "bg-steel-200",
          )}
        />
      ))}
    </div>
  );
}
