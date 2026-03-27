"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

type CountdownTimerProps = {
  targetDate: Date | string;
  className?: string;
};

type TimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  ended: boolean;
};

function calcTimeLeft(target: Date): TimeLeft {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    ended: false,
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function CountdownTimer({ targetDate, className }: CountdownTimerProps) {
  const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calcTimeLeft(target));

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(calcTimeLeft(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (timeLeft.ended) {
    return (
      <span className={clsx("text-sm font-semibold text-slate-500", className)}>
        Ended
      </span>
    );
  }

  const totalSecondsLeft =
    timeLeft.days * 86400 + timeLeft.hours * 3600 + timeLeft.minutes * 60 + timeLeft.seconds;
  const isUrgent = totalSecondsLeft < 300;
  const isWarning = totalSecondsLeft < 3600;

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums",
        isUrgent ? "text-red-600" : isWarning ? "text-amber-600" : "text-slate-700",
        className
      )}
    >
      {timeLeft.days > 0 && (
        <>
          <span>{timeLeft.days}d</span>
          <span className="text-slate-400">:</span>
        </>
      )}
      <span>{pad(timeLeft.hours)}h</span>
      <span className="text-slate-400">:</span>
      <span>{pad(timeLeft.minutes)}m</span>
      <span className="text-slate-400">:</span>
      <span>{pad(timeLeft.seconds)}s</span>
    </div>
  );
}
