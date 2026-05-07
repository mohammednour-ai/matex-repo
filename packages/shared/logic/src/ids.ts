/**
 * Cross-runtime ID + time helpers. Uses globalThis.crypto, available in Node 19+ and Deno.
 */
export function generateId(): string {
  return globalThis.crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

export function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

export function addHours(date: Date, hours: number): Date {
  const r = new Date(date);
  r.setHours(r.getHours() + hours);
  return r;
}
