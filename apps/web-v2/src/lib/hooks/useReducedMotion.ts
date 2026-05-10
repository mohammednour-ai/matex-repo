"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the `prefers-reduced-motion: reduce` media query. Returns false
 * during SSR / first hydration paint to avoid hydration mismatch; flips to
 * the real value on mount and updates on system preference change.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
