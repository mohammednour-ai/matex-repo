export function formatCAD(amount: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
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
