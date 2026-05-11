"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Package,
  CreditCard,
  Wallet,
  Building2,
  CheckCircle,
  ArrowRight,
  Copy,
  Shield,
  ShoppingCart,
} from "lucide-react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { callTool, getUser, extractId } from "@/lib/api";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Spinner } from "@/components/ui/shadcn/spinner";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StripeProvider } from "@/components/payments/StripeProvider";
import { isStripeConfigured } from "@/lib/stripe";
import Image from "next/image";

type Step = 1 | 2 | 3;
type PaymentMethod = "card" | "wallet" | "credit" | "interac";

type TaxBreakdown = {
  subtotal: number;
  commission: number;
  gst: number;
  hst: number;
  pst: number;
  total_tax: number;
  grand_total: number;
  province_buyer: string;
  province_seller: string;
};

type OrderItem = {
  listing_id: string;
  seller_id: string;
  title: string;
  quantity: string;
  unit: string;
  unit_price: number;
  total: number;
  material_category: string;
};

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

export default function CheckoutPage() {
  const router = useRouter();
  const user = getUser();
  const searchParams = useSearchParams();
  const listingIdParam = searchParams.get("listing_id") ?? "";
  const orderIdParam = searchParams.get("order_id") ?? "";
  const quantityParam = searchParams.get("quantity") ?? "";

  const [step, setStep] = useState<Step>(1);
  const [item, setItem] = useState<OrderItem | null>(null);
  const [itemLoading, setItemLoading] = useState(true);
  const [itemError, setItemError] = useState("");
  const [tax, setTax] = useState<TaxBreakdown | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxError, setTaxError] = useState<string>("");
  const [taxRetryKey, setTaxRetryKey] = useState(0);
  const [shippingEstimate] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [walletBalance, setWalletBalance] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [, setEscrowId] = useState("");
  const [copied, setCopied] = useState(false);

  // Card-payment state. Allocated in step 2 (and only when paymentMethod is
  // 'card' so non-card users never round-trip Stripe). Cleared on step-back
  // so a fresh PI is allocated if the user changes their mind.
  const [orderId, setOrderId] = useState<string>(orderIdParam);
  const [clientSecret, setClientSecret] = useState<string>("");
  const [transactionId, setTransactionId] = useState<string>("");
  const [allocLoading, setAllocLoading] = useState(false);
  const [allocError, setAllocError] = useState<string>("");
  const stripeReady = isStripeConfigured();

  // Load listing → order item
  useEffect(() => {
    if (!listingIdParam) {
      setItemLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setItemLoading(true);
      setItemError("");
      const res = await callTool("listing.get_listing", { listing_id: listingIdParam });
      if (cancelled) return;
      if (res.success) {
        const raw = res.data as unknown as Record<string, unknown>;
        const qty = quantityParam ? parseFloat(quantityParam) : Number(raw.quantity ?? 1);
        const unitPrice = Number(raw.price ?? raw.asking_price ?? raw.starting_bid ?? 0);
        setItem({
          listing_id: String(raw.listing_id ?? listingIdParam),
          seller_id: String(raw.seller_id ?? ""),
          title: String(raw.title ?? "Material order"),
          quantity: String(qty),
          unit: String(raw.unit ?? "unit"),
          unit_price: unitPrice,
          total: Math.round(unitPrice * qty * 100) / 100,
          material_category: String(raw.material_grade ?? raw.category ?? ""),
        });
      } else {
        setItemError(res.error?.message ?? "Could not load listing.");
      }
      setItemLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [listingIdParam, quantityParam]);

  // Load wallet for selected payment option
  useEffect(() => {
    if (!user?.userId) return;
    (async () => {
      const res = await callTool("payments.get_wallet_balance", { user_id: user.userId, actor_id: user.userId });
      if (res.success) {
        const d = res.data as unknown as { wallet?: { balance?: number }; balance?: number };
        setWalletBalance(Number(d?.wallet?.balance ?? d?.balance ?? 0));
      }
    })();
  }, [user?.userId]);

  // Load tax once item is known. We never substitute flat-rate guesses
  // when the call fails — Canadian sales tax is a (buyer_province,
  // seller_province, material_category) lookup, and producing the wrong
  // number on a checkout page is worse than refusing to compute one
  // (tax_mcp owns recycled-metal zero-rating, QC QST, BC PST, etc.).
  // Per .cursor/rules/matex-canadian-compliance.mdc.
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    (async () => {
      setTaxLoading(true);
      setTaxError("");
      const provinceBuyer = (user as { province?: string } | null)?.province ?? "ON";
      const provinceSeller = "ON";
      const res = await callTool("tax.calculate_tax", {
        amount: item.total,
        province_seller: provinceSeller,
        province_buyer: provinceBuyer,
        material_category: item.material_category,
      });
      if (cancelled) return;
      if (res.success) {
        setTax(res.data as unknown as TaxBreakdown);
      } else {
        setTax(null);
        setTaxError(res.error?.message ?? "Could not calculate tax. Please try again.");
      }
      setTaxLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [item, user, taxRetryKey]);

  const effectiveTax = tax;
  const grandTotal = effectiveTax ? effectiveTax.grand_total + shippingEstimate : 0;
  const canCheckout = Boolean(effectiveTax) && !taxLoading;
  // Card flow needs a clientSecret BEFORE mounting the PaymentElement, so
  // we kick the PI allocation when step 2 opens with paymentMethod='card'.
  // Wallet/credit/interac stay on the synchronous handleNonCardPayment path.
  const cardReady = paymentMethod === "card" && Boolean(clientSecret) && !allocLoading;

  // Create the order if it doesn't exist yet. Returns the order_id or null
  // (with itemError set) on failure. Idempotent: if state.orderId is already
  // populated (from the URL or a prior call), returns it without a new
  // orders.create_order round-trip.
  async function ensureOrder(): Promise<string | null> {
    if (orderId) return orderId;
    if (!item || !user?.userId) return null;
    const orderRes = await callTool("orders.create_order", {
      listing_id: item.listing_id,
      buyer_id: user.userId,
      seller_id: item.seller_id,
      quantity: Number(item.quantity),
      unit: item.unit,
      original_amount: item.total,
      payment_method: paymentMethod === "card" ? "card" : paymentMethod === "wallet" ? "wallet" : "credit_terms",
    });
    if (!orderRes.success) {
      setItemError(orderRes.error?.message ?? "Could not create order.");
      return null;
    }
    const newId = extractId(orderRes, "order_id") || "";
    if (!newId) {
      setItemError("Order created but no order_id returned.");
      return null;
    }
    setOrderId(newId);
    return newId;
  }

  // Step 2 entry for the card method: allocate the PaymentIntent so the
  // PaymentElement has a clientSecret to mount against. Skips when stripe
  // isn't configured (UI degrades to a fallback message), when we already
  // have a clientSecret, or when the user is on a non-card method.
  useEffect(() => {
    if (step !== 2 || paymentMethod !== "card") return;
    if (!stripeReady) return;
    if (!effectiveTax || !item || !user?.userId) return;
    if (clientSecret || allocLoading) return;
    let cancelled = false;
    (async () => {
      setAllocLoading(true);
      setAllocError("");
      const id = await ensureOrder();
      if (cancelled) return;
      if (!id) {
        setAllocLoading(false);
        return;
      }
      const res = await callTool("payments.create_payment_intent", {
        user_id: user.userId,
        actor_id: user.userId,
        order_id: id,
        amount: grandTotal,
        currency: "CAD",
      });
      if (cancelled) return;
      if (!res.success) {
        setAllocError(res.error?.message ?? "Could not start card payment.");
        setAllocLoading(false);
        return;
      }
      const data = res.data as Record<string, unknown> | undefined;
      const cs = String(data?.client_secret ?? "");
      const tx = String(data?.transaction_id ?? "");
      if (!cs || !tx) {
        setAllocError("Payment service did not return a client secret.");
        setAllocLoading(false);
        return;
      }
      setClientSecret(cs);
      setTransactionId(tx);
      setAllocLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, paymentMethod, stripeReady, grandTotal, effectiveTax?.grand_total]);

  // Going back to step 1 invalidates any allocated PI (the user might switch
  // amounts or methods). We don't actively cancel the PI on Stripe — it
  // expires in 24h or is reaped by the reconciliation cron in PR 6.
  useEffect(() => {
    if (step === 1 && clientSecret) {
      setClientSecret("");
      setTransactionId("");
      setAllocError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Post-payment finalisation: invoice + escrow + step 3. Used by every
  // payment method. The card flow calls this after stripe.confirmPayment
  // succeeds; wallet/credit/interac call it after process_payment.
  async function finalizeAfterPayment(orderIdToUse: string): Promise<void> {
    if (!item || !effectiveTax || !user?.userId) return;
    const invoiceRes = await callTool("tax.generate_invoice", {
      order_id: orderIdToUse,
      seller_id: item.seller_id,
      buyer_id: user.userId,
      seller_province: effectiveTax.province_seller,
      buyer_province: effectiveTax.province_buyer,
      subtotal: effectiveTax.subtotal,
      commission_amount: effectiveTax.commission,
    });
    if (!invoiceRes.success) {
      setItemError(invoiceRes.error?.message ?? "Could not issue invoice.");
      return;
    }
    const inv = extractId(invoiceRes, "invoice_number");
    if (!inv) {
      setItemError("Invoice was created but no invoice number was returned.");
      return;
    }

    const escrowRes = await callTool("escrow.create_escrow", {
      order_id: orderIdToUse,
      buyer_id: user.userId,
      seller_id: item.seller_id,
      amount: grandTotal,
      performed_by: user.userId,
    });
    const esc = extractId(escrowRes, "escrow_id") || "";

    setInvoiceNumber(inv);
    setEscrowId(esc);
    setStep(3);
  }

  // Non-card path (wallet / credit / interac). Card goes through the
  // PaymentElement form and calls finalizeAfterPayment in its onSuccess.
  async function handleNonCardPayment(): Promise<void> {
    if (!item || !effectiveTax) return;
    if (!user?.userId) {
      setItemError("Sign in to complete checkout.");
      return;
    }
    if (!item.seller_id) {
      setItemError("Listing is missing seller information. Cannot create order.");
      return;
    }
    setProcessing(true);
    setItemError("");

    const id = await ensureOrder();
    if (!id) {
      setProcessing(false);
      return;
    }

    const paymentRes = await callTool("payments.process_payment", {
      user_id: user.userId,
      actor_id: user.userId,
      amount: grandTotal,
      payment_method: paymentMethod,
      order_id: id,
    });
    if (!paymentRes.success) {
      setProcessing(false);
      setItemError(paymentRes.error?.message ?? "Payment failed. Please try again.");
      return;
    }

    await finalizeAfterPayment(id);
    setProcessing(false);
  }

  if (itemLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <AppPageHeader
          title="Checkout"
          description="Review your order, complete payment, and confirm your purchase."
        />
        <div className="flex items-center justify-center py-16">
          <Spinner className="h-6 w-6 text-blue-500" />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <AppPageHeader
          title="Checkout"
          description="Review your order, complete payment, and confirm your purchase."
        />
        <EmptyState
          icon={ShoppingCart}
          title="No order to check out"
          description={
            itemError ||
            "Open a listing and choose Buy now to start a checkout."
          }
          cta={{ label: "Browse marketplace", href: "/search" }}
          size="lg"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <AppPageHeader
        title="Checkout"
        description="Review your order, complete payment, and confirm your purchase."
      />

      {itemError && (
        <div className="rounded-2xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          {itemError}
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {(["Order Review", "Payment", "Confirmation"] as const).map((label, i) => {
          const s = (i + 1) as Step;
          const active = step === s;
          const done = step > s;
          return (
            <div key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold shrink-0 ${
                    done ? "bg-emerald-500 text-white" : active ? "bg-blue-600 text-white" : "bg-night-700 text-night-300"
                  }`}
                >
                  {done ? "✓" : s}
                </div>
                <p className={`mt-1 text-xs font-medium whitespace-nowrap ${active ? "text-brand-400" : done ? "text-emerald-600" : "text-night-300"}`}>
                  {label}
                </p>
              </div>
              {i < 2 && <div className={`flex-1 h-0.5 mb-5 mx-1 ${done ? "bg-emerald-400" : "bg-night-700"}`} />}
            </div>
          );
        })}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="marketplace-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-night-300">Order Details</h2>
            <div className="flex items-start gap-4 mb-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
                <Image src="/grphs/Icons/cart-i-cart.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" aria-hidden />
              </div>
              <div>
                <p className="font-semibold text-night-100">{item.title}</p>
                <p className="text-sm text-night-300">{item.quantity} {item.unit} @ {formatCAD(item.unit_price)}/{item.unit}</p>
                <Badge variant="gray" className="mt-1">{item.material_category}</Badge>
              </div>
            </div>
          </div>

          <div className="marketplace-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-night-300">Price Breakdown</h2>
            {taxLoading ? (
              <div className="flex justify-center py-6">
                <Spinner className="h-6 w-6 text-blue-500" />
              </div>
            ) : !effectiveTax ? (
              <div className="space-y-3 rounded-xl border border-danger-500/30 bg-danger-500/10 p-4 text-sm text-danger-400">
                <p>{taxError || "Could not calculate tax for this order."}</p>
                <button
                  type="button"
                  onClick={() => setTaxRetryKey((k) => k + 1)}
                  className="font-semibold text-brand-400 underline-offset-2 hover:underline"
                >
                  Retry tax calculation
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <TaxLine label="Material price" value={formatCAD(effectiveTax.subtotal)} />
                <TaxLine label="Platform commission (3.5%)" value={formatCAD(effectiveTax.commission)} sub />
                {effectiveTax.hst > 0 && (
                  <TaxLine
                    label={`HST (${effectiveTax.province_buyer} → ${effectiveTax.province_seller})`}
                    value={formatCAD(effectiveTax.hst)}
                    sub
                  />
                )}
                {effectiveTax.gst > 0 && <TaxLine label="GST (5%)" value={formatCAD(effectiveTax.gst)} sub />}
                {effectiveTax.pst > 0 && <TaxLine label="PST (7%)" value={formatCAD(effectiveTax.pst)} sub />}
                <TaxLine label="Est. shipping (Day & Ross)" value={formatCAD(shippingEstimate)} sub />
                <div className="flex justify-between border-t border-night-700 pt-3 font-bold text-night-100 text-base">
                  <span>Total</span>
                  <span className="text-blue-600">{formatCAD(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={() => setStep(2)}
            disabled={!canCheckout}
          >
            Continue to Payment <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="marketplace-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-night-300">Select Payment Method</h2>
            <div className="space-y-3">
              <PaymentOption
                id="interac"
                icon={<Wallet className="h-5 w-5" />}
                label="Interac e-Transfer"
                description="Instant Canadian bank-to-bank transfer — most common for B2B scrap"
                selected={paymentMethod === "interac"}
                onSelect={() => setPaymentMethod("interac")}
              />
              {paymentMethod === "interac" && (
                <div className="ml-9 rounded-lg border border-night-700 bg-night-900 p-4 space-y-2 text-sm">
                  <p className="font-semibold text-night-100">Send Interac e-Transfer to:</p>
                  <p className="font-mono text-brand-400">payments@matex.ca</p>
                  <p className="text-night-300 text-xs">
                    Use your order number as the message/memo. Matex will confirm receipt and release escrow within 1
                    business hour. Funds are held in escrow until delivery is confirmed.
                  </p>
                </div>
              )}
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
                  {!stripeReady ? (
                    <p className="text-xs text-night-300">
                      Card payments are not configured for this environment. Set
                      <code className="mx-1 rounded bg-night-850 px-1.5 py-0.5 font-mono text-[11px] text-brand-400">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>
                      or pick a different payment method.
                    </p>
                  ) : allocLoading ? (
                    <div className="flex items-center gap-3 py-2 text-sm text-night-300">
                      <Spinner className="h-4 w-4 text-blue-500" />
                      Preparing secure card form…
                    </div>
                  ) : allocError ? (
                    <div className="space-y-2 text-sm">
                      <p className="text-danger-400">{allocError}</p>
                      <button
                        type="button"
                        onClick={() => { setClientSecret(""); setAllocError(""); }}
                        className="text-xs font-semibold text-brand-400 underline-offset-2 hover:underline"
                      >
                        Try again
                      </button>
                    </div>
                  ) : clientSecret ? (
                    <StripeProvider clientSecret={clientSecret}>
                      <CardPaymentForm
                        amount={grandTotal}
                        disabled={!canCheckout}
                        onSuccess={async () => {
                          if (!orderId) return;
                          setProcessing(true);
                          setItemError("");
                          await finalizeAfterPayment(orderId);
                          setProcessing(false);
                        }}
                      />
                    </StripeProvider>
                  ) : (
                    <p className="text-xs text-night-300">Continue to start the card flow.</p>
                  )}
                </div>
              )}
              <PaymentOption
                id="wallet"
                icon={<Wallet className="h-5 w-5" />}
                label={`Matex Wallet — ${formatCAD(walletBalance)}`}
                description={walletBalance >= grandTotal ? "Sufficient balance" : `Insufficient — need ${formatCAD(grandTotal - walletBalance)} more`}
                selected={paymentMethod === "wallet"}
                onSelect={() => setPaymentMethod("wallet")}
                disabled={walletBalance < grandTotal}
              />
              <PaymentOption
                id="credit"
                icon={<Building2 className="h-5 w-5" />}
                label="Credit Facility (Net 30)"
                description="Available credit: $100,000 CAD"
                selected={paymentMethod === "credit"}
                onSelect={() => setPaymentMethod("credit")}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button size="lg" variant="secondary" className="flex-1" onClick={() => setStep(1)}>
              Back
            </Button>
            {paymentMethod !== "card" && (
              // Card flow uses CardPaymentForm's submit button (above) which
              // confirms the PaymentIntent via stripe.confirmPayment before
              // running finalizeAfterPayment. Wallet / credit / interac use
              // this synchronous path through process_payment.
              <Button
                size="lg"
                className="flex-1"
                loading={processing}
                disabled={!canCheckout}
                onClick={handleNonCardPayment}
              >
                <Shield className="h-4 w-4" />
                Pay {formatCAD(grandTotal)}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="rounded-xl border-2 border-emerald-300 bg-success-500/10 p-7 text-center">
            <Image
              src="/grphs/Animations/confetti-burst-a-confetti.png"
              alt=""
              aria-hidden
              width={260}
              height={80}
              className="mx-auto -mb-2 h-auto w-auto max-w-full opacity-90"
            />
            <Image
              src="/grphs/Platform%20Domains/payments-d-payments.png"
              alt=""
              aria-hidden
              width={220}
              height={140}
              className="mx-auto mb-3 h-auto w-auto max-w-full"
            />
            <h2 className="text-xl font-bold text-success-400">Order Confirmed!</h2>
            <p className="mt-1 text-sm text-success-400">Payment processed. Funds are now in escrow.</p>
          </div>

          <div className="marketplace-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-night-300">Invoice Number</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-night-100">{invoiceNumber || `MTX-${new Date().getFullYear()}-000001`}</span>
                <button onClick={() => { navigator.clipboard.writeText(invoiceNumber); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                  {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-night-300" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-night-300">Escrow Status</span>
              <Badge variant="info">Funds Held</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-night-300">Amount</span>
              <span className="font-bold text-night-100">{formatCAD(grandTotal)}</span>
            </div>
          </div>

          <div className="marketplace-card p-5">
            <h3 className="text-sm font-semibold text-night-200 mb-4">Next Steps</h3>
            <ol className="space-y-3">
              {[
                { label: "Book inspection", href: "/inspections", cta: "Schedule" },
                { label: "Arrange logistics", href: "/logistics", cta: "Get Quotes" },
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

          <Button size="lg" variant="secondary" className="w-full" onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Card-payment form. Mounted under <StripeProvider> so useStripe() and
 * useElements() resolve. The submit handler calls stripe.confirmPayment
 * with the clientSecret already on the Elements provider; we don't need
 * elements.submit() because we're using the immediate-PI pattern (PI was
 * created server-side before this form mounted).
 *
 * `redirect: "if_required"` lets Stripe.js auto-handle 3DS in an iframe
 * when needed and only return here on terminal status. On `succeeded` we
 * call onSuccess(); the durable transaction status flips to `completed`
 * via the Stripe webhook (existing /api/stripe/webhook handler) — the
 * Stripe.js result is a hint, the webhook is the source of truth.
 */
function CardPaymentForm({
  amount,
  disabled,
  onSuccess,
}: {
  amount: number;
  disabled: boolean;
  onSuccess: () => Promise<void>;
}): JSX.Element {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError("");
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        // If Stripe needs to redirect for 3DS the user comes back here.
        return_url: `${window.location.origin}/checkout?return=1`,
      },
    });
    if (confirmError) {
      setError(confirmError.message ?? "Card was declined.");
      setSubmitting(false);
      return;
    }
    // Defensive: if Stripe returned without an error but the PI isn't
    // succeeded (e.g. requires_action under non-redirect scenarios), surface
    // a friendly message and stay on this step.
    if (paymentIntent && paymentIntent.status !== "succeeded" && paymentIntent.status !== "processing") {
      setError(`Payment is ${paymentIntent.status.replace(/_/g, " ")}. Please try again.`);
      setSubmitting(false);
      return;
    }
    await onSuccess();
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">
          {error}
        </div>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={submitting}
        disabled={disabled || !stripe || !elements || submitting}
      >
        <Shield className="h-4 w-4" />
        Pay {new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount)}
      </Button>
    </form>
  );
}

function TaxLine({ label, value, sub = false }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${sub ? "text-night-300" : "text-night-200 font-medium"}`}>
      <span>{label}</span>
      <span>{value}</span>
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
      <input type="radio" name="checkout-payment" value={id} checked={selected} onChange={onSelect} disabled={disabled} className="sr-only" />
      <div className={`shrink-0 ${selected ? "text-blue-600" : "text-night-300"}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${selected ? "text-info-400" : "text-night-200"}`}>{label}</p>
        <p className="text-xs text-night-300">{description}</p>
      </div>
      {selected && <CheckCircle className="h-5 w-5 text-blue-600 shrink-0" />}
    </label>
  );
}
