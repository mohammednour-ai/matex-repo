/**
 * Canonical material catalog for the intelligence pipeline.
 *
 * Keys are stable identifiers used in `intelligence_mcp.market_intelligence`,
 * `price_alerts`, and recommendation lookups. Adding a material here makes it
 * automatically picked up by the daily pipeline and the dashboard.
 *
 * `baseLmePrice` and `volatility` only seed the deterministic stub feeds in
 * `lib/intelligence/sources.ts`; once the live LME/Fastmarkets adapters are
 * wired they're ignored.
 */

export type MaterialUnit = "mt" | "lb";

export type MaterialDefinition = {
  key: string;
  label: string;
  category: "ferrous" | "non_ferrous" | "specialty";
  unit: MaterialUnit;
  /** Currency-per-unit anchor used by the stub LME adapter. */
  baseLmePrice: number;
  /** Daily price drift magnitude (fraction). */
  volatility: number;
  /** Human-readable spec / typical assay used in AI prompts. */
  spec: string;
};

export const MATERIALS: MaterialDefinition[] = [
  {
    key: "copper_2",
    label: "Copper #2",
    category: "non_ferrous",
    unit: "mt",
    baseLmePrice: 4820,
    volatility: 0.018,
    spec: "Copper Birch/Cliff, 96% min Cu, ISRI #2 grade.",
  },
  {
    key: "copper_1",
    label: "Copper #1 (Berry/Cliff)",
    category: "non_ferrous",
    unit: "mt",
    baseLmePrice: 5120,
    volatility: 0.016,
    spec: "Bare bright copper wire, 99% min Cu, ISRI Berry/Cliff.",
  },
  {
    key: "aluminum_ubc",
    label: "Aluminum UBC",
    category: "non_ferrous",
    unit: "lb",
    baseLmePrice: 1.12,
    volatility: 0.022,
    spec: "Used Beverage Cans, baled, ISRI Talc.",
  },
  {
    key: "aluminum_extrusion",
    label: "Aluminum Extrusion 6063",
    category: "non_ferrous",
    unit: "mt",
    baseLmePrice: 2280,
    volatility: 0.018,
    spec: "Clean 6063 extrusion, free of attachments.",
  },
  {
    key: "steel_hms_1_2",
    label: "Steel HMS 1/2",
    category: "ferrous",
    unit: "mt",
    baseLmePrice: 385,
    volatility: 0.025,
    spec: "Heavy Melting Steel 1/2 mix, ISRI 200/201.",
  },
  {
    key: "stainless_304",
    label: "Stainless 304 Solids",
    category: "specialty",
    unit: "mt",
    baseLmePrice: 1480,
    volatility: 0.02,
    spec: "Type 304 stainless steel solids, low free-iron.",
  },
];

export const MATERIAL_BY_KEY: Record<string, MaterialDefinition> = Object.fromEntries(
  MATERIALS.map((m) => [m.key, m]),
);

export function getMaterial(key: string): MaterialDefinition | null {
  return MATERIAL_BY_KEY[key] ?? null;
}

/** Best-effort label-to-key resolution for free-text input from the listing form. */
export function resolveMaterialKey(input: string | null | undefined): string | null {
  if (!input) return null;
  const norm = input.trim().toLowerCase();
  const direct = MATERIALS.find((m) => m.key === norm);
  if (direct) return direct.key;
  const byLabel = MATERIALS.find((m) => m.label.toLowerCase() === norm);
  if (byLabel) return byLabel.key;
  // Fuzzy contains match on key tokens (e.g. "copper" → copper_2).
  const contains = MATERIALS.find((m) => norm.includes(m.key.split("_")[0]!));
  return contains?.key ?? null;
}
