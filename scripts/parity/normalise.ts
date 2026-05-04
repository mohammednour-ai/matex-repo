// Strip volatile fields so edge↔MCP envelopes can be compared structurally.
// Fields matching VOLATILE_KEY_PATTERN are replaced with sentinel strings;
// everything else is preserved verbatim so commission math, status strings,
// and array shapes still diff exactly.

const VOLATILE_KEY_PATTERN = /(_id$|_at$|^request_id$|^timestamp$|^token$)/i;
const ID_SENTINEL = "<id>";
const TS_SENTINEL = "<ts>";
const REQ_SENTINEL = "<req>";

function sentinelFor(key: string): string {
  if (/_at$/i.test(key) || key.toLowerCase() === "timestamp") return TS_SENTINEL;
  if (key.toLowerCase() === "request_id") return REQ_SENTINEL;
  return ID_SENTINEL;
}

export function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (VOLATILE_KEY_PATTERN.test(k) && (typeof v === "string" || typeof v === "number")) {
        out[k] = sentinelFor(k);
      } else {
        out[k] = normalise(v);
      }
    }
    return out;
  }
  return value;
}

export function diff(edge: unknown, mcp: unknown): { equal: true } | { equal: false; reason: string } {
  const a = JSON.stringify(normalise(edge));
  const b = JSON.stringify(normalise(mcp));
  if (a === b) return { equal: true };
  return { equal: false, reason: `edge=${a}\nmcp =${b}` };
}
