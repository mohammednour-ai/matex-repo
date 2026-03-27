"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Send,
  Plus,
  ExternalLink,
  Calendar,
  Lock,
  Eye,
} from "lucide-react";
import clsx from "clsx";
import { callTool, getUser } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";

// ─── Types ───────────────────────────────────────────────────────────────────

type Thread = {
  thread_id: string;
  listing_id?: string;
  listing_title?: string;
  other_user_name: string;
  other_user_id: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  status: "active" | "closed";
};

type Message = {
  message_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type ListingContext = {
  listing_id: string;
  title: string;
  status: string;
  price?: number;
  escrow_id?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

function UserAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const letter = name.slice(0, 1).toUpperCase();
  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-600",
        size === "sm" ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm"
      )}
    >
      {letter}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const [currentUserId] = useState(() => getUser()?.userId ?? "");

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [listingCtx, setListingCtx] = useState<ListingContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);

  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadForm, setNewThreadForm] = useState({
    listing_id: "",
    message: "",
  });
  const [creatingThread, setCreatingThread] = useState(false);

  // ── Load threads ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadThreads(): Promise<void> {
      setThreadsLoading(true);
      const res = await callTool("messaging.get_unread", {});
      if (res.success) {
        const data = res.data as unknown as { threads?: Thread[] };
        const list = data?.threads ?? [];
        setThreads(list);
        if (list.length > 0) setActiveThread(list[0]);
      }
      setThreadsLoading(false);
    }
    loadThreads();
  }, []);

  // ── Load messages + listing context when active thread changes ────────────
  useEffect(() => {
    if (!activeThread) return;
    const threadId = activeThread.thread_id;

    async function loadMessages(): Promise<void> {
      setMsgsLoading(true);
      const res = await callTool("messaging.get_messages", {
        thread_id: threadId,
        limit: 50,
      });
      if (res.success) {
        const data = res.data as unknown as { messages?: Message[] };
        setMessages(data?.messages ?? []);
      }
      setMsgsLoading(false);
    }

    async function loadListing(listingId: string): Promise<void> {
      setCtxLoading(true);
      const res = await callTool("listing.get_listing", { listing_id: listingId });
      if (res.success) {
        setListingCtx(res.data as unknown as ListingContext);
      } else {
        setListingCtx(null);
      }
      setCtxLoading(false);
    }

    loadMessages();

    if (activeThread.listing_id) {
      loadListing(activeThread.listing_id);
    } else {
      setListingCtx(null);
    }
  }, [activeThread?.thread_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async (): Promise<void> => {
    if (!newMessage.trim() || !activeThread) return;
    const content = newMessage.trim();
    setNewMessage("");
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const tempMsg: Message = {
      message_id: tempId,
      sender_id: currentUserId,
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempMsg]);

    const res = await callTool("messaging.send_message", {
      thread_id: activeThread.thread_id,
      content,
    });

    if (res.success) {
      const data = res.data as unknown as { message?: Message };
      if (data?.message) {
        setMessages((m) =>
          m.map((msg) => (msg.message_id === tempId ? data.message! : msg))
        );
      }

      // Update last_message in thread list
      setThreads((ts) =>
        ts.map((t) =>
          t.thread_id === activeThread.thread_id
            ? { ...t, last_message: content, last_message_at: new Date().toISOString() }
            : t
        )
      );
    }
    setSending(false);
  };

  // ── Create thread ─────────────────────────────────────────────────────────
  const handleCreateThread = async (): Promise<void> => {
    if (!newThreadForm.listing_id.trim() || !newThreadForm.message.trim()) return;
    setCreatingThread(true);
    const res = await callTool("messaging.create_thread", {
      listing_id: newThreadForm.listing_id,
      initial_message: newThreadForm.message,
    });
    if (res.success) {
      const data = res.data as unknown as { thread?: Thread };
      if (data?.thread) {
        setThreads((t) => [data.thread!, ...t]);
        setActiveThread(data.thread!);
      }
      setShowNewThread(false);
      setNewThreadForm({ listing_id: "", message: "" });
    }
    setCreatingThread(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Left: Thread List ───────────────────────────────────────────── */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
          <h2 className="font-semibold text-slate-800">Messages</h2>
          <button
            type="button"
            onClick={() => setShowNewThread(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-5 w-5 text-brand-500" />
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
              <MessageSquare className="h-8 w-8 opacity-40" />
              <p className="text-sm">No messages yet</p>
            </div>
          ) : (
            threads.map((thread) => {
              const isActive = activeThread?.thread_id === thread.thread_id;
              return (
                <button
                  key={thread.thread_id}
                  type="button"
                  onClick={() => setActiveThread(thread)}
                  className={clsx(
                    "w-full border-b border-slate-50 px-4 py-3.5 text-left transition-colors hover:bg-slate-50",
                    isActive && "border-l-2 border-l-brand-500 bg-brand-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <UserAvatar name={thread.other_user_name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {thread.other_user_name}
                        </p>
                        {thread.listing_title && (
                          <p className="truncate text-xs text-slate-400">
                            {thread.listing_title}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs text-slate-400">
                        {timeAgo(thread.last_message_at)}
                      </span>
                      {thread.unread_count > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">
                          {thread.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="ml-11 mt-1.5 truncate text-xs text-slate-500">
                    {thread.last_message}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Center: Conversation ────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden bg-slate-50">
        {!activeThread ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
            <MessageSquare className="h-12 w-12 opacity-30" />
            <p className="text-sm">Select a conversation to get started</p>
          </div>
        ) : (
          <>
            {/* Conv header */}
            <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3.5 shadow-sm">
              <UserAvatar name={activeThread.other_user_name} />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {activeThread.other_user_name}
                </p>
                {activeThread.listing_title && (
                  <p className="text-xs text-slate-500">
                    Re: {activeThread.listing_title}
                  </p>
                )}
              </div>
              <Badge
                variant={activeThread.status === "active" ? "success" : "gray"}
                className="ml-auto"
              >
                {activeThread.status}
              </Badge>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {msgsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner className="h-5 w-5 text-brand-500" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
                  <MessageSquare className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender_id === currentUserId;
                  return (
                    <div
                      key={msg.message_id}
                      className={clsx(
                        "flex",
                        isMe ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={clsx(
                          "max-w-xs rounded-2xl px-4 py-2.5 shadow-sm",
                          isMe
                            ? "rounded-br-sm bg-brand-600 text-white"
                            : "rounded-bl-sm bg-white text-slate-800 ring-1 ring-slate-100"
                        )}
                      >
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                        <p
                          className={clsx(
                            "mt-1 text-right text-[11px]",
                            isMe ? "text-brand-200" : "text-slate-400"
                          )}
                        >
                          {formatMsgTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-400 transition-colors">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sending}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
                >
                  {sending ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── Right: Context Panel ─────────────────────────────────────────── */}
      <aside className="hidden w-64 shrink-0 flex-col border-l border-slate-200 bg-white xl:flex">
        <div className="border-b border-slate-100 px-4 py-3.5">
          <h3 className="text-sm font-semibold text-slate-700">Context</h3>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {ctxLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-4 w-4 text-brand-400" />
            </div>
          ) : listingCtx ? (
            <>
              {/* Listing info */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Linked Listing
                </p>
                <p className="text-sm font-medium leading-snug text-slate-800">
                  {listingCtx.title}
                </p>
                <Badge
                  variant={listingCtx.status === "active" ? "success" : "gray"}
                >
                  {listingCtx.status}
                </Badge>
                {listingCtx.price !== undefined && (
                  <p className="text-sm font-semibold text-brand-700">
                    {formatCAD(listingCtx.price)}
                  </p>
                )}
              </div>

              {/* Quick actions */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quick Actions
                </p>
                <Link
                  href={`/listings/${listingCtx.listing_id}`}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Eye className="h-4 w-4 shrink-0 text-slate-400" />
                  View Listing
                  <ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-300" />
                </Link>
                {listingCtx.escrow_id && (
                  <Link
                    href={`/escrow/${listingCtx.escrow_id}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Lock className="h-4 w-4 shrink-0 text-amber-400" />
                    Go to Escrow
                    <ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-300" />
                  </Link>
                )}
                <Link
                  href={`/booking/new?listing_id=${listingCtx.listing_id}`}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Calendar className="h-4 w-4 shrink-0 text-brand-500" />
                  Book Inspection
                  <ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-300" />
                </Link>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
              <MessageSquare className="h-8 w-8 opacity-30" />
              <p className="text-center text-xs">No listing linked to this thread</p>
            </div>
          )}
        </div>
      </aside>

      {/* ── New Thread Modal ─────────────────────────────────────────────── */}
      <Modal
        open={showNewThread}
        onClose={() => setShowNewThread(false)}
        title="New Message Thread"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Listing ID
            </label>
            <input
              type="text"
              value={newThreadForm.listing_id}
              onChange={(e) =>
                setNewThreadForm((f) => ({ ...f, listing_id: e.target.value }))
              }
              placeholder="Paste the listing ID"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Message
            </label>
            <textarea
              value={newThreadForm.message}
              onChange={(e) =>
                setNewThreadForm((f) => ({ ...f, message: e.target.value }))
              }
              placeholder="Hi, I'm interested in your listing…"
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowNewThread(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateThread}
              loading={creatingThread}
              disabled={
                !newThreadForm.listing_id.trim() || !newThreadForm.message.trim()
              }
            >
              Send Message
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
