"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, X, Send, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { Badge } from "@/components/ui/shadcn/badge";
import { Spinner } from "@/components/ui/shadcn/spinner";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolUsed?: string;
};

const QUICK_CHIPS = [
  "Search copper",
  "Check wallet",
  "Tax quote",
  "Market prices",
];

export function CopilotPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("matex_user");
      if (raw) {
        const u = JSON.parse(raw);
        setUserId(u?.id ?? u?.user_id ?? null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");
      const data = await res.json();

      const toolCall = data.tool_call ?? data.tool_used;
      const toolStatus = data.tool_call?.status;
      const isToolError = toolStatus && toolStatus >= 400;
      const toolLabel = typeof toolCall === "object" ? toolCall?.tool : toolCall;
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.message ?? data.content ?? "No response",
        toolUsed: toolLabel ? `${toolLabel}${isToolError ? " (error)" : ""}` : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I couldn't connect. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Matex AI"
        className={clsx(
          "fixed bottom-6 right-6 z-40",
          "h-14 w-14 rounded-full bg-blue-600 text-white shadow-lg",
          "flex items-center justify-center",
          "hover:bg-blue-700 transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
          open && "hidden"
        )}
      >
        <Bot className="h-6 w-6" />
      </button>

      {/* Panel */}
      <div
        className={clsx(
          "fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col",
          // On narrow viewports (e.g. iPhone SE @ 375px) the original 380px width
          // would overflow the right edge; cap to the viewport with a 1rem inset.
          "w-[min(380px,calc(100vw-2rem))] h-[min(500px,calc(100vh-6rem))]",
          "rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200",
          "transition-all duration-200 origin-bottom-right",
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900">Matex AI</span>
            {userId && (
              <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                {userId.slice(0, 8)}…
              </span>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close AI panel"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Quick chips */}
        <div className="flex gap-1.5 px-4 py-2 overflow-x-auto shrink-0 border-b border-slate-100">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => sendMessage(chip)}
              className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors whitespace-nowrap"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && !loading && (
            <p className="text-xs text-slate-400 text-center mt-8">
              Ask me anything about Matex — listings, prices, your wallet, and more.
            </p>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={clsx(
                "flex flex-col gap-1",
                msg.role === "user" ? "items-end" : "items-start"
              )}
            >
              <div
                className={clsx(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                )}
              >
                {msg.content}
              </div>
              {msg.toolUsed && (
                <Badge variant="info" className="text-[10px]">
                  Used: {msg.toolUsed}
                </Badge>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-2">
              <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-3.5 py-2 flex items-center gap-2">
                <Spinner className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">Thinking…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-slate-100 px-3 py-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              disabled={loading}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-colors disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send message"
              className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
