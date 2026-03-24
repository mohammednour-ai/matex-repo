"use client";

import { useMemo, useState } from "react";
import { readTrackedIds } from "../harness-client";
import { StatusBanner } from "../harness-ui";

export default function DashboardPage() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [output, setOutput] = useState("No action yet.");
  const tracked = useMemo(() => readTrackedIds(), [output]);

  async function onReset() {
    const response = await fetch("/api/reset-test-data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tracked }),
    });
    const text = await response.text();
    setOutput(`HTTP ${response.status}\n${text}`);
    if (response.ok) {
      localStorage.removeItem("matex_test_ids");
      localStorage.removeItem("matex_token");
      setStatus("success");
    } else {
      setStatus("error");
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Guided UI test</div>
          <h1 className="page-title">Dashboard + reset</h1>
          <p className="page-sub">Review captured IDs and reset created test data in non-production environments.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <StatusBanner tone={status} text={status === "success" ? "Reset completed." : status === "error" ? "Reset failed." : "Waiting for action."} />
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(tracked, null, 2)}</pre>
          <button className="btn btn-ghost" type="button" onClick={onReset}>Reset test data</button>
          <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{output}</pre>
        </div>
      </div>
    </div>
  );
}
