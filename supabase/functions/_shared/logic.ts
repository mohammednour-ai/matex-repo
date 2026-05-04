// MIRROR of packages/shared/logic/src/. Edge Functions deploy bundles only the
// supabase/ directory, so we keep a Deno-native copy here. Keep in sync with
// the @matex/logic package; CI will diff the two paths and fail on drift.

export function generateId(): string {
  return globalThis.crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function roundToTwoDecimals(num: number): number {
  return Math.round(num * 100) / 100;
}

export interface CommissionConfig {
  rate: number;
  minimum: number;
  cap: number;
}

export function calculateCommission(amount: number, config: CommissionConfig): number {
  const commission = roundToTwoDecimals(amount * config.rate);
  return Math.min(Math.max(commission, config.minimum), config.cap);
}

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

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCanadianPhone(phone: string): boolean {
  return /^\+1[2-9]\d{9}$/.test(phone.replace(/[\s\-\(\)]/g, ""));
}

export interface ActOnInput {
  actorId: string;
  ownerIds: ReadonlyArray<string | null | undefined>;
  isAdmin: boolean;
}

export function canActOn({ actorId, ownerIds, isAdmin }: ActOnInput): boolean {
  if (!actorId) return false;
  if (isAdmin) return true;
  return ownerIds.some((id) => id === actorId);
}

export function parsePlatformAdminRow(row: { is_platform_admin?: boolean | null } | null | undefined): boolean {
  return Boolean(row?.is_platform_admin);
}

export interface OkEnvelope<T = unknown> { success: true; data: T }
export interface FailEnvelope { success: false; error: { code: string; message: string } }
export type Envelope<T = unknown> = OkEnvelope<T> | FailEnvelope;

export function okEnvelope<T>(data: T): OkEnvelope<T> {
  return { success: true, data };
}

export function failEnvelope(code: string, message: string): FailEnvelope {
  return { success: false, error: { code, message } };
}
