import { Receipt } from "lucide-react";

const HST_RATE = 0.13;

type Line = {
  line_id: string;
  material_name: string;
  quantity_kg: number;
  unit_price_per_kg: number;
};

type Props = {
  ticketNumber: string;
  sellerName: string;
  netWeight: string;
  lines: Line[];
  subtotal: number;
  payoutMethod: string;
};

export function TicketSummary({ ticketNumber, sellerName, netWeight, lines, subtotal, payoutMethod }: Props) {
  const hst = subtotal * HST_RATE;
  const total = subtotal + hst;

  return (
    <div className="rounded-xl border border-night-700 bg-night-800 overflow-hidden">
      {/* Header */}
      <div className="border-b border-night-700 bg-night-900 px-5 py-4 flex items-center gap-3">
        <Receipt size={18} className="text-brand-400 flex-shrink-0" />
        <div>
          <p className="font-bold text-night-100">Ticket {ticketNumber}</p>
          <p className="text-xs text-night-400">{sellerName}</p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-night-500 mb-0.5">Net Weight</p>
            <p className="font-semibold text-night-100 tabular-nums">{netWeight}</p>
          </div>
          <div>
            <p className="text-xs text-night-500 mb-0.5">Payout Method</p>
            <p className="font-semibold text-night-100 capitalize">{payoutMethod.replace("_", " ")}</p>
          </div>
          <div>
            <p className="text-xs text-night-500 mb-0.5">Date</p>
            <p className="font-semibold text-night-100">{new Date().toLocaleDateString("en-CA")}</p>
          </div>
          <div>
            <p className="text-xs text-night-500 mb-0.5">Time</p>
            <p className="font-semibold text-night-100">{new Date().toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>

        {/* Line items */}
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-night-500">Materials</p>
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.line_id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="text-night-200 truncate">{l.material_name}</p>
                  <p className="text-xs text-night-500 tabular-nums">{l.quantity_kg.toFixed(2)} kg × ${l.unit_price_per_kg.toFixed(3)}</p>
                </div>
                <p className="ml-4 font-semibold tabular-nums text-night-100 flex-shrink-0">
                  ${(l.quantity_kg * l.unit_price_per_kg).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="border-t border-night-700 pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-night-400">Subtotal</span>
            <span className="tabular-nums text-night-200">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-night-400">HST 13%</span>
            <span className="tabular-nums text-night-200">${hst.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span className="text-night-100">Total Payout</span>
            <span className="tabular-nums text-night-100 text-lg">${total.toFixed(2)} CAD</span>
          </div>
        </div>

        <p className="text-[10px] text-night-600 text-center leading-relaxed">
          This is a legally required record under Ontario Municipal Act and the Scrap Metal Dealers Act.
          Retain for 7 years per CRA requirements.
        </p>
      </div>
    </div>
  );
}
