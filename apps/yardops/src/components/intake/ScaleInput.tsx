"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Scale, Usb, AlertTriangle } from "lucide-react";

type Props = {
  onComplete: (gross: number, tare: number) => void;
  loading: boolean;
};

export function ScaleInput({ onComplete, loading }: Props) {
  const [gross, setGross] = useState("");
  const [tare, setTare] = useState("");
  const [serialReading, setSerialReading] = useState<number | null>(null);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialError, setSerialError] = useState("");
  const [captureMode, setCaptureMode] = useState<"gross" | "tare" | null>(null);
  const [error, setError] = useState("");
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  const grossNum = parseFloat(gross) || 0;
  const tareNum = parseFloat(tare) || 0;
  const net = grossNum - tareNum;
  const netValid = grossNum > 0 && grossNum >= tareNum;

  const disconnectSerial = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch { /* ignore */ }
    setSerialConnected(false);
    setSerialReading(null);
  }, []);

  const connectSerial = useCallback(async () => {
    setSerialError("");
    if (!("serial" in navigator)) {
      setSerialError("Web Serial not supported — enter weights manually.");
      return;
    }
    try {
      const port = await (navigator as unknown as { serial: { requestPort: () => Promise<SerialPort> } }).serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" });
      portRef.current = port;
      setSerialConnected(true);
      const reader = port.readable!.getReader();
      readerRef.current = reader;

      let buf = "";
      const pump = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += new TextDecoder().decode(value);
            const lines = buf.split(/\r?\n/);
            buf = lines.pop() ?? "";
            for (const line of lines) {
              const match = line.match(/([0-9]+\.?[0-9]*)\s*kg/i) ?? line.match(/^[\s]*([0-9]+\.?[0-9]*)/);
              if (match) {
                const kg = parseFloat(match[1]);
                if (!isNaN(kg)) setSerialReading(kg);
              }
            }
          }
        } catch { /* port closed */ }
      };
      pump();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("No port selected")) setSerialError("Could not connect to scale: " + msg);
    }
  }, []);

  useEffect(() => () => { disconnectSerial(); }, [disconnectSerial]);

  function captureReading(field: "gross" | "tare") {
    if (serialReading !== null) {
      if (field === "gross") setGross(serialReading.toFixed(2));
      else setTare(serialReading.toFixed(2));
    }
    setCaptureMode(null);
  }

  function handleSubmit() {
    setError("");
    if (grossNum <= 0) { setError("Enter gross weight."); return; }
    if (tareNum < 0) { setError("Tare weight cannot be negative."); return; }
    if (grossNum < tareNum) { setError("Gross must be ≥ tare."); return; }
    onComplete(grossNum, tareNum);
  }

  return (
    <div className="space-y-6">
      {/* Serial scale connection */}
      <div className="rounded-xl border border-night-700 bg-night-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-night-200 flex items-center gap-2">
            <Usb size={16} className={serialConnected ? "text-success-400" : "text-night-500"} />
            Scale Connection
            {serialConnected && <span className="badge-green">Live</span>}
          </p>
          {serialConnected ? (
            <button onClick={disconnectSerial} className="yard-btn-secondary text-xs py-1 px-3">
              Disconnect
            </button>
          ) : (
            <button onClick={connectSerial} className="yard-btn-secondary text-xs py-1 px-3">
              Connect Scale
            </button>
          )}
        </div>

        {serialError && (
          <p className="flex items-center gap-2 text-xs text-warning-400 mb-2">
            <AlertTriangle size={12} />
            {serialError}
          </p>
        )}

        {serialConnected && serialReading !== null && (
          <div className="mt-3 rounded-xl bg-night-900 border border-night-700 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-night-400 mb-1">Live Reading</p>
            <p className="scale-display text-night-100">{serialReading.toFixed(2)}</p>
            <p className="text-sm text-night-400 mt-1">kg</p>
            <div className="mt-3 flex gap-2 justify-center">
              <button
                onClick={() => { setGross(serialReading.toFixed(2)); setCaptureMode(null); }}
                className="yard-btn-primary text-xs py-1.5 px-4"
              >
                → Gross
              </button>
              <button
                onClick={() => { setTare(serialReading.toFixed(2)); setCaptureMode(null); }}
                className="yard-btn-secondary text-xs py-1.5 px-4"
              >
                → Tare
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual entry */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-night-200">
            Gross Weight (kg)
            {serialConnected && captureMode === "gross" && (
              <span className="ml-2 text-xs text-brand-400 animate-pulse">Waiting for reading…</span>
            )}
          </label>
          <div className="relative">
            <input
              className="yard-input pr-16 tabular-nums"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={gross}
              onChange={(e) => setGross(e.target.value)}
              aria-label="Gross weight in kilograms"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-night-500">kg</span>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-night-200">Tare Weight (kg)</label>
          <div className="relative">
            <input
              className="yard-input pr-16 tabular-nums"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={tare}
              onChange={(e) => setTare(e.target.value)}
              aria-label="Tare weight in kilograms"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-night-500">kg</span>
          </div>
        </div>
      </div>

      {/* Net display */}
      <div className={[
        "rounded-xl border p-6 text-center transition-colors",
        netValid ? "border-brand-500/30 bg-brand-500/5" : "border-night-700 bg-night-800",
      ].join(" ")}>
        <p className="text-xs font-bold uppercase tracking-widest text-night-400 mb-2">
          <Scale size={12} className="inline mr-1" />
          Net Weight
        </p>
        <p className={["scale-display tabular-nums leading-none", netValid ? "text-night-100" : "text-night-600"].join(" ")}>
          {netValid ? net.toFixed(2) : "—"}
        </p>
        <p className="mt-1 text-sm text-night-400">kg</p>
        {netValid && (
          <p className="mt-2 text-xs text-night-500">
            {(net / 1000).toFixed(4)} t · {(net * 2.20462).toFixed(1)} lb
          </p>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading || !netValid}
        className="yard-btn-primary w-full"
      >
        {loading ? "Saving…" : "Record Weights →"}
      </button>
    </div>
  );
}
