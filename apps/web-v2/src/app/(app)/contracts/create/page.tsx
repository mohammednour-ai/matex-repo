"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  Copy,
  ArrowRight,
} from "lucide-react";
import { callTool, getUser, extractId } from "@/lib/api";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Spinner } from "@/components/ui/shadcn/spinner";

/**
 * /contracts/create — v1 form for standing supply contracts.
 *
 * Scope (per the agreed plan in PR #47's description and the audit doc
 * §2.3 P1-1):
 *   - contract_type = "standing" only (volume / hybrid / index_linked /
 *     rfq_framework / consignment are valid tool inputs but not exposed
 *     here; chat / API callers can still issue them).
 *   - pricing_model is built server-side from the base_price field —
 *     the tool defaults the JSONB to { type: "fixed", base_price,
 *     currency } so index_linked is an additive change (add a pricing
 *     UI block that overrides pricing_model directly) without backend
 *     churn.
 *   - quality_specs and breach_penalties are left to defaults; the
 *     in-contract negotiate_terms flow already covers refinement.
 *   - No counterparty search yet — paste their user_id. Counterparty
 *     picker is a follow-up.
 *
 * After submit the page shows a success step with the new contract_id
 * and a link to /contracts. There is no /contracts/[id] route yet
 * (separate piece of work), so we don't redirect into one.
 *
 * Refs: docs/audit/2026-05-10/report.md §2.3 P1-1, PR #47 (tool fix).
 */

type Step = "form" | "success";
type Role = "buyer" | "seller";

type UnitOption = { value: string; label: string };
const UNIT_OPTIONS: UnitOption[] = [
  { value: "mt", label: "Metric tonne (MT)" },
  { value: "kg", label: "Kilogram (kg)" },
  { value: "lots", label: "Lot" },
  { value: "cubic_yards", label: "Cubic yard" },
  // troy_oz / g / units exist on the unit_type enum but are uncommon
  // for B2B scrap contracts; omit from the v1 picker.
];

type FrequencyOption = { value: string; label: string };
const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { value: "", label: "No fixed cadence" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "on_demand", label: "On demand" },
];

type Category = {
  category_id: string;
  name: string;
  slug?: string;
  parent_id?: string | null;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusMonthsISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default function CreateContractPage(): JSX.Element {
  const router = useRouter();
  const user = getUser();
  const userId = user?.userId ?? "";

  // Form state
  const [role, setRole] = useState<Role>("buyer");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [totalVolume, setTotalVolume] = useState("");
  const [unit, setUnit] = useState<string>("mt");
  const [basePrice, setBasePrice] = useState("");
  const [frequency, setFrequency] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(todayISO());
  const [endDate, setEndDate] = useState<string>(plusMonthsISO(12));
  const [autoRenew, setAutoRenew] = useState(false);
  const [renewalNoticeDays, setRenewalNoticeDays] = useState("30");

  // Async state
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [createdContractId, setCreatedContractId] = useState("");
  const [copied, setCopied] = useState(false);

  // Load categories on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCategoriesLoading(true);
      setCategoriesError("");
      const res = await callTool("listing.list_categories", {});
      if (cancelled) return;
      if (!res.success) {
        setCategoriesError(res.error?.message ?? "Could not load material categories.");
        setCategoriesLoading(false);
        return;
      }
      const data = res.data as Record<string, unknown> | undefined;
      const up = (data?.upstream_response as Record<string, unknown> | undefined)?.data as
        | Record<string, unknown>
        | undefined;
      const list =
        (up?.categories as Category[] | undefined) ??
        (data?.categories as Category[] | undefined) ??
        [];
      if (Array.isArray(list)) {
        // Show only top-level categories in v1 — matches "standing
        // contract for a material class" rather than asking buyers to
        // pick a sub-grade up front. Sub-grades belong on quality_specs
        // and the in-contract negotiation flow.
        const top = list.filter((c) => !c.parent_id);
        setCategories(top.length > 0 ? top : list);
      }
      setCategoriesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function validate(): string {
    if (!userId) return "Sign in to create a contract.";
    if (!counterpartyId.trim()) return "Counterparty user ID is required.";
    if (counterpartyId.trim() === userId) return "You can't be the counterparty on your own contract.";
    if (!categoryId) return "Pick a material category.";
    const v = Number(totalVolume);
    if (!Number.isFinite(v) || v <= 0) return "Total volume must be greater than 0.";
    const p = Number(basePrice);
    if (!Number.isFinite(p) || p <= 0) return "Base price must be greater than 0.";
    if (!startDate || !endDate) return "Start and end dates are required.";
    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      return "End date must be after start date.";
    }
    return "";
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const err = validate();
    if (err) {
      setSubmitError(err);
      return;
    }
    setSubmitting(true);
    setSubmitError("");

    const buyerId = role === "buyer" ? userId : counterpartyId.trim();
    const sellerId = role === "seller" ? userId : counterpartyId.trim();
    // pricing_model omitted — the tool (PR #47) defaults it to
    // { type: "fixed", base_price, currency: "CAD" }. When index_linked
    // becomes a v2 form choice this is where the override goes.
    const res = await callTool("contracts.create_contract", {
      buyer_id: buyerId,
      seller_id: sellerId,
      contract_type: "standing",
      material_category_id: categoryId,
      total_volume: Number(totalVolume),
      unit,
      base_price: Number(basePrice),
      currency: "CAD",
      frequency: frequency || undefined,
      start_date: startDate,
      end_date: endDate,
      auto_renew: autoRenew,
      renewal_notice_days: Number(renewalNoticeDays) || 30,
    });

    if (!res.success) {
      setSubmitError(res.error?.message ?? "Could not create contract.");
      setSubmitting(false);
      return;
    }
    const id = extractId(res, "contract_id");
    if (!id) {
      setSubmitError("Contract was created but no contract_id was returned.");
      setSubmitting(false);
      return;
    }
    setCreatedContractId(id);
    setStep("success");
    setSubmitting(false);
  }

  function handleCopy(): void {
    navigator.clipboard.writeText(createdContractId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (step === "success") {
    return (
      <div className="space-y-6">
        <AppPageHeader
          title="Draft contract created"
          description="Status: draft. Negotiate terms or send for eSign from the contract list."
          actions={
            <Button size="sm" variant="secondary" onClick={() => router.push("/contracts")}>
              <ArrowLeft className="h-4 w-4" /> Back to contracts
            </Button>
          }
        />
        <div className="mx-auto max-w-md space-y-5">
          <div className="rounded-xl border-2 border-emerald-300 bg-success-500/10 p-7 text-center">
            <CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
            <h2 className="text-xl font-bold text-success-400">Contract drafted</h2>
            <p className="mt-1 text-sm text-success-400">
              Your standing-supply contract is saved as a draft. Both parties can review and propose changes
              before sending to eSign.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-300 bg-night-850 px-4 py-2.5">
              <span className="text-xs text-night-300">Contract ID</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-night-100 truncate max-w-[200px]">{createdContractId}</span>
                <button onClick={handleCopy} className="text-night-300 hover:text-night-200" aria-label="Copy contract ID">
                  {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="marketplace-card p-5">
            <h3 className="text-sm font-semibold text-night-200 mb-3">Next steps</h3>
            <ol className="space-y-3 text-sm text-night-200">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
                <span>Counterparty reviews the draft and may propose changes via the in-contract negotiation flow.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
                <span>Once both parties agree, send to eSign from the contract page (self-serve send is coming; reach out to Matex support to send today).</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">3</span>
                <span>After eSign, the contract activates and orders auto-generate per the agreed cadence.</span>
              </li>
            </ol>
          </div>

          <div className="flex gap-3">
            <Button size="lg" variant="secondary" className="flex-1" onClick={() => router.push("/contracts")}>
              View all contracts
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                setStep("form");
                setCreatedContractId("");
                setCopied(false);
                setSubmitError("");
              }}
            >
              Draft another <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="New contract"
        description="Draft a standing supply agreement. The contract starts in draft and only activates after both parties eSign."
        actions={
          <Button size="sm" variant="secondary" onClick={() => router.push("/contracts")}>
            <ArrowLeft className="h-4 w-4" /> Back to contracts
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
        {/* Parties */}
        <section className="marketplace-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-night-300">Parties</h2>
          <div>
            <label className="mb-2 block text-sm font-medium text-night-200">I am the</label>
            <div className="grid grid-cols-2 gap-3">
              {(["buyer", "seller"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-xl border-2 p-3 text-sm font-medium transition ${
                    role === r
                      ? "border-blue-500 bg-brand-500/10 text-info-400"
                      : "border-night-700 text-night-200 hover:border-night-600"
                  }`}
                  aria-pressed={role === r}
                >
                  {r === "buyer" ? "Buyer (receiving material)" : "Seller (providing material)"}
                </button>
              ))}
            </div>
          </div>
          <Input
            label={`Counterparty user ID (the ${role === "buyer" ? "seller" : "buyer"})`}
            value={counterpartyId}
            onChange={(e) => setCounterpartyId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            hint="Paste their user ID. A counterparty picker is on the way; until then, find their ID in a recent order or message header."
          />
        </section>

        {/* Material + volume */}
        <section className="marketplace-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-night-300">Material &amp; volume</h2>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-night-200">Material category</label>
            {categoriesLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-night-700 bg-night-850 px-3 py-2 text-sm text-night-300">
                <Spinner className="h-4 w-4 text-blue-500" /> Loading categories…
              </div>
            ) : categoriesError ? (
              <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-400">
                {categoriesError}
              </div>
            ) : (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-lg border border-night-600 bg-night-850 px-3 py-2 text-sm text-night-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">— pick a category —</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Total volume"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={totalVolume}
              onChange={(e) => setTotalVolume(e.target.value)}
              placeholder="e.g. 240"
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-night-200">Unit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-night-600 bg-night-850 px-3 py-2 text-sm text-night-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="marketplace-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-night-300">Pricing</h2>
          <div className="rounded-lg border border-night-700 bg-night-900 p-3 text-xs text-night-300">
            v1 supports fixed-price standing contracts. Index-linked pricing (LME / scrap-index pegged with
            premium and floor/ceiling) lands as an additive section here — the underlying tool already accepts it.
          </div>
          <Input
            label={`Base price per ${UNIT_OPTIONS.find((o) => o.value === unit)?.label.toLowerCase() ?? unit} (CAD)`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            placeholder="e.g. 850.00"
          />
        </section>

        {/* Cadence + term */}
        <section className="marketplace-card p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-night-300">Cadence &amp; term</h2>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-night-200">Delivery frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full rounded-lg border border-night-600 bg-night-850 px-3 py-2 text-sm text-night-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="End date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-night-700 bg-night-900 p-3">
            <input
              type="checkbox"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-night-600 text-blue-600 focus:ring-blue-500"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-night-200">Auto-renew at end date</p>
              <p className="text-xs text-night-300">
                Renews on the same terms unless either party gives notice within the window below.
              </p>
            </div>
          </label>
          {autoRenew && (
            <Input
              label="Renewal notice window (days)"
              type="number"
              inputMode="numeric"
              min="0"
              value={renewalNoticeDays}
              onChange={(e) => setRenewalNoticeDays(e.target.value)}
            />
          )}
        </section>

        {submitError && (
          <div className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
            {submitError}
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={submitting || categoriesLoading}
        >
          <FileText className="h-4 w-4" /> Save draft contract
        </Button>
      </form>
    </div>
  );
}
