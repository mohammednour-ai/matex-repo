export default function Loading() {
  return (
    <div className="loading-overlay">
      <div className="loading-spinner-lg" />
      <p style={{ color: "var(--muted)", marginTop: 16, fontSize: 13 }}>Loading...</p>
    </div>
  );
}
