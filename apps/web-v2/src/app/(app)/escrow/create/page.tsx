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
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Spinner } from "@/components/ui/shadcn/spinner";
import { AppPageHeader } from "@/components/layout/AppPageHeader";

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
    const userId = user?.userId ?? "";

    const escrowRes = await callTool("escrow.create_escrow", {
      order_id: order.order_id,
      amount: order.grand_total,
      buyer_id: userId,
      performed_by: userId,
    });
    const newEscrowId = extractId(escrowRes, "escrow_id") || `ESC-${Date.now()}`;

    await callTool("escrow.hold_funds", { escrow_id: newEscrowId, performed_by: userId });

    await callTool("payments.process_payment", {
      user_id: userId,
      actor_id: userId,
      escrow_id: newEscrowId,
      order_id: order.order_id,
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
          <div className="rounded-xl border-2 border-emerald-300 bg-success-500/10 p-7 text-center">
            <CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
            <h2 className="text-xl font-bold text-success-400">Escrow Funded!</h2>
            <p className="mt-1 text-sm text-success-400">
              {formatCAD(order.grand_total)} is now held in escrow.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-300 bg-night-850 px-4 py-2.5">
              <span className="text-xs text-night-300">Escrow ID</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-night-100 truncate max-w-[160px]">{escrowId}</span>
                <button onClick={handleCopy} className="text-night-300 hover:text-night-200">
                  {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="marketplace-card p-5">
            <h3 className="text-sm font-semibold text-night-200 mb-4">Next Steps</h3>
            <ol className="space-y-3">
              {[
                { label: "Inspection booking", href: "/inspections", cta: "Book Inspection" },
                { label: "Logistics arrangement", href: "/logistics", cta: "Get Quotes" },
                { label: "Confirm delivery & release escrow", href: "/escrow", cta: "View Escrow" },
              ].map((s, i) => (
                <li key={s.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="text-sm text-night-200">{s.label}</span>
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
    <div className="mx-auto max-w-2xl space-y-6">
      <AppPageHeader
        title="Fund Escrow"
        description="Funds will be held securely until all release conditions are met."
      />

      {/* Order summary */}
      <div className="marketplace-card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-night-300">Order Summary</h2>
        <div className="flex items-start gap-4 mb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
            <Package className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <p className="font-semibold text-night-100">{order.title}</p>
            <p className="text-sm text-night-300">Seller: {order.seller}</p>
            <p className="text-sm text-night-300">Qty: {order.quantity} @ {formatCAD(order.unit_price)}/MT</p>
          </div>
        </div>

        <div className="space-y-2 border-t border-night-700/60 pt-4">
          {[
            { label: "Material price", value: formatCAD(order.total_price) },
            { label: "Platform commission (3.5%)", value: formatCAD(order.commission), sub: true },
            { label: "HST (13%)", value: formatCAD(order.tax), sub: true },
          ].map((r) => (
            <div key={r.label} className={`flex justify-between text-sm ${r.sub ? "text-night-300" : "text-night-200"}`}>
              <span>{r.label}</span>
              <span>{r.value}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-night-700 pt-2 font-bold text-night-100">
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
      <div className="marketplace-card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-night-300">Payment Method</h2>
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
            <div className="ml-9 rounded-lg border border-night-700 bg-night-900 p-4">
              <div className="h-10 rounded border-2 border-dashed border-night-600 bg-night-850 flex items-center justify-center text-xs text-night-300">
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
      <div className="marketplace-card p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-night-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-night-200 leading-relaxed">
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
    <div className="marketplace-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-night-300 mb-1">{role}</p>
      <p className="font-medium text-night-100 text-sm truncate">{name}</p>
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
        selected ? "border-blue-500 bg-brand-500/10" : "border-night-700 hover:border-night-600"
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
      <div className={`shrink-0 ${selected ? "text-blue-600" : "text-night-300"}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${selected ? "text-info-400" : "text-night-200"}`}>{label}</p>
        <p className="text-xs text-night-300">{description}</p>
      </div>
      {selected && <CheckCircle className="h-5 w-5 text-blue-600 shrink-0" />}
    </label>
  );
}
