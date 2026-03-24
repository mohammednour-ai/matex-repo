import Link from "next/link";

export function HarnessBanner({ href, label }: { href: string; label: string }) {
  return (
    <div style={{
      padding: "10px 16px",
      marginBottom: 16,
      borderRadius: "var(--r-sm)",
      background: "rgba(46,232,245,.08)",
      border: "1px solid rgba(46,232,245,.25)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: 13,
    }}>
      <span style={{ color: "var(--muted)" }}>This is a visual mockup. Test the live flow interactively.</span>
      <Link href={href} className="btn btn-primary btn-sm">{label}</Link>
    </div>
  );
}
