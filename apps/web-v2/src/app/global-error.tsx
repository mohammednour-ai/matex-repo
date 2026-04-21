"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface unhandled errors to the console so Railway log drains capture them.
    // In production we'd wire this to Sentry/Datadog.
    console.error("[web-v2] global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "1.25rem",
          padding: "1.5rem",
          background: "#0b1220",
          color: "#e5e7eb",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <p
            style={{
              fontSize: "0.75rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#fb923c",
              fontWeight: 600,
            }}
          >
            Something broke
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "#fff", margin: 0 }}>
            We hit an unexpected error
          </h1>
          <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: "#cbd5e1" }}>
            Our team has been notified. Try again, or head back to the dashboard.
          </p>
          {error?.digest ? (
            <code
              style={{
                fontSize: "0.75rem",
                color: "#94a3b8",
                background: "rgba(255,255,255,0.04)",
                padding: "0.25rem 0.5rem",
                borderRadius: "0.5rem",
              }}
            >
              ref: {error.digest}
            </code>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#fff",
              background: "#ea580c",
              border: "none",
              borderRadius: "0.75rem",
              cursor: "pointer",
              boxShadow: "0 0 20px -4px rgba(234,88,12,0.45)",
            }}
          >
            Try again
          </button>
          <a
            href="/dashboard"
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#e2e8f0",
              background: "transparent",
              border: "1px solid #334155",
              borderRadius: "0.75rem",
              textDecoration: "none",
            }}
          >
            Go to dashboard
          </a>
        </div>
      </body>
    </html>
  );
}
