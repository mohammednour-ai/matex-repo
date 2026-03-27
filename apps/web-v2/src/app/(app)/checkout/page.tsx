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
  Truck,
  Receipt,
  Shield,
} from "lucide-react";
import { callTool, getUser, extractId } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

type Step = 1 | 2 | 3;
type PaymentMethod = "card" | "wallet" | "credit";

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
  title: string;
  quantity: string;
  unit: string;
  unit_price: number;
  total: number;
  material_category: string;
};

const MOCK_ITEM: OrderItem = {
  listing_id: "lst-001",
  title: "HMS #1 Scrap Steel",
  quantity: "18",
  unit: "MT",
  unit_price: 1583.33,
  total: 28500,
  material_category: "Ferrous — HMS #1",
};

const MOCK_TAX: TaxBreakdown = {
  subtotal: 28500,
  commission: 997.5,
  gst: 0,
  hst: 1299.75,
  pst: 0,
  total_tax: 1299.75,
  grand_total: 30797.25,
  province_buyer: "ON",
  province_seller: "ON",
};

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

function generateInvoiceNumber(year: number, seq: number): string {
  return `MTX-${year}-${String(seq).padStart(6, "0")}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const user = getUser();
  const [step, setStep] = useState<Step>(1);
  const [item] = useState<OrderItem>(MOCK_ITEM);
  const [tax, setTax] = useState<TaxBreakdown | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const [shippingEstimate] = useState(2340);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [walletBalance] = useState(12500);
  const [processing, setProcessing] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [escrowId, setEscrowId] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadTax(): Promise<void> {
      setTaxLoading(true);
      const res = await callTool("tax.calculate_tax", {
        amount: item.total,
        province_seller: "ON",
        province_buyer: "ON",
        material_category: item.material_category,
      });
      if (res.success) {
        setTax(res.data as unknown as TaxBreakdown);
      } else {
        setTax(MOCK_TAX);
      }
      setTaxLoading(false);
    }
    loadTax();
  }, []);

  const effectiveTax = tax ?? MOCK_TAX;
  const grandTotal = effectiveTax.grand_total + shippingEstimate;

  async function handleConfirm(): Promise<void> {
    setProcessing(true);

    const paymentRes = await callTool("payments.process_payment", {
      amount: grandTotal,
      payment_method: paymentMethod,
      order_id: "ord-new",
    });

    const invoiceRes = await callTool("tax.generate_invoice", {
      order_id: "ord-new",
      amount: effectiveTax.subtotal,
      tax_amount: effectiveTax.total_tax,
      province_buyer: effectiveTax.province_buyer,
      province_seller: effectiveTax.province_seller,
    });
    const inv = extractId(invoiceRes, "invoice_number") || generateInvoiceNumber(new Date().getFullYear(), Math.floor(Math.random() * 999) + 1);
    const esc = `ESC-${Date.now()}`;

    setInvoiceNumber(inv);
    setEscrowId(esc);
    setStep(3);
    setProcessing(false);
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-0">
        {(["Order Review", "Payment", "Confirmation"] as const).map((label, i) => {
          const s = (i + 1) as Step;
          const active = step === s;
          const done = step > s;
          return (
            <div key={label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold shrink-0 ${
                    done ? "bg-emerald-500 text-white" : active ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-400"
                  }`}
                >
                  {done ? "✓" : s}
                </div>
                <p className={`mt-1 text-xs font-medium whitespace-nowrap ${active ? "text-blue-700" : done ? "text-emerald-600" : "text-slate-400"}`}>
                  {label}
                </p>
              </div>
              {i < 2 && <div className={`flex-1 h-0.5 mb-5 mx-1 ${done ? "bg-emerald-400" : "bg-slate-200"}`} />}
            </div>
          );
        })}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Order Details</h2>
            <div className="flex items-start gap-4 mb-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                <Package className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">{item.title}</p>
                <p className="text-sm text-slate-500">{item.quantity} {item.unit} @ {formatCAD(item.unit_price)}/{item.unit}</p>
                <Badge variant="gray" className="mt-1">{item.material_category}</Badge>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Price Breakdown</h2>
            {taxLoading ? (
              <div className="flex justify-center py-6">
                <Spinner className="h-6 w-6 text-blue-500" />
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
                <div className="flex justify-between border-t border-slate-200 pt-3 font-bold text-slate-900 text-base">
                  <span>Total</span>
                  <span className="text-blue-600">{formatCAD(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>

          <Button size="lg" className="w-full" onClick={() => setStep(2)}>
            Continue to Payment <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Select Payment Method</h2>
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
                  <div className="space-y-3">
                    <div className="h-10 rounded border-2 border-dashed border-slate-300 bg-white flex items-center justify-center text-xs text-slate-400">
                      Stripe Elements — Card Number (placeholder)
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="h-10 rounded border-2 border-dashed border-slate-300 bg-white flex items-center justify-center text-xs text-slate-400">
                        Expiry
                      </div>
                      <div className="h-10 rounded border-2 border-dashed border-slate-300 bg-white flex items-center justify-center text-xs text-slate-400">
                        CVC
                      </div>
                    </div>
                  </div>
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
            <Button size="lg" className="flex-1" loading={processing} onClick={handleConfirm}>
              <Shield className="h-4 w-4" />
              Pay {formatCAD(grandTotal)}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-7 text-center">
            <CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
            <h2 className="text-xl font-bold text-emerald-800">Order Confirmed!</h2>
            <p className="mt-1 text-sm text-emerald-700">Payment processed. Funds are now in escrow.</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Invoice Number</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-800">{invoiceNumber || `MTX-${new Date().getFullYear()}-000001`}</span>
                <button onClick={() => { navigator.clipboard.writeText(invoiceNumber); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                  {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-slate-400" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Escrow Status</span>
              <Badge variant="info">Funds Held</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Amount</span>
              <span className="font-bold text-slate-900">{formatCAD(grandTotal)}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Next Steps</h3>
            <ol className="space-y-3">
              {[
                { label: "Book inspection", href: "/inspection", cta: "Schedule" },
                { label: "Arrange logistics", href: "/logistics", cta: "Get Quotes" },
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

          <Button size="lg" variant="secondary" className="w-full" onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      )}
    </div>
  );
}

function TaxLine({ label, value, sub = false }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${sub ? "text-slate-500" : "text-slate-700 font-medium"}`}>
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
        selected ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input type="radio" name="checkout-payment" value={id} checked={selected} onChange={onSelect} disabled={disabled} className="sr-only" />
      <div className={`shrink-0 ${selected ? "text-blue-600" : "text-slate-400"}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${selected ? "text-blue-900" : "text-slate-700"}`}>{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      {selected && <CheckCircle className="h-5 w-5 text-blue-600 shrink-0" />}
    </label>
  );
}
