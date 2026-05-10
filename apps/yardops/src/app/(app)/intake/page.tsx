"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { callTool, getUser } from "@/lib/api";
import { SellerCapture } from "@/components/intake/SellerCapture";
import { ScaleInput } from "@/components/intake/ScaleInput";
import { MaterialGrid } from "@/components/intake/MaterialGrid";
import { PayoutSelector } from "@/components/intake/PayoutSelector";
import { SignaturePad } from "@/components/intake/SignaturePad";
import { TicketSummary } from "@/components/intake/TicketSummary";
import { CheckCircle, ChevronRight } from "lucide-react";

const STEPS = ["Seller", "Weigh", "Materials", "Payout", "Sign"] as const;
type Step = typeof STEPS[number];

type TicketState = {
  ticket_id: string;
  ticket_number: string;
  seller_id: string;
  seller_name: string;
  vehicle_id?: string;
  gross_weight_kg: number;
  tare_weight_kg: number;
  lines: Array<{
    line_id: string;
    material_id: string;
    material_name: string;
    quantity_kg: number;
    unit_price_per_kg: number;
  }>;
  subtotal: number;
  payout_method: string;
  payout_ref: string;
};

export default function IntakePage() {
  const router = useRouter();
  const user = getUser();
  const [step, setStep] = useState<Step>("Seller");
  const [ticket, setTicket] = useState<Partial<TicketState>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);

  const tenantId = user?.tenant_id ?? "";
  const actorId = user?.user_id ?? "";

  const stepIndex = STEPS.indexOf(step);

  async function onSellerSelected(sellerId: string, sellerName: string, vehicleId?: string) {
    setError("");
    setLoading(true);
    try {
      const res = await callTool<{ ticket_id: string; ticket_number: string }>("yardops.create_ticket", {
        tenant_id: tenantId,
        actor_id: actorId,
        seller_id: sellerId,
        vehicle_id: vehicleId,
      });

      if (!res.success || !res.data?.ticket_id) {
        setError(res.error?.message ?? "Failed to create ticket");
        return;
      }

      setTicket((t) => ({ ...t, ticket_id: res.data!.ticket_id, ticket_number: res.data!.ticket_number, seller_id: sellerId, seller_name: sellerName, vehicle_id: vehicleId }));
      setStep("Weigh");
    } finally {
      setLoading(false);
    }
  }

  async function onWeighDone(gross: number, tare: number) {
    setError("");
    setLoading(true);
    try {
      const res = await callTool("yardops.record_weights", {
        tenant_id: tenantId,
        actor_id: actorId,
        ticket_id: ticket.ticket_id,
        gross_weight_kg: gross,
        tare_weight_kg: tare,
      });
      if (!res.success) { setError(res.error?.message ?? "Failed to record weights"); return; }
      setTicket((t) => ({ ...t, gross_weight_kg: gross, tare_weight_kg: tare }));
      setStep("Materials");
    } finally {
      setLoading(false);
    }
  }

  const onLinesUpdated = useCallback((lines: TicketState["lines"], subtotal: number) => {
    setTicket((t) => ({ ...t, lines, subtotal }));
  }, []);

  function onPayoutSelected(method: string, ref: string) {
    setTicket((t) => ({ ...t, payout_method: method, payout_ref: ref }));
    setStep("Sign");
  }

  async function onSigned(signatureSvg: string) {
    setError("");
    setLoading(true);
    try {
      // 1. Record signature
      const sigRes = await callTool("yardops.record_signature", {
        tenant_id: tenantId, actor_id: actorId, ticket_id: ticket.ticket_id, signature_svg: signatureSvg,
      });
      if (!sigRes.success) { setError(sigRes.error?.message ?? "Failed to record signature"); return; }

      // 2. Create payout
      const payRes = await callTool<{ payout_id: string; total: number }>("yardops.create_payout", {
        tenant_id: tenantId,
        actor_id: actorId,
        ticket_id: ticket.ticket_id,
        seller_id: ticket.seller_id,
        subtotal: ticket.subtotal ?? 0,
        method: ticket.payout_method,
        etransfer_email: ticket.payout_method === "e_transfer" ? ticket.payout_ref : undefined,
        cheque_number: ticket.payout_method === "cheque" ? ticket.payout_ref : undefined,
      });
      if (!payRes.success) { setError(payRes.error?.message ?? "Failed to process payout"); return; }

      // 3. Complete ticket
      const doneRes = await callTool("yardops.complete_ticket", {
        tenant_id: tenantId, actor_id: actorId, ticket_id: ticket.ticket_id,
      });
      if (!doneRes.success) { setError(doneRes.error?.message ?? "Failed to complete ticket"); return; }

      setCompleted(true);
    } finally {
      setLoading(false);
    }
  }

  if (completed) {
    return (
      <div className="mx-auto max-w-lg space-y-6 pt-8 text-center">
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success-500/15">
            <CheckCircle className="h-10 w-10 text-success-400" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-night-100">Ticket Complete</h1>
          <p className="mt-2 text-night-400">{ticket.ticket_number} — {ticket.seller_name}</p>
          <p className="mt-1 text-night-400">Total: <span className="font-semibold text-night-100">${((ticket.subtotal ?? 0) * 1.13).toFixed(2)} CAD (incl. HST)</span></p>
        </div>
        <div className="flex flex-col gap-3">
          <a
            href={`/api/ticket/${ticket.ticket_id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="yard-btn-primary block text-center"
          >
            Download Ticket PDF
          </a>
          <button onClick={() => { setTicket({}); setStep("Seller"); setCompleted(false); }} className="yard-btn-secondary">
            New Intake
          </button>
          <button onClick={() => router.push("/dashboard")} className="text-sm text-night-400 hover:text-night-200">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-night-100">New Intake</h1>
        {ticket.ticket_number && (
          <p className="mt-1 text-sm text-night-400">Ticket {ticket.ticket_number}</p>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Intake steps">
        {STEPS.map((s, i) => {
          const done = i < stepIndex;
          const active = s === step;
          return (
            <div key={s} className="flex items-center gap-1">
              <div
                role="tab"
                aria-selected={active}
                aria-label={`Step ${i + 1}: ${s}${done ? " (completed)" : ""}`}
                className={[
                  "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap",
                  active ? "bg-brand-500 text-white" : done ? "text-success-400" : "text-night-500",
                ].join(" ")}
              >
                {done ? <CheckCircle size={12} /> : <span className="tabular-nums">{i + 1}.</span>}
                {s}
              </div>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="text-night-600 flex-shrink-0" />}
            </div>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          {error}
        </div>
      )}

      <div className="yard-card">
        {step === "Seller" && (
          <SellerCapture tenantId={tenantId} actorId={actorId} onComplete={onSellerSelected} loading={loading} />
        )}
        {step === "Weigh" && (
          <ScaleInput onComplete={onWeighDone} loading={loading} />
        )}
        {step === "Materials" && ticket.ticket_id && (
          <MaterialGrid
            tenantId={tenantId}
            actorId={actorId}
            ticketId={ticket.ticket_id}
            onLinesUpdated={onLinesUpdated}
            onNext={() => setStep("Payout")}
          />
        )}
        {step === "Payout" && (
          <PayoutSelector
            tenantId={tenantId}
            subtotal={ticket.subtotal ?? 0}
            onComplete={onPayoutSelected}
          />
        )}
        {step === "Sign" && (
          <div className="space-y-6">
            <TicketSummary
              ticketNumber={ticket.ticket_number ?? ""}
              sellerName={ticket.seller_name ?? ""}
              netWeight={`${((ticket.gross_weight_kg ?? 0) - (ticket.tare_weight_kg ?? 0)).toFixed(2)} kg`}
              lines={ticket.lines ?? []}
              subtotal={ticket.subtotal ?? 0}
              payoutMethod={ticket.payout_method ?? ""}
            />
            <SignaturePad onSign={onSigned} loading={loading} />
          </div>
        )}
      </div>
    </div>
  );
}
