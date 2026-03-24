"use client";

import { useState } from "react";
import { addTrackedId, callGatewayTool, formatResult, readTrackedIds, requiredMessage } from "../harness-client";
import { CopyChip, StatusBanner, ValidationSummary } from "../harness-ui";

export default function MessagingPage() {
  const ids = readTrackedIds();
  const [listingId, setListingId] = useState(ids.listingIds[0] ?? "");
  const [participants, setParticipants] = useState(ids.userIds.slice(0, 2).join(","));
  const [subject, setSubject] = useState("UI test negotiation");
  const [threadId, setThreadId] = useState("");
  const [senderId, setSenderId] = useState(ids.userIds[0] ?? "");
  const [content, setContent] = useState("Can we close with escrow today?");
  const [messageId, setMessageId] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [validation, setValidation] = useState<string | null>(null);
  const [output, setOutput] = useState("No action yet.");

  async function onCreateThread() {
    const parsedParticipants = participants.split(",").map((v) => v.trim()).filter(Boolean);
    const missing = requiredMessage([["participants", parsedParticipants.join("")]]);
    setValidation(missing);
    if (missing) return;
    const result = await callGatewayTool("messaging.create_thread", {
      listing_id: listingId || null,
      participants: parsedParticipants,
      subject,
    });
    setOutput(formatResult("messaging.create_thread", result));
    if (result.payload.success) {
      const id = String((((result.payload.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)?.thread_id as string | undefined) ?? "");
      setThreadId(id);
      addTrackedId("threadIds", id);
      setStatus("success");
    } else setStatus("error");
  }

  async function onSendMessage() {
    const missing = requiredMessage([
      ["thread_id", threadId],
      ["sender_id", senderId],
      ["content", content],
    ]);
    setValidation(missing);
    if (missing) return;
    const result = await callGatewayTool("messaging.send_message", { thread_id: threadId, sender_id: senderId, content });
    setOutput(formatResult("messaging.send_message", result));
    if (result.payload.success) {
      const id = String((((result.payload.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)?.message_id as string | undefined) ?? "");
      setMessageId(id);
      addTrackedId("messageIds", id);
      setStatus("success");
    } else setStatus("error");
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Guided UI test</div>
          <h1 className="page-title">Messaging flow</h1>
          <p className="page-sub">Create a thread and send a message with copyable IDs and validation.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <StatusBanner tone={status} text={status === "success" ? "Messaging action succeeded." : status === "error" ? "Messaging action failed." : "Waiting for action."} />
          <ValidationSummary message={validation} />
          <div className="field-row"><div className="field-label">Listing ID</div><input className="field-input" value={listingId} onChange={(e) => setListingId(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Participants (comma-separated)</div><input className="field-input" value={participants} onChange={(e) => setParticipants(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Subject</div><input className="field-input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Thread ID</div><input className="field-input" value={threadId} onChange={(e) => setThreadId(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Sender ID</div><input className="field-input" value={senderId} onChange={(e) => setSenderId(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Message</div><input className="field-input" value={content} onChange={(e) => setContent(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="btn btn-primary" type="button" onClick={onCreateThread}>Create thread</button>
            <button className="btn btn-ghost" type="button" onClick={onSendMessage}>Send message</button>
            {threadId ? <CopyChip label="thread_id" value={threadId} /> : null}
            {messageId ? <CopyChip label="message_id" value={messageId} /> : null}
          </div>
          <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{output}</pre>
        </div>
      </div>
    </div>
  );
}
