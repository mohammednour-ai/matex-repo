/**
 * Inline “control module” mark for Matex Copilot — no extra raster assets.
 */
export function CopilotControlMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="4"
        y="6"
        width="32"
        height="28"
        rx="6"
        fill="rgb(15, 23, 42)"
        stroke="rgb(249, 115, 22)"
        strokeOpacity={0.72}
        strokeWidth="1.25"
      />
      <path
        d="M10 14h20M10 20h14M10 26h18"
        stroke="rgb(71, 85, 105)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="30" cy="14" r="2.5" fill="rgb(251, 146, 60)" />
      <circle cx="26" cy="26" r="1.8" fill="rgb(52, 211, 153)" fillOpacity={0.95} />
      <path
        d="M20 2v4M20 34v4M2 20h4M34 20h4"
        stroke="rgb(249, 115, 22)"
        strokeOpacity={0.45}
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
