/**
 * Matex Operational Rules Engine
 * Enforces compliance rules from matex-operations.mdc and matex-canadian-compliance.mdc
 */

export function checkEnvironmentalPermitExpiry(permits: Array<{ expiry: string }>): {
  expired: boolean;
  alerts: Array<{ days_until_expiry: number; level: "warning" | "critical" | "expired" }>;
} {
  const now = Date.now();
  const alerts: Array<{ days_until_expiry: number; level: "warning" | "critical" | "expired" }> = [];
  let expired = false;

  for (const permit of permits) {
    const expiryDate = new Date(permit.expiry).getTime();
    const daysUntil = Math.floor((expiryDate - now) / 86400000);

    if (daysUntil <= 0) {
      expired = true;
      alerts.push({ days_until_expiry: daysUntil, level: "expired" });
    } else if (daysUntil <= 30) {
      alerts.push({ days_until_expiry: daysUntil, level: "critical" });
    } else if (daysUntil <= 60) {
      alerts.push({ days_until_expiry: daysUntil, level: "warning" });
    } else if (daysUntil <= 90) {
      alerts.push({ days_until_expiry: daysUntil, level: "warning" });
    }
  }

  return { expired, alerts };
}

export function getChainOfCustodyRequirements(transactionValue: number): {
  level: "self_declaration" | "purchase_invoice" | "source_documentation" | "full_provenance";
  mandatory_inspection: boolean;
  description: string;
} {
  if (transactionValue > 100000) {
    return { level: "full_provenance", mandatory_inspection: true, description: "Full provenance documentation + mandatory third-party site inspection" };
  }
  if (transactionValue > 25000) {
    return { level: "source_documentation", mandatory_inspection: false, description: "Source documentation + chain of custody form" };
  }
  if (transactionValue > 5000) {
    return { level: "purchase_invoice", mandatory_inspection: false, description: "Purchase invoice or generation certificate" };
  }
  return { level: "self_declaration", mandatory_inspection: false, description: "Self-declaration of ownership" };
}

export function getBookingLeadTime(eventType: string): { min_hours: number; description: string } {
  const leadTimes: Record<string, { min_hours: number; description: string }> = {
    buyer_visit: { min_hours: 24, description: "Buyer on-site visit: 24 hours minimum" },
    third_party_inspection: { min_hours: 48, description: "Third-party inspection: 48 hours minimum" },
    lab_sample: { min_hours: 72, description: "Lab sample collection: 72 hours minimum" },
    live_auction: { min_hours: 168, description: "Live auction session: 7 days minimum" },
    mediation: { min_hours: 48, description: "Mediation meeting: 48 hours minimum" },
    reweigh: { min_hours: 24, description: "Re-weigh appointment: 24 hours minimum" },
    pickup: { min_hours: 24, description: "Carrier pickup: 24 hours minimum" },
  };
  return leadTimes[eventType] ?? { min_hours: 24, description: "Default: 24 hours minimum" };
}

export function validateBookingLeadTime(eventType: string, scheduledAt: string): {
  valid: boolean;
  min_hours: number;
  actual_hours: number;
} {
  const { min_hours } = getBookingLeadTime(eventType);
  const actualHours = (new Date(scheduledAt).getTime() - Date.now()) / 3600000;
  return { valid: actualHours >= min_hours, min_hours, actual_hours: Math.round(actualHours * 10) / 10 };
}

export function validateCAWScaleCertificate(scaleCertified: boolean, scaleCertificate: string | null): {
  valid: boolean;
  error?: string;
} {
  if (!scaleCertified) return { valid: true };
  if (!scaleCertificate || scaleCertificate.trim().length === 0) {
    return { valid: false, error: "scale_certified=true requires a valid CAW certificate number" };
  }
  return { valid: true };
}

export function checkTheftPreventionCoolingPeriod(
  isFirstTimeSeller: boolean,
  materialCategory: string,
  listingCreatedAt: string,
): { blocked: boolean; hours_remaining: number; reason?: string } {
  const highTheftCategories = ["copper", "catalytic_converters", "precious_metals", "non_ferrous"];
  const isHighTheft = highTheftCategories.some((cat) => materialCategory.toLowerCase().includes(cat));

  if (!isFirstTimeSeller || !isHighTheft) return { blocked: false, hours_remaining: 0 };

  const coolingHours = 72;
  const createdAt = new Date(listingCreatedAt).getTime();
  const hoursElapsed = (Date.now() - createdAt) / 3600000;
  const remaining = Math.max(0, coolingHours - hoursElapsed);

  if (remaining > 0) {
    return { blocked: true, hours_remaining: Math.round(remaining * 10) / 10, reason: "72-hour cooling period for first-time sellers of high-theft materials" };
  }
  return { blocked: false, hours_remaining: 0 };
}

export function checkContractBreach(
  contractStatus: string,
  sellerConfirmedWithin48h: boolean,
): { breached: boolean; action: "freeze_escrow" | "admin_alert" | "none" } {
  if (contractStatus !== "active") return { breached: false, action: "none" };
  if (!sellerConfirmedWithin48h) {
    return { breached: true, action: "freeze_escrow" };
  }
  return { breached: false, action: "none" };
}

export function getCancellationRefund(hoursBeforeEvent: number): { refund_pct: number; description: string } {
  if (hoursBeforeEvent > 24) return { refund_pct: 100, description: "Full refund (>24h before event)" };
  if (hoursBeforeEvent >= 12) return { refund_pct: 50, description: "50% refund (12-24h before event)" };
  return { refund_pct: 0, description: "No refund (<12h before event)" };
}
