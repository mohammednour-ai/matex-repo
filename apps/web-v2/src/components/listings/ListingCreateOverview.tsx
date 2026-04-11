"use client";

import { Bot, ShieldCheck, ClipboardCheck, Sparkles } from "lucide-react";
import { dispatchCopilotPrefill } from "@/lib/copilot-events";

const PILLARS = [
  {
    icon: Bot,
    title: "MCP-backed listing tools",
    body: "Create, update, and publish through the same tool calls the platform uses in production.",
  },
  {
    icon: ShieldCheck,
    title: "Escrow-backed settlement",
    body: "Buyer funds are held until delivery and inspection milestones you set on this listing.",
  },
  {
    icon: ClipboardCheck,
    title: "Inspections & compliance",
    body: "Optional inspections, hazmat flags, and permits align with Canadian B2B trade rules.",
  },
] as const;

const COPILOT_CHIPS: { label: string; message: string }[] = [
  { label: "Market prices — copper", message: "market prices for copper" },
  { label: "My listings", message: "my listings" },
  { label: "Tax quote ON→ON", message: "calculate tax for $5000 ON ON" },
  { label: "Dashboard stats", message: "dashboard stats" },
];

export function ListingCreateOverview() {
  return (
    <section
      data-testid="listing-create-overview"
      className="relative overflow-hidden rounded-2xl border border-steel-200/80 bg-gradient-to-br from-steel-950/5 via-white to-surface-50 shadow-card"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        aria-hidden
      >
        <div className="metal-texture absolute inset-0" />
      </div>
      <div className="relative space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">
              Seller workspace · MCP-connected
            </p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-steel-900 sm:text-xl">
              Industrial materials exchange
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm font-medium text-steel-600">
              Structured listings, live auctions, and escrow-backed settlement—wired through Matex
              Copilot to the same MCP tools your ops stack uses.
            </p>
          </div>
        </div>

        <ul className="grid gap-3 sm:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="rounded-xl border border-steel-200/70 bg-white/80 p-3.5 backdrop-blur-sm"
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                <span className="text-xs font-bold text-steel-900">{title}</span>
              </div>
              <p className="text-xs leading-snug text-steel-600">{body}</p>
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-brand-200/60 bg-brand-50/50 px-3 py-3 sm:px-4">
          <p className="text-xs font-semibold text-brand-900">
            Matex Copilot <span className="font-normal text-brand-800">(bottom-right)</span>
          </p>
          <p className="mt-1 text-xs text-brand-800/90">
            Run marketplace tools in natural language—pricing, tax, listings, and more. Tap a prompt
            to send it to Copilot.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {COPILOT_CHIPS.map(({ label, message }) => (
              <button
                key={label}
                type="button"
                onClick={() =>
                  dispatchCopilotPrefill({ message, open: true })
                }
                className="rounded-full border border-brand-300/80 bg-white px-3 py-1 text-xs font-semibold text-brand-800 shadow-sm transition-colors hover:bg-brand-100/80"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
