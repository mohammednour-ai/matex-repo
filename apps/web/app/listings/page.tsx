"use client";

import { useCallback, useEffect, useState } from "react";
import { callGatewayTool, readTrackedIds, addTrackedId } from "../harness-client";

type Listing = {
  listing_id: string;
  title: string;
  status: string;
  asking_price: number;
  quantity: number;
  unit: string;
  description: string;
};

const STATUS_STEPS = ["draft", "active", "sold"];

function statusBadgeClass(status: string): string {
  switch (status) {
    case "draft": return "badge badge-muted";
    case "active": return "badge badge-green";
    case "sold": return "badge badge-cyan";
    default: return "badge badge-amber";
  }
}

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [priceType, setPriceType] = useState("fixed");
  const [askingPrice, setAskingPrice] = useState("");

  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugOutput, setDebugOutput] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    setGalleryLoading(true);
    setGalleryError(null);
    try {
      const result = await callGatewayTool("listing.get_my_listings", {});
      const d = result.payload.data;
      const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const items = (upstream?.listings ?? d?.listings ?? []) as Listing[];
      setListings(Array.isArray(items) ? items : []);
    } catch (err) {
      setGalleryError(String(err));
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  useEffect(() => { loadListings(); }, [loadListings]);

  async function handleCreate() {
    setError(null);
    setSuccess(null);
    setDebugOutput(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setFormLoading(true);
    try {
      const ids = readTrackedIds();
      const sellerId = ids.userIds[0] ?? "";
      const result = await callGatewayTool("listing.create_listing", {
        seller_id: sellerId || undefined,
        category_id: categoryId || undefined,
        title,
        description: description || "No description provided",
        quantity: Number(quantity) || 1,
        unit,
        price_type: priceType,
        asking_price: Number(askingPrice) || 0,
      });
      setDebugOutput(JSON.stringify(result.payload, null, 2));

      if (result.payload.success) {
        const d = result.payload.data;
        const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
        const id = String(upstream?.listing_id ?? d?.listing_id ?? "");
        if (id) addTrackedId("listingIds", id);
        setSuccess("Listing created as draft.");
        setTitle("");
        setDescription("");
        setCategoryId("");
        setQuantity("");
        setAskingPrice("");
        await loadListings();
      } else {
        setError(result.payload.error?.message ?? "Failed to create listing.");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setFormLoading(false);
    }
  }

  async function handlePublish(listingId: string) {
    setError(null);
    setSuccess(null);
    setDebugOutput(null);
    setFormLoading(true);
    try {
      const result = await callGatewayTool("listing.publish_listing", { listing_id: listingId });
      setDebugOutput(JSON.stringify(result.payload, null, 2));

      if (result.payload.success) {
        setSuccess("Listing published!");
        await loadListings();
      } else {
        setError(result.payload.error?.message ?? "Failed to publish listing.");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setFormLoading(false);
    }
  }

  function handlePhotoZoneClick() {
    setError(null);
    setSuccess("Photo upload will be available soon.");
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Listings</h1>
          <p className="page-sub">Manage your material listings and create new ones.</p>
        </div>
      </div>

      {error && (
        <div className="error-toast">
          <div className="error-toast-header">
            <div className="error-toast-icon">!</div>
            <div className="error-toast-message">{error}</div>
            <button className="error-toast-close" onClick={() => setError(null)}>×</button>
          </div>
        </div>
      )}

      {success && (
        <div className="success-toast">
          <div className="success-toast-icon">✓</div>
          <span style={{ fontSize: 13 }}>{success}</span>
        </div>
      )}

      {/* My Listings gallery */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">My Listings</div>
          <button className="btn btn-ghost btn-sm" onClick={loadListings} disabled={galleryLoading}>
            {galleryLoading ? <span className="loading-spinner" /> : "Refresh"}
          </button>
        </div>
        <div className="card-body">
          {galleryLoading && listings.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>
              <span className="loading-spinner-lg" />
            </div>
          ) : galleryError ? (
            <div style={{ color: "var(--red)", fontSize: 13 }}>{galleryError}</div>
          ) : listings.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 13 }}>
              No listings yet. Create your first listing below.
            </div>
          ) : (
            <>
              <div className="status-stepper" style={{ marginBottom: 14 }}>
                {STATUS_STEPS.map((step, i) => {
                  const count = listings.filter((l) => l.status === step).length;
                  const hasSome = count > 0;
                  return (
                    <span key={step}>
                      {i > 0 && <span className="status-step-arrow" style={{ margin: "0 2px" }}>→</span>}
                      <span className={`status-step${hasSome ? " done" : ""}`}>
                        {step} ({count})
                      </span>
                    </span>
                  );
                })}
              </div>

              <div className="listing-grid">
                {listings.map((l) => (
                  <div className="listing-card" key={l.listing_id}>
                    <div className="listing-card-top">
                      <div className="listing-card-title">{l.title}</div>
                      <span className={statusBadgeClass(l.status)}>{l.status}</span>
                    </div>
                    <div className="listing-card-price">
                      ${Number(l.asking_price ?? 0).toLocaleString("en-CA", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="listing-card-detail">
                      {l.quantity} {l.unit}
                    </div>
                    {l.status === "draft" && (
                      <div className="listing-card-footer">
                        <button className="btn btn-primary btn-sm" onClick={() => handlePublish(l.listing_id)} disabled={formLoading}>
                          Publish
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create listing form */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Create listing</div>
        </div>
        <div className="card-body">
          <div className="field-row">
            <div className="field-label">Title</div>
            <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. #1 Copper Wire 99.9% purity" />
          </div>
          <div className="field-row">
            <div className="field-label">Description</div>
            <textarea
              className="field-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the material, condition, source…"
              rows={3}
              style={{ resize: "vertical" }}
            />
          </div>
          <div className="field-row">
            <div className="field-label">Category ID (optional)</div>
            <input className="field-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="UUID of material category" />
          </div>
          <div className="two-col">
            <div className="field-row">
              <div className="field-label">Quantity</div>
              <input className="field-input" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
            </div>
            <div className="field-row">
              <div className="field-label">Unit</div>
              <select className="field-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
                <option value="mt">metric tonnes</option>
                <option value="units">units</option>
              </select>
            </div>
          </div>
          <div className="two-col">
            <div className="field-row">
              <div className="field-label">Price type</div>
              <select className="field-select" value={priceType} onChange={(e) => setPriceType(e.target.value)}>
                <option value="fixed">Fixed price</option>
                <option value="auction">Auction</option>
              </select>
            </div>
            <div className="field-row">
              <div className="field-label">Asking price (CAD)</div>
              <input className="field-input" type="number" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="field-row">
            <div className="field-label">Photos</div>
            <div className="photo-upload-zone" onClick={handlePhotoZoneClick}>
              Drag and drop photos or click to upload
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button className="btn btn-primary" onClick={handleCreate} disabled={formLoading}>
              {formLoading ? <span className="loading-spinner" /> : "Create draft"}
            </button>
          </div>

          {debugOutput && (
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => setShowDebug(!showDebug)}
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}
              >
                {showDebug ? "Hide debug" : "Show debug"}
              </button>
              {showDebug && (
                <pre style={{ marginTop: 6, fontSize: 10, maxHeight: 160, overflow: "auto", padding: 8, background: "rgba(0,0,0,.3)", borderRadius: 4, whiteSpace: "pre-wrap" }}>
                  {debugOutput}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
