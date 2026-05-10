"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/components/system/ThemeProvider";

const OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light",  label: "Light",  icon: Sun     },
  { value: "dark",   label: "Dark",   icon: Moon    },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Segmented theme switcher. 44 px hit-target per option.
 * Phase 4 will mount this inside the user menu in `(app)/layout.tsx`.
 */
export function ThemeToggle(): JSX.Element {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-1 rounded-xl border border-night-700 bg-night-850/80 p-1"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={[
              "flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              active
                ? "bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30"
                : "text-night-300 hover:text-night-100 hover:bg-night-800",
            ].join(" ")}
            title={label}
          >
            <Icon size={18} aria-hidden />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
