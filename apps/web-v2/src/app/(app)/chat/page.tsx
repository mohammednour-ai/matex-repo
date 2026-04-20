"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Bot,
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Zap,
  Package,
  DollarSign,
  Truck,
  BarChart2,
  Shield,
  FileText,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tool_call?: ToolCall | null;
  error?: string | null;
  followUps?: string[];
  timestamp: Date;
};

type Context = {
  userId: string | null;
  listingId: string | null;
  walletBalance: string | null;
};

// ---------------------------------------------------------------------------
// Onboarding modal
// ---------------------------------------------------------------------------
const ONBOARDING_CATEGORIES = [
  {
    icon: <Package size={20} />,
    label: "Listings",
    examples: ["Search copper scrap", "Create new listing", "My active listings"],
  },
  {
    icon: <DollarSign size={20} />,
    label: "Trading",
    examples: ["Check wallet", "Place bid", "Get market price copper"],
  },
  {
    icon: <Shield size={20} />,
    label: "Escrow",
    examples: ["Check escrow status", "Release escrow funds", "Create escrow"],
  },
  {
    icon: <Truck size={20} />,
    label: "Logistics",
    examples: ["Get carrier quotes", "Book shipment", "Track shipment"],
  },
  {
    icon: <BarChart2 size={20} />,
    label: "Analytics",
    examples: ["Dashboard stats", "Revenue report", "Conversion funnel"],
  },
  {
    icon: <FileText size={20} />,
    label: "Compliance",
    examples: ["Check KYC status", "Get invoice", "My credit score"],
  },
];

function OnboardingModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Bot size={22} />
              </div>
              <div>
                <h2 className="font-bold text-lg">Matex AI Copilot</h2>
                <p className="text-brand-100 text-sm">Your intelligent platform assistant</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-6">
          <p className="text-gray-600 text-sm mb-5">
            I can help you interact with every part of Matex. Here's what I can do:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ONBOARDING_CATEGORIES.map((cat) => (
              <div
                key={cat.label}
                className="border border-gray-100 rounded-xl p-3 hover:border-brand-200 hover:bg-brand-50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2 text-brand-600">
                  {cat.icon}
                  <span className="font-semibold text-sm text-gray-800">{cat.label}</span>
                </div>
                <ul className="space-y-1">
                  {cat.examples.map((ex) => (
                    <li key={ex} className="text-xs text-gray-500 truncate">
                      • {ex}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <button
            onClick={onClose}
            className="mt-6 w-full py-2.5 bg-brand-600 text-white rounded-xl font-semibold text-sm hover:bg-brand-700 transition-colors"
          >
            Get started
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context indicator bar
// ---------------------------------------------------------------------------
function ContextBar({ context }: { context: Context }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 flex-wrap">
      <span className="font-medium text-gray-400 uppercase tracking-wider">Context:</span>
      {context.userId ? (
        <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-mono">
          <span className="w-1.5 h-1.5 bg-brand-500 rounded-full" />
          {context.userId}
        </span>
      ) : (
        <span className="text-gray-400 italic">user not linked</span>
      )}
      {context.listingId && (
        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-mono">
          <Package size={10} />
          {context.listingId}
        </span>
      )}
      {context.walletBalance && (
        <span className="inline-flex items-center gap-1 bg-success-50 text-success-700 px-2 py-0.5 rounded-full">
          <DollarSign size={10} />
          {context.walletBalance}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick action chips
// ---------------------------------------------------------------------------
const QUICK_ACTIONS = [
  ["Search copper wire", "Check my wallet", "Calculate tax $22,495 ON→ON", "Get carrier quotes"],
  ["My active listings", "Check KYC status", "Market price copper", "Dashboard stats"],
];

function QuickActions({ onSelect }: { onSelect: (q: string) => void }) {
  return (
    <div className="px-4 py-3 border-b border-gray-100 space-y-2">
      {QUICK_ACTIONS.map((row, ri) => (
        <div key={ri} className="flex flex-wrap gap-2">
          {row.map((action) => (
            <button
              key={action}
              onClick={() => onSelect(action)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-full text-gray-600 hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors shadow-sm"
            >
              <Zap size={10} className="text-brand-400" />
              {action}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool call disclosure
// ---------------------------------------------------------------------------
function ToolCallDisclosure({ toolCall }: { toolCall: ToolCall }) {
  const [open, setOpen] = useState(false);
  const isSuccess = toolCall.result !== null && toolCall.result !== undefined;

  return (
    <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className={`w-1.5 h-1.5 rounded-full ${isSuccess ? "bg-success-500" : "bg-danger-500"}`} />
          <span className="font-mono font-medium">{toolCall.tool}</span>
          <span className="text-gray-400">→</span>
          <span className={isSuccess ? "text-success-700" : "text-danger-700"}>
            {isSuccess ? "success" : "error"}
          </span>
        </span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <pre className="p-3 bg-gray-900 text-green-400 overflow-x-auto text-[11px] leading-relaxed max-h-48">
          {JSON.stringify({ args: toolCall.args, result: toolCall.result }, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Follow-up chips per tool
// ---------------------------------------------------------------------------
const TOOL_FOLLOW_UPS: Record<string, string[]> = {
  "search.search_materials": ["Create a listing for this material", "Get market price", "Get carrier quotes"],
  "listing.get_my_listings": ["Check wallet balance", "Get market price copper", "Dashboard stats"],
  "listing.create_listing": ["Publish listing", "Search similar listings", "Calculate tax"],
  "payments.get_wallet_balance": ["Transaction history", "Top up wallet $500", "My credit score"],
  "payments.get_transaction_history": ["Check wallet", "Revenue report", "Get invoice"],
  "kyc.get_kyc_level": ["Start KYC verification", "Check credit score", "My profile"],
  "kyc.assert_kyc_gate": ["Check KYC status", "Start KYC verification", "My credit score"],
  "analytics.get_dashboard_stats": ["Revenue report", "Conversion funnel", "Admin overview"],
  "tax.calculate_tax": ["Get carrier quotes", "Create escrow", "Book shipment"],
  "logistics.get_quotes": ["Book shipment", "Track shipment", "Calculate tax"],
  "escrow.get_escrow": ["Release escrow funds", "File dispute", "Check wallet"],
  "escrow.create_escrow": ["Check escrow status", "Book inspection", "Get carrier quotes"],
  "escrow.release_funds": ["Transaction history", "Check wallet", "Dashboard stats"],
  "bidding.get_highest_bid": ["Place a bid", "Get lot state", "Market price copper"],
  "bidding.place_bid": ["Check escrow", "My active listings", "Dashboard stats"],
  "auction.get_lot_state": ["Place a bid", "Get highest bid", "Check escrow"],
  "inspection.request_inspection": ["Book inspection", "Check weight discrepancy", "Logistics quotes"],
  "dispute.file_dispute": ["Check dispute status", "Check escrow", "My profile"],
  "dispute.get_dispute": ["Release escrow funds", "File dispute", "Dashboard stats"],
  "pricing.get_market_prices": ["Set price alert", "Calculate MPI", "Create listing"],
  "pricing.create_price_alert": ["Market price copper", "Calculate MPI", "My listings"],
  "credit.get_credit_facility": ["Check wallet", "Transaction history", "My profile"],
};

function getFollowUps(toolName: string): string[] {
  return TOOL_FOLLOW_UPS[toolName] ?? ["Dashboard stats", "Check wallet", "My active listings"];
}

// ---------------------------------------------------------------------------
// Single message bubble
// ---------------------------------------------------------------------------
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot size={14} />
        </div>
      )}
      <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={[
            "px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed",
            isUser
              ? "bg-brand-600 text-white rounded-br-sm"
              : "bg-gray-100 text-gray-800 rounded-bl-sm",
          ].join(" ")}
        >
          {msg.text}
        </div>

        {msg.error && (
          <div className="mt-1.5 px-3 py-2 bg-danger-50 border border-danger-200 rounded-lg text-xs text-danger-700">
            ⚠ {msg.error}
          </div>
        )}

        {!isUser && msg.tool_call && (
          <div className="w-full mt-1">
            <ToolCallDisclosure toolCall={msg.tool_call} />
          </div>
        )}

        {!isUser && msg.followUps && msg.followUps.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {msg.followUps.map((fu) => (
              <button
                key={fu}
                data-followup={fu}
                className="px-2.5 py-1 text-[11px] font-medium bg-white border border-brand-200 text-brand-600 rounded-full hover:bg-brand-50 hover:border-brand-400 transition-colors"
              >
                {fu}
              </button>
            ))}
          </div>
        )}

        <span className="text-[10px] text-gray-400 mt-1 px-1">
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {isUser && (
        <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
          U
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<Context>({ userId: null, listingId: null, walletBalance: null });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load context from localStorage and check first-visit
  useEffect(() => {
    const user = localStorage.getItem("matex_user");
    const listingId = localStorage.getItem("matex_active_listing");
    const walletBalance = localStorage.getItem("matex_wallet_balance");
    if (user) {
      try {
        const parsed = JSON.parse(user) as { userId?: string };
        setContext({
          userId: parsed.userId ?? null,
          listingId: listingId,
          walletBalance: walletBalance ? `$${walletBalance} CAD` : null,
        });
      } catch {
        // ignore parse errors
      }
    }
    const visited = localStorage.getItem("matex_chat_visited");
    if (!visited) {
      setShowOnboarding(true);
      localStorage.setItem("matex_chat_visited", "1");
    }
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        text: trimmed,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const token = localStorage.getItem("matex_token") ?? undefined;
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            context: {
              user_id: context.userId,
              listing_id: context.listingId,
            },
            token,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
          content: string;
          tool_call?: ToolCall | null;
          error?: string | null;
        };

        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.content,
          tool_call: data.tool_call ?? null,
          error: data.error ?? null,
          followUps: data.tool_call ? getFollowUps(data.tool_call.tool) : undefined,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Something went wrong. Please try again.",
          error: err instanceof Error ? err.message : "Unknown error",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, context],
  );

  // Handle follow-up chip clicks bubbled up from message area
  function handleMessageAreaClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const btn = target.closest("[data-followup]") as HTMLElement | null;
    if (btn?.dataset.followup) {
      void sendMessage(btn.dataset.followup);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  function clearConversation() {
    setMessages([]);
  }

  return (
    <>
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}

      <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-2xl border border-steel-200/80 bg-white/95 shadow-card">
        {/* Page header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-steel-200/80 bg-white/90 px-6 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Bot size={20} />
            </div>
            <div>
              <h1 className="app-inpage-title text-lg sm:text-xl">Matex AI</h1>
              <p className="text-xs text-steel-500">
                Ask me anything about your listings, auctions, escrow, logistics, and more.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowOnboarding(true)}
            className="rounded-xl border border-brand-200/80 px-3 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-800"
          >
            What can I do?
          </button>
        </div>

        {/* Context indicator */}
        <ContextBar context={context} />

        {/* Quick actions */}
        <QuickActions onSelect={(q) => void sendMessage(q)} />

        {/* Chat messages */}
        <div
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
          onClick={handleMessageAreaClick}
        >
          {messages.length === 0 && (
            <EmptyState
              image="/illustrations/copilot-empty.png"
              title="How can I help you today?"
              description="Use the quick actions above or type your question below to get started."
              size="md"
            />
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {loading && (
            <div className="flex justify-start gap-2">
              <div className="w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center flex-shrink-0">
                <Bot size={14} />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1.5 items-center">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3">
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Matex AI… (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="flex-1 resize-none px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all min-h-[42px] max-h-32 overflow-y-auto leading-relaxed"
              style={{ height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
            />
            <button
              onClick={() => void sendMessage(input)}
              disabled={loading || !input.trim()}
              className="p-2.5 bg-brand-600 text-white rounded-xl disabled:opacity-40 hover:bg-brand-700 active:bg-brand-800 transition-colors flex-shrink-0"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
            <button
              onClick={clearConversation}
              disabled={messages.length === 0}
              className="p-2.5 text-gray-400 rounded-xl disabled:opacity-30 hover:text-danger-500 hover:bg-danger-50 transition-colors flex-shrink-0"
              aria-label="Clear conversation"
              title="Clear conversation"
            >
              <Trash2 size={18} />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 text-center mt-1.5">
            Matex AI can make mistakes. Verify important information independently.
          </p>
        </div>
      </div>
    </>
  );
}
