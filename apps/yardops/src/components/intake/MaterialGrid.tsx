"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { callTool } from "@/lib/api";
import { Camera, Plus, Trash2, ShieldAlert, ChevronRight } from "lucide-react";

type Material = {
  material_id: string;
  name: string;
  category: string;
  is_cat_converter: boolean;
  is_prohibited: boolean;
  unit_price_per_kg: number;
};

type Line = {
  line_id: string;
  material_id: string;
  material_name: string;
  quantity_kg: number;
  unit_price_per_kg: number;
};

type Props = {
  tenantId: string;
  actorId: string;
  ticketId: string;
  onLinesUpdated: (lines: Line[], subtotal: number) => void;
  onNext: () => void;
};

export function MaterialGrid({ tenantId, actorId, ticketId, onLinesUpdated, onNext }: Props) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [loadingMats, setLoadingMats] = useState(true);
  const [selected, setSelected] = useState<Material | null>(null);
  const [qty, setQty] = useState("");
  const [adding, setAdding] = useState(false);
  const [photoAdding, setPhotoAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const activeLineRef = useRef<string | null>(null);

  useEffect(() => {
    callTool<{ materials: Material[] }>("yardops.get_active_prices", { tenant_id: tenantId })
      .then((res) => {
        if (res.success && res.data) setMaterials(res.data.materials ?? []);
      })
      .finally(() => setLoadingMats(false));
  }, [tenantId]);

  const subtotal = lines.reduce((acc, l) => acc + l.quantity_kg * l.unit_price_per_kg, 0);

  const notifyParent = useCallback((newLines: Line[]) => {
    const sub = newLines.reduce((acc, l) => acc + l.quantity_kg * l.unit_price_per_kg, 0);
    onLinesUpdated(newLines, sub);
  }, [onLinesUpdated]);

  async function addLine() {
    if (!selected) return;
    const qtyNum = parseFloat(qty);
    if (!qtyNum || qtyNum <= 0) { setError("Enter a positive quantity."); return; }
    if (selected.is_prohibited) { setError("This material is on the prohibited items list."); return; }
    setError("");
    setAdding(true);
    try {
      const res = await callTool<{ line_id: string }>("yardops.add_ticket_line", {
        tenant_id: tenantId,
        actor_id: actorId,
        ticket_id: ticketId,
        material_id: selected.material_id,
        quantity_kg: qtyNum,
        unit_price_per_kg: selected.unit_price_per_kg,
      });
      if (!res.success || !res.data?.line_id) {
        setError(res.error?.message ?? "Failed to add line");
        return;
      }
      const newLine: Line = {
        line_id: res.data.line_id,
        material_id: selected.material_id,
        material_name: selected.name,
        quantity_kg: qtyNum,
        unit_price_per_kg: selected.unit_price_per_kg,
      };
      const updated = [...lines, newLine];
      setLines(updated);
      notifyParent(updated);
      setSelected(null);
      setQty("");
    } finally {
      setAdding(false);
    }
  }

  async function removeLine(lineId: string) {
    const updated = lines.filter((l) => l.line_id !== lineId);
    setLines(updated);
    notifyParent(updated);
  }

  async function attachPhoto(file: File, lineId: string) {
    setPhotoAdding(lineId);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((res, rej) => {
        reader.onload = () => {
          const r = reader.result as string;
          res(r.split(",")[1] ?? r);
        };
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      await callTool("yardops.attach_line_photo", {
        tenant_id: tenantId,
        actor_id: actorId,
        ticket_id: ticketId,
        line_id: lineId,
        photo_base64: base64,
        media_type: file.type,
      });
    } finally {
      setPhotoAdding(null);
      activeLineRef.current = null;
    }
  }

  const cats = materials.filter((m) => m.is_cat_converter);
  const hasCat = lines.some((l) => cats.some((c) => c.material_id === l.material_id));

  const grouped = materials.reduce<Record<string, Material[]>>((acc, m) => {
    if (m.is_prohibited) return acc;
    (acc[m.category] = acc[m.category] ?? []).push(m);
    return acc;
  }, {});

  if (loadingMats) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-night-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Material picker */}
      <div>
        <p className="mb-3 text-sm font-semibold text-night-200">Select Material</p>
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, mats]) => (
            <div key={cat}>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-night-500">{cat.replace(/_/g, " ")}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {mats.map((m) => (
                  <button
                    key={m.material_id}
                    onClick={() => setSelected(m)}
                    className={[
                      "rounded-xl border p-3 text-left transition-all",
                      selected?.material_id === m.material_id
                        ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500"
                        : "border-night-700 bg-night-800 hover:border-night-600",
                      m.is_cat_converter ? "border-l-2 border-l-warning-500" : "",
                    ].join(" ")}
                  >
                    <p className="text-sm font-semibold text-night-100 leading-tight">{m.name}</p>
                    <p className="mt-1 text-xs tabular-nums text-night-400">${m.unit_price_per_kg.toFixed(3)}/kg</p>
                    {m.is_cat_converter && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-warning-400">
                        <ShieldAlert size={10} />
                        Cat converter
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quantity input */}
      {selected && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-4">
          <p className="mb-3 text-sm font-semibold text-night-200">
            {selected.name}
            <span className="ml-2 text-xs text-night-400 font-normal">${selected.unit_price_per_kg.toFixed(3)}/kg</span>
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className="yard-input pr-10 tabular-nums"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLine()}
                autoFocus
                aria-label="Quantity in kilograms"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-night-500">kg</span>
            </div>
            <button onClick={addLine} disabled={adding} className="yard-btn-primary px-4 flex items-center gap-2">
              <Plus size={16} />
              Add
            </button>
          </div>
          {qty && parseFloat(qty) > 0 && (
            <p className="mt-2 text-xs text-night-400 tabular-nums">
              Line total: ${(parseFloat(qty) * selected.unit_price_per_kg).toFixed(2)} CAD
            </p>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}

      {/* Lines list */}
      {lines.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-night-200">Ticket Lines</p>
          <div className="space-y-2">
            {lines.map((l) => (
              <div
                key={l.line_id}
                className="flex items-center gap-3 rounded-xl border border-night-700 bg-night-800 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-night-100 truncate">{l.material_name}</p>
                  <p className="text-xs tabular-nums text-night-400">
                    {l.quantity_kg.toFixed(2)} kg × ${l.unit_price_per_kg.toFixed(3)} = <span className="text-night-200 font-medium">${(l.quantity_kg * l.unit_price_per_kg).toFixed(2)}</span>
                  </p>
                </div>
                <button
                  onClick={() => { activeLineRef.current = l.line_id; fileRef.current?.click(); }}
                  disabled={photoAdding === l.line_id}
                  className="rounded-lg border border-night-700 p-1.5 text-night-400 hover:text-night-100 hover:border-night-500 transition-colors"
                  aria-label={`Attach photo to ${l.material_name}`}
                  title="Attach photo"
                >
                  {photoAdding === l.line_id
                    ? <span className="block h-4 w-4 rounded-full border-2 border-white/30 border-t-white spin-brand" />
                    : <Camera size={14} />
                  }
                </button>
                <button
                  onClick={() => removeLine(l.line_id)}
                  className="rounded-lg border border-night-700 p-1.5 text-danger-400 hover:text-danger-300 hover:border-danger-500/40 transition-colors"
                  aria-label={`Remove ${l.material_name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Subtotal */}
          <div className="mt-4 flex items-center justify-between rounded-xl border border-night-700 bg-night-800 px-4 py-3">
            <p className="text-sm font-semibold text-night-200">Subtotal (excl. HST)</p>
            <p className="text-lg font-black tabular-nums text-night-100">${subtotal.toFixed(2)} CAD</p>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && activeLineRef.current) attachPhoto(f, activeLineRef.current);
          e.target.value = "";
        }}
      />

      {hasCat && (
        <div className="flex items-start gap-3 rounded-xl border border-warning-500/30 bg-warning-500/10 p-4">
          <ShieldAlert size={18} className="flex-shrink-0 text-warning-400 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-warning-300">Catalytic Converter Detected</p>
            <p className="mt-1 text-xs text-night-300">
              Ontario requires additional documentation. You&apos;ll record VIN source and proof of ownership on the next screen.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={lines.length === 0}
        className="yard-btn-primary w-full flex items-center justify-center gap-2"
      >
        Continue to Payout
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
