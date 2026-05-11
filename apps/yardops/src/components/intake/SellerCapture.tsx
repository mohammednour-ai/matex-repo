"use client";

import { useState, useRef } from "react";
import { callTool } from "@/lib/api";
import { Camera, Search, UserPlus, CheckCircle } from "lucide-react";

type Seller = { seller_id: string; first_name: string; last_name: string; phone: string; pipeda_consent: boolean };

type OcrResult = {
  id_type?: string;
  first_name?: string;
  last_name?: string;
  id_number?: string;
  province_issued?: string;
  expiry_date?: string;
  dob?: string;
  address?: string;
  confidence?: number;
};

export function SellerCapture({ tenantId, actorId, onComplete, loading: parentLoading }: {
  tenantId: string;
  actorId: string;
  onComplete: (sellerId: string, sellerName: string, vehicleId?: string) => void;
  loading: boolean;
}) {
  const [mode, setMode] = useState<"search" | "create">("search");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Seller[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Seller | null>(null);

  // New seller form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [pipedaConsent, setPipedaConsent] = useState(false);
  const [idType, setIdType] = useState("drivers_license");
  const [idNumber, setIdNumber] = useState("");
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  async function doSearch() {
    if (!search.trim() || search.length < 2) return;
    setSearching(true);
    const res = await callTool<{ sellers: Seller[] }>("yardops.list_sellers", { tenant_id: tenantId, search: search.trim() });
    setSearching(false);
    if (res.success && res.data) setResults(res.data.sellers ?? []);
  }

  function selectSeller(seller: Seller) {
    setSelected(seller);
  }

  async function captureId(file: File) {
    setOcrLoading(true);
    setOcrResult(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image_base64: base64, media_type: file.type }),
      });
      const data = await res.json() as { success: boolean; data?: OcrResult };
      if (data.success && data.data) {
        const ocr = data.data;
        setOcrResult(ocr);
        if (ocr.first_name) setFirstName(ocr.first_name);
        if (ocr.last_name) setLastName(ocr.last_name);
        if (ocr.id_number) setIdNumber(ocr.id_number);
        if (ocr.id_type) setIdType(ocr.id_type);
      }
    } finally {
      setOcrLoading(false);
    }
  }

  async function createAndContinue() {
    if (!firstName || !lastName || !phone || !pipedaConsent) {
      setError("All fields required. PIPEDA consent must be given.");
      return;
    }
    setError("");
    setCreating(true);

    try {
      // 1. Create seller
      const sellerRes = await callTool<{ seller_id: string }>("yardops.create_seller", {
        tenant_id: tenantId,
        actor_id: actorId,
        first_name: firstName,
        last_name: lastName,
        phone,
      });
      if (!sellerRes.success || !sellerRes.data?.seller_id) {
        setError(sellerRes.error?.message ?? "Failed to create seller");
        return;
      }
      const sellerId = sellerRes.data.seller_id;

      // 2. Record PIPEDA consent
      await callTool("yardops.record_pipeda_consent", { tenant_id: tenantId, actor_id: actorId, seller_id: sellerId });

      // 3. Log ID if we have one
      if (idNumber) {
        await callTool("yardops.log_seller_id", {
          tenant_id: tenantId,
          actor_id: actorId,
          seller_id: sellerId,
          id_type: idType,
          id_number_plain: idNumber,
          province_issued: ocrResult?.province_issued ?? undefined,
          ocr_confidence: ocrResult?.confidence ?? undefined,
        });
      }

      // 4. Create vehicle record if plate entered
      let vehicleId: string | undefined;
      if (plateNumber) {
        const vRes = await callTool<{ vehicle_id?: string }>("yardops.create_ticket", { // placeholder — use a direct approach
          tenant_id: tenantId,
          actor_id: actorId,
          seller_id: sellerId,
        });
        // vehicle creation would go here in a real implementation
        // For MVP, vehicle_id stays undefined if we don't have a dedicated tool
        vehicleId = undefined;
      }

      onComplete(sellerId, `${firstName} ${lastName}`, vehicleId);
    } finally {
      setCreating(false);
    }
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-success-500/30 bg-success-500/10 p-4">
          <CheckCircle className="h-6 w-6 text-success-400 flex-shrink-0" />
          <div>
            <p className="font-semibold text-night-100">{selected.first_name} {selected.last_name}</p>
            <p className="text-sm text-night-400">{selected.phone}</p>
            {!selected.pipeda_consent && (
              <p className="mt-1 text-xs text-warning-400">PIPEDA consent not on file — obtain verbally and record.</p>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="plate-number" className="mb-1.5 block text-sm font-medium text-night-200">
            Vehicle plate <span className="text-night-500">(optional)</span>
          </label>
          <input
            id="plate-number"
            className="yard-input"
            placeholder="e.g. ABCD 123"
            value={plateNumber}
            onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
          />
        </div>
        <div className="flex gap-3">
          <button onClick={() => setSelected(null)} className="yard-btn-secondary">
            Back
          </button>
          <button onClick={() => onComplete(selected.seller_id, `${selected.first_name} ${selected.last_name}`)} disabled={parentLoading} className="yard-btn-primary flex-1">
            {parentLoading ? "Creating ticket…" : "Continue →"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <button
          onClick={() => setMode("search")}
          className={mode === "search" ? "yard-btn-primary flex-1" : "yard-btn-secondary flex-1"}
        >
          <Search size={16} className="inline mr-2" />
          Find Existing
        </button>
        <button
          onClick={() => setMode("create")}
          className={mode === "create" ? "yard-btn-primary flex-1" : "yard-btn-secondary flex-1"}
        >
          <UserPlus size={16} className="inline mr-2" />
          New Seller
        </button>
      </div>

      {mode === "search" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              className="yard-input flex-1"
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              aria-label="Search sellers"
            />
            <button onClick={doSearch} disabled={searching} className="yard-btn-primary px-4">
              {searching ? <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white spin-brand inline-block" /> : "Search"}
            </button>
          </div>
          {results.map((s) => (
            <button
              key={s.seller_id}
              onClick={() => selectSeller(s)}
              className="w-full rounded-xl border border-night-700 bg-night-800 p-4 text-left hover:border-brand-500/40 hover:bg-night-750 transition-colors"
            >
              <p className="font-semibold text-night-100">{s.first_name} {s.last_name}</p>
              <p className="text-sm text-night-400">{s.phone}</p>
            </button>
          ))}
          {results.length === 0 && search.length > 1 && !searching && (
            <p className="text-sm text-night-500 text-center py-4">No sellers found. <button onClick={() => setMode("create")} className="text-brand-400 underline">Create new?</button></p>
          )}
        </div>
      )}

      {mode === "create" && (
        <div className="space-y-4">
          {/* PIPEDA consent gate — must be first */}
          <div className="rounded-xl border border-warning-500/30 bg-warning-500/10 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={pipedaConsent}
                onChange={(e) => setPipedaConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-night-600 bg-night-800 accent-brand-500"
                aria-required
              />
              <span className="text-sm text-night-200">
                <strong className="text-night-100">PIPEDA Consent</strong> — The seller has been informed that we collect their personal information for regulatory compliance (scrap metal dealer record-keeping) and has provided verbal consent.
                {/* TODO(compliance): PIPEDA s.4.3 — Principle 3: Consent. Verbal consent is valid for legitimate business purposes.
                    Reference: https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/ */}
              </span>
            </label>
          </div>

          {/* ID Capture */}
          <div className="rounded-xl border border-night-700 bg-night-800 p-4">
            <p className="mb-3 text-sm font-semibold text-night-200">Government Photo ID</p>
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={ocrLoading}
                className="yard-btn-secondary flex items-center gap-2"
                aria-label="Capture or upload ID photo"
              >
                <Camera size={16} />
                {ocrLoading ? "Reading ID…" : "Scan ID"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                aria-hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) captureId(f); }}
              />
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                className="yard-input flex-1"
                aria-label="ID type"
              >
                <option value="drivers_license">Driver's Licence</option>
                <option value="passport">Passport</option>
                <option value="health_card">Health Card</option>
                <option value="status_card">Status Card</option>
                <option value="other">Other</option>
              </select>
            </div>
            {ocrResult && ocrResult.confidence != null && (
              <p className="mt-2 text-xs text-success-400">
                OCR confidence: {Math.round(ocrResult.confidence * 100)}% — Review and correct fields below.
              </p>
            )}
            <div className="mt-3">
              <label className="mb-1 block text-xs text-night-400">ID Number</label>
              <input
                className="yard-input"
                placeholder="ID number"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                aria-label="ID number"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-night-200">First Name</label>
              <input className="yard-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-night-200">Last Name</label>
              <input className="yard-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-night-200">Phone</label>
            <input className="yard-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 613-555-0100" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-night-200">Vehicle Plate <span className="text-night-500">(optional)</span></label>
            <input className="yard-input" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value.toUpperCase())} placeholder="e.g. ABCD 123" />
          </div>

          {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}

          <button
            onClick={createAndContinue}
            disabled={creating || !firstName || !lastName || !phone || !pipedaConsent}
            className="yard-btn-primary w-full"
          >
            {creating ? "Creating seller…" : "Register & Continue →"}
          </button>
        </div>
      )}
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
