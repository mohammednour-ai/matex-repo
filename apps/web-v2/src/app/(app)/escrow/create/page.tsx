"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Shield,
  CreditCard,
  Wallet,
  Building2,
  CheckCircle,
  ArrowRight,
  Copy,
  Package,
} from "lucide-react";
import { callTool, getUser, extractId } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";

type PaymentMethod = "card" | "wallet" | "credit";

type OrderSummary = {
  order_id: string;
  title: string;
  seller: string;
  quantity: string;
  unit_price: number;
  total_price: number;
  commission: number;
  tax: number;
  grand_total: number;
};

const MOCK_ORDER: OrderSummary = {
  order_id: "ord-001",
  title: "HMS #1 Scrap Steel — Lot 3",
  seller: "Ontario Metal Works",
  quantity: "18 MT",
  unit_price: 1583.33,
  total_price: 28500,
  commission: 997.5,
  tax: 1299.75,
  grand_total: 30797.25,
};

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

export default function CreateEscrowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id") ?? "ord-001";
  const user = getUser();

  const [order] = useState<OrderSummary>(MOCK_ORDER);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [walletBalance] = useState(12500);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "success">("form");
  const [escrowId, setEscrowId] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleFundEscrow(): Promise<void> {
    setLoading(true);

    const escrowRes = await callTool("escrow.create_escrow", {
      order_id: order.order_id,
      amount: order.grand_total,
      buyer_id: user?.userId,
    });
    const newEscrowId = extractId(escrowRes, "escrow_id") || `ESC-${Date.now()}`;

    await callTool("escrow.hold_funds", { escrow_id: newEscrowId });

    await callTool("payments.process_payment", {
      escrow_id: newEscrowId,
      amount: order.grand_total,
      payment_method: paymentMethod,
    });

    setEscrowId(newEscrowId);
    setStep("success");
    setLoading(false);
  }

  function handleCopy(): void {
    navigator.clipboard.writeText(escrowId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (step === "success") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5">
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-7 text-center">
            <CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
            <h2 className="text-xl font-bold text-emerald-800">Escrow Funded!</h2>
            <p className="mt-1 text-sm text-emerald-700">
              {formatCAD(order.grand_total)} is now held in escrow.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-300 bg-white px-4 py-2.5">
              <span className="text-xs text-slate-500">Escrow ID</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-800 truncate max-w-[160px]">{escrowId}</span>
                <button onClick={handleCopy} className="text-slate-400 hover:text-slate-600">
                  {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Next Steps</h3>
            <ol className="space-y-3">
              {[
                { label: "Inspection booking", href: "/inspection", cta: "Book Inspection" },
                { label: "Logistics arrangement", href: "/logistics", cta: "Get Quotes" },
                { label: "Confirm delivery & release escrow", href: "/escrow", cta: "View Escrow" },
              ].map((s, i) => (
                <li key={s.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="text-sm text-slate-700">{s.label}</span>
                  </div>
                  <a href={s.href} className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1">
                    {s.cta} <ArrowRight className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ol>
          </div>

          <Button size="lg" className="w-full" onClick={() => router.push("/escrow")}>
            View All Escrows
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fund Escrow</h1>
        <p className="mt-1 text-sm text-slate-500">
          Funds will be held securely until all release conditions are met.
        </p>
      </div>

      {/* Order summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Order Summary</h2>
        <div className="flex items-start gap-4 mb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
            <Package className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">{order.title}</p>
            <p className="text-sm text-slate-500">Seller: {order.seller}</p>
            <p className="text-sm text-slate-500">Qty: {order.quantity} @ {formatCAD(order.unit_price)}/MT</p>
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-4">
          {[
            { label: "Material price", value: formatCAD(order.total_price) },
            { label: "Platform commission (3.5%)", value: formatCAD(order.commission), sub: true },
            { label: "HST (13%)", value: formatCAD(order.tax), sub: true },
          ].map((r) => (
            <div key={r.label} className={`flex justify-between text-sm ${r.sub ? "text-slate-500" : "text-slate-700"}`}>
              <span>{r.label}</span>
              <span>{r.value}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900">
            <span>Total to escrow</span>
            <span className="text-blue-600 text-lg">{formatCAD(order.grand_total)}</span>
          </div>
        </div>
      </div>

      {/* Buyer / Seller */}
      <div className="grid grid-cols-2 gap-4">
        <PartyCard role="Buyer" name={user?.email ?? "You"} />
        <PartyCard role="Seller" name={order.seller} />
      </div>

      {/* Payment method */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Payment Method</h2>
        <div className="space-y-3">
          <PaymentOption
            id="card"
            icon={<CreditCard className="h-5 w-5" />}
            label="Credit / Debit Card"
            description="Secure payment via Stripe"
            selected={paymentMethod === "card"}
            onSelect={() => setPaymentMethod("card")}
          />
          {paymentMethod === "card" && (
            <div className="ml-9 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="h-10 rounded border-2 border-dashed border-slate-300 bg-white flex items-center justify-center text-xs text-slate-400">
                Stripe Elements — Card input (placeholder)
              </div>
            </div>
          )}

          <PaymentOption
            id="wallet"
            icon={<Wallet className="h-5 w-5" />}
            label={`Matex Wallet — Balance: ${formatCAD(walletBalance)}`}
            description={walletBalance >= order.grand_total ? "Sufficient balance" : "Insufficient balance"}
            selected={paymentMethod === "wallet"}
            onSelect={() => setPaymentMethod("wallet")}
            disabled={walletBalance < order.grand_total}
          />

          <PaymentOption
            id="credit"
            icon={<Building2 className="h-5 w-5" />}
            label="Credit Facility (Net 30)"
            description="Available credit: $100,000"
            selected={paymentMethod === "credit"}
            onSelect={() => setPaymentMethod("credit")}
          />
        </div>
      </div>

      {/* Terms */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-600 leading-relaxed">
            I agree to the{" "}
            <a href="#" className="text-blue-600 hover:underline">Matex Escrow Terms</a>,{" "}
            <a href="#" className="text-blue-600 hover:underline">Platform Fee Schedule</a>, and confirm
            that all order details are correct. I understand funds will be held until release conditions are
            satisfied.
          </span>
        </label>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={!accepted}
        loading={loading}
        onClick={handleFundEscrow}
      >
        <Shield className="h-4 w-4" />
        Fund Escrow — {formatCAD(order.grand_total)}
      </Button>
    </div>
  );
}

function PartyCard({ role, name }: { role: string; name: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{role}</p>
      <p className="font-medium text-slate-800 text-sm truncate">{name}</p>
    </div>
  );
}

function PaymentOption({
  id,
  icon,
  label,
  description,
  selected,
  onSelect,
  disabled = false,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition ${
        selected ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="radio"
        name="payment"
        value={id}
        checked={selected}
        onChange={onSelect}
        disabled={disabled}
        className="sr-only"
      />
      <div className={`shrink-0 ${selected ? "text-blue-600" : "text-slate-400"}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${selected ? "text-blue-900" : "text-slate-700"}`}>{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      {selected && <CheckCircle className="h-5 w-5 text-blue-600 shrink-0" />}
    </label>
  );
}
