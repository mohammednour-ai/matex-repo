"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  Calendar,
  List,
  Weight,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
} from "lucide-react";
import { callTool, getUser } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

type InspectionStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "failed";
type InspectionType = "pre_shipment" | "delivery" | "weight_verification" | "quality_grading" | "lab_sample";

type WeightRecord = {
  w1_seller?: number;
  w2_carrier?: number;
  w3_buyer?: number;
  w4_third_party?: number;
};

type Inspection = {
  inspection_id: string;
  listing_title: string;
  order_id: string;
  type: InspectionType;
  inspector: string;
  scheduled_at: string;
  status: InspectionStatus;
  result?: "pass" | "fail" | "conditional";
  weights: WeightRecord;
  notes?: string;
};

const INSPECTION_TYPE_LABELS: Record<InspectionType, string> = {
  pre_shipment: "Pre-Shipment",
  delivery: "Delivery",
  weight_verification: "Weight Verification",
  quality_grading: "Quality Grading",
  lab_sample: "Lab Sample",
};

function statusBadge(status: InspectionStatus, result?: string) {
  if (status === "completed" && result === "pass") return <Badge variant="success">Passed</Badge>;
  if (status === "completed" && result === "conditional") return <Badge variant="warning">Conditional</Badge>;
  if (status === "failed") return <Badge variant="danger">Failed</Badge>;
  if (status === "in_progress") return <Badge variant="warning">In Progress</Badge>;
  if (status === "scheduled") return <Badge variant="info">Scheduled</Badge>;
  if (status === "cancelled") return <Badge variant="gray">Cancelled</Badge>;
  return <Badge variant="gray">{status}</Badge>;
}

function weightDiscrepancy(weights: WeightRecord): number | null {
  const ref =
    weights.w4_third_party ?? weights.w3_buyer ?? weights.w2_carrier ?? weights.w1_seller;
  const seller = weights.w1_seller;
  if (!ref || !seller) return null;
  return Math.abs((ref - seller) / seller) * 100;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ViewMode = "list" | "calendar";

type RawInspection = Partial<Inspection> & {
  inspection_id: string;
  scheduled_at?: string;
  listing_title?: string;
  listing_id?: string;
  inspector_name?: string;
  inspector_id?: string;
};

function normalizeInspection(raw: RawInspection): Inspection {
  return {
    inspection_id: raw.inspection_id,
    listing_title: raw.listing_title ?? raw.listing_id ?? "Inspection",
    order_id: raw.order_id ?? "",
    type: ((raw.type as InspectionType) ?? "weight_verification"),
    inspector: raw.inspector ?? raw.inspector_name ?? raw.inspector_id ?? "Assigned inspector",
    scheduled_at: raw.scheduled_at ?? new Date().toISOString(),
    status: ((raw.status as InspectionStatus) ?? "scheduled"),
    result: raw.result,
    weights: raw.weights ?? {},
    notes: raw.notes,
  };
}

export default function InspectionPage() {
  const [view, setView] = useState<ViewMode>("list");
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const user = getUser();
      const res = await callTool("inspection.list_inspections", {
        user_id: user?.userId ?? "",
      });
      if (cancelled) return;
      if (res.success) {
        const d = res.data as unknown as { inspections?: RawInspection[] };
        setInspections(Array.isArray(d?.inspections) ? d.inspections.map(normalizeInspection) : []);
      } else {
        setError(res.error?.message ?? "Could not load inspections.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleComplete(inspectionId: string): Promise<void> {
    setActionLoading(inspectionId + "complete");
    await callTool("inspection.complete_inspection", { inspection_id: inspectionId, result: "pass" });
    setInspections((prev) =>
      prev.map((i) => i.inspection_id === inspectionId ? { ...i, status: "completed", result: "pass" } : i)
    );
    setActionLoading(null);
  }

  async function handleFlagDiscrepancy(inspectionId: string): Promise<void> {
    setActionLoading(inspectionId + "discrepancy");
    await callTool("inspection.evaluate_discrepancy", { inspection_id: inspectionId });
    setActionLoading(null);
  }

  const upcomingThisWeek = inspections.filter((i) => {
    const diff = new Date(i.scheduled_at).getTime() - Date.now();
    return diff > 0 && diff < 604800000 && i.status === "scheduled";
  });

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Inspections"
        description="Track weight certification and quality grading for your orders."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                view === "list" ? "bg-brand-600 text-white shadow-sm" : "border border-steel-300 text-steel-600 hover:bg-steel-50"
              }`}
            >
              <List className="h-4 w-4" /> List
            </button>
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                view === "calendar" ? "bg-brand-600 text-white shadow-sm" : "border border-steel-300 text-steel-600 hover:bg-steel-50"
              }`}
            >
              <Calendar className="h-4 w-4" /> Week
            </button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Scheduled", value: inspections.filter((i) => i.status === "scheduled").length, color: "text-blue-600" },
          { label: "This Week", value: upcomingThisWeek.length, color: "text-amber-600" },
          { label: "Completed", value: inspections.filter((i) => i.status === "completed").length, color: "text-emerald-600" },
          { label: "Failed", value: inspections.filter((i) => i.status === "failed").length, color: "text-red-600" },
        ].map((c) => (
          <div key={c.label} className="marketplace-card p-4">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={`mt-1 text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-5 w-5 text-brand-500" />
        </div>
      ) : view === "calendar" ? (
        <CalendarView inspections={inspections} />
      ) : inspections.length === 0 ? (
        <EmptyState
          image="/illustrations/inspection-pending.png"
          title="No inspections yet"
          description="Scheduled CAW weight checks and grading visits will appear here."
          size="lg"
        />
      ) : (
        <div className="marketplace-card overflow-hidden">
          <div className="divide-y divide-slate-100">
            {inspections.map((insp) => (
              <InspectionRow
                key={insp.inspection_id}
                inspection={insp}
                expanded={expandedId === insp.inspection_id}
                onToggle={() => setExpandedId((p) => (p === insp.inspection_id ? null : insp.inspection_id))}
                actionLoading={actionLoading}
                onComplete={handleComplete}
                onFlagDiscrepancy={handleFlagDiscrepancy}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InspectionRow({
  inspection: insp,
  expanded,
  onToggle,
  actionLoading,
  onComplete,
  onFlagDiscrepancy,
}: {
  inspection: Inspection;
  expanded: boolean;
  onToggle: () => void;
  actionLoading: string | null;
  onComplete: (id: string) => Promise<void>;
  onFlagDiscrepancy: (id: string) => Promise<void>;
}) {
  const discrepancy = weightDiscrepancy(insp.weights);
  const hasDiscrepancy = discrepancy !== null && discrepancy > 2;

  return (
    <div>
      <div
        className="flex cursor-pointer flex-wrap items-center gap-4 px-5 py-4 hover:bg-slate-50 transition"
        onClick={onToggle}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-900 text-sm truncate">{insp.listing_title}</p>
            {statusBadge(insp.status, insp.result)}
            <Badge variant="gray">{INSPECTION_TYPE_LABELS[insp.type]}</Badge>
            {hasDiscrepancy && (
              <Badge variant="danger">⚠ Weight Discrepancy {discrepancy?.toFixed(1)}%</Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><User className="h-3 w-3" />{insp.inspector}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(insp.scheduled_at)}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 space-y-4">
          {/* Weight chain */}
          {Object.values(insp.weights).some((v) => v !== undefined) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Weight Certification Chain (kg)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { key: "w1_seller", label: "W1 — Seller" },
                    { key: "w2_carrier", label: "W2 — Carrier" },
                    { key: "w3_buyer", label: "W3 — Buyer" },
                    { key: "w4_third_party", label: "W4 — CAW Certified" },
                  ] as { key: keyof WeightRecord; label: string }[]
                ).map(({ key, label }, i, arr) => {
                  const val = insp.weights[key];
                  if (!val) return null;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <div className={`rounded-lg border-2 p-3 text-center min-w-[100px] ${key === "w4_third_party" ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                        <p className={`text-xs font-medium mb-1 ${key === "w4_third_party" ? "text-emerald-700" : "text-slate-500"}`}>{label}</p>
                        <p className={`text-base font-bold ${key === "w4_third_party" ? "text-emerald-800" : "text-slate-800"}`}>
                          {val.toLocaleString()} kg
                        </p>
                        {key === "w4_third_party" && <p className="text-[10px] text-emerald-600 mt-0.5">Authoritative</p>}
                      </div>
                      {i < arr.filter((a) => insp.weights[a.key] !== undefined).length - 1 && (
                        <span className="text-slate-300 text-lg">→</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {hasDiscrepancy && (
                <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Discrepancy of {discrepancy?.toFixed(2)}% exceeds the 2% tolerance threshold.
                </p>
              )}
            </div>
          )}

          {insp.notes && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-500 mb-1">Inspector Notes</p>
              <p className="text-sm text-slate-700">{insp.notes}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {insp.status === "scheduled" || insp.status === "in_progress" ? (
              <Button
                size="sm"
                loading={actionLoading === insp.inspection_id + "complete"}
                onClick={(e) => { e.stopPropagation(); onComplete(insp.inspection_id); }}
              >
                <CheckCircle className="h-3.5 w-3.5" /> Mark Complete
              </Button>
            ) : null}
            {hasDiscrepancy && (
              <Button
                size="sm"
                variant="danger"
                loading={actionLoading === insp.inspection_id + "discrepancy"}
                onClick={(e) => { e.stopPropagation(); onFlagDiscrepancy(insp.inspection_id); }}
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Flag Discrepancy
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarView({ inspections }: { inspections: Inspection[] }) {
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm overflow-x-auto">
      <p className="text-sm font-semibold text-slate-600 mb-4">Week of {today.toLocaleDateString("en-CA", { month: "long", day: "numeric" })}</p>
      <div className="grid grid-cols-7 gap-2 min-w-[700px]">
        {weekDays.map((day) => {
          const dayInspections = inspections.filter((i) => {
            const d = new Date(i.scheduled_at);
            return (
              d.getFullYear() === day.getFullYear() &&
              d.getMonth() === day.getMonth() &&
              d.getDate() === day.getDate()
            );
          });
          const isToday = day.toDateString() === today.toDateString();
          return (
            <div key={day.toISOString()} className={`rounded-lg border p-2 min-h-[100px] ${isToday ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}>
              <p className={`text-xs font-semibold mb-2 ${isToday ? "text-blue-700" : "text-slate-500"}`}>
                {day.toLocaleDateString("en-CA", { weekday: "short" })}{" "}
                <span className={isToday ? "text-blue-900" : "text-slate-800"}>{day.getDate()}</span>
              </p>
              <div className="space-y-1">
                {dayInspections.map((i) => (
                  <div key={i.inspection_id} className="rounded bg-blue-600 px-1.5 py-1 text-[10px] font-medium text-white truncate">
                    {i.listing_title.split("—")[0].trim()}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
