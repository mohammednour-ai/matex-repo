import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ padding: 60, textAlign: "center", maxWidth: 500, margin: "80px auto" }}>
      <div style={{
        width: 80, height: 80, borderRadius: "50%", margin: "0 auto 24px",
        background: "rgba(46,232,245,.1)", border: "2px solid var(--cyan)",
        display: "grid", placeItems: "center", fontSize: 32, color: "var(--cyan)",
      }}>?</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Page not found</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/" className="btn btn-primary">Back to Overview</Link>
    </div>
  );
}
