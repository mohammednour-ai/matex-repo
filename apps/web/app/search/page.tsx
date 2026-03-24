"use client";

import { useState } from "react";
import { callGatewayTool, formatResult, requiredMessage } from "../harness-client";
import { StatusBanner, ValidationSummary } from "../harness-ui";

export default function SearchPage() {
  const [query, setQuery] = useState("copper");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [validation, setValidation] = useState<string | null>(null);
  const [output, setOutput] = useState("No action yet.");

  async function onSearch() {
    const missing = requiredMessage([["query", query]]);
    setValidation(missing);
    if (missing) return;
    const result = await callGatewayTool("search.search_materials", { query });
    setOutput(formatResult("search.search_materials", result));
    setStatus(result.payload.success ? "success" : "error");
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Guided UI test</div>
          <h1 className="page-title">Search flow</h1>
          <p className="page-sub">Run listing discovery and inspect API payload output.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <StatusBanner tone={status} text={status === "success" ? "Search succeeded." : status === "error" ? "Search failed." : "Waiting for action."} />
          <ValidationSummary message={validation} />
          <div className="field-row"><div className="field-label">Query</div><input className="field-input" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <button className="btn btn-primary" type="button" onClick={onSearch}>Run search</button>
          <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{output}</pre>
        </div>
      </div>
    </div>
  );
}
