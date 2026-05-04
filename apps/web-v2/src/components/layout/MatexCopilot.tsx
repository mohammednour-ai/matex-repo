"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Cpu, Radio, Sparkles, Wrench, X } from "lucide-react";
import {
  MATEX_COPILOT_PREFILL,
  type MatexCopilotPrefillDetail,
} from "@/lib/copilot-events";
import { CopilotControlMark } from "@/components/layout/CopilotControlMark";

type ToolCallPayload = {
  tool: string;
  args?: unknown;
  result?: unknown;
} | null;

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  toolCall?: ToolCallPayload;
  toolStatus?: "ok" | "error";
};

function toolResultOk(result: unknown): boolean {
  if (result === null || result === undefined) return true;
  if (typeof result !== "object") return true;
  const r = result as Record<string, unknown>;
  if (r.success === false) return false;
  if (typeof r.error === "object" && r.error !== null) return false;
  return true;
}

function buildCopilotContext(
  pathname: string,
  searchParams: URLSearchParams,
): Record<string, unknown> {
  const page = pathname.startsWith("/listings/create")
    ? "listing-create"
    : pathname.replace(/^\//, "").split("/")[0] || "app";
  const stepRaw = searchParams.get("step");
  const step = stepRaw ? parseInt(stepRaw, 10) : NaN;
  const listingId = searchParams.get("listing_id")?.trim() || null;
  return {
    page,
    path: pathname,
    step: Number.isFinite(step) && step >= 1 && step <= 99 ? step : null,
    listing_id: listingId,
  };
}

/** Decorative scope lines for empty Copilot state — evokes control-room readouts. */
function CopilotScopeGraphic() {
  return (
    <div className="relative mx-auto mt-2 h-24 w-full max-w-[13rem]" aria-hidden>
      <div className="absolute inset-2 rounded-lg border border-slate-600/50 bg-slate-950/40" />
      <div className="absolute inset-5 rounded border border-orange-500/25 bg-gradient-to-b from-orange-500/10 to-transparent" />
      <div className="absolute bottom-3 left-4 right-4 flex gap-1">
        <span className="h-1 flex-1 rounded-full bg-orange-400/60" />
        <span className="h-1 flex-1 rounded-full bg-slate-600/80" />
        <span className="h-1 flex-1 rounded-full bg-emerald-500/50" />
      </div>
      <div className="absolute left-4 top-5 h-8 w-px bg-orange-500/30" />
      <div className="absolute right-6 top-6 h-6 w-px bg-slate-500/40" />
    </div>
  );
}

function MatexCopilotInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    function onPrefill(e: Event) {
      const ce = e as CustomEvent<MatexCopilotPrefillDetail>;
      const d = ce.detail;
      if (!d?.message) return;
      setInput(d.message);
      if (d.open !== false) setOpen(true);
    }
    window.addEventListener(MATEX_COPILOT_PREFILL, onPrefill);
    return () => window.removeEventListener(MATEX_COPILOT_PREFILL, onPrefill);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sendText = useCallback(
    async (raw: string) => {
      const msg = raw.trim();
      if (!msg || loading) return;
      setInput("");
      setMessages((prev) => [...prev, { role: "user", text: msg }]);
      setLoading(true);

      try {
        const token = localStorage.getItem("matex_token") ?? undefined;
        const context = buildCopilotContext(pathname, searchParams);
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: msg, token, context }),
        });
        const data = (await res.json()) as {
          content: string;
          tool_call?: ToolCallPayload;
        };
        const tc = data.tool_call ?? null;
        const toolStatus =
          tc?.tool != null ? (toolResultOk(tc.result) ? "ok" : "error") : undefined;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: data.content ?? "",
            toolCall: tc,
            toolStatus,
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "Something went wrong. Please try again.",
            toolStatus: "error",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, pathname, searchParams],
  );

  function handleSend() {
    void sendText(input);
  }

  return (
    <>
      <div className="group fixed bottom-6 right-6 z-50">
        {!open && (
          <span className="pointer-events-none absolute -top-9 right-0 whitespace-nowrap rounded-lg border border-slate-700/50 bg-slate-950/[0.95] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 opacity-0 shadow-lg ring-1 ring-orange-500/20 transition-opacity group-hover:opacity-100">
            Matex Copilot · ⌘K
          </span>
        )}
        <div className="relative">
          <div
            className="pointer-events-none absolute -inset-1 rounded-[1.05rem] bg-gradient-to-br from-orange-500/45 via-transparent to-orange-400/15 opacity-90 blur-[1.5px]"
            aria-hidden
          />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-600/70 bg-gradient-to-br from-slate-900 to-slate-950 text-white shadow-[0_14px_40px_-14px_rgba(249,115,22,0.65)] ring-1 ring-orange-500/35 transition-all hover:border-orange-400/50 hover:from-slate-800 hover:to-slate-900 hover:shadow-[0_18px_44px_-14px_rgba(249,115,22,0.75)] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
            aria-label="Open Matex Copilot (⌘K)"
          >
            {open ? (
              <X size={22} className="text-orange-200" strokeWidth={2.25} />
            ) : (
              <CopilotControlMark className="h-9 w-9 drop-shadow-[0_0_8px_rgba(249,115,22,0.35)]" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex w-[min(22rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-slate-600/55 bg-slate-950/[0.97] shadow-[0_28px_80px_-24px_rgba(0,0,0,0.75)] ring-1 ring-orange-500/15 backdrop-blur-xl sm:w-[26rem]"
          style={{ maxHeight: "min(62vh, 36rem)" }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden>
            <div className="metal-texture absolute inset-0" />
          </div>
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            aria-hidden
            style={{
              backgroundImage: `linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px),
                linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)`,
              backgroundSize: "20px 20px",
            }}
          />

          <header className="relative border-b border-slate-700/60 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 px-4 py-3">
            <div className="flex items-start gap-3">
              <CopilotControlMark className="h-10 w-10 shrink-0 drop-shadow-md" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-400/95">Matex</p>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-black tracking-tight text-white">Copilot</h2>
                  <span className="rounded border border-orange-500/35 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-orange-200">
                    MCP
                  </span>
                </div>
                <p className="mt-1 text-[10px] font-medium leading-snug text-slate-400">
                  Industrial workspace assistant — routes through your live tool gateway.
                </p>
              </div>
              <div className="flex shrink-0 gap-1 text-slate-500" aria-hidden>
                <Cpu className="h-3.5 w-3.5" />
                <Radio className="h-3.5 w-3.5" />
                <Wrench className="h-3.5 w-3.5" />
                <Sparkles className="h-3.5 w-3.5 text-orange-400/80" />
              </div>
            </div>
          </header>

          <div className="relative flex-1 space-y-3 overflow-y-auto bg-slate-950/40 p-4 text-sm">
            {messages.length === 0 && (
              <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 px-3 py-4 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-300/90">
                  Control channel ready
                </p>
                <CopilotScopeGraphic />
                <p className="mt-3 text-xs leading-relaxed text-slate-400">
                  Describe an operation in plain language — Copilot maps it to the same MCP tools the platform uses
                  (listings, search, escrow, analytics, and more).
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
                <span
                  className={[
                    "inline-block max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-xs leading-relaxed",
                    m.role === "user"
                      ? "border border-slate-600/50 bg-gradient-to-br from-slate-800 to-slate-900 text-slate-100 shadow-md"
                      : "border border-slate-600/40 border-l-[3px] border-l-orange-500 bg-slate-900/80 text-slate-200 shadow-sm",
                  ].join(" ")}
                >
                  {m.text}
                </span>
                {m.role === "assistant" && m.toolCall?.tool && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-0.5">
                    <span
                      className={[
                        "inline-flex rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold",
                        m.toolStatus === "error"
                          ? "bg-red-950/60 text-red-200 ring-1 ring-red-500/30"
                          : "bg-emerald-950/50 text-emerald-200 ring-1 ring-emerald-500/25",
                      ].join(" ")}
                      title="MCP tool invoked via gateway"
                    >
                      {m.toolCall.tool}
                    </span>
                    {m.toolStatus === "error" && (
                      <span className="text-[10px] text-red-300">upstream issue</span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="text-left">
                <span className="inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-400" />
                  </span>
                  Executing tools…
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="relative flex gap-2 border-t border-slate-700/50 bg-slate-950/90 p-3 backdrop-blur-sm">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Describe what to run — listings, search, escrow…"
              className="flex-1 rounded-xl border border-slate-600/60 bg-slate-900/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-orange-400/50 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-orange-500/40 bg-gradient-to-b from-orange-600 to-orange-700 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-md transition hover:from-orange-500 hover:to-orange-600 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Run
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function MatexCopilot() {
  return (
    <Suspense fallback={null}>
      <MatexCopilotInner />
    </Suspense>
  );
}
