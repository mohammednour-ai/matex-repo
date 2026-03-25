"use client";

import { useState } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div style={{ padding: 60, textAlign: "center", maxWidth: 560, margin: "60px auto" }}>
      <div style={{
        width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px",
        background: "rgba(255,77,109,.12)", border: "2px solid var(--red)",
        display: "grid", placeItems: "center", fontSize: 28, color: "var(--red)",
      }}>!</div>
      <h2 style={{ marginBottom: 8, fontSize: 22 }}>Something went wrong</h2>
      <p style={{ color: "var(--muted)", marginBottom: 20, fontSize: 14 }}>
        An unexpected error occurred. Please try again or contact support if this persists.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={reset}>Try again</button>
        <button className="btn btn-ghost" onClick={() => setShowDebug(!showDebug)}>
          {showDebug ? "Hide" : "Show"} details
        </button>
      </div>
      {showDebug && (
        <pre style={{ textAlign: "left", fontSize: 11, padding: 14, borderRadius: "var(--r-sm)", background: "rgba(255,255,255,.04)", border: "1px solid var(--border)", overflow: "auto", maxHeight: 200 }}>
          {error.message}
          {error.digest ? `\nDigest: ${error.digest}` : ""}
          {error.stack ? `\n\n${error.stack}` : ""}
        </pre>
      )}
    </div>
  );
}
