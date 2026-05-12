"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Truck,
  MapPin,
  Weight,
  AlertTriangle,
  Leaf,
  FileText,
  CheckCircle,
  Package,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { callTool, getUser, extractId } from "@/lib/api";
import { showError, showSuccess } from "@/lib/toast";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Spinner } from "@/components/ui/shadcn/spinner";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

type ShipmentStatus = "pending" | "booked" | "in_transit" | "delivered" | "exception";

type Shipment = {
  shipment_id: string;
  order_title: string;
  carrier: string;
  tracking_number: string;
  origin: string;
  destination: string;
  weight_kg: number;
  status: ShipmentStatus;
  eta: string;
  co2_kg: number;
  bol_number?: string;
  last_tracked_at?: string;
};

type CarrierQuote = {
  quote_id: string;
  order_id: string;
  carrier: string;
  carrier_name?: string;
  price: number;
  transit_days: number;
  co2_kg: number;
  rating: number;
  recommended?: boolean;
};

function parseLocation(s: string): { city: string; province: string; postal_code: string } {
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  return { city: parts[0] ?? s, province: parts[1] ?? "", postal_code: parts[2] ?? "" };
}

type RawShipment = Partial<Shipment> & {
  shipment_id: string;
  carrier_name?: string;
  origin_city?: string;
  destination_city?: string;
};

function normalizeShipment(raw: RawShipment): Shipment {
  return {
    shipment_id: raw.shipment_id,
    order_title: raw.order_title ?? `Shipment ${raw.shipment_id.slice(0, 8)}`,
    carrier: raw.carrier ?? raw.carrier_name ?? "",
    tracking_number: raw.tracking_number ?? "",
    origin: raw.origin ?? raw.origin_city ?? "",
    destination: raw.destination ?? raw.destination_city ?? "",
    weight_kg: Number(raw.weight_kg ?? 0),
    status: ((raw.status as ShipmentStatus) ?? "pending"),
    eta: raw.eta ?? new Date().toISOString(),
    co2_kg: Number(raw.co2_kg ?? 0),
    bol_number: raw.bol_number,
  };
}

const HAZMAT_CLASSES = [
  { value: "none", label: "None" },
  { value: "class_1", label: "Class 1 — Explosives" },
  { value: "class_3", label: "Class 3 — Flammable Liquids" },
  { value: "class_8", label: "Class 8 — Corrosives (Lead-Acid)" },
  { value: "class_9", label: "Class 9 — Miscellaneous (Li-Ion)" },
];

function statusBadge(s: ShipmentStatus) {
  const map: Record<ShipmentStatus, { label: string; variant: "success" | "warning" | "danger" | "info" | "gray" }> = {
    pending: { label: "Pending", variant: "gray" },
    booked: { label: "Booked", variant: "info" },
    in_transit: { label: "In Transit", variant: "warning" },
    delivered: { label: "Delivered", variant: "success" },
    exception: { label: "Exception", variant: "danger" },
  };
  return <Badge variant={map[s].variant}>{map[s].label}</Badge>;
}

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function LogisticsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(true);
  const [shipmentsError, setShipmentsError] = useState("");
  const [orderIdInput, setOrderIdInput] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [weight, setWeight] = useState("");
  const [hazmat, setHazmat] = useState("none");
  const [quotes, setQuotes] = useState<CarrierQuote[] | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState("");
  const [bookingLoading, setBookingLoading] = useState<string | null>(null);
  const [trackLoading, setTrackLoading] = useState<string | null>(null);
  const [bolLoading, setBolLoading] = useState<string | null>(null);
  const [bolError, setBolError] = useState<string>("");
  const [trackError, setTrackError] = useState<string>("");
  const [expandedShipment, setExpandedShipment] = useState<string | null>(null);
  // P1-12 — get_shipment also returns the historical carrier quotes for the
  // order. We cache them per shipment so the timeline expand can show what
  // alternatives the operator had at booking time.
  const [trackedQuotes, setTrackedQuotes] = useState<Record<string, CarrierQuote[]>>({});
  const [bookedId, setBookedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setShipmentsLoading(true);
      setShipmentsError("");
      const res = await callTool("logistics.list_shipments", {
        user_id: getUser()?.userId ?? "",
      });
      if (cancelled) return;
      if (res.success) {
        const d = res.data as unknown as { shipments?: RawShipment[] };
        setShipments(Array.isArray(d?.shipments) ? d.shipments.map(normalizeShipment) : []);
      } else {
        setShipmentsError(res.error?.message ?? "Could not load shipments.");
      }
      setShipmentsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGetQuotes(): Promise<void> {
    setQuotesError("");
    const userId = getUser()?.userId ?? "";
    if (!userId) {
      setQuotesError("Sign in to request shipping quotes.");
      return;
    }
    if (!orderIdInput.trim()) {
      setQuotesError("Linked order ID is required to request shipping quotes.");
      return;
    }
    setQuotesLoading(true);
    const res = await callTool("logistics.get_quotes", {
      order_id: orderIdInput.trim(),
      origin: parseLocation(origin),
      destination: parseLocation(destination),
      weight_kg: Number(weight),
      hazmat_class: hazmat,
      requested_by: userId,
    });
    if (!res.success) {
      setQuotesError(res.error?.message ?? "Could not fetch quotes.");
      setQuotes([]);
      setQuotesLoading(false);
      return;
    }
    const upData = (res.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
    const rawQuotes = (upData?.quotes ?? (res.data as unknown as { quotes?: Record<string, unknown>[] })?.quotes) as Record<string, unknown>[] | undefined;
    const normalized: CarrierQuote[] = (rawQuotes ?? []).map((q) => ({
      quote_id: String(q.quote_id ?? ""),
      order_id: String(q.order_id ?? orderIdInput.trim()),
      carrier: String(q.carrier_name ?? q.carrier ?? ""),
      carrier_name: String(q.carrier_name ?? q.carrier ?? ""),
      price: Number(q.price_cad ?? q.price ?? 0),
      transit_days: Number(q.transit_days ?? 0),
      co2_kg: Number(q.co2_emissions_kg ?? q.co2_kg ?? 0),
      rating: Number(q.rating ?? 4.5),
      recommended: Boolean(q.recommended),
    }));
    setQuotes(normalized);
    setQuotesLoading(false);
  }

  async function handleBookShipment(quote: CarrierQuote): Promise<void> {
    const userId = getUser()?.userId ?? "";
    if (!userId) return;
    setBookingLoading(quote.carrier);
    const res = await callTool("logistics.book_shipment", {
      order_id: quote.order_id,
      quote_id: quote.quote_id,
      carrier_name: quote.carrier_name ?? quote.carrier,
      booked_by: userId,
    });
    if (!res.success) {
      setBookingLoading(null);
      setQuotesError(res.error?.message ?? "Could not book shipment.");
      return;
    }
    const newId = extractId(res, "shipment_id") || `SHP-${Date.now()}`;
    setBookedId(newId);
    setShipments((prev) => [
      {
        shipment_id: newId,
        order_title: `${weight} kg shipment`,
        carrier: quote.carrier,
        tracking_number: `${quote.carrier.substring(0, 2).toUpperCase()}-2026-${Math.floor(Math.random() * 900000 + 100000)}`,
        origin,
        destination,
        weight_kg: Number(weight),
        status: "booked",
        eta: new Date(Date.now() + 86400000 * 3).toISOString(),
        co2_kg: quote.price * 0.04,
      },
      ...prev,
    ]);
    setBookingLoading(null);
    setQuotes(null);
  }

  async function handleGenerateBOL(shipmentId: string): Promise<void> {
    setBolLoading(shipmentId);
    setBolError("");
    const res = await callTool("logistics.generate_bol", { shipment_id: shipmentId });
    setBolLoading(null);
    if (!res.success) {
      setBolError(res.error?.message ?? "Could not generate Bill of Lading.");
      showError(res.error, "Could not generate Bill of Lading.");
      return;
    }
    // The tool returns { shipment_id, bol_number }. Read it through both
    // the flat-edge shape and the gateway upstream_response shape, same
    // pattern as everywhere else.
    const data = res.data as Record<string, unknown> | undefined;
    const up = (data?.upstream_response as Record<string, unknown> | undefined)?.data as
      | Record<string, unknown>
      | undefined;
    const bolNumber = String((up?.bol_number ?? data?.bol_number) ?? "");
    if (!bolNumber) {
      setBolError("BoL was generated but no reference number was returned.");
      return;
    }
    setShipments((prev) =>
      prev.map((sh) => (sh.shipment_id === shipmentId ? { ...sh, bol_number: bolNumber } : sh)),
    );
    showSuccess(`Bill of Lading generated: ${bolNumber}`);
  }

  async function handleTrack(shipmentId: string): Promise<void> {
    setTrackLoading(shipmentId);
    setTrackError("");
    const res = await callTool("logistics.get_shipment", { shipment_id: shipmentId });
    setTrackLoading(null);
    if (!res.success) {
      setTrackError(res.error?.message ?? "Could not refresh shipment tracking.");
      // Still toggle the timeline open — it's safe; we just won't have
      // the freshest server-side fields.
      setExpandedShipment((p) => (p === shipmentId ? null : shipmentId));
      return;
    }
    // Merge the freshest server-side fields (status / tracking_number /
    // bol_number / estimated_delivery → eta) into the local row so the
    // timeline reflects reality. The Shipment row's origin / destination /
    // weight are local representations that don't map 1:1 to the DB row
    // (which uses JSONB addresses); leave those alone.
    const data = res.data as Record<string, unknown> | undefined;
    const up = (data?.upstream_response as Record<string, unknown> | undefined)?.data as
      | Record<string, unknown>
      | undefined;
    const fresh = ((up?.shipment ?? data?.shipment) as Record<string, unknown> | undefined) ?? undefined;
    const freshQuotes = ((up?.quotes ?? data?.quotes) as Array<Record<string, unknown>> | undefined) ?? [];
    if (fresh) {
      setShipments((prev) =>
        prev.map((sh) => {
          if (sh.shipment_id !== shipmentId) return sh;
          return {
            ...sh,
            status: ((String(fresh.status ?? sh.status)) as ShipmentStatus),
            tracking_number: String(fresh.tracking_number ?? sh.tracking_number),
            bol_number: fresh.bol_number ? String(fresh.bol_number) : sh.bol_number,
            eta: fresh.estimated_delivery ? String(fresh.estimated_delivery) : sh.eta,
            last_tracked_at: new Date().toISOString(),
          };
        }),
      );
    }
    if (freshQuotes.length > 0) {
      const normalized: CarrierQuote[] = freshQuotes.map((q) => ({
        quote_id: String(q.quote_id ?? ""),
        order_id: String(q.order_id ?? ""),
        carrier: String(q.carrier ?? ""),
        carrier_name: q.carrier_name ? String(q.carrier_name) : undefined,
        price: Number(q.price ?? 0),
        transit_days: Number(q.transit_days ?? 0),
        co2_kg: Number(q.co2_kg ?? 0),
        rating: Number(q.rating ?? 0),
        recommended: Boolean(q.recommended ?? false),
      }));
      setTrackedQuotes((prev) => ({ ...prev, [shipmentId]: normalized }));
    }
    setExpandedShipment((p) => (p === shipmentId ? null : shipmentId));
  }

  const totalCO2 = shipments.reduce((s, sh) => s + sh.co2_kg, 0);

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Logistics"
        description="Manage shipments, get multi-carrier quotes, and track deliveries."
        actions={
          <div className="flex items-center gap-2 rounded-2xl border border-success-500/30/90 bg-success-500/90 px-4 py-2 shadow-sm">
            <Leaf className="h-4 w-4 text-emerald-600" />
            <div className="text-sm">
              <span className="font-semibold text-success-400">{totalCO2.toFixed(1)} kg CO₂</span>
              <span className="text-emerald-600"> total emissions tracked</span>
            </div>
          </div>
        }
      />

      {(bolError || trackError) && (
        <div className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          {bolError || trackError}
        </div>
      )}

      {/* Active shipments */}
      <div className="marketplace-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-line/60">
          <h2 className="text-sm font-semibold text-fg-muted">Active Shipments</h2>
        </div>
        {shipmentsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-5 w-5 text-brand-500" />
          </div>
        ) : shipmentsError ? (
          <div className="px-5 py-4 text-sm text-danger-400">{shipmentsError}</div>
        ) : shipments.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No shipments yet"
            description="Book your first load below to start tracking pickup, ETA, and proof of delivery."
            size="md"
          />
        ) : (
          <div className="divide-y divide-zinc-100">
            {shipments.map((sh) => (
              <div key={sh.shipment_id}>
                <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated">
                    <Image src="/grphs/Icons/shipping-truck-i-truck.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-fg truncate">{sh.order_title}</p>
                      {statusBadge(sh.status)}
                    </div>
                    <p className="text-xs text-fg-subtle mt-0.5">
                      {sh.carrier} · {sh.origin} → {sh.destination} · {sh.tracking_number}
                    </p>
                    {sh.bol_number && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-night-800 px-2 py-0.5 font-mono text-[11px] text-brand-300">
                        <FileText className="h-3 w-3" /> {sh.bol_number}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-fg-subtle shrink-0">
                    <p>ETA: {formatDate(sh.eta)}</p>
                    <p className="flex items-center justify-end gap-1 text-emerald-600">
                      <Leaf className="h-3 w-3" /> {sh.co2_kg.toFixed(1)} kg CO₂
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={trackLoading === sh.shipment_id}
                      onClick={() => handleTrack(sh.shipment_id)}
                    >
                      Track
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={bolLoading === sh.shipment_id}
                      onClick={() => handleGenerateBOL(sh.shipment_id)}
                    >
                      <FileText className="h-3.5 w-3.5" /> BOL
                    </Button>
                  </div>
                </div>
                {expandedShipment === sh.shipment_id && (
                  <ShipmentTimeline
                    shipment={sh}
                    quotes={trackedQuotes[sh.shipment_id] ?? []}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Get quotes */}
      <div className="marketplace-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-fg-muted">Get Carrier Quotes</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-4">
          <Input
            label="Linked Order ID"
            placeholder="ORD-..."
            value={orderIdInput}
            onChange={(e) => setOrderIdInput(e.target.value)}
          />
          <Input
            label="Origin"
            placeholder="Hamilton, ON"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          />
          <Input
            label="Destination"
            placeholder="Montreal, QC"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
          <Input
            label="Weight (kg)"
            type="number"
            placeholder="18000"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-fg-muted">Hazmat Class</label>
            <select
              value={hazmat}
              onChange={(e) => setHazmat(e.target.value)}
              className="rounded-lg border border-line-strong px-3 py-2 text-sm text-fg focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              {HAZMAT_CLASSES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <Button
          loading={quotesLoading}
          disabled={!origin || !destination || !weight || !orderIdInput.trim()}
          onClick={handleGetQuotes}
        >
          Get Quotes
        </Button>
        {quotesError && (
          <div className="mt-3 rounded-lg bg-danger-500/10 px-4 py-2 text-sm text-danger-400">{quotesError}</div>
        )}

        {bookedId && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-success-500/10 px-4 py-3 text-sm text-success-400">
            <CheckCircle className="h-4 w-4 shrink-0" />
            Shipment booked! ID: <strong className="font-mono">{bookedId}</strong>
          </div>
        )}

        {quotes && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                  <th className="pb-2 text-left">Carrier</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">Transit</th>
                  <th className="pb-2 text-right">CO₂</th>
                  <th className="pb-2 text-right">Rating</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {quotes.sort((a, b) => a.price - b.price).map((q) => (
                  <tr key={q.carrier} className={q.recommended ? "bg-brand-500/10" : ""}>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-fg">{q.carrier}</span>
                        {q.recommended && <Badge variant="info">Best Value</Badge>}
                      </div>
                    </td>
                    <td className="py-3 text-right font-bold text-fg">{formatCAD(q.price)}</td>
                    <td className="py-3 text-right text-fg-muted">{q.transit_days}d</td>
                    <td className="py-3 text-right text-emerald-600">{q.co2_kg.toFixed(1)} kg</td>
                    <td className="py-3 text-right">{"★".repeat(Math.round(q.rating))} <span className="text-fg-subtle">{q.rating}</span></td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        loading={bookingLoading === q.carrier}
                        onClick={() => handleBookShipment(q)}
                      >
                        Book
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const TRACKING_STEPS = [
  "Order Created",
  "Pickup Scheduled",
  "Picked Up (W2 Recorded)",
  "In Transit",
  "Out for Delivery",
  "Delivered (W3 Recorded)",
];

function ShipmentTimeline({ shipment, quotes }: { shipment: Shipment; quotes: CarrierQuote[] }) {
  const stepMap: Record<ShipmentStatus, number> = {
    pending: 0,
    booked: 1,
    in_transit: 3,
    delivered: 5,
    exception: 3,
  };
  const currentStep = stepMap[shipment.status];

  return (
    <div className="border-t border-line/60 bg-canvas px-5 py-4 space-y-4">
      <div className="flex gap-0 overflow-x-auto">
        {TRACKING_STEPS.map((step, i) => (
          <div key={step} className="flex flex-1 items-start min-w-[80px]">
            <div className="flex flex-col items-center w-full">
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= currentStep ? "bg-brand-600 text-white" : "bg-night-700 text-fg-subtle"}`}>
                {i < currentStep ? "✓" : i + 1}
              </div>
              <p className={`mt-1 text-center text-[10px] leading-tight ${i <= currentStep ? "text-brand-700 font-medium" : "text-fg-subtle"}`}>
                {step}
              </p>
            </div>
            {i < TRACKING_STEPS.length - 1 && (
              <div className={`mt-3 h-0.5 flex-1 ${i < currentStep ? "bg-brand-600" : "bg-night-700"}`} />
            )}
          </div>
        ))}
      </div>

      {shipment.last_tracked_at && (
        <p className="text-[11px] text-fg-subtle">
          Last refreshed {new Date(shipment.last_tracked_at).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

      {quotes.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            Carrier quotes at booking
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {quotes.map((q) => (
              <li
                key={q.quote_id || `${q.carrier}-${q.price}`}
                className="flex items-center justify-between rounded-lg border border-line/60 bg-surfaceBg px-3 py-1.5 text-xs"
              >
                <span className="truncate text-fg-muted">{q.carrier_name || q.carrier}</span>
                <span className="ml-2 shrink-0 text-fg">
                  ${q.price.toFixed(2)} · {q.transit_days}d
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
