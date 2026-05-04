"use client";

import clsx from "clsx";

type MiniSparkBarsProps = {
  /** Up to 7 non-negative values (e.g. daily listing creates). */
  series: number[];
  className?: string;
  /** Short label shown above bars. */
  label?: string;
};

/**
 * Lightweight horizontal micro-bars (no Chart.js). Max value scales the row.
 */
export function MiniSparkBars({ series, className, label }: MiniSparkBarsProps) {
  const vals = (series.length ? series : [0]).slice(-7);
  const max = Math.max(1, ...vals.map((v) => (Number.isFinite(v) ? v : 0)));

  return (
    <div className={clsx("rounded-xl border border-sky-200/80 bg-orange-50/[0.35] px-3 py-2.5", className)}>
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">{label}</p>
      )}
      <div className={clsx("flex h-12 items-end gap-1", label && "mt-1.5")}>
        {vals.map((v, i) => {
          const n = Number.isFinite(v) ? v : 0;
          const px = Math.max(3, Math.round((n / max) * 44));
          return (
            <div
              key={i}
              className="flex h-full flex-1 items-end rounded-sm bg-sky-200/60 px-0.5 pb-0.5 pt-1"
              title={`${n}`}
            >
              <div
                className="w-full rounded-sm bg-gradient-to-t from-orange-600 to-amber-400 transition-all"
                style={{ height: `${px}px` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
