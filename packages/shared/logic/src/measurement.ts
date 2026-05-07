import { roundToTwoDecimals } from "./money";

export interface ToleranceResult {
  within: boolean;
  deviation: number;
  deviationPct: number;
}

export function isWithinTolerance(expected: number, actual: number, tolerancePct: number): ToleranceResult {
  const deviation = actual - expected;
  const deviationPct = (deviation / expected) * 100;
  return {
    within: Math.abs(deviationPct) <= tolerancePct,
    deviation: roundToTwoDecimals(deviation),
    deviationPct: roundToTwoDecimals(deviationPct),
  };
}
