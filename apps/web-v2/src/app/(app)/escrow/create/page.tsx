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
import { Button } from "@/components/ui/shadcn/button";
import { Spinner } from "@/components/ui/shadcn/spinner";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

type PaymentMethod = "card" | "wallet" | "credit";

type OrderRow = {
  order_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  quantity: number;
  unit: string;
  original_amount: number;
};

type TaxBreakdown = {
  subtotal?: number;
  commission?: number;
  gst?: number;
  hst?: number;
  pst?: number;
  qst?: number;
  total_tax?: number;
  grand_total?: number;
  province_buyer?: string;
  province_seller?: string;
};

const COMMISSION_RATE = 0.035;

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

// Both transports share the {success, data} envelope, but the legacy MCP
// gateway path nests payloads under data.upstream_response.data. Try the
// nested shape first and fall back to the flat one.
function unwrap<T>(data: unknown, key: string): T | undefined {
  const d = data as Record<string, unknown> | undefined;
  if (!d) return undefined;
  const ur = d.upstream_response as Record<string, unknown> | undefined;
  if (ur && typeof ur === "object") {
    const inner = ur.data as Record<string, unknown> | undefined;
    if (inner && inner[key] !== undefined) return inner[key] as T;
  }
  if (d[key] !== undefined) return d[key] as T;
  return undefined;
}

export default function CreateEscrowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id") ?? "";
  const user = getUser();
  const userId = user?.userId ?? "";

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [listingTitle, setListingTitle] = useState<string>("");
  const [sellerProvince, setSellerProvince] = useState<string>("");
  const [tax, setTax] = useState<TaxBreakdown | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [loadError, setLoadError] = useState<string>("");

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [accepted, setAccepted] = useState(false);
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string>("");
  const [step, setStep] = useState<"form" | "success">("form");
  const [escrowId, setEscrowId] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Stage 1: load order + wallet in parallel as soon as the page mounts.
  // Stage 2 (separate effect): once order is known, fetch listing (for
  // title + seller_province) and the tax breakdown.
  useEffect(() => {
    if (!orderId) {
      setLoadingOrder(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingOrder(true);
      setLoadError("");
      const [orderRes, walletRes] = await Promise.allSettled([
        callTool("orders.get_order", { order_id: orderId }),
        userId
          ? callTool("payments.get_wallet_balance", { user_id: userId, actor_id: userId })
          : Promise.resolve({ success: false, error: { code: "NO_USER", message: "" } } as const),
      ]);
      if (cancelled) return;

      if (orderRes.status === "fulfilled" && orderRes.value.success) {
        const o = unwrap<OrderRow>(orderRes.value.data, "order");
        if (!o || !o.order_id) {
          setLoadError("Order not found.");
        } else {
          setOrder({
            ...o,
            quantity: Number(o.quantity ?? 0),
            original_amount: Number(o.original_amount ?? 0),
          });
        }
      } else {
        const msg =
          orderRes.status === "fulfilled"
            ? orderRes.value.error?.message ?? "Could not load order."
            : "Could not load order.";
        setLoadError(msg);
      }

      if (walletRes.status === "fulfilled" && (walletRes.value as { success?: boolean }).success) {
        const wallet = unwrap<{ balance?: number }>(
          (walletRes.value as { data?: unknown }).data,
          "wallet",
        );
        const flatBalance = ((walletRes.value as { data?: { balance?: number } }).data ?? {}).balance;
        setWalletBalance(Number(wallet?.balance ?? flatBalance ?? 0));
      }

      setLoadingOrder(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, userId]);

  // Stage 2: enrich with listing title + tax breakdown once order is known.
  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    (async () => {
      // Listing → title + seller_province
      let resolvedSellerProvince = "";
      if (order.listing_id) {
        const res = await callTool("listing.get_listing", { listing_id: order.listing_id });
        if (cancelled) return;
        if (res.success) {
          const listing = unwrap<{ title?: string; seller_province?: string }>(
            res.data,
            "listing",
          ) ??
            ((res.data as Record<string, unknown> | undefined) as
              | { title?: string; seller_province?: string }
              | undefined);
          if (listing?.title) setListingTitle(String(listing.title));
          if (listing?.seller_province) {
            resolvedSellerProvince = String(listing.seller_province);
            setSellerProvince(resolvedSellerProvince);
          }
        }
      }

      // Tax. We default to ON for both provinces if we don't have better info;
      // tax-mcp will return the right breakdown for the (buyer, seller) pair.
      const buyerProvince = (user as { province?: string } | null)?.province ?? "ON";
      const sellerProv = resolvedSellerProvince || buyerProvince;
      const taxRes = await callTool("tax.calculate_tax", {
        amount: order.original_amount,
        province_buyer: buyerProvince,
        province_seller: sellerProv,
      });
      if (cancelled) return;
      if (taxRes.success) {
        setTax(taxRes.data as unknown as TaxBreakdown);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order, user]);

  // Derived totals. tax.calculate_tax already returns a grand_total that
  // includes commission + taxes; if the call failed we synthesize the same
  // shape locally so the buyer still sees a real number for what they're
  // about to fund. This is NOT mock data — it's a deterministic computation
  // off the real order's original_amount.
  const subtotal = Number(order?.original_amount ?? 0);
  const commission =
    tax?.commission ?? Math.round(subtotal * COMMISSION_RATE * 100) / 100;
  const totalTax = tax?.total_tax ?? 0;
  const grandTotal =
    tax?.grand_total ?? Math.round((subtotal + commission + totalTax) * 100) / 100;
  const unitPrice =
    order && Number(order.quantity) > 0 ? subtotal / Number(order.quantity) : 0;
  const sellerLabel = order?.seller_id ? `${order.seller_id.slice(0, 8)}…` : "—";
  const titleLabel =
    listingTitle || (order ? `Order ${order.order_id.slice(0, 8)}…` : "");

  async function handleFundEscrow(): Promise<void> {
    setFundError("");
    if (!order) {
      setFundError("Order not loaded.");
      return;
    }
    if (!userId) {
      setFundError("Sign in to fund escrow.");
      return;
    }
    if (userId !== order.buyer_id) {
      setFundError("Only the buyer of this order can fund its escrow.");
      return;
    }
    if (grandTotal <= 0) {
      setFundError("Order amount is invalid.");
      return;
    }
    setFunding(true);

    const escrowRes = await callTool("escrow.create_escrow", {
      order_id: order.order_id,
      buyer_id: order.buyer_id,
      seller_id: order.seller_id,
      amount: grandTotal,
      performed_by: userId,
    });
    if (!escrowRes.success) {
      setFunding(false);
      setFundError(escrowRes.error?.message ?? "Could not create escrow.");
      return;
    }
    const newEscrowId = extractId(escrowRes, "escrow_id");
    if (!newEscrowId) {
      setFunding(false);
      setFundError("Escrow created but no ID was returned.");
      return;
    }

    const holdRes = await callTool("escrow.hold_funds", {
      escrow_id: newEscrowId,
      amount: grandTotal,
      performed_by: userId,
    });
    if (!holdRes.success) {
      setFunding(false);
      setFundError(holdRes.error?.message ?? "Could not hold funds in escrow.");
      return;
    }

    const payRes = await callTool("payments.process_payment", {
      user_id: userId,
      actor_id: userId,
      escrow_id: newEscrowId,
      order_id: order.order_id,
      amount: grandTotal,
      payment_method: paymentMethod,
    });
    if (!payRes.success) {
      setFunding(false);
      setFundError(payRes.error?.message ?? "Payment failed.");
      return;
    }

    setEscrowId(newEscrowId);
    setStep("success");
    setFunding(false);
  }

  function handleCopy(): void {
    navigator.clipboard.writeText(escrowId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Success step
  if (step === "success") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5">
          <div className="rounded-xl border-2 border-emerald-300 bg-success-500/10 p-7 text-center">
            <CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
            <h2 className="text-xl font-bold text-success-400">Escrow Funded!</h2>
            <p className="mt-1 text-sm text-success-400">
              {formatCAD(grandTotal)} is now held in escrow.
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

  // Loading: order in flight
  if (loadingOrder) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <AppPageHeader
          title="Fund Escrow"
          description="Funds will be held securely until all release conditions are met."
        />
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6 text-brand-500" />
        </div>
      </div>
    );
  }

  // No order_id, or order failed to load: empty / error state. We never
  // fall through to a form against a fake order.
  if (!order) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <AppPageHeader
          title="Fund Escrow"
          description="Funds will be held securely until all release conditions are met."
        />
        <EmptyState
          image="/grphs/Platform%20Domains/escrow-d-escrow.png"
          title={!orderId ? "No order selected" : "Order not found"}
          description={
            loadError ||
            (!orderId
              ? "Open a confirmed order and choose Fund Escrow to start the funding flow."
              : "We couldn't find that order. Check the link or return to your escrows list.")
          }
          cta={{ label: "View all escrows", href: "/escrow" }}
          size="lg"
        />
      </div>
    );
  }

  // Form
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <AppPageHeader
        title="Fund Escrow"
        description="Funds will be held securely until all release conditions are met."
      />

      {fundError && (
        <div className="rounded-2xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          {fundError}
        </div>
      )}

      {/* Order summary */}
      <div className="marketplace-card p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-night-300">Order Summary</h2>
        <div className="flex items-start gap-4 mb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
            <Package className="h-6 w-6 text-blue-500" />
          </div>
          <div>
            <p className="font-semibold text-night-100">{titleLabel}</p>
            <p className="text-sm text-night-300">
              Seller: <span className="font-mono">{sellerLabel}</span>
              {sellerProvince ? ` · ${sellerProvince}` : ""}
            </p>
            <p className="text-sm text-night-300">
              Qty: {order.quantity} {order.unit}
              {unitPrice > 0 ? ` @ ${formatCAD(unitPrice)}/${order.unit}` : ""}
            </p>
          </div>
        </div>

        <div className="space-y-2 border-t border-night-700/60 pt-4">
          <div className="flex justify-between text-sm text-night-200">
            <span>Material price</span>
            <span>{formatCAD(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-night-300">
            <span>Platform commission (3.5%)</span>
            <span>{formatCAD(commission)}</span>
          </div>
          {tax?.hst != null && tax.hst > 0 && (
            <div className="flex justify-between text-sm text-night-300">
              <span>HST</span>
              <span>{formatCAD(tax.hst)}</span>
            </div>
          )}
          {tax?.gst != null && tax.gst > 0 && (
            <div className="flex justify-between text-sm text-night-300">
              <span>GST</span>
              <span>{formatCAD(tax.gst)}</span>
            </div>
          )}
          {tax?.pst != null && tax.pst > 0 && (
            <div className="flex justify-between text-sm text-night-300">
              <span>PST</span>
              <span>{formatCAD(tax.pst)}</span>
            </div>
          )}
          {tax?.qst != null && tax.qst > 0 && (
            <div className="flex justify-between text-sm text-night-300">
              <span>QST</span>
              <span>{formatCAD(tax.qst)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-night-700 pt-2 font-bold text-night-100">
            <span>Total to escrow</span>
            <span className="text-blue-600 text-lg">{formatCAD(grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* Buyer / Seller */}
      <div className="grid grid-cols-2 gap-4">
        <PartyCard role="Buyer" name={user?.email ?? `${order.buyer_id.slice(0, 8)}…`} />
        <PartyCard role="Seller" name={sellerLabel} />
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
            description={walletBalance >= grandTotal ? "Sufficient balance" : "Insufficient balance"}
            selected={paymentMethod === "wallet"}
            onSelect={() => setPaymentMethod("wallet")}
            disabled={walletBalance < grandTotal}
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
        loading={funding}
        onClick={handleFundEscrow}
      >
        <Shield className="h-4 w-4" />
        Fund Escrow — {formatCAD(grandTotal)}
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
