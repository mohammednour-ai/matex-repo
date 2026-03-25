"use client";

import { useState } from "react";
import { addTrackedId, callGatewayTool, formatResult, readTrackedIds, requiredMessage } from "../harness-client";
import { CopyChip, StatusBanner, ValidationSummary } from "../harness-ui";
import { PageIntro, Panel } from "../ui";

function extract(result: { payload: { success: boolean; data?: Record<string, unknown> } }, key: string): string {
  const d = result.payload.data;
  const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
  return String((upstream?.[key] as string | undefined) ?? (d?.[key] as string | undefined) ?? "");
}

export default function Phase2Page() {
  const tracked = readTrackedIds();
  const [userId, setUserId] = useState(tracked.userIds[0] ?? "");
  const [verificationId, setVerificationId] = useState("");
  const [escrowId, setEscrowId] = useState("");
  const [auctionId, setAuctionId] = useState("");
  const [lotId, setLotId] = useState("");
  const [inspectionId, setInspectionId] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [validation, setValidation] = useState<string | null>(null);
  const [output, setOutput] = useState("No action yet.");

  async function run(tool: string, args: Record<string, unknown>, title: string) {
    const result = await callGatewayTool(tool, args);
    setOutput(formatResult(title, result));
    setStatus(result.payload.success ? "success" : "error");
    return result;
  }

  async function startKyc() {
    const missing = requiredMessage([["user_id", userId]]);
    setValidation(missing);
    if (missing) return;
    const result = await run("kyc.start_verification", { user_id: userId, target_level: "level_2" }, "kyc.start_verification");
    if (result.payload.success) {
      const id = extract(result, "verification_id");
      setVerificationId(id);
      addTrackedId("verificationIds", id);
    }
  }

  async function reviewKyc() {
    const missing = requiredMessage([["verification_id", verificationId]]);
    setValidation(missing);
    if (missing) return;
    await run("kyc.review_verification", { verification_id: verificationId, reviewer_id: userId, status: "verified" }, "kyc.review_verification");
  }

  async function createEscrow() {
    const missing = requiredMessage([["buyer_id", userId]]);
    setValidation(missing);
    if (missing) return;
    const result = await run(
      "escrow.create_escrow",
      { buyer_id: userId, seller_id: userId, order_id: crypto.randomUUID(), amount: 5000, currency: "CAD" },
      "escrow.create_escrow",
    );
    if (result.payload.success) {
      const id = extract(result, "escrow_id");
      setEscrowId(id);
      addTrackedId("escrowIds", id);
    }
  }

  async function holdEscrow() {
    const missing = requiredMessage([["escrow_id", escrowId]]);
    setValidation(missing);
    if (missing) return;
    await run("escrow.hold_funds", { escrow_id: escrowId, amount: 5000 }, "escrow.hold_funds");
  }

  async function releaseEscrow() {
    const missing = requiredMessage([["escrow_id", escrowId]]);
    setValidation(missing);
    if (missing) return;
    await run("escrow.release_funds", { escrow_id: escrowId, amount: 5000 }, "escrow.release_funds");
  }

  async function createAuction() {
    const result = await run("auction.create_auction", { seller_id: userId, title: `UI Auction ${Date.now()}` }, "auction.create_auction");
    if (result.payload.success) {
      const id = extract(result, "auction_id");
      setAuctionId(id);
      addTrackedId("auctionIds", id);
    }
  }

  async function addLot() {
    const missing = requiredMessage([["auction_id", auctionId]]);
    setValidation(missing);
    if (missing) return;
    const listingId = readTrackedIds().listingIds[0] ?? null;
    const result = await run("auction.add_lot", { auction_id: auctionId, listing_id: listingId, reserve_price: 3000, starting_price: 2500 }, "auction.add_lot");
    if (result.payload.success) {
      const id = extract(result, "lot_id");
      setLotId(id);
      addTrackedId("lotIds", id);
    }
  }

  async function bidLot() {
    const missing = requiredMessage([["lot_id", lotId]]);
    setValidation(missing);
    if (missing) return;
    await run("auction.place_auction_bid", { lot_id: lotId, bidder_id: userId, amount: 3200 }, "auction.place_auction_bid");
  }

  async function createInspection() {
    const listingId = readTrackedIds().listingIds[0] ?? "";
    const missing = requiredMessage([["requester_id", userId]]);
    setValidation(missing);
    if (missing) return;
    const result = await run("inspection.request_inspection", { listing_id: listingId || undefined, requester_id: userId }, "inspection.request_inspection");
    if (result.payload.success) {
      const id = extract(result, "inspection_id");
      setInspectionId(id);
      addTrackedId("inspectionIds", id);
    }
  }

  async function evaluateDiscrepancy() {
    const missing = requiredMessage([["inspection_id", inspectionId]]);
    setValidation(missing);
    if (missing) return;
    await run("inspection.evaluate_discrepancy", { inspection_id: inspectionId, expected_weight: 1000, actual_weight: 900 }, "inspection.evaluate_discrepancy");
  }

  async function createBooking() {
    const result = await run("booking.create_booking", { user_id: userId, event_type: "pickup", scheduled_for: new Date(Date.now() + 86400000).toISOString() }, "booking.create_booking");
    if (result.payload.success) {
      const id = extract(result, "booking_id");
      setBookingId(id);
      addTrackedId("bookingIds", id);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Phase 2 trust workflows</div>
          <h1 className="page-title">KYC, escrow, auction, inspection, booking</h1>
          <p className="page-sub">Interactive trust-workflow surface for manual demos and validation.</p>
        </div>
      </div>
      <StatusBanner tone={status} text={status === "success" ? "Last action succeeded." : status === "error" ? "Last action failed." : "Waiting for action."} />
      <ValidationSummary message={validation} />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">User context</span></div>
        <div className="card-body">
          <div className="field-row"><div className="field-label">User ID</div><input className="field-input" value={userId} onChange={(e) => setUserId(e.target.value)} /></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">KYC</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={startKyc}>Start verification</button>
            <button className="btn btn-ghost" type="button" onClick={reviewKyc}>Review verified</button>
            {verificationId ? <CopyChip label="verification_id" value={verificationId} /> : null}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">Escrow</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={createEscrow}>Create escrow</button>
            <button className="btn btn-ghost" type="button" onClick={holdEscrow}>Hold funds</button>
            <button className="btn btn-ghost" type="button" onClick={releaseEscrow}>Release funds</button>
            {escrowId ? <CopyChip label="escrow_id" value={escrowId} /> : null}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">Auction + bids</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={createAuction}>Create auction</button>
            <button className="btn btn-ghost" type="button" onClick={addLot}>Add lot</button>
            <button className="btn btn-ghost" type="button" onClick={bidLot}>Place lot bid</button>
            {auctionId ? <CopyChip label="auction_id" value={auctionId} /> : null}
            {lotId ? <CopyChip label="lot_id" value={lotId} /> : null}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">Inspection + booking</span></div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={createInspection}>Request inspection</button>
            <button className="btn btn-ghost" type="button" onClick={evaluateDiscrepancy}>Evaluate discrepancy</button>
            <button className="btn btn-ghost" type="button" onClick={createBooking}>Create booking</button>
            {inspectionId ? <CopyChip label="inspection_id" value={inspectionId} /> : null}
            {bookingId ? <CopyChip label="booking_id" value={bookingId} /> : null}
          </div>
        </div>
      </div>

      <pre style={{ whiteSpace: "pre-wrap" }}>{output}</pre>
    </div>
  );
}
