"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type LotProgressBarProps = {
  startTime: string;
  endTime: string;
  className?: string;
};

/**
 * Visualizes how much of the lot's bidding window has elapsed. Bar fills
 * left-to-right; colour escalates green -> amber -> red as the lot
 * approaches close. In the final 10 seconds the bar pulses (matches the
 * "going once / going twice" cadence buyers expect from a live auction).
 */
export function LotProgressBar({ startTime, endTime, className }: LotProgressBarProps) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const total = Math.max(1, end - start);
  const elapsed = Math.max(0, Math.min(total, now - start));
  const remainingMs = Math.max(0, end - now);
  const remainingSec = Math.floor(remainingMs / 1000);
  const pct = Math.min(100, Math.round((elapsed / total) * 100));

  const phase: "early" | "warning" | "closing" | "final" =
    remainingSec <= 10
      ? "final"
      : remainingSec <= 60
        ? "closing"
        : pct >= 75
          ? "warning"
          : "early";

  const fillClass =
    phase === "final"
      ? "bg-red-500 animate-pulse"
      : phase === "closing"
        ? "bg-red-500"
        : phase === "warning"
          ? "bg-amber-500"
          : "bg-emerald-500";

  const callerLabel: string =
    phase === "final"
      ? remainingSec <= 3
        ? "Sold!"
        : remainingSec <= 6
          ? "Going twice…"
          : "Going once…"
      : phase === "closing"
        ? "Closing soon"
        : phase === "warning"
          ? "Final stretch"
          : "Bidding open";

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={callerLabel}
      className={cn("space-y-1.5", className)}
    >
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full transition-[width] duration-500 ease-linear", fillClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] font-medium">
        <span
          className={cn(
            phase === "final" && "text-red-600",
            phase === "closing" && "text-red-600",
            phase === "warning" && "text-amber-700",
            phase === "early" && "text-emerald-700",
          )}
        >
          {callerLabel}
        </span>
        <span className="text-slate-500 tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}
