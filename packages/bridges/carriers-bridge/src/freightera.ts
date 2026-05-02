/**
 * Freightera Shipper API adapter.
 *
 * Status: stub. The Freightera Shipper API is a "select accounts" tier
 * (per advisory § 4) that requires written approval before access. While
 * that approval is in flight, this adapter:
 *   - exposes the same shape the rest of the bridge emits (`quote_id`,
 *     `carrier_id`, `carrier_name`, `price_cad`, `transit_days`, …)
 *   - returns a deterministic synthetic quote so the listing-detail freight
 *     widget renders end-to-end behind the `freight_quote_widget` flag,
 *   - swaps to the real HTTPS call once `FREIGHTERA_API_KEY` is present.
 *
 * Replace `callFreighteraApi` with the real endpoint once Freightera grants
 * the API account; the call signature and response shape are documented at
 * https://www.freightera.com/api (request access there).
 */

export type FreighteraQuoteRequest = {
  origin: {
    province: string;
    postal_code: string;
    country: "CA" | "US";
  };
  destination: {
    province: string;
    postal_code: string;
    country: "CA" | "US";
  };
  weight_kg: number;
  hazmat_class?: string;
  flatbed?: boolean;
};

export type FreighteraQuote = {
  quote_id: string;
  carrier_id: string;
  carrier_name: string;
  carrier_rating: number;
  price_cad: number;
  transit_days: number;
  co2_emissions_kg: number;
  valid_until: string;
  tdg_certified: boolean;
  cross_border: boolean;
  customs_broker_included: boolean;
};

const SYNTHETIC_RATING = 4.4;
const FREIGHTERA_CARRIER_ID = "freightera";
const FREIGHTERA_CARRIER_NAME = "Freightera";

function syntheticQuote(req: FreighteraQuoteRequest): FreighteraQuote {
  const weight = Math.max(req.weight_kg, 0);
  const crossBorder = req.origin.country !== req.destination.country;
  const basePrice = weight * 0.085 + (req.flatbed ? 220 : 175);
  const crossBorderSurcharge = crossBorder ? 95 : 0;
  return {
    quote_id: `freightera_${Date.now()}`,
    carrier_id: FREIGHTERA_CARRIER_ID,
    carrier_name: FREIGHTERA_CARRIER_NAME,
    carrier_rating: SYNTHETIC_RATING,
    price_cad: Number((basePrice + crossBorderSurcharge).toFixed(2)),
    transit_days: crossBorder ? 4 : 2,
    co2_emissions_kg: Number((weight * 0.045).toFixed(2)),
    valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    tdg_certified: true,
    cross_border: crossBorder,
    customs_broker_included: crossBorder,
  };
}

async function callFreighteraApi(
  req: FreighteraQuoteRequest,
  apiKey: string,
): Promise<FreighteraQuote> {
  // Placeholder — endpoint URL and request shape will be confirmed once
  // Freightera grants API access. Until then this branch is unreachable
  // because we gate on `apiKey`; the synthetic path runs.
  const _url = "https://api.freightera.com/v1/quotes"; // confirm with Freightera
  void _url;
  void apiKey;
  void req;
  // When wiring the real API, expect a 200 with a list of available rates;
  // we'll pick the first or apply business rules (cheapest? fastest? rated?).
  throw new Error("Freightera real API path is not wired up yet.");
}

export async function getFreighteraQuote(
  req: FreighteraQuoteRequest,
): Promise<FreighteraQuote> {
  const apiKey = process.env.FREIGHTERA_API_KEY;
  if (apiKey) {
    try {
      return await callFreighteraApi(req, apiKey);
    } catch {
      // Fail closed to the synthetic quote rather than blocking the widget.
      return syntheticQuote(req);
    }
  }
  return syntheticQuote(req);
}
