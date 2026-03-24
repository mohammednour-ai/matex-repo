"use client";

import { useState } from "react";

const LOGO_SRC = "/matex-logo.jpg";

export function Logo({ className = "", size = 40 }: { className?: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 0 20px rgba(46,232,245,.25)",
      }}
    >
      {!failed ? (
        <img
          src={LOGO_SRC}
          alt="MATEX"
          width={size}
          height={size}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            backgroundColor: "rgba(6,13,26,.95)",
            padding: 4,
          }}
          onError={() => setFailed(true)}
        />
      ) : null}
      {failed ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg, #2ee8f5, #19c9aa)",
            color: "#03080f",
            fontWeight: 900,
            fontSize: size * 0.5,
            borderRadius: 10,
            boxShadow: "0 0 20px rgba(46,232,245,.35)",
          }}
        >
          M
        </div>
      ) : null}
    </div>
  );
}
