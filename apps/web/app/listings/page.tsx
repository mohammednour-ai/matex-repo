"use client";

import { useState } from "react";
import { addTrackedId, callGatewayTool, formatResult, readTrackedIds, requiredMessage } from "../harness-client";
import { CopyChip, StatusBanner, ValidationSummary } from "../harness-ui";

export default function ListingsPage() {
  const knownUser = readTrackedIds().userIds[0] ?? "";
  const [sellerId, setSellerId] = useState(knownUser);
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("UI test copper wire lot");
  const [quantity, setQuantity] = useState("12");
  const [price, setPrice] = useState("22495");
  const [listingId, setListingId] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [validation, setValidation] = useState<string | null>(null);
  const [output, setOutput] = useState("No action yet.");

  async function onCreate() {
    const missing = requiredMessage([
      ["seller_id", sellerId],
      ["title", title],
    ]);
    setValidation(missing);
    if (missing) return;
    const result = await callGatewayTool("listing.create_listing", {
      seller_id: sellerId,
      category_id: categoryId || undefined,
      title,
      description: "Created from UI harness",
      quantity: Number(quantity),
      unit: "kg",
      price_type: "fixed",
      asking_price: Number(price),
    });
    setOutput(formatResult("listing.create_listing", result));
    if (result.payload.success) {
      const id = String((((result.payload.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)?.listing_id as string | undefined) ?? "");
      setListingId(id);
      addTrackedId("listingIds", id);
      setStatus("success");
    } else setStatus("error");
  }

  async function onPublish() {
    const missing = requiredMessage([["listing_id", listingId]]);
    setValidation(missing);
    if (missing) return;
    const result = await callGatewayTool("listing.publish_listing", { listing_id: listingId });
    setOutput(formatResult("listing.publish_listing", result));
    setStatus(result.payload.success ? "success" : "error");
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Guided UI test</div>
          <h1 className="page-title">Listings flow</h1>
          <p className="page-sub">Create and publish a listing with validation and copyable IDs.</p>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <StatusBanner tone={status} text={status === "success" ? "Listing action succeeded." : status === "error" ? "Listing action failed." : "Waiting for action."} />
          <ValidationSummary message={validation} />
          <div className="field-row"><div className="field-label">Seller ID</div><input className="field-input" value={sellerId} onChange={(e) => setSellerId(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Category ID (optional)</div><input className="field-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Title</div><input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Quantity</div><input className="field-input" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div className="field-row"><div className="field-label">Asking price</div><input className="field-input" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="btn btn-primary" type="button" onClick={onCreate}>Create listing</button>
            <button className="btn btn-ghost" type="button" onClick={onPublish}>Publish listing</button>
            {listingId ? <CopyChip label="listing_id" value={listingId} /> : null}
          </div>
          <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{output}</pre>
        </div>
      </div>
    </div>
  );
}
