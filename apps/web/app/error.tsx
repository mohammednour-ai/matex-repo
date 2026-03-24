"use client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 40, textAlign: "center", maxWidth: 500, margin: "80px auto" }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px",
        background: "rgba(255,77,109,.12)", border: "2px solid var(--red)",
        display: "grid", placeItems: "center", fontSize: 28, color: "var(--red)",
      }}>!</div>
      <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ color: "var(--muted)", marginBottom: 20, fontSize: 13 }}>
        {error.message || "An unexpected error occurred."}
      </p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
