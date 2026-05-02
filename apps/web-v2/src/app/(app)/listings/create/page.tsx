"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import clsx from "clsx";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Package,
  Camera,
  DollarSign,
  Truck,
  CreditCard,
  Eye,
  AlertCircle,
  Info,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MediaUploader } from "@/components/ui/MediaUploader";
import { callTool, getUser, extractId } from "@/lib/api";
import { track } from "@/lib/analytics";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { ListingCreateOverview } from "@/components/listings/ListingCreateOverview";

// ─── Types ──────────────────────────────────────────────────────────────────

type SaleMode = "fixed" | "bidding" | "auction" | "";
type MaterialType = "scrap" | "surplus";
type PublishMode = "immediate" | "scheduled";

type FormData = {
  // Step 1
  title: string;
  description: string;
  category: string;
  materialType: MaterialType;
  qualityGrade: string;
  contaminationPct: number;
  moisturePct: number;
  quantity: number;
  unit: string;
  hasPermit: boolean;
  permitNumber: string;
  certifications: string;
  // Step 2
  uploadedUrls: string[];
  /** Auction terms PDF / doc uploads (step 3 auction only) — kept separate from material photos. */
  auctionTermsUrls: string[];
  // Step 3
  saleMode: SaleMode;
  askingPrice: string;
  buyNowPrice: string;
  listingExpiry: string;
  startingBid: string;
  reservePrice: string;
  bidIncrement: string;
  biddingCloses: string;
  auctionDate: string;
  depositPct: number;
  minLotSize: string;
  publishMode: PublishMode;
  scheduledAt: string;
  // Step 4
  inspectionRequired: boolean;
  inspectionWindow: string;
  inspectionDays: string[];
  inspectorPreference: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
  hazmatClass: string;
  // Step 5
  requireEscrow: boolean;
  paymentMethods: string[];
  downPaymentPct: number;
  sellerProvince: string;
};

const DEFAULT_FORM: FormData = {
  title: "",
  description: "",
  category: "",
  materialType: "scrap",
  qualityGrade: "",
  contaminationPct: 0,
  moisturePct: 0,
  quantity: 0,
  unit: "mt",
  hasPermit: false,
  permitNumber: "",
  certifications: "",
  uploadedUrls: [],
  auctionTermsUrls: [],
  saleMode: "",
  askingPrice: "",
  buyNowPrice: "",
  listingExpiry: "",
  startingBid: "",
  reservePrice: "",
  bidIncrement: "",
  biddingCloses: "",
  auctionDate: "",
  depositPct: 10,
  minLotSize: "",
  publishMode: "immediate",
  scheduledAt: "",
  inspectionRequired: false,
  inspectionWindow: "48h",
  inspectionDays: [],
  inspectorPreference: "matex",
  street: "",
  city: "",
  province: "ON",
  postalCode: "",
  hazmatClass: "none",
  requireEscrow: true,
  paymentMethods: ["stripe"],
  downPaymentPct: 25,
  sellerProvince: "ON",
};

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES: { name: string; icon: string | null }[] = [
  { name: "Ferrous Metals", icon: "/icons/categories/ferrous-metals.png" },
  { name: "Non-Ferrous Metals", icon: "/icons/categories/non-ferrous-metals.png" },
  { name: "Precious Metals", icon: "/icons/categories/precious-metals.png" },
  { name: "Plastics", icon: "/icons/categories/plastics.png" },
  { name: "Electronics", icon: "/icons/categories/electronics.png" },
  { name: "Paper & Cardboard", icon: "/icons/categories/paper-cardboard.png" },
  { name: "Rubber", icon: "/icons/categories/rubber.png" },
  { name: "Construction", icon: "/icons/categories/construction.png" },
];

const UNITS = [
  { value: "mt", label: "Metric Tons (mt)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "units", label: "Units" },
  { value: "lots", label: "Lots" },
];

const PROVINCES = [
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
];

const HAZMAT_CLASSES = [
  { value: "none", label: "None" },
  { value: "class8", label: "Class 8 — Corrosives (Lead-acid batteries)" },
  { value: "class9", label: "Class 9 — Miscellaneous (Li-ion scrap)" },
  { value: "other", label: "Other (specify in description)" },
];

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PAYMENT_METHOD_OPTIONS = [
  { value: "stripe", label: "Stripe (credit / debit card)" },
  { value: "bank_transfer", label: "Bank transfer (EFT/wire)" },
  { value: "wallet", label: "Matex wallet balance" },
  { value: "credit", label: "Credit terms (Net 15/30/60)" },
  { value: "lc", label: "Letter of credit" },
];

const INSPECTION_WINDOWS = [
  { value: "48h", label: "48 hours" },
  { value: "72h", label: "72 hours" },
  { value: "1w", label: "1 week" },
  { value: "2w", label: "2 weeks" },
];

/** Result of persisting step 1 so callers can show API errors instead of a generic message. */
type SaveDraftResult = { ok: true; listingId: string } | { ok: false; message: string };

const STEPS = [
  { n: 1, label: "Material", icon: Package },
  { n: 2, label: "Photos", icon: Camera },
  { n: 3, label: "Sale Mode", icon: DollarSign },
  { n: 4, label: "Logistics", icon: Truck },
  { n: 5, label: "Payment", icon: CreditCard },
  { n: 6, label: "Review", icon: Eye },
];

// ─── Commission helper ───────────────────────────────────────────────────────

function calcCommission(amount: number, mode: SaleMode): number {
  if (!amount || amount <= 0) return 0;
  const rate = mode === "auction" ? 0.04 : 0.035;
  const min = mode === "auction" ? 50 : 25;
  const cap = mode === "auction" ? 7500 : 5000;
  const raw = amount * rate;
  return Math.min(Math.max(raw, min), cap);
}

// ─── Shared field components ─────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-slate-700 mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-slate-400">{children}</p>;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-500 transition-colors";

const selectCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-500 transition-colors bg-white";

function Slider({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-sm font-semibold text-slate-800">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-600 h-2 rounded cursor-pointer"
      />
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
  );
}

function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-brand-50 border border-brand-100 px-3 py-2.5">
      <Info className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
      <p className="text-xs text-brand-700">{children}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}

// ─── Step progress bar ───────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-1">
      {STEPS.map((s, idx) => {
        const done = s.n < current;
        const active = s.n === current;
        const Icon = s.icon;
        return (
          <div key={s.n} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={clsx(
                  "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors shrink-0",
                  done
                    ? "bg-brand-600 border-brand-600 text-white"
                    : active
                    ? "bg-white border-brand-600 text-brand-600"
                    : "bg-white border-slate-200 text-slate-400"
                )}
              >
                {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span
                className={clsx(
                  "text-[10px] font-medium whitespace-nowrap",
                  active ? "text-brand-600" : done ? "text-slate-700" : "text-slate-400"
                )}
              >
                {s.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={clsx(
                  "h-0.5 w-8 sm:w-12 mx-1 mt-[-12px] transition-colors",
                  done ? "bg-brand-600" : "bg-slate-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Material Info ────────────────────────────────────────────────────

function Step1({
  data,
  onChange,
  onSaveDraft,
  saving,
  listingId,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  onSaveDraft: () => Promise<SaveDraftResult>;
  saving: boolean;
  listingId: string;
}) {
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel required>Listing title</FieldLabel>
        <input
          className={inputCls}
          placeholder="e.g. HMS 1&2 Mixed Ferrous Scrap — 50 MT"
          value={data.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </div>

      <div>
        <FieldLabel required>Description</FieldLabel>
        <textarea
          className={clsx(inputCls, "resize-none")}
          rows={4}
          placeholder="Describe the material grade, condition, source, packaging, etc."
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel required>Category</FieldLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CATEGORIES.map((c) => {
              const active = data.category === c.name;
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => onChange({ category: c.name })}
                  className={clsx(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors",
                    active
                      ? "border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-200"
                      : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-brand-50/40",
                  )}
                >
                  {c.icon ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-steel-50 overflow-hidden">
                      <Image src={c.icon} alt="" width={28} height={28} className="object-contain" />
                    </span>
                  ) : null}
                  <span className="truncate">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel>Material type</FieldLabel>
          <div className="flex gap-2 mt-0.5">
            {(["scrap", "surplus"] as MaterialType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ materialType: t })}
                className={clsx(
                  "flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors",
                  data.materialType === t
                    ? "bg-brand-600 border-brand-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <FieldLabel>Quality grade / ISRI code</FieldLabel>
        <input
          className={inputCls}
          placeholder="e.g. HMS #1, Zorba, 3161 Stainless"
          value={data.qualityGrade}
          onChange={(e) => onChange({ qualityGrade: e.target.value })}
        />
        <FieldHint>Reference ISRI specifications or applicable grading standard.</FieldHint>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Slider
          label="Contamination %"
          value={data.contaminationPct}
          onChange={(v) => onChange({ contaminationPct: v })}
          hint="Estimated non-conforming material by weight"
        />
        <Slider
          label="Moisture %"
          value={data.moisturePct}
          onChange={(v) => onChange({ moisturePct: v })}
          hint="Estimated moisture content by weight"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="col-span-2 sm:col-span-2">
          <FieldLabel required>Quantity</FieldLabel>
          <input
            type="number"
            min={0}
            step={1}
            className={inputCls}
            placeholder="0"
            value={data.quantity || ""}
            onChange={(e) => onChange({ quantity: Math.round(Number(e.target.value) || 0) })}
          />
        </div>
        <div>
          <FieldLabel>Unit</FieldLabel>
          <select
            className={selectCls}
            value={data.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
          >
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-sm font-medium text-slate-700">Environmental permits</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.hasPermit}
            onChange={(e) => onChange({ hasPermit: e.target.checked })}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-200"
          />
          <span className="text-sm text-slate-700">Has provincial transport permit</span>
        </label>
        {data.hasPermit && (
          <input
            className={inputCls}
            placeholder="Permit number (e.g. ON-2026-12345)"
            value={data.permitNumber}
            onChange={(e) => onChange({ permitNumber: e.target.value })}
          />
        )}
      </div>

      <div>
        <FieldLabel>Certifications</FieldLabel>
        <textarea
          className={clsx(inputCls, "resize-none")}
          rows={2}
          placeholder="e.g. R2v3 certified, ISO 14001, e-Stewards"
          value={data.certifications}
          onChange={(e) => onChange({ certifications: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="secondary"
          onClick={onSaveDraft}
          loading={saving}
          size="sm"
        >
          Save as draft
        </Button>
        {listingId && (
          <span className="text-xs text-slate-400">Draft saved · ID: {listingId.slice(0, 8)}…</span>
        )}
      </div>
    </div>
  );
}

// ─── Step 2: Photos & Videos ──────────────────────────────────────────────────

function Step2({
  data,
  onChange,
  listingId,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  listingId: string;
}) {
  return (
    <div className="space-y-4">
      <InfoBanner>
        Add at least 1 photo of the material. High-quality photos improve buyer confidence and reduce disputes.
      </InfoBanner>
      <div>
        <FieldLabel>Upload material photos and condition videos</FieldLabel>
        <MediaUploader
          listingId={listingId || undefined}
          maxFiles={12}
          onUploadComplete={(urls) => onChange({ uploadedUrls: urls })}
        />
        <FieldHint>
          Accepted: JPG, PNG, WebP (photos) · MP4 (video tours) · Max 12 files
        </FieldHint>
      </div>
      {data.uploadedUrls.length > 0 && (
        <p className="text-xs text-emerald-600 font-medium">
          ✓ {data.uploadedUrls.length} file{data.uploadedUrls.length > 1 ? "s" : ""} uploaded
        </p>
      )}
    </div>
  );
}

// ─── Step 3: Sale Mode ────────────────────────────────────────────────────────

function SaleModeCard({
  mode,
  selected,
  title,
  description,
  icon,
  onSelect,
}: {
  mode: SaleMode;
  selected: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "w-full rounded-xl border-2 p-4 text-left transition-all",
        selected
          ? "border-brand-600 bg-brand-50/50 ring-1 ring-brand-200"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
            selected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={clsx("font-semibold text-sm", selected ? "text-brand-700" : "text-slate-800")}>
            {title}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <div
          className={clsx(
            "w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center",
            selected ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white"
          )}
        >
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </div>
    </button>
  );
}

function Step3({
  data,
  onChange,
  listingId,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  listingId: string;
}) {
  const price =
    data.saleMode === "fixed"
      ? parseFloat(data.askingPrice) || 0
      : data.saleMode === "bidding"
      ? parseFloat(data.startingBid) || 0
      : parseFloat(data.reservePrice) || 0;
  const commission = calcCommission(price, data.saleMode);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <SaleModeCard
          mode="fixed"
          selected={data.saleMode === "fixed"}
          title="Fixed Price"
          description="Set a firm asking price. Buyers can purchase immediately."
          icon={<DollarSign className="w-5 h-5" />}
          onSelect={() => onChange({ saleMode: "fixed" })}
        />
        <SaleModeCard
          mode="bidding"
          selected={data.saleMode === "bidding"}
          title="Open Bidding"
          description="Accept competitive bids over a set period. Best price wins."
          icon={
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 5.323V3a1 1 0 011-1z" />
            </svg>
          }
          onSelect={() => onChange({ saleMode: "bidding" })}
        />
        <SaleModeCard
          mode="auction"
          selected={data.saleMode === "auction"}
          title="Live Auction"
          description="Schedule a timed live auction session with deposits and lots."
          icon={
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2V5h1v1H5zm-2 7a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 2v-1h1v1H5zm8-12a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1V4zm2 2V5h1v1h-1zm-2 7a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-3zm2 2v-1h1v1h-1z" clipRule="evenodd" />
            </svg>
          }
          onSelect={() => onChange({ saleMode: "auction" })}
        />
      </div>

      {/* Mode-specific fields */}
      {data.saleMode === "fixed" && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-4">
          <p className="text-sm font-semibold text-slate-700">Fixed price settings</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Asking price (CAD)</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={clsx(inputCls, "pl-7")}
                  placeholder="0.00"
                  value={data.askingPrice}
                  onChange={(e) => onChange({ askingPrice: e.target.value })}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Buy-now price (CAD)</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={clsx(inputCls, "pl-7")}
                  placeholder="Optional"
                  value={data.buyNowPrice}
                  onChange={(e) => onChange({ buyNowPrice: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div>
            <FieldLabel>Listing expires at</FieldLabel>
            <input
              type="date"
              className={inputCls}
              value={data.listingExpiry}
              onChange={(e) => onChange({ listingExpiry: e.target.value })}
            />
          </div>
        </div>
      )}

      {data.saleMode === "bidding" && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-4">
          <p className="text-sm font-semibold text-slate-700">Bidding settings</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel required>Starting bid (CAD)</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number" min={0} step={0.01}
                  className={clsx(inputCls, "pl-7")}
                  placeholder="0.00"
                  value={data.startingBid}
                  onChange={(e) => onChange({ startingBid: e.target.value })}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Reserve price (CAD)</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number" min={0} step={0.01}
                  className={clsx(inputCls, "pl-7")}
                  placeholder="Hidden floor price"
                  value={data.reservePrice}
                  onChange={(e) => onChange({ reservePrice: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Bid increment (CAD)</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number" min={0} step={0.01}
                  className={clsx(inputCls, "pl-7")}
                  placeholder="e.g. 100.00"
                  value={data.bidIncrement}
                  onChange={(e) => onChange({ bidIncrement: e.target.value })}
                />
              </div>
            </div>
            <div>
              <FieldLabel required>Bidding closes at</FieldLabel>
              <input
                type="datetime-local"
                className={inputCls}
                value={data.biddingCloses}
                onChange={(e) => onChange({ biddingCloses: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}

      {data.saleMode === "auction" && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-4">
          <p className="text-sm font-semibold text-slate-700">Live auction settings</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Reserve price (CAD)</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number" min={0} step={0.01}
                  className={clsx(inputCls, "pl-7")}
                  placeholder="Hidden reserve"
                  value={data.reservePrice}
                  onChange={(e) => onChange({ reservePrice: e.target.value })}
                />
              </div>
            </div>
            <div>
              <FieldLabel required>Auction session date & time</FieldLabel>
              <input
                type="datetime-local"
                className={inputCls}
                value={data.auctionDate}
                onChange={(e) => onChange({ auctionDate: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <FieldLabel>Deposit / downpayment %</FieldLabel>
                <span className="text-sm font-semibold text-slate-800">{data.depositPct}%</span>
              </div>
              <input
                type="range" min={0} max={50}
                value={data.depositPct}
                onChange={(e) => onChange({ depositPct: Number(e.target.value) })}
                className="w-full accent-brand-600 h-2 rounded cursor-pointer"
              />
              <FieldHint>Percentage of winning bid required as deposit</FieldHint>
            </div>
            <div>
              <FieldLabel>Minimum lot size</FieldLabel>
              <input
                className={inputCls}
                placeholder="e.g. 5 MT per lot"
                value={data.minLotSize}
                onChange={(e) => onChange({ minLotSize: e.target.value })}
              />
            </div>
          </div>
          <div>
            <FieldLabel>Auction terms (PDF)</FieldLabel>
            <MediaUploader
              listingId={listingId || undefined}
              maxFiles={1}
              onUploadComplete={(urls) => onChange({ auctionTermsUrls: urls })}
            />
            <FieldHint>Upload a PDF of auction terms and conditions for bidders.</FieldHint>
          </div>
        </div>
      )}

      {/* Publish schedule */}
      {data.saleMode !== "" && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">Publish schedule</p>
          <div className="flex gap-2">
            {(["immediate", "scheduled"] as PublishMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ publishMode: m })}
                className={clsx(
                  "flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors",
                  data.publishMode === m
                    ? "bg-brand-600 border-brand-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                )}
              >
                {m === "immediate" ? "Publish immediately" : "Schedule for later"}
              </button>
            ))}
          </div>
          {data.publishMode === "scheduled" && (
            <div>
              <FieldLabel>Go-live date & time</FieldLabel>
              <input
                type="datetime-local"
                className={inputCls}
                value={data.scheduledAt}
                onChange={(e) => onChange({ scheduledAt: e.target.value })}
              />
            </div>
          )}
        </div>
      )}

      {/* Commission preview */}
      {price > 0 && data.saleMode && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 flex justify-between items-center">
          <div>
            <p className="text-xs font-medium text-amber-700">Estimated Matex commission</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {data.saleMode === "auction" ? "4.0%" : "3.5%"} · min ${data.saleMode === "auction" ? "50" : "25"} · max ${data.saleMode === "auction" ? "7,500" : "5,000"}
            </p>
          </div>
          <span className="font-bold text-amber-800 text-base">
            ${commission.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Inspection & Logistics ──────────────────────────────────────────

type ShippingQuote = { carrier: string; price: number; transit: string };

function Step4({
  data,
  onChange,
  listingId,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  listingId: string;
}) {
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [quotesError, setQuotesError] = useState("");
  const [settingAvail, setSettingAvail] = useState(false);
  const [availSaved, setAvailSaved] = useState(false);

  const co2Estimate =
    data.unit === "mt"
      ? (data.quantity * 12).toFixed(1)
      : data.unit === "kg"
      ? ((data.quantity / 1000) * 12).toFixed(1)
      : null;

  const toggleDay = (day: string) => {
    const current = data.inspectionDays;
    onChange({
      inspectionDays: current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day],
    });
  };

  const handleSetAvailability = async () => {
    if (!listingId || data.inspectionDays.length === 0) return;
    setSettingAvail(true);
    try {
      await callTool("booking.set_availability", {
        listing_id: listingId,
        days_of_week: data.inspectionDays,
        inspection_window: data.inspectionWindow,
      });
      setAvailSaved(true);
    } catch {
      /* soft fail */
    } finally {
      setSettingAvail(false);
    }
  };

  const handleGetQuotes = async () => {
    setLoadingQuotes(true);
    setQuotesError("");
    try {
      const res = await callTool("logistics.get_quotes", {
        listing_id: listingId || undefined,
        origin_province: data.province,
        origin_city: data.city,
        weight_kg: data.unit === "mt" ? data.quantity * 1000 : data.unit === "kg" ? data.quantity : 0,
        hazmat_class: data.hazmatClass,
        user_id: getUser()?.userId ?? "",
      });
      const upData = (res.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const raw = (upData?.quotes ?? res.data?.quotes ?? []) as ShippingQuote[];
      setQuotes(Array.isArray(raw) ? raw.slice(0, 3) : []);
    } catch {
      setQuotesError("Could not fetch quotes. Please try again.");
    } finally {
      setLoadingQuotes(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Inspection toggle */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Inspection required</p>
            <p className="text-xs text-slate-500 mt-0.5">Buyers must schedule an inspection before purchase</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ inspectionRequired: !data.inspectionRequired })}
            className={clsx(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
              data.inspectionRequired ? "bg-brand-600" : "bg-slate-200"
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow",
                data.inspectionRequired ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>

        {data.inspectionRequired && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Inspection window</FieldLabel>
                <select
                  className={selectCls}
                  value={data.inspectionWindow}
                  onChange={(e) => onChange({ inspectionWindow: e.target.value })}
                >
                  {INSPECTION_WINDOWS.map((w) => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Inspector preference</FieldLabel>
                <select
                  className={selectCls}
                  value={data.inspectorPreference}
                  onChange={(e) => onChange({ inspectorPreference: e.target.value })}
                >
                  <option value="matex">Any Matex inspector</option>
                  <option value="third_party">Third-party inspector</option>
                </select>
              </div>
            </div>

            <div>
              <FieldLabel>Available inspection days</FieldLabel>
              <div className="flex flex-wrap gap-2 mt-1">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={clsx(
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      data.inspectionDays.includes(day)
                        ? "bg-brand-600 border-brand-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            {data.inspectionDays.length > 0 && (
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSetAvailability}
                  loading={settingAvail}
                >
                  Save availability
                </Button>
                {availSaved && (
                  <span className="text-xs text-emerald-600 font-medium">✓ Saved</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pickup address */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Pickup address</p>
        <input
          className={inputCls}
          placeholder="Street address"
          value={data.street}
          onChange={(e) => onChange({ street: e.target.value })}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <input
              className={inputCls}
              placeholder="City"
              value={data.city}
              onChange={(e) => onChange({ city: e.target.value })}
            />
          </div>
          <div>
            <select
              className={selectCls}
              value={data.province}
              onChange={(e) => onChange({ province: e.target.value })}
            >
              {PROVINCES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <input
              className={inputCls}
              placeholder="Postal code"
              value={data.postalCode}
              onChange={(e) => onChange({ postalCode: e.target.value.toUpperCase() })}
              maxLength={7}
            />
          </div>
        </div>
      </div>

      {/* Hazmat */}
      <div>
        <FieldLabel>Hazmat classification</FieldLabel>
        <select
          className={selectCls}
          value={data.hazmatClass}
          onChange={(e) => onChange({ hazmatClass: e.target.value })}
        >
          {HAZMAT_CLASSES.map((h) => (
            <option key={h.value} value={h.value}>{h.label}</option>
          ))}
        </select>
        {data.hazmatClass !== "none" && (
          <InfoBanner>
            Carrier must have valid TDG certification for this hazmat class. Non-certified carriers will be excluded from quotes.
          </InfoBanner>
        )}
      </div>

      {/* CO2 estimate */}
      {co2Estimate && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 flex justify-between items-center">
          <div>
            <p className="text-xs font-medium text-emerald-700">Estimated CO₂ emissions</p>
            <p className="text-xs text-emerald-600 mt-0.5">Based on material weight (avg. 12 kg CO₂/mt)</p>
          </div>
          <span className="font-bold text-emerald-800 text-base">{co2Estimate} kg CO₂</span>
        </div>
      )}

      {/* Shipping estimates */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Shipping estimates</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleGetQuotes}
            loading={loadingQuotes}
          >
            {loadingQuotes ? "Fetching…" : "Get quotes"}
          </Button>
        </div>
        {quotesError && <ErrorBanner message={quotesError} />}
        {quotes.length > 0 && (
          <div className="space-y-2">
            {quotes.map((q, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{q.carrier}</p>
                  <p className="text-xs text-slate-400">{q.transit}</p>
                </div>
                <span className="font-semibold text-slate-800 text-sm">
                  ${q.price.toLocaleString("en-CA", { minimumFractionDigits: 2 })} CAD
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 5: Payment & Escrow ─────────────────────────────────────────────────

type TaxPreview = {
  gst: number; hst: number; pst: number; qst: number; total: number;
  gst_amount?: number; hst_amount?: number; pst_amount?: number; qst_amount?: number; total_tax?: number;
  total_amount?: number;
};

function Step5({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  const [taxPreview, setTaxPreview] = useState<TaxPreview | null>(null);
  const [loadingTax, setLoadingTax] = useState(false);

  const price =
    data.saleMode === "fixed"
      ? parseFloat(data.askingPrice) || 0
      : data.saleMode === "bidding"
      ? parseFloat(data.startingBid) || 0
      : parseFloat(data.reservePrice) || 0;

  const commission = calcCommission(price, data.saleMode);

  const togglePayment = (method: string) => {
    onChange({
      paymentMethods: data.paymentMethods.includes(method)
        ? data.paymentMethods.filter((m) => m !== method)
        : [...data.paymentMethods, method],
    });
  };

  const handleCalcTax = async () => {
    if (!price) return;
    setLoadingTax(true);
    try {
      const res = await callTool("tax.calculate_tax", {
        seller_province: data.sellerProvince,
        buyer_province: data.sellerProvince,
        subtotal: price,
      });
      const up = (res.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const tp = (up ?? res.data ?? null) as TaxPreview | null;
      setTaxPreview(tp);
    } catch {
      /* soft fail */
    } finally {
      setLoadingTax(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Escrow toggle */}
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Require escrow</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Funds are held by Matex until delivery is confirmed
              {price >= 5000 && " — mandatory for orders ≥ $5,000 CAD"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (price >= 5000) return;
              onChange({ requireEscrow: !data.requireEscrow });
            }}
            className={clsx(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
              data.requireEscrow || price >= 5000 ? "bg-brand-600" : "bg-slate-200",
              price >= 5000 ? "cursor-not-allowed opacity-70" : ""
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow",
                data.requireEscrow || price >= 5000 ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>
      </div>

      {/* Payment methods */}
      <div>
        <FieldLabel>Accepted payment methods</FieldLabel>
        <div className="space-y-2 mt-1">
          {PAYMENT_METHOD_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={data.paymentMethods.includes(opt.value)}
                onChange={() => togglePayment(opt.value)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-200"
              />
              <span className="text-sm text-slate-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Down payment (for auctions or large orders) */}
      {(data.saleMode === "auction" || price >= 5000) && (
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <FieldLabel>Down payment %</FieldLabel>
            <span className="text-sm font-semibold text-slate-800">{data.downPaymentPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            value={data.downPaymentPct}
            onChange={(e) => onChange({ downPaymentPct: Number(e.target.value) })}
            className="w-full accent-brand-600 h-2 rounded cursor-pointer"
          />
          <FieldHint>
            {price > 0 && `Down payment: $${((price * data.downPaymentPct) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2 })} CAD`}
          </FieldHint>
        </div>
      )}

      {/* Seller province for tax */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel>Seller province (for tax)</FieldLabel>
          <select
            className={selectCls}
            value={data.sellerProvince}
            onChange={(e) => onChange({ sellerProvince: e.target.value })}
          >
            {PROVINCES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCalcTax}
            loading={loadingTax}
            disabled={!price}
            className="mb-0.5"
          >
            Preview tax
          </Button>
        </div>
      </div>

      {taxPreview && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-2">
          <p className="text-sm font-semibold text-slate-700">Tax breakdown (estimated)</p>
          {(taxPreview.gst_amount ?? taxPreview.gst ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">GST (5%)</span>
              <span className="text-slate-800 font-medium">${(Number(taxPreview.gst_amount ?? taxPreview.gst ?? 0)).toFixed(2)}</span>
            </div>
          )}
          {(taxPreview.hst_amount ?? taxPreview.hst ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">HST</span>
              <span className="text-slate-800 font-medium">${(Number(taxPreview.hst_amount ?? taxPreview.hst ?? 0)).toFixed(2)}</span>
            </div>
          )}
          {(taxPreview.pst_amount ?? taxPreview.pst ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">PST</span>
              <span className="text-slate-800 font-medium">${(Number(taxPreview.pst_amount ?? taxPreview.pst ?? 0)).toFixed(2)}</span>
            </div>
          )}
          {(taxPreview.qst_amount ?? taxPreview.qst ?? 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">QST (9.975%)</span>
              <span className="text-slate-800 font-medium">${(Number(taxPreview.qst_amount ?? taxPreview.qst ?? 0)).toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-slate-100 pt-2 flex justify-between text-sm font-semibold">
            <span className="text-slate-700">Total tax</span>
            <span className="text-slate-900">${(Number(taxPreview.total_tax ?? taxPreview.total ?? 0)).toFixed(2)}</span>
          </div>
          <FieldHint>Final tax calculated at checkout based on buyer province.</FieldHint>
        </div>
      )}

      {/* Commission summary */}
      {price > 0 && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-slate-600">
            Matex commission ({data.saleMode === "auction" ? "4.0%" : "3.5%"})
          </span>
          <span className="font-bold text-slate-800">
            ${commission.toLocaleString("en-CA", { minimumFractionDigits: 2 })} CAD
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Step 6: Review & Publish ─────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 shrink-0 w-36">{label}</span>
      <span className="text-sm text-slate-800 text-right">{value || <span className="text-slate-400 italic">Not set</span>}</span>
    </div>
  );
}

function ReviewSection({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: number;
  onEdit: (s: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <button
          type="button"
          onClick={() => onEdit(step)}
          className="text-xs text-brand-600 hover:underline font-medium"
        >
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}

function Step6({
  data,
  listingId,
  onEdit,
  onPublish,
  onSaveDraft,
  publishing,
  saving,
  publishError,
}: {
  data: FormData;
  listingId: string;
  onEdit: (step: number) => void;
  onPublish: () => Promise<void>;
  onSaveDraft: () => Promise<SaveDraftResult>;
  publishing: boolean;
  saving: boolean;
  publishError: string;
}) {
  const price =
    data.saleMode === "fixed"
      ? parseFloat(data.askingPrice) || 0
      : data.saleMode === "bidding"
      ? parseFloat(data.startingBid) || 0
      : parseFloat(data.reservePrice) || 0;

  return (
    <div className="space-y-4">
      <InfoBanner>
        Review your listing details before publishing. Once published, buyers can view and act on it immediately.
      </InfoBanner>

      <ReviewSection title="Material Information" step={1} onEdit={onEdit}>
        <ReviewRow label="Title" value={data.title} />
        <ReviewRow label="Category" value={data.category} />
        <ReviewRow label="Type" value={data.materialType} />
        <ReviewRow label="Grade" value={data.qualityGrade} />
        <ReviewRow label="Quantity" value={`${data.quantity} ${data.unit}`} />
        <ReviewRow label="Contamination" value={`${data.contaminationPct}%`} />
        <ReviewRow label="Moisture" value={`${data.moisturePct}%`} />
        {data.hasPermit && <ReviewRow label="Permit #" value={data.permitNumber} />}
      </ReviewSection>

      <ReviewSection title="Photos & Media" step={2} onEdit={onEdit}>
        <ReviewRow
          label="Files uploaded"
          value={
            data.uploadedUrls.length > 0
              ? `${data.uploadedUrls.length} file${data.uploadedUrls.length > 1 ? "s" : ""}`
              : "None"
          }
        />
      </ReviewSection>

      <ReviewSection title="Sale Mode" step={3} onEdit={onEdit}>
        <ReviewRow
          label="Mode"
          value={
            data.saleMode === "fixed"
              ? "Fixed Price"
              : data.saleMode === "bidding"
              ? "Open Bidding"
              : data.saleMode === "auction"
              ? "Live Auction"
              : "Not selected"
          }
        />
        {data.saleMode === "fixed" && (
          <>
            <ReviewRow label="Asking price" value={`$${data.askingPrice} CAD`} />
            {data.buyNowPrice && <ReviewRow label="Buy-now price" value={`$${data.buyNowPrice} CAD`} />}
            {data.listingExpiry && <ReviewRow label="Expires" value={data.listingExpiry} />}
          </>
        )}
        {data.saleMode === "bidding" && (
          <>
            <ReviewRow label="Starting bid" value={`$${data.startingBid} CAD`} />
            {data.reservePrice && <ReviewRow label="Reserve" value={`$${data.reservePrice} CAD`} />}
            {data.bidIncrement && <ReviewRow label="Increment" value={`$${data.bidIncrement} CAD`} />}
            {data.biddingCloses && <ReviewRow label="Closes" value={data.biddingCloses} />}
          </>
        )}
        {data.saleMode === "auction" && (
          <>
            {data.reservePrice && <ReviewRow label="Reserve" value={`$${data.reservePrice} CAD`} />}
            {data.auctionDate && <ReviewRow label="Auction date" value={data.auctionDate} />}
            <ReviewRow label="Deposit %" value={`${data.depositPct}%`} />
            {data.minLotSize && <ReviewRow label="Min lot size" value={data.minLotSize} />}
            <ReviewRow
              label="Auction terms file"
              value={
                data.auctionTermsUrls.length > 0
                  ? `${data.auctionTermsUrls.length} file${data.auctionTermsUrls.length > 1 ? "s" : ""}`
                  : "None"
              }
            />
          </>
        )}
        <ReviewRow
          label="Publish"
          value={data.publishMode === "immediate" ? "Immediately" : data.scheduledAt || "Scheduled"}
        />
        {price > 0 && (
          <ReviewRow
            label="Commission"
            value={`$${calcCommission(price, data.saleMode).toLocaleString("en-CA", {
              minimumFractionDigits: 2,
            })} CAD`}
          />
        )}
      </ReviewSection>

      <ReviewSection title="Inspection & Logistics" step={4} onEdit={onEdit}>
        <ReviewRow label="Inspection" value={data.inspectionRequired ? "Required" : "Not required"} />
        {data.inspectionRequired && (
          <>
            <ReviewRow label="Window" value={data.inspectionWindow} />
            <ReviewRow label="Available days" value={data.inspectionDays.join(", ") || "None"} />
            <ReviewRow
              label="Inspector"
              value={data.inspectorPreference === "matex" ? "Any Matex inspector" : "Third-party"}
            />
          </>
        )}
        <ReviewRow
          label="Pickup address"
          value={[data.street, data.city, data.province, data.postalCode].filter(Boolean).join(", ")}
        />
        <ReviewRow
          label="Hazmat class"
          value={HAZMAT_CLASSES.find((h) => h.value === data.hazmatClass)?.label ?? data.hazmatClass}
        />
      </ReviewSection>

      <ReviewSection title="Payment & Escrow" step={5} onEdit={onEdit}>
        <ReviewRow label="Escrow" value={data.requireEscrow ? "Required" : "Not required"} />
        <ReviewRow
          label="Payment methods"
          value={data.paymentMethods
            .map((m) => PAYMENT_METHOD_OPTIONS.find((o) => o.value === m)?.label ?? m)
            .join(", ")}
        />
        <ReviewRow label="Seller province" value={data.sellerProvince} />
      </ReviewSection>

      {publishError && <ErrorBanner message={publishError} />}

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button
          variant="secondary"
          onClick={onSaveDraft}
          loading={saving}
          className="sm:w-auto"
        >
          Save as draft
        </Button>
        <Button
          onClick={onPublish}
          loading={publishing}
          disabled={!data.title || !data.category || !data.saleMode}
          className="sm:flex-1"
          size="lg"
        >
          Publish listing
        </Button>
      </div>

      {(!data.title || !data.category || !data.saleMode) && (
        <p className="text-xs text-amber-600 text-center">
          Complete required fields in steps 1 and 3 before publishing.
        </p>
      )}
    </div>
  );
}

// ─── Success Modal ────────────────────────────────────────────────────────────

function SuccessModal({
  listingId,
  onClose,
  onCreateAnother,
}: {
  listingId: string;
  onClose: () => void;
  onCreateAnother: () => void;
}) {
  const router = useRouter();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Listing published!</h2>
        <p className="text-sm text-slate-500 mb-2">
          Your listing is now live on the Matex marketplace.
        </p>
        <p className="text-xs text-slate-400 font-mono bg-slate-50 rounded px-3 py-1.5 mb-6 border border-slate-200 inline-block">
          ID: {listingId}
        </p>
        <div className="flex flex-col gap-3">
          <Button
            onClick={() => router.push(`/listings/${listingId}`)}
            className="w-full"
          >
            View listing
          </Button>
          <Button
            variant="secondary"
            onClick={onCreateAnother}
            className="w-full"
          >
            Create another listing
          </Button>
          <button
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Go to My Listings
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main wizard page ─────────────────────────────────────────────────────────

export default function CreateListingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [listingId, setListingId] = useState("");
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
  const [urlHydrated, setUrlHydrated] = useState(false);

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [stepError, setStepError] = useState("");

  const patch = useCallback(
    (update: Partial<FormData>) => setFormData((prev) => ({ ...prev, ...update })),
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const step = parseInt(params.get("step") ?? "1", 10);
    const lid = params.get("listing_id")?.trim();
    if (step >= 1 && step <= 6) setCurrentStep(step);
    if (lid) setListingId(lid);
    setUrlHydrated(true);
  }, []);

  useEffect(() => {
    if (!urlHydrated) return;
    const q = new URLSearchParams();
    q.set("step", String(currentStep));
    if (listingId) q.set("listing_id", listingId);
    router.replace(`/listings/create?${q.toString()}`, { scroll: false });
  }, [currentStep, listingId, router, urlHydrated]);

  const handleSaveDraft = async (): Promise<SaveDraftResult> => {
    setSaving(true);
    setStepError("");
    try {
      const user = getUser();
      if (!user?.userId) {
        const msg = "You must be logged in to save a listing draft.";
        setStepError(msg);
        return { ok: false, message: msg };
      }
      if (listingId) {
        const imageUrls = [...new Set([...formData.uploadedUrls, ...formData.auctionTermsUrls])].filter(Boolean);
        const res = await callTool("listing.update_listing", {
          listing_id: listingId,
          title: formData.title,
          description: formData.description,
          category: formData.category,
          material_type: formData.materialType,
          quality_grade: formData.qualityGrade,
          contamination_pct: formData.contaminationPct,
          moisture_pct: formData.moisturePct,
          quantity: formData.quantity,
          unit: formData.unit,
          status: "draft",
          ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
        });
        if (!res.success) {
          const msg = res.error?.message ?? "Failed to save draft";
          setStepError(msg);
          return { ok: false, message: msg };
        }
        return { ok: true, listingId };
      }
      const res = await callTool("listing.create_listing", {
        seller_id: user.userId,
        title: formData.title,
        description: formData.description ?? "",
        category: formData.category,
        material_type: formData.materialType,
        quality_grade: formData.qualityGrade,
        contamination_pct: formData.contaminationPct,
        moisture_pct: formData.moisturePct,
        quantity: formData.quantity,
        unit: formData.unit,
        has_permit: formData.hasPermit,
        permit_number: formData.hasPermit ? formData.permitNumber : undefined,
        certifications: formData.certifications,
        status: "draft",
      });
      if (!res.success) {
        const msg = res.error?.message ?? "Failed to save draft";
        setStepError(msg);
        return { ok: false, message: msg };
      }
      const id = extractId(res, "listing_id");
      if (!id) {
        const msg =
          "The server saved the draft but did not return a listing id. Check the gateway/MCP response shape or try again.";
        setStepError(msg);
        return { ok: false, message: msg };
      }
      setListingId(id);
      return { ok: true, listingId: id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save draft";
      setStepError(msg);
      return { ok: false, message: msg };
    } finally {
      setSaving(false);
    }
  };

  const canProceed = (): boolean => {
    if (currentStep === 1) return !!formData.title && !!formData.category;
    if (currentStep === 3) return !!formData.saleMode;
    return true;
  };

  const handleNext = async () => {
    setStepError("");
    if (!canProceed()) {
      setStepError("Please fill in required fields before continuing.");
      return;
    }
    if (currentStep === 1 && !listingId) {
      const draft = await handleSaveDraft();
      if (!draft.ok) return;
    }
    setCurrentStep((s) => Math.min(s + 1, 6));
  };

  const handleBack = () => {
    setStepError("");
    setCurrentStep((s) => Math.max(s - 1, 1));
  };

  const handlePublish = async (): Promise<void> => {
    setPublishing(true);
    setPublishError("");
    try {
      let publishListingId = listingId;
      if (!publishListingId) {
        const draft = await handleSaveDraft();
        if (!draft.ok) {
          setPublishError((draft as { ok: false; message: string }).message);
          return;
        }
        publishListingId = draft.listingId;
      }
      if (!publishListingId) {
        setPublishError("Could not save listing draft. Try again.");
        return;
      }
      if (publishListingId !== listingId) {
        setListingId(publishListingId);
      }
      await callTool("listing.publish_listing", {
        listing_id: publishListingId,
        sale_mode: formData.saleMode,
        asking_price: formData.saleMode === "fixed" ? parseFloat(formData.askingPrice) : undefined,
        buy_now_price: formData.buyNowPrice ? parseFloat(formData.buyNowPrice) : undefined,
        starting_bid: formData.saleMode === "bidding" ? parseFloat(formData.startingBid) : undefined,
        reserve_price: formData.reservePrice ? parseFloat(formData.reservePrice) : undefined,
        bid_increment: formData.bidIncrement ? parseFloat(formData.bidIncrement) : undefined,
        bidding_closes_at: formData.biddingCloses || undefined,
        auction_date: formData.auctionDate || undefined,
        deposit_pct: formData.saleMode === "auction" ? formData.depositPct : undefined,
        require_escrow: formData.requireEscrow,
        payment_methods: formData.paymentMethods,
        seller_province: formData.sellerProvince,
        pickup_address: {
          street: formData.street,
          city: formData.city,
          province: formData.province,
          postal_code: formData.postalCode,
        },
        inspection_required: formData.inspectionRequired,
        hazmat_class: formData.hazmatClass,
        publish_mode: formData.publishMode,
        scheduled_at: formData.scheduledAt || undefined,
      });
      track("listing_created", { sale_mode: formData.saleMode, listing_id: publishListingId });
      setShowSuccess(true);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Failed to publish listing");
    } finally {
      setPublishing(false);
    }
  };

  const handleCreateAnother = () => {
    setFormData(DEFAULT_FORM);
    setListingId("");
    setCurrentStep(1);
    setShowSuccess(false);
    setPublishError("");
    setStepError("");
  };

  return (
    <>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <button
            type="button"
            onClick={() => router.push("/listings")}
            className="mb-3 flex items-center gap-1.5 text-sm text-steel-500 transition-colors hover:text-steel-800"
          >
            <ChevronLeft className="h-4 w-4" />
            My Listings
          </button>
          <AppPageHeader
            title="Create listing"
            description="List your recycled materials on the Matex marketplace"
            className="!mb-0 sm:!mb-0"
          />
        </div>

        <ListingCreateOverview />

        {/* Step progress */}
        <StepBar current={currentStep} />

        {/* Step card */}
        <div className="marketplace-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-5">
            {STEPS[currentStep - 1].label === "Material" && "Material Information"}
            {STEPS[currentStep - 1].label === "Photos" && "Photos & Videos"}
            {STEPS[currentStep - 1].label === "Sale Mode" && "Choose Sale Mode"}
            {STEPS[currentStep - 1].label === "Logistics" && "Inspection & Logistics"}
            {STEPS[currentStep - 1].label === "Payment" && "Payment & Escrow"}
            {STEPS[currentStep - 1].label === "Review" && "Review & Publish"}
          </h2>

          {currentStep === 1 && (
            <Step1
              data={formData}
              onChange={patch}
              onSaveDraft={handleSaveDraft}
              saving={saving}
              listingId={listingId}
            />
          )}
          {currentStep === 2 && <Step2 data={formData} onChange={patch} listingId={listingId} />}
          {currentStep === 3 && <Step3 data={formData} onChange={patch} listingId={listingId} />}
          {currentStep === 4 && (
            <Step4 data={formData} onChange={patch} listingId={listingId} />
          )}
          {currentStep === 5 && <Step5 data={formData} onChange={patch} />}
          {currentStep === 6 && (
            <Step6
              data={formData}
              listingId={listingId}
              onEdit={(s) => setCurrentStep(s)}
              onPublish={handlePublish}
              onSaveDraft={handleSaveDraft}
              publishing={publishing}
              saving={saving}
              publishError={publishError}
            />
          )}

          {stepError && (
            <div className="mt-4">
              <ErrorBanner message={stepError} />
            </div>
          )}

          {/* Navigation */}
          {currentStep < 6 && (
            <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={currentStep === 1}
                className="gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                {saving && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving…
                  </span>
                )}
                <Button onClick={handleNext} className="gap-1">
                  {currentStep === 5 ? "Review" : "Next"}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Step indicator (text) */}
        <p className="text-center text-xs text-slate-400 mt-4">
          Step {currentStep} of {STEPS.length}
        </p>
      </div>

      {showSuccess && (
        <SuccessModal
          listingId={listingId}
          onClose={() => router.push("/listings")}
          onCreateAnother={handleCreateAnother}
        />
      )}
    </>
  );
}
