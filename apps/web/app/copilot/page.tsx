"use client";

import { useEffect, useRef, useState } from "react";
import { readTrackedIds } from "../harness-client";
import { StatusBanner } from "../harness-ui";

type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
  status: number;
  response: Record<string, unknown>;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  tool_call?: ToolCall | null;
  timestamp: string;
};

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I'm the Matex AI Copilot. I can search materials, check your wallet, get shipping quotes, calculate tax, and more. Try typing a command.", tool_call: null, timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const tracked = readTrackedIds();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function onSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("matex_token") ?? "" : "";
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          context: {
            user_id: tracked.userIds[0] ?? "",
            listing_id: tracked.listingIds[0] ?? "",
            thread_id: tracked.threadIds[0] ?? "",
          },
          token,
        }),
      });
      const data = await response.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: String(data.content ?? ""),
        tool_call: data.tool_call ?? null,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}`, tool_call: null, timestamp: new Date().toISOString() },
      ]);
    }
    setLoading(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  const suggestions = [
    "search copper wire",
    "check my wallet",
    "get dashboard stats",
    "calculate tax for $22495 ON ON",
    "get shipping quotes",
    "show my listings",
    "check KYC status",
    "get market prices for copper",
  ];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", height: "calc(100vh - 100px)" }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <div className="eyebrow">AI copilot</div>
          <h1 className="page-title">Matex AI Copilot</h1>
          <p className="page-sub">Natural language to MCP tool calls. Chat-first marketplace orchestration.</p>
        </div>
        <StatusBanner tone={loading ? "idle" : "success"} text={loading ? "Processing..." : "Ready"} />
      </div>

      <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.map((msg, i) => (
            <div key={i} className={`msg ${msg.role === "user" ? "msg-user" : "msg-ai"}`}>
              <div className="msg-from">{msg.role === "user" ? "You" : "Matex AI"}</div>
              <div className={`msg-bubble${msg.tool_call ? " action" : ""}`}>
                <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                {msg.tool_call ? (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--cyan)" }}>
                      Tool: {msg.tool_call.tool} (HTTP {msg.tool_call.status})
                    </summary>
                    <pre style={{ fontSize: 11, marginTop: 4, maxHeight: 200, overflow: "auto" }}>
                      {JSON.stringify(msg.tool_call.response, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="msg msg-ai">
              <div className="msg-from">Matex AI</div>
              <div className="msg-bubble" style={{ opacity: 0.6 }}>Thinking...</div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 14px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                onClick={() => { setInput(s); }}
              >
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="field-input"
              style={{ flex: 1 }}
              placeholder="Ask Matex AI — search, check wallet, calculate tax, get quotes..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading}
            />
            <button className="btn btn-primary" type="button" onClick={onSend} disabled={loading}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
