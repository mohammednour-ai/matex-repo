"use client";

import { useState } from "react";
import { addTrackedId, callGatewayTool, formatResult, readTrackedIds, requiredMessage } from "../harness-client";
import { CopyChip, StatusBanner, ValidationSummary } from "../harness-ui";
import { PageIntro, Panel } from "../ui";

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
    const result = await run("kyc.start_verification", { user_id: userId, verification_type: "business" }, "kyc.start_verification");
    if (result.payload.success) {
      const id = String((result.payload.data?.verification_id as string | undefined) ?? "");
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
      const id = String((result.payload.data?.escrow_id as string | undefined) ?? "");
      setEscrowId(id);
      addTrackedId("escrowIds", id);
    }
  }

  async function holdEscrow() {
    const missing = requiredMessage([["escrow_id", escrowId]]);
    setValidation(missing);
    if (missing) return;
    await run("escrow.hold_funds", { escrow_id: escrowId }, "escrow.hold_funds");
  }

  async function releaseEscrow() {
    const missing = requiredMessage([["escrow_id", escrowId]]);
    setValidation(missing);
    if (missing) return;
    await run("escrow.release_funds", { escrow_id: escrowId }, "escrow.release_funds");
  }

  async function createAuction() {
    const result = await run("auction.create_auction", { seller_id: userId, title: `UI Auction ${Date.now()}` }, "auction.create_auction");
    if (result.payload.success) {
      const id = String((result.payload.data?.auction_id as string | undefined) ?? "");
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
      const id = String((result.payload.data?.lot_id as string | undefined) ?? "");
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
    const missing = requiredMessage([["listing_id", listingId], ["requester_id", userId]]);
    setValidation(missing);
    if (missing) return;
    const result = await run("inspection.request_inspection", { listing_id: listingId, requester_id: userId }, "inspection.request_inspection");
    if (result.payload.success) {
      const id = String((result.payload.data?.inspection_id as string | undefined) ?? "");
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
    const result = await run("booking.create_booking", { user_id: userId, title: "UI pickup booking", scheduled_for: new Date(Date.now() + 86400000).toISOString() }, "booking.create_booking");
    if (result.payload.success) {
      const id = String((result.payload.data?.booking_id as string | undefined) ?? "");
      setBookingId(id);
      addTrackedId("bookingIds", id);
    }
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="Phase 2 trust workflows" title="KYC, escrow, auction, inspection, booking" description="Interactive trust-workflow surface for manual demos and validation." />
      <StatusBanner tone={status} text={status === "success" ? "Last action succeeded." : status === "error" ? "Last action failed." : "Waiting for action."} />
      <ValidationSummary message={validation} />

      <Panel title="KYC" eyebrow="Trust step 1">
        <div className="tag-row">
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user_id" />
          <button className="ghost-button" type="button" onClick={startKyc}>Start verification</button>
          <button className="ghost-button" type="button" onClick={reviewKyc}>Review verified</button>
          {verificationId ? <CopyChip label="verification_id" value={verificationId} /> : null}
        </div>
      </Panel>

      <Panel title="Escrow" eyebrow="Trust step 2">
        <div className="tag-row">
          <button className="ghost-button" type="button" onClick={createEscrow}>Create escrow</button>
          <button className="ghost-button" type="button" onClick={holdEscrow}>Hold funds</button>
          <button className="ghost-button" type="button" onClick={releaseEscrow}>Release funds</button>
          {escrowId ? <CopyChip label="escrow_id" value={escrowId} /> : null}
        </div>
      </Panel>

      <Panel title="Auction + bids" eyebrow="Trust step 3">
        <div className="tag-row">
          <button className="ghost-button" type="button" onClick={createAuction}>Create auction</button>
          <button className="ghost-button" type="button" onClick={addLot}>Add lot</button>
          <button className="ghost-button" type="button" onClick={bidLot}>Place lot bid</button>
          {auctionId ? <CopyChip label="auction_id" value={auctionId} /> : null}
          {lotId ? <CopyChip label="lot_id" value={lotId} /> : null}
        </div>
      </Panel>

      <Panel title="Inspection + booking" eyebrow="Trust step 4">
        <div className="tag-row">
          <button className="ghost-button" type="button" onClick={createInspection}>Request inspection</button>
          <button className="ghost-button" type="button" onClick={evaluateDiscrepancy}>Evaluate discrepancy</button>
          <button className="ghost-button" type="button" onClick={createBooking}>Create booking</button>
          {inspectionId ? <CopyChip label="inspection_id" value={inspectionId} /> : null}
          {bookingId ? <CopyChip label="booking_id" value={bookingId} /> : null}
        </div>
      </Panel>

      <pre>{output}</pre>
    </div>
  );
}
