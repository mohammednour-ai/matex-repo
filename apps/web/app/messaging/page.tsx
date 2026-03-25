"use client";

import { useEffect, useState } from "react";
import { addTrackedId, callGatewayTool, readTrackedIds } from "../harness-client";

type Thread = { id: string; subject: string; listing: string; snippet: string; time: string; unread: boolean };
type Message = { id: string; from: "user" | "other"; text: string; time: string };

const SAMPLE_THREADS: Thread[] = [
  { id: "THR-001", subject: "NorthLoop Metals inquiry", listing: "Copper wire MTX-9415", snippet: "Can we close with escrow today?", time: "2 min", unread: true },
  { id: "THR-002", subject: "Apex Metals negotiation", listing: "Aluminum ingots MTX-9402", snippet: "We accept the revised pricing.", time: "18 min", unread: true },
  { id: "THR-003", subject: "GreatLakes quality dispute", listing: "Steel bales MTX-9389", snippet: "Inspection report attached.", time: "1 hr", unread: false },
  { id: "THR-004", subject: "BlueSky shipping delay", listing: "Battery scrap MTX-9374", snippet: "Carrier rescheduled to Tuesday.", time: "3 hr", unread: false },
  { id: "THR-005", subject: "Hamilton Scrap — reweigh", listing: "Crushed auto MTX-9360", snippet: "Scale ticket uploaded.", time: "1 day", unread: false },
];

const SAMPLE_MESSAGES: Message[] = [
  { id: "m1", from: "other", text: "Hi — we'd like to proceed with the copper wire lot at the listed price. Can you confirm availability for 18 mt?", time: "10:02 AM" },
  { id: "m2", from: "user", text: "Yes, 18 mt is available. We can stage escrow once you confirm the order.", time: "10:05 AM" },
  { id: "m3", from: "other", text: "Great. Let's do $22,495 with standard inspection. Can we close with escrow today?", time: "10:08 AM" },
];

export default function MessagingPage() {
  const ids = readTrackedIds();
  const [threads, setThreads] = useState<Thread[]>(SAMPLE_THREADS);
  const [activeIdx, setActiveIdx] = useState(0);
  const [messages, setMessages] = useState<Message[]>(SAMPLE_MESSAGES);
  const [reply, setReply] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newListingId, setNewListingId] = useState(ids.listingIds[0] ?? "");
  const [newParticipants, setNewParticipants] = useState(ids.userIds.slice(0, 2).join(", "));
  const [sending, setSending] = useState(false);

  const active = threads[activeIdx];

  useEffect(() => {
    callGatewayTool("messaging.get_unread", { user_id: ids.userIds[0] ?? "system" }).then((r) => {
      if (r.payload.success) {
        const d = r.payload.data;
        const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
        const count = Number(upstream?.unread_count ?? d?.unread_count ?? 0);
        setUnreadCount(count || threads.filter((t) => t.unread).length);
      } else {
        setUnreadCount(threads.filter((t) => t.unread).length);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSend(): Promise<void> {
    if (!reply.trim() || sending) return;
    setSending(true);
    const result = await callGatewayTool("messaging.send_message", {
      thread_id: active?.id ?? "",
      sender_id: ids.userIds[0] ?? "system",
      content: reply,
    });
    if (result.payload.success) {
      const d = result.payload.data;
      const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const msgId = String(upstream?.message_id ?? d?.message_id ?? "");
      addTrackedId("messageIds", msgId);
      setMessages((prev) => [...prev, { id: msgId || `m-${Date.now()}`, from: "user", text: reply, time: "Just now" }]);
      setReply("");
    }
    setSending(false);
  }

  async function onCreateThread(): Promise<void> {
    if (!newSubject.trim()) return;
    const parsed = newParticipants.split(",").map((v) => v.trim()).filter(Boolean);
    const result = await callGatewayTool("messaging.create_thread", {
      listing_id: newListingId || null,
      participants: parsed,
      subject: newSubject,
    });
    if (result.payload.success) {
      const d = result.payload.data;
      const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const threadId = String(upstream?.thread_id ?? d?.thread_id ?? "");
      addTrackedId("threadIds", threadId);
      const created: Thread = { id: threadId || `THR-${Date.now()}`, subject: newSubject, listing: newListingId, snippet: "New thread", time: "Now", unread: false };
      setThreads((prev) => [created, ...prev]);
      setActiveIdx(0);
      setMessages([]);
      setShowNewThread(false);
      setNewSubject("");
    }
  }

  return (
    <div>
      <h1 className="page-title">Messages</h1>
      <p className="page-sub" style={{ marginBottom: 16 }}>Real-time negotiation threads linked to listings and orders.</p>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 280px", gap: 14, height: "calc(100vh - 160px)" }}>
        {/* ── Left: Thread list ── */}
        <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="card-header">
            <span className="card-title">Threads</span>
            {unreadCount > 0 && <span className="badge badge-cyan">{unreadCount}</span>}
          </div>
          <div style={{ padding: "8px 12px 0" }}>
            <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={() => setShowNewThread(true)}>+ New thread</button>
          </div>
          <div className="card-body scroll-box" style={{ flex: 1, padding: "8px 10px", overflow: "auto" }}>
            {threads.map((t, i) => (
              <button
                key={t.id}
                onClick={() => { setActiveIdx(i); setMessages(i === 0 ? SAMPLE_MESSAGES : []); }}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "10px 12px",
                  borderRadius: "var(--r-sm)", marginBottom: 4, cursor: "pointer", background: "transparent",
                  border: i === activeIdx ? "1px solid var(--cyan)" : "1px solid transparent",
                  color: "var(--text)",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.subject}</span>
                  {t.unread && <span className="dot" style={{ background: "var(--cyan)", flexShrink: 0, marginTop: 4 }} />}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{t.listing}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.snippet}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{t.time}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Center: Conversation ── */}
        <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="card-header" style={{ padding: "14px 18px" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{active?.subject ?? "Select a thread"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{active?.listing}</div>
            </div>
          </div>

          <div className="chat-messages" style={{ flex: 1 }}>
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.from === "user" ? "msg-user" : "msg-ai"}`}>
                <div className="msg-from">{m.from === "user" ? "You" : active?.subject.split(" ")[0] ?? "Them"} · {m.time}</div>
                <div className="msg-bubble">{m.text}</div>
              </div>
            ))}
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--muted)", padding: 40, fontSize: 13 }}>No messages in this thread yet.</div>
            )}
          </div>

          <div className="chat-input-row">
            <input
              className="field-input"
              placeholder="Type a reply…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSend(); }}
              style={{ border: "1px solid var(--border)" }}
            />
            <button className="send-btn" onClick={onSend} disabled={sending}>➤</button>
          </div>
        </div>

        {/* ── Right: Context panel ── */}
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Linked listing</span></div>
            <div className="card-body">
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Copper wire — bare bright</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--cyan)", letterSpacing: "-.03em" }}>$22,495</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Seller: GreatLakes Recycling</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>18 mt · ISRI Barley · Hamilton, ON</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Thread info</span></div>
            <div className="card-body" style={{ fontSize: 13 }}>
              {[
                ["Created", "Mar 24, 2026"],
                ["Participants", "3"],
                ["Messages", String(messages.length)],
                ["Status", "Active"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span style={{ color: "var(--muted)" }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Quick actions</span></div>
            <div className="card-body" style={{ display: "grid", gap: 6 }}>
              <a href="/checkout" className="btn btn-ghost btn-sm" style={{ width: "100%", textAlign: "left" }}>Create order →</a>
              <a href="/escrow" className="btn btn-ghost btn-sm" style={{ width: "100%", textAlign: "left" }}>Stage escrow →</a>
              <a href="/booking" className="btn btn-ghost btn-sm" style={{ width: "100%", textAlign: "left" }}>Request inspection →</a>
            </div>
          </div>
        </div>
      </div>

      {/* ── New thread modal ── */}
      {showNewThread && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", zIndex: 100 }} onClick={() => setShowNewThread(false)}>
          <div className="card" style={{ width: 440, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header"><span className="card-title">New thread</span></div>
            <div className="card-body">
              <div className="field-row">
                <div className="field-label">Participants (auto-filled from tracked users)</div>
                <input className="field-input" value={newParticipants} onChange={(e) => setNewParticipants(e.target.value)} />
              </div>
              <div className="field-row">
                <div className="field-label">Subject</div>
                <input className="field-input" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="e.g. Copper wire pricing" />
              </div>
              <div className="field-row">
                <div className="field-label">Listing ID (optional)</div>
                <input className="field-input" value={newListingId} onChange={(e) => setNewListingId(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" onClick={onCreateThread}>Create thread</button>
                <button className="btn btn-ghost" onClick={() => setShowNewThread(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
