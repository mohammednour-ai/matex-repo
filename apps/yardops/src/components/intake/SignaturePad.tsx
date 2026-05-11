"use client";

import { useRef, useState, useEffect } from "react";
import { PenLine, RotateCcw, Check } from "lucide-react";

type Props = {
  onSign: (signatureSvg: string) => void;
  loading: boolean;
};

export function SignaturePad({ onSign, loading }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  function getCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }

  function setupCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  useEffect(() => {
    setupCanvas();
    const observer = new ResizeObserver(() => {
      if (!hasStrokes) setupCanvas();
    });
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [hasStrokes]);

  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0];
      if (!t) return null;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;
    setIsDrawing(true);
    setHasStrokes(true);
    lastPos.current = pos;
    const ctx = getCtx();
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!isDrawing) return;
    const pos = getPos(e);
    if (!pos || !lastPos.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setIsDrawing(false);
    lastPos.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // Convert canvas to SVG by embedding as data URI
    const dataUrl = canvas.toDataURL("image/png");
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
      `<rect width="${w}" height="${h}" fill="#0f172a"/>`,
      `<image href="${dataUrl}" width="${w}" height="${h}"/>`,
      `</svg>`,
    ].join("");
    onSign(svg);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-night-200 flex items-center gap-2">
          <PenLine size={16} className="text-brand-400" />
          Seller Signature
        </p>
        <button
          onClick={clear}
          disabled={!hasStrokes || loading}
          className="flex items-center gap-1.5 text-xs text-night-400 hover:text-night-200 disabled:opacity-40 transition-colors"
          aria-label="Clear signature"
        >
          <RotateCcw size={13} />
          Clear
        </button>
      </div>

      <div
        className={[
          "relative rounded-xl border-2 bg-night-900 overflow-hidden",
          hasStrokes ? "border-brand-500/40" : "border-dashed border-night-700",
        ].join(" ")}
        style={{ height: 200 }}
      >
        <canvas
          ref={canvasRef}
          className="touch-none block w-full h-full cursor-crosshair"
          style={{ height: 200 }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          aria-label="Signature pad — draw your signature here"
          role="img"
        />
        {!hasStrokes && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-night-600">Sign here</p>
          </div>
        )}
      </div>

      <p className="text-xs text-night-500 text-center">
        By signing, the seller confirms the above information is accurate and consents to the payout.
      </p>

      <button
        onClick={confirm}
        disabled={!hasStrokes || loading}
        className="yard-btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white spin-brand" />
            Processing…
          </>
        ) : (
          <>
            <Check size={16} />
            Confirm & Complete Ticket
          </>
        )}
      </button>
    </div>
  );
}
