"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Bot, X } from "lucide-react";
import {
  MATEX_COPILOT_PREFILL,
  type MatexCopilotPrefillDetail,
} from "@/lib/copilot-events";

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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-lg shadow-accent-900/40 transition-all hover:from-accent-600 hover:to-accent-700 hover:shadow-accent-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/80"
        aria-label="Open AI Copilot"
      >
        {open ? <X size={22} /> : <Bot size={22} />}
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex w-80 flex-col overflow-hidden rounded-2xl border border-steel-200/80 bg-white/98 shadow-2xl backdrop-blur-xl sm:w-96"
          style={{ maxHeight: "60vh" }}
        >
          <div className="flex items-center gap-2 border-b border-white/10 bg-gradient-to-r from-steel-950 via-steel-900 to-steel-950 px-4 py-3 text-white">
            <Bot size={18} className="text-brand-400" />
            <span className="text-sm font-bold">Matex Copilot</span>
            <span className="ml-auto rounded-full bg-brand-500/25 px-2 py-0.5 text-[10px] font-semibold text-brand-200">
              MCP
            </span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {messages.length === 0 && (
              <p className="pt-4 text-center text-xs text-steel-400">
                Ask in plain language — tools run through the same MCP gateway as the app.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "text-right" : "text-left"}
              >
                <span
                  className={[
                    "inline-block max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-xs",
                    m.role === "user"
                      ? "bg-brand-600 text-white shadow-sm"
                      : "border border-steel-200/80 bg-surface-50 text-steel-800",
                  ].join(" ")}
                >
                  {m.text}
                </span>
                {m.role === "assistant" && m.toolCall?.tool && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-0.5">
                    <span
                      className={[
                        "inline-flex rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold",
                        m.toolStatus === "error"
                          ? "bg-danger-50 text-danger-700 ring-1 ring-danger-200"
                          : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
                      ].join(" ")}
                      title="MCP tool invoked via gateway"
                    >
                      {m.toolCall.tool}
                    </span>
                    {m.toolStatus === "error" && (
                      <span className="text-[10px] text-danger-600">upstream issue</span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="text-left">
                <span className="inline-block animate-pulse rounded-xl border border-steel-100 bg-surface-100 px-3 py-2 text-xs text-steel-400">
                  Calling tools…
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2 border-t border-steel-200/80 bg-surface-50/80 p-3 backdrop-blur-sm">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask Copilot..."
              className="flex-1 rounded-xl border border-steel-200/90 bg-white px-3 py-2 text-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
            >
              Send
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
