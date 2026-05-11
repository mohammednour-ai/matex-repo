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
  /** True when tax couldn't be computed via tax.calculate_tax and the HST 13% flat fallback was used. */
  tax_is_estimate?: boolean;
  tax_provinces?: { seller: string; buyer: string };
  grand_total: number;
};

// Demo fallback. Used only when no `order_id` query param is present (e.g. a
// recruiter or stakeholder lands on /escrow/create directly to see the flow).
// Real orders go through orders.get_order + listing.get_listing fetches below.
const DEMO_ORDER: OrderSummary = {
  order_id: "demo-order",
  title: "HMS #1 Scrap Steel — Lot 3 (demo)",
  seller: "Ontario Metal Works (demo)",
  quantity: "18 MT",
  unit_price: 1583.33,
  total_price: 28500,
  commission: 997.5,
  tax: 1299.75,
  grand_total: 30797.25,
};

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "data"; order: OrderSummary };

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

export default function CreateEscrowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderIdParam = searchParams.get("order_id");
  const user = getUser();

  // No order_id → demo mode (no fetch). With order_id → real fetch via
  // orders.get_order + listing.get_listing.
  const [state, setState] = useState<LoadState>(
    orderIdParam ? { kind: "loading" } : { kind: "data", order: DEMO_ORDER },
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [walletBalance] = useState(12500);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "success">("form");
  const [escrowId, setEscrowId] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!orderIdParam) return;
    let cancelled = false;
    (async () => {
      const orderRes = await callTool("orders.get_order", { order_id: orderIdParam });
      if (cancelled) return;
      if (!orderRes.success) {
        setState({
          kind: orderRes.error?.code === "NOT_FOUND" ? "empty" : "error",
          message: orderRes.error?.message ?? "Could not load this order.",
        });
        return;
      }
      const orderRow =
        ((orderRes.data as Record<string, unknown> | undefined)?.order as
          | Record<string, unknown>
          | undefined) ?? null;
      if (!orderRow) {
        setState({ kind: "empty", message: "Order not found." });
        return;
      }

      const listingId = String(orderRow.listing_id ?? "");
      const listingRes = listingId
        ? await callTool("listing.get_listing", { listing_id: listingId })
        : null;
      if (cancelled) return;
      const listingRow =
        ((listingRes?.data as Record<string, unknown> | undefined)?.listing as
          | Record<string, unknown>
          | undefined) ?? null;

      const subtotal = Number(orderRow.original_amount ?? 0);
      const commission = Number(orderRow.commission_amount ?? 0);
      const quantity = Number(orderRow.quantity ?? 0);
      const unit = String(orderRow.unit ?? "MT");

      // Province-aware tax via tax.calculate_tax. seller_province comes from
      // the listing's pickup address; buyer_province defaults to "ON" (the
      // most common Canadian buyer) because profile.get_profile doesn't
      // expose the buyer's incorporation_province today — wire that in once
      // a profile.get_company tool exists.
      const pickup =
        (listingRow?.pickup_address as Record<string, unknown> | undefined) ??
        undefined;
      const paymentMeta =
        (listingRow?.payment_meta as Record<string, unknown> | undefined) ??
        undefined;
      const sellerProvince = String(
        paymentMeta?.seller_province ?? pickup?.province ?? "ON",
      );
      const buyerProvince = "ON";

      let taxTotal = +(subtotal * 0.13).toFixed(2);
      let taxIsEstimate = true;
      if (subtotal > 0) {
        const taxRes = await callTool("tax.calculate_tax", {
          amount: subtotal,
          seller_province: sellerProvince,
          buyer_province: buyerProvince,
        });
        if (cancelled) return;
        if (taxRes.success) {
          const taxBody = taxRes.data as Record<string, unknown> | undefined;
          const totalTax = Number(taxBody?.total_tax ?? NaN);
          if (Number.isFinite(totalTax)) {
            taxTotal = +totalTax.toFixed(2);
            taxIsEstimate = false;
          }
        }
      }
      const grand = +(subtotal + commission + taxTotal).toFixed(2);

      setState({
        kind: "data",
        order: {
          order_id: String(orderRow.order_id ?? orderIdParam),
          title: String(listingRow?.title ?? `Order ${orderIdParam.slice(0, 8)}`),
          seller: String(
            listingRow?.seller_name ??
              listingRow?.company_name ??
              `Seller ${String(orderRow.seller_id ?? "").slice(0, 8)}`,
          ),
          quantity: `${quantity} ${unit}`,
          unit_price: quantity > 0 ? +(subtotal / quantity).toFixed(2) : 0,
          total_price: subtotal,
          commission,
          tax: taxTotal,
          tax_is_estimate: taxIsEstimate,
          tax_provinces: { seller: sellerProvince, buyer: buyerProvince },
          grand_total: grand,
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [orderIdParam]);

  const order = state.kind === "data" ? state.order : null;

  async function handleFundEscrow(): Promise<void> {
    if (!order) return;
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

  if (step === "success" && order) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5">
          <div className="rounded-xl border-2 border-emerald-300 bg-success-500/10 p-7 text-center">
            <CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
            <h2 className="text-xl font-bold text-success-400">Escrow Funded!</h2>
            <p className="mt-1 text-sm text-success-400">
              {formatCAD(order.grand_total)} is now held in escrow.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-300 bg-surfaceBg px-4 py-2.5">
              <span className="text-xs text-fg-subtle">Escrow ID</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-fg truncate max-w-[160px]">{escrowId}</span>
                <button onClick={handleCopy} className="text-fg-subtle hover:text-fg-muted">
                  {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="marketplace-card p-5">
            <h3 className="text-sm font-semibold text-fg-muted mb-4">Next Steps</h3>
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
                    <span className="text-sm text-fg-muted">{s.label}</span>
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

  if (state.kind === "loading") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <AppPageHeader
          title="Fund Escrow"
          description="Loading order…"
        />
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6 text-brand-500" />
        </div>
      </div>
    );
  }

  if (state.kind === "error" || state.kind === "empty") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <AppPageHeader
          title="Fund Escrow"
          description="Funds will be held securely until all release conditions are met."
        />
        <div className="marketplace-card p-8 text-center">
          <p className="text-sm font-semibold text-fg">{state.message}</p>
          <p className="mt-2 text-sm text-fg-subtle">
            Open a checked-out order from the listings flow to fund its escrow, or return to the dashboard.
          </p>
          <Button
            size="md"
            variant="secondary"
            className="mt-4"
            onClick={() => router.push("/dashboard")}
          >
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  // state.kind === "data" — order is non-null
  if (!order) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <AppPageHeader
        title="Fund Escrow"
        description="Funds will be held securely until all release conditions are met."
      />

      {!orderIdParam && (
        <div className="rounded-xl border border-warning-500/30 bg-warning-500/10 px-4 py-3 text-xs text-warning-400">
          Demo mode — no <code>order_id</code> in the URL. Showing a sample order so you can preview the flow. Real flows arrive from the checkout page with the order id attached.
        </div>
      )}

      {/* Order summary */}
      <div className="marketplace-card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-fg-subtle">Order Summary</h2>
        <div className="flex items-start gap-4 mb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
            <Package className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <p className="font-semibold text-fg">{order.title}</p>
            <p className="text-sm text-fg-subtle">Seller: {order.seller}</p>
            <p className="text-sm text-fg-subtle">Qty: {order.quantity} @ {formatCAD(order.unit_price)}/MT</p>
          </div>
        </div>

        <div className="space-y-2 border-t border-line/60 pt-4">
          {[
            { label: "Material price", value: formatCAD(order.total_price) },
            { label: "Platform commission (3.5%)", value: formatCAD(order.commission), sub: true },
            {
              label: order.tax_provinces
                ? `Tax (${order.tax_provinces.seller} → ${order.tax_provinces.buyer}${order.tax_is_estimate ? " · estimate" : ""})`
                : "HST (13% estimate)",
              value: formatCAD(order.tax),
              sub: true,
            },
          ].map((r) => (
            <div key={r.label} className={`flex justify-between text-sm ${r.sub ? "text-fg-subtle" : "text-fg-muted"}`}>
              <span>{r.label}</span>
              <span>{r.value}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-2 font-bold text-fg">
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
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-fg-subtle">Payment Method</h2>
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
            <div className="ml-9 rounded-lg border border-line bg-canvas p-4">
              <div className="h-10 rounded border-2 border-dashed border-line-strong bg-surfaceBg flex items-center justify-center text-xs text-fg-subtle">
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
            className="mt-0.5 h-4 w-4 rounded border-line-strong text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-fg-muted leading-relaxed">
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
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-1">{role}</p>
      <p className="font-medium text-fg text-sm truncate">{name}</p>
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
        selected ? "border-blue-500 bg-brand-500/10" : "border-line hover:border-line-strong"
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
      <div className={`shrink-0 ${selected ? "text-blue-600" : "text-fg-subtle"}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${selected ? "text-blue-900" : "text-fg-muted"}`}>{label}</p>
        <p className="text-xs text-fg-subtle">{description}</p>
      </div>
      {selected && <CheckCircle className="h-5 w-5 text-blue-600 shrink-0" />}
    </label>
  );
}
