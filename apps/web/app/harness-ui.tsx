"use client";

import { useState } from "react";

export function StatusBanner({
  tone,
  text,
}: {
  tone: "idle" | "success" | "error";
  text: string;
}) {
  const cls =
    tone === "success" ? "status-pill" : tone === "error" ? "status-pill muted" : "status-pill";
  return <p className={cls}>{text}</p>;
}

export function ValidationSummary({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="lede" style={{ color: "#f87171" }}>{message}</p>;
}

export function LoadingSpinner() {
  return <span className="loading-spinner" />;
}

export function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="ghost-button" type="button" onClick={onCopy} title={value}>
      {copied ? `${label}: copied` : `${label}: ${value}`}
    </button>
  );
}
