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
