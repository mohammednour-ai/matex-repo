"use client";

import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
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
  bol_url?: string;
};

type CarrierQuote = {
  carrier: string;
  price: number;
  transit_days: number;
  co2_kg: number;
  rating: number;
  recommended?: boolean;
};

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
    bol_url: raw.bol_url,
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
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [weight, setWeight] = useState("");
  const [hazmat, setHazmat] = useState("none");
  const [quotes, setQuotes] = useState<CarrierQuote[] | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState<string | null>(null);
  const [trackLoading, setTrackLoading] = useState<string | null>(null);
  const [bolLoading, setBolLoading] = useState<string | null>(null);
  const [expandedShipment, setExpandedShipment] = useState<string | null>(null);
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
    setQuotesLoading(true);
    const res = await callTool("logistics.get_quotes", {
      origin,
      destination,
      weight_kg: Number(weight),
      hazmat_class: hazmat,
      user_id: getUser()?.userId ?? "",
    });
    const upData = (res.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
    const realQuotes = (upData?.quotes ?? (res.data as unknown as { quotes?: CarrierQuote[] })?.quotes) as CarrierQuote[] | undefined;
    setQuotes(res.success && realQuotes?.length ? realQuotes : []);
    setQuotesLoading(false);
  }

  async function handleBookShipment(carrier: string, price: number): Promise<void> {
    setBookingLoading(carrier);
    const res = await callTool("logistics.book_shipment", { carrier, origin, destination, weight_kg: Number(weight), price });
    const newId = extractId(res, "shipment_id") || `SHP-${Date.now()}`;
    setBookedId(newId);
    setShipments((prev) => [
      {
        shipment_id: newId,
        order_title: `${weight} kg shipment`,
        carrier,
        tracking_number: `${carrier.substring(0, 2).toUpperCase()}-2026-${Math.floor(Math.random() * 900000 + 100000)}`,
        origin,
        destination,
        weight_kg: Number(weight),
        status: "booked",
        eta: new Date(Date.now() + 86400000 * 3).toISOString(),
        co2_kg: price * 0.04,
      },
      ...prev,
    ]);
    setBookingLoading(null);
    setQuotes(null);
  }

  async function handleGenerateBOL(shipmentId: string): Promise<void> {
    setBolLoading(shipmentId);
    await callTool("logistics.generate_bol", { shipment_id: shipmentId });
    setBolLoading(null);
  }

  async function handleTrack(shipmentId: string): Promise<void> {
    setTrackLoading(shipmentId);
    await callTool("logistics.get_shipment", { shipment_id: shipmentId });
    setExpandedShipment((p) => (p === shipmentId ? null : shipmentId));
    setTrackLoading(null);
  }

  const totalCO2 = shipments.reduce((s, sh) => s + sh.co2_kg, 0);

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Logistics"
        description="Manage shipments, get multi-carrier quotes, and track deliveries."
        actions={
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/90 bg-emerald-50/90 px-4 py-2 shadow-sm">
            <Leaf className="h-4 w-4 text-emerald-600" />
            <div className="text-sm">
              <span className="font-semibold text-emerald-800">{totalCO2.toFixed(1)} kg CO₂</span>
              <span className="text-emerald-600"> total emissions tracked</span>
            </div>
          </div>
        }
      />

      {/* Active shipments */}
      <div className="marketplace-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Active Shipments</h2>
        </div>
        {shipmentsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-5 w-5 text-brand-500" />
          </div>
        ) : shipmentsError ? (
          <div className="px-5 py-4 text-sm text-red-700">{shipmentsError}</div>
        ) : shipments.length === 0 ? (
          <EmptyState
            image="/illustrations/shipment-tracking.png"
            title="No shipments yet"
            description="Book your first load below to start tracking pickup, ETA, and proof of delivery."
            size="md"
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {shipments.map((sh) => (
              <div key={sh.shipment_id}>
                <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Truck className="h-4 w-4 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">{sh.order_title}</p>
                      {statusBadge(sh.status)}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {sh.carrier} · {sh.origin} → {sh.destination} · {sh.tracking_number}
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-500 shrink-0">
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
                  <ShipmentTimeline shipment={sh} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Get quotes */}
      <div className="marketplace-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Get Carrier Quotes</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-4">
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
            <label className="text-sm font-medium text-slate-700">Hazmat Class</label>
            <select
              value={hazmat}
              onChange={(e) => setHazmat(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              {HAZMAT_CLASSES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <Button
          loading={quotesLoading}
          disabled={!origin || !destination || !weight}
          onClick={handleGetQuotes}
        >
          Get Quotes
        </Button>

        {bookedId && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle className="h-4 w-4 shrink-0" />
            Shipment booked! ID: <strong className="font-mono">{bookedId}</strong>
          </div>
        )}

        {quotes && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="pb-2 text-left">Carrier</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">Transit</th>
                  <th className="pb-2 text-right">CO₂</th>
                  <th className="pb-2 text-right">Rating</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.sort((a, b) => a.price - b.price).map((q) => (
                  <tr key={q.carrier} className={q.recommended ? "bg-brand-50" : ""}>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{q.carrier}</span>
                        {q.recommended && <Badge variant="info">Best Value</Badge>}
                      </div>
                    </td>
                    <td className="py-3 text-right font-bold text-slate-900">{formatCAD(q.price)}</td>
                    <td className="py-3 text-right text-slate-600">{q.transit_days}d</td>
                    <td className="py-3 text-right text-emerald-600">{q.co2_kg.toFixed(1)} kg</td>
                    <td className="py-3 text-right">{"★".repeat(Math.round(q.rating))} <span className="text-slate-400">{q.rating}</span></td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        loading={bookingLoading === q.carrier}
                        onClick={() => handleBookShipment(q.carrier, q.price)}
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

function ShipmentTimeline({ shipment }: { shipment: Shipment }) {
  const stepMap: Record<ShipmentStatus, number> = {
    pending: 0,
    booked: 1,
    in_transit: 3,
    delivered: 5,
    exception: 3,
  };
  const currentStep = stepMap[shipment.status];

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
      <div className="flex gap-0 overflow-x-auto">
        {TRACKING_STEPS.map((step, i) => (
          <div key={step} className="flex flex-1 items-start min-w-[80px]">
            <div className="flex flex-col items-center w-full">
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= currentStep ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-400"}`}>
                {i < currentStep ? "✓" : i + 1}
              </div>
              <p className={`mt-1 text-center text-[10px] leading-tight ${i <= currentStep ? "text-brand-700 font-medium" : "text-slate-400"}`}>
                {step}
              </p>
            </div>
            {i < TRACKING_STEPS.length - 1 && (
              <div className={`mt-3 h-0.5 flex-1 ${i < currentStep ? "bg-brand-600" : "bg-slate-200"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
