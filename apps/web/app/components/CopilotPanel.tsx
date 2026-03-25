"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const QUICK_CHIPS = ["check my wallet", "search copper", "get dashboard stats"] as const;

export function CopilotPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLinked, setContextLinked] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setContextLinked(!!localStorage.getItem("matex_token"));
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const token = localStorage.getItem("matex_token") ?? "";
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed, token }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: String(data.content ?? data.error ?? "No response") }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    }
    setLoading(false);
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 56,
        right: 0,
        width: 360,
        height: "calc(100vh - 56px)",
        background: "var(--surface, #1a1a2e)",
        borderLeft: "1px solid var(--border, #333)",
        display: "flex",
        flexDirection: "column",
        zIndex: 900,
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s ease",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border, #333)" }}>
        <strong style={{ fontSize: 14 }}>AI Copilot</strong>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 18 }}>
          ×
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 && (
          <p style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", marginTop: 24 }}>
            Ask the Matex AI Copilot anything.
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            <div style={{
              padding: "8px 12px",
              borderRadius: 10,
              fontSize: 13,
              whiteSpace: "pre-wrap",
              background: msg.role === "user" ? "var(--cyan, #00d4ff)" : "var(--card-bg, #262640)",
              color: msg.role === "user" ? "#000" : "inherit",
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start" }}>
            <div style={{ padding: "8px 12px", borderRadius: 10, fontSize: 13, background: "var(--card-bg, #262640)", opacity: 0.6 }}>
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick chips + input */}
      <div style={{ borderTop: "1px solid var(--border, #333)", padding: "8px 12px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {QUICK_CHIPS.map((chip) => (
            <button key={chip} type="button" className="chip" onClick={() => send(chip)} disabled={loading}>
              {chip}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="field-input"
            style={{ flex: 1, fontSize: 13 }}
            placeholder="Ask anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
          />
          <button className="btn btn-primary" type="button" onClick={() => send(input)} disabled={loading}>
            Send
          </button>
        </div>
        {contextLinked && (
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--muted)" }}>Context: user_id linked</div>
        )}
      </div>
    </div>
  );
}
