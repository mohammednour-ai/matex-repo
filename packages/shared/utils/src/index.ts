/**
 * MATEX Shared Utilities
 */
import { createHash, randomUUID } from "node:crypto";

// ============================================================================
// ID Generation
// ============================================================================

export function generateId(): string {
  return randomUUID();
}

// ============================================================================
// Date/Time
// ============================================================================

export function now(): string {
  return new Date().toISOString();
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

// ============================================================================
// Currency
// ============================================================================

export function formatCAD(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

export function roundToTwoDecimals(num: number): number {
  return Math.round(num * 100) / 100;
}

// ============================================================================
// Commission Calculation
// ============================================================================

interface CommissionConfig {
  rate: number; // e.g. 0.035 for 3.5%
  minimum: number; // e.g. 25
  cap: number; // e.g. 5000
}

export function calculateCommission(amount: number, config: CommissionConfig): number {
  const commission = roundToTwoDecimals(amount * config.rate);
  return Math.min(Math.max(commission, config.minimum), config.cap);
}

// ============================================================================
// Weight Tolerance
// ============================================================================

export function isWithinTolerance(
  expected: number,
  actual: number,
  tolerancePct: number
): { within: boolean; deviation: number; deviationPct: number } {
  const deviation = actual - expected;
  const deviationPct = (deviation / expected) * 100;
  return {
    within: Math.abs(deviationPct) <= tolerancePct,
    deviation: roundToTwoDecimals(deviation),
    deviationPct: roundToTwoDecimals(deviationPct),
  };
}

// ============================================================================
// Validation
// ============================================================================

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCanadianPhone(phone: string): boolean {
  return /^\+1[2-9]\d{9}$/.test(phone.replace(/[\s\-\(\)]/g, ""));
}

export function isValidPostalCode(code: string): boolean {
  return /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(code);
}

export function isValidBusinessNumber(bn: string): boolean {
  return /^\d{9}(RT\d{4})?$/.test(bn.replace(/[\s\-]/g, ""));
}

// ============================================================================
// Sanitization (for logging)
// ============================================================================

export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ["password", "token", "secret", "credit_card", "sin", "ssn", "account_number"];
  const sanitized = { ...obj };
  
  for (const key of Object.keys(sanitized)) {
    if (sensitive.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = "[REDACTED]";
    }
  }
  
  return sanitized;
}

// ============================================================================
// Hashing
// ============================================================================

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export * from "./event-bus";
export { callServer } from "./inter-server";
export * from "./operational-rules";
export * from "./cross-border";
