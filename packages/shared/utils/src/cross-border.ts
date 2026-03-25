/**
 * Matex Cross-Border Trade Module
 * Supports Canada-US corridors per matex-operations.mdc
 */

export type Corridor = "CA_TO_US" | "US_TO_CA";

export type CustomsDocument = {
  type: string;
  required: boolean;
  description: string;
};

export function getRequiredDocuments(corridor: Corridor, value: number, isHazmat: boolean): CustomsDocument[] {
  const docs: CustomsDocument[] = [
    { type: "commercial_invoice", required: true, description: "Commercial Invoice (all cross-border)" },
    { type: "packing_list", required: true, description: "Packing List (all cross-border)" },
  ];

  if (corridor === "CA_TO_US") {
    docs.push({ type: "usmca_certificate", required: true, description: "USMCA Certificate of Origin (duty-free claim)" });
    if (value > 2000) {
      docs.push({ type: "export_declaration_b13a", required: true, description: "Export Declaration B13A via CBSA CERS API (Canada exports > $2,000)" });
    }
  }

  if (corridor === "US_TO_CA") {
    docs.push({ type: "cbsa_import_declaration", required: true, description: "CBSA Import Declaration" });
    docs.push({ type: "cepa_compliance", required: true, description: "CEPA Environmental Compliance Certificate" });
  }

  if (isHazmat) {
    docs.push({ type: "hazmat_declaration", required: true, description: "Hazmat Declaration (TDGR/DOT regulated materials)" });
  }

  return docs;
}

const BANK_OF_CANADA_RATE_PLACEHOLDER = 1.36;

export function convertCurrency(
  amount: number,
  from: "CAD" | "USD",
  to: "CAD" | "USD",
  rate?: number,
): { converted_amount: number; rate: number; markup: number; fee: number } {
  if (from === to) return { converted_amount: amount, rate: 1, markup: 0, fee: 0 };

  const baseRate = rate ?? BANK_OF_CANADA_RATE_PLACEHOLDER;
  const markupPct = 0.005; // 0.5% per matex-operations.mdc
  const effectiveRate = from === "USD" ? baseRate * (1 + markupPct) : (1 / baseRate) * (1 + markupPct);
  const converted = Math.round(amount * effectiveRate * 100) / 100;
  const fee = Math.round(amount * markupPct * 100) / 100;

  return { converted_amount: converted, rate: effectiveRate, markup: markupPct, fee };
}

export function generateUSMCACertificate(params: {
  exporter: string;
  exporter_address: string;
  importer: string;
  importer_address: string;
  material_description: string;
  hs_code: string;
  origin_criterion: string;
  value: number;
  currency: string;
}): {
  certificate_number: string;
  document_type: "usmca_certificate_of_origin";
  data: Record<string, unknown>;
  generated_at: string;
} {
  return {
    certificate_number: `USMCA-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    document_type: "usmca_certificate_of_origin",
    data: {
      ...params,
      blanket_period_from: new Date().toISOString().slice(0, 10),
      blanket_period_to: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      certifier: params.exporter,
    },
    generated_at: new Date().toISOString(),
  };
}

export function screenOFAC(_entityName: string): { cleared: boolean; match_score: number; list_checked: string } {
  return { cleared: true, match_score: 0, list_checked: "OFAC SDN List (stub)" };
}

export function screenCBSA(_entityName: string): { cleared: boolean; match_score: number; list_checked: string } {
  return { cleared: true, match_score: 0, list_checked: "CBSA Sanctions List (stub)" };
}
