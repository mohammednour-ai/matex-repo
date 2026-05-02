"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Share2,
  Flag,
  Star,
  ShieldCheck,
  Package,
  Truck,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Info,
  CreditCard,
  FileText,
  Download,
  Leaf,
  Scale,
  MessageSquare,
  Play,
  X,
  MapPin,
  Clock,
} from "lucide-react";
import clsx from "clsx";
import { callTool, getUser, extractId } from "@/lib/api";
import { Badge } from "@/components/ui/shadcn/badge";
import { Modal } from "@/components/ui/shadcn/modal";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { ConfidenceStack } from "@/components/listings/ConfidenceStack";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SaleMode = "fixed" | "bidding" | "auction";

type EnvironmentalPermit = {
  permit_type: string;
  number: string;
  expiry: string;
};

type Listing = {
  listing_id: string;
  title: string;
  description: string;
  sale_mode: SaleMode;
  price: number;
  unit: string;
  quantity: number;
  currency: string;
  material_category: string;
  material_grade: string;
  contamination_pct: number;
  moisture_pct: number;
  hazmat_class: string;
  inspection_required: boolean;
  seller_id: string;
  seller_name: string;
  seller_province: string;
  seller_kyc_level: number;
  seller_pis_score: number;
  created_at: string;
  photos: string[];
  video_url?: string;
  certifications: string[];
  chain_of_custody: string;
  environmental_classification: string;
  environmental_permits: EnvironmentalPermit[];
  // Bidding
  current_bid?: number;
  bid_count?: number;
  bidding_ends_at?: string;
  // Auction
  auction_session_id?: string;
  auction_session_date?: string;
  auction_deposit_amount?: number;
};

type ShippingQuote = {
  carrier_name: string;
  carrier_logo?: string;
  price: number;
  transit_days: number;
  co2_emissions_kg: number;
  service_level: string;
};

type InspectionSlot = {
  slot_id: string;
  date: string;
  time: string;
  available: boolean;
};

type TaxEstimate = {
  subtotal: number;
  gst?: number;
  hst?: number;
  pst?: number;
  qst?: number;
  total_tax: number;
  total: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtCAD(amount: number): string {
  return amount.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function pisStars(score: number): number {
  if (score >= 90) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 25) return 2;
  return 1;
}

const HAZMAT_LABELS: Record<string, string> = {
  none: "None",
  class_8: "Class 8 — Corrosives",
  class_9: "Class 9 — Miscellaneous",
};

const ENV_CLASS_CONFIG: Record<string, { label: string; variant: "success" | "warning" | "danger" }> = {
  non_hazardous: { label: "Non-Hazardous", variant: "success" },
  potentially_hazardous: { label: "Potentially Hazardous", variant: "warning" },
  hazardous: { label: "Hazardous", variant: "danger" },
};

// ---------------------------------------------------------------------------
// Photo Gallery
// ---------------------------------------------------------------------------
function PhotoGallery({ photos, videoUrl, title }: { photos: string[]; videoUrl?: string; title: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const media = [...photos];

  const goTo = (idx: number) => setActiveIdx(Math.max(0, Math.min(idx, media.length - 1)));

  return (
    <div className="space-y-2">
      {/* Main view */}
      <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-gray-100">
        {showVideo && videoUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-black">
            <video controls autoPlay className="w-full h-full object-contain">
              <source src={videoUrl} />
            </video>
            <button
              onClick={() => setShowVideo(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>
        ) : media[activeIdx] ? (
          <img src={media[activeIdx]} alt={`${title} — photo ${activeIdx + 1}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
            <Package size={48} className="text-slate-400" />
          </div>
        )}

        {/* Prev / Next arrows */}
        {media.length > 1 && (
          <>
            <button
              onClick={() => goTo(activeIdx - 1)}
              disabled={activeIdx === 0}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 shadow flex items-center justify-center disabled:opacity-30 hover:bg-white transition"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => goTo(activeIdx + 1)}
              disabled={activeIdx === media.length - 1}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 shadow flex items-center justify-center disabled:opacity-30 hover:bg-white transition"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {/* Video play button overlay */}
        {videoUrl && !showVideo && (
          <button
            onClick={() => setShowVideo(true)}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/60 text-white text-xs font-medium px-3 py-1.5 rounded-full hover:bg-black/80 transition"
          >
            <Play size={12} fill="white" />
            Watch Video
          </button>
        )}

        {/* Photo counter */}
        {media.length > 0 && (
          <span className="absolute bottom-3 left-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
            {activeIdx + 1} / {media.length}
          </span>
        )}
      </div>

      {/* Thumbnails */}
      {media.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {media.map((src, i) => (
            <button
              key={i}
              onClick={() => { setActiveIdx(i); setShowVideo(false); }}
              className={clsx(
                "w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all",
                i === activeIdx && !showVideo ? "border-brand-600" : "border-transparent hover:border-gray-300"
              )}
            >
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
          {videoUrl && (
            <button
              onClick={() => setShowVideo(true)}
              className={clsx(
                "w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 bg-gray-900 flex items-center justify-center transition-all",
                showVideo ? "border-brand-600" : "border-transparent hover:border-gray-300"
              )}
            >
              <Play size={20} className="text-white" fill="white" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bid Modal
// ---------------------------------------------------------------------------
function BidModal({
  open,
  onClose,
  listing,
  onBidPlaced,
}: {
  open: boolean;
  onClose: () => void;
  listing: Listing;
  onBidPlaced: () => void;
}) {
  const minBid = (listing.current_bid ?? listing.price) + 1;
  const [bidAmount, setBidAmount] = useState(String(minBid));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleConfirm() {
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount < minBid) {
      setError(`Bid must be at least ${fmtCAD(minBid)} CAD`);
      return;
    }
    setError("");
    setLoading(true);
    const res = await callTool("bidding.place_bid", {
      listing_id: listing.listing_id,
      amount,
      bid_type: "manual",
    });
    setLoading(false);
    if (res.success) {
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onBidPlaced(); onClose(); }, 1500);
    } else {
      setError(res.error?.message ?? "Failed to place bid. Please try again.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Place a Bid" size="sm">
      <div className="space-y-4">
        {/* Current bid info */}
        <div className="bg-brand-50 rounded-lg p-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Current highest bid</span>
            <span className="font-bold text-brand-700">{fmtCAD(listing.current_bid ?? listing.price)} CAD</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-gray-600">Minimum bid</span>
            <span className="font-semibold text-gray-800">{fmtCAD(minBid)} CAD</span>
          </div>
          {listing.bidding_ends_at && (
            <div className="flex justify-between items-center mt-1">
              <span className="text-gray-600">Ends in</span>
              <CountdownTimer targetDate={listing.bidding_ends_at} />
            </div>
          )}
        </div>

        {/* Bid input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your Maximum Bid (CAD)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">$</span>
            <input
              type="number"
              min={minBid}
              step={1}
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          {error && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertTriangle size={11} />{error}</p>}
        </div>

        <p className="text-xs text-gray-500">
          By placing a bid you agree to purchase at this price if you win. Bid deposits may be required for high-value auctions.
        </p>

        {success ? (
          <div className="flex items-center justify-center gap-2 py-2 text-emerald-600 font-semibold text-sm">
            <CheckCircle size={18} /> Bid placed successfully!
          </div>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Placing bid…" : "Confirm Bid"}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Auction Register Modal
// ---------------------------------------------------------------------------
function AuctionRegisterModal({
  open,
  onClose,
  listing,
}: {
  open: boolean;
  onClose: () => void;
  listing: Listing;
}) {
  const [paymentMethod, setPaymentMethod] = useState("wallet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const deposit = listing.auction_deposit_amount ?? 500;

  async function handleRegister() {
    setError("");
    setLoading(true);
    const res = await callTool("auction.register_bidder", {
      session_id: listing.auction_session_id,
      listing_id: listing.listing_id,
      deposit_amount: deposit,
      payment_method: paymentMethod,
    });
    setLoading(false);
    if (res.success) {
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onClose(); }, 2000);
    } else {
      setError(res.error?.message ?? "Registration failed. Please try again.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Register for Auction" size="md">
      <div className="space-y-4">
        {/* Session info */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          <p className="font-semibold text-amber-800">{listing.title}</p>
          {listing.auction_session_date && (
            <p className="text-amber-700 mt-1">
              <Calendar size={12} className="inline mr-1" />
              Session: {new Date(listing.auction_session_date).toLocaleDateString("en-CA", {
                weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* Deposit */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Refundable Deposit</span>
            <span className="font-bold text-gray-900">{fmtCAD(deposit)} CAD</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Refunded within 24 hours if you do not win.</p>
        </div>

        {/* Payment method */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
          <div className="space-y-2">
            {["wallet", "credit_card", "bank_transfer"].map((method) => (
              <label key={method} className="flex items-center gap-3 p-2.5 border border-gray-200 rounded-lg cursor-pointer hover:border-brand-400 transition-colors">
                <input
                  type="radio"
                  name="payment_method"
                  value={method}
                  checked={paymentMethod === method}
                  onChange={() => setPaymentMethod(method)}
                  className="text-brand-600 focus:ring-brand-400"
                />
                <CreditCard size={16} className="text-gray-400" />
                <span className="text-sm text-gray-700 capitalize">{method.replace("_", " ")}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Terms */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <a href="#" className="flex items-center gap-1 text-brand-600 hover:underline font-medium">
            <Download size={12} /> Download Terms &amp; Conditions PDF
          </a>
        </div>

        {error && (
          <p className="text-xs text-red-600 flex items-center gap-1 bg-red-50 p-2 rounded-lg">
            <AlertTriangle size={12} /> {error}
          </p>
        )}

        {success ? (
          <div className="flex items-center justify-center gap-2 py-2 text-emerald-600 font-semibold text-sm">
            <CheckCircle size={18} /> Registered successfully!
          </div>
        ) : (
          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full py-2.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Processing…" : `Pay Deposit ${fmtCAD(deposit)} & Register`}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Buy Now Modal
// ---------------------------------------------------------------------------
function BuyNowModal({
  open,
  onClose,
  listing,
  taxEstimate,
  shippingEstimate,
}: {
  open: boolean;
  onClose: () => void;
  listing: Listing;
  taxEstimate: TaxEstimate | null;
  shippingEstimate: number;
}) {
  const subtotal = listing.price * listing.quantity;
  const commissionRate = 0.035;
  const commissionCents = Math.round(subtotal * 100 * commissionRate);
  const commission = commissionCents / 100;
  const tax = taxEstimate?.total_tax ?? 0;
  const total = subtotal + commission + tax + shippingEstimate;

  return (
    <Modal open={open} onClose={onClose} title="Order Summary" size="md">
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <p className="font-semibold text-gray-900 mb-2">{listing.title}</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-gray-600">
              <span>Listing price ({listing.quantity.toLocaleString()} {listing.unit})</span>
              <span className="font-medium text-gray-800">{fmtCAD(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Tax (est.)</span>
              <span>{fmtCAD(tax)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Shipping (est.)</span>
              <span>{shippingEstimate > 0 ? fmtCAD(shippingEstimate) : "TBD"}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Matex Commission (3.5%)</span>
              <span>{fmtCAD(commission)}</span>
            </div>
            <div className="border-t border-gray-200 pt-1.5 mt-1.5 flex justify-between font-bold text-gray-900">
              <span>Total Estimate</span>
              <span className="text-brand-600">{fmtCAD(total)}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 flex items-start gap-1.5">
          <Info size={12} className="flex-shrink-0 mt-0.5 text-brand-500" />
          Final amounts may vary based on actual weight, carrier selection, and applicable taxes at checkout.
        </p>

        <Link
          href={`/checkout?listing=${listing.listing_id}`}
          className="block w-full py-2.5 text-center text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          onClick={onClose}
        >
          Proceed to Checkout →
        </Link>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Inspection Booking Card
// ---------------------------------------------------------------------------
function InspectionBookingCard({ listingId }: { listingId: string }) {
  const [slots, setSlots] = useState<InspectionSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSlots() {
      setLoading(true);
      const res = await callTool("booking.get_available_slots", {
        listing_id: listingId,
        event_type: "third_party_inspection",
      });
      if (res.success && Array.isArray(res.data)) {
        setSlots(res.data as InspectionSlot[]);
      }
      setLoading(false);
    }
    loadSlots();
  }, [listingId]);

  async function handleBook() {
    if (!selectedSlot) return;
    setBooking(true);
    setError("");
    const res = await callTool("booking.create_booking", {
      listing_id: listingId,
      slot_id: selectedSlot,
      event_type: "third_party_inspection",
    });
    setBooking(false);
    if (res.success) {
      setBooked(true);
    } else {
      setError(res.error?.message ?? "Booking failed. Please try again.");
    }
  }

  if (booked) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-emerald-800 text-sm">Inspection Booked</p>
          <p className="text-xs text-emerald-700 mt-0.5">You'll receive a confirmation email shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-brand-600" />
        <h4 className="font-semibold text-gray-900 text-sm">Book Inspection</h4>
        <Badge variant="warning">Required</Badge>
      </div>

      {loading && (
        <div className="text-xs text-gray-400 animate-pulse py-2">Loading available slots…</div>
      )}

      {!loading && slots.length === 0 && (
        <p className="text-xs text-gray-500">No slots currently available. Contact the seller to arrange an inspection.</p>
      )}

      {!loading && slots.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {slots.map((slot) => (
            <button
              key={slot.slot_id}
              disabled={!slot.available}
              onClick={() => setSelectedSlot(slot.slot_id)}
              className={clsx(
                "w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors",
                !slot.available && "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-400",
                slot.available && selectedSlot === slot.slot_id
                  ? "border-brand-600 bg-brand-50 text-brand-800 font-medium"
                  : slot.available
                  ? "border-gray-200 hover:border-brand-400 text-gray-700"
                  : ""
              )}
            >
              <span className="font-medium">{new Date(slot.date).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="ml-2 text-gray-500">{slot.time}</span>
              {!slot.available && <span className="ml-2 text-gray-400">— Unavailable</span>}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={handleBook}
        disabled={!selectedSlot || booking}
        className="w-full py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-40"
      >
        {booking ? "Booking…" : "Book Inspection"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seller Card
// ---------------------------------------------------------------------------
function SellerCard({
  listing,
  onMessage,
  onSave,
  saved,
}: {
  listing: Listing;
  onMessage: () => void;
  onSave: () => void;
  saved: boolean;
}) {
  const stars = pisStars(listing.seller_pis_score);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      {/* Company */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Package size={18} className="text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{listing.seller_name}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <MapPin size={11} className="text-gray-400" />
            <span className="text-xs text-gray-500">{listing.seller_province}</span>
          </div>
        </div>
      </div>

      {/* KYC + PIS */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">
          <ShieldCheck size={11} />
          KYC L{listing.seller_kyc_level}
        </div>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={12}
              className={i < stars ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}
            />
          ))}
          <span className="text-xs text-gray-500 ml-1">({listing.seller_pis_score}/100)</span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={onMessage}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
        >
          <MessageSquare size={14} />
          Message Seller
        </button>
        <button
          onClick={onSave}
          className={clsx(
            "w-full flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg border transition-colors",
            saved
              ? "text-red-600 border-red-200 bg-red-50 hover:bg-red-100"
              : "text-gray-600 border-gray-200 bg-white hover:bg-gray-50"
          )}
        >
          <Heart size={14} className={saved ? "fill-red-500" : ""} />
          {saved ? "Saved" : "Save Listing"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price Breakdown Card
// ---------------------------------------------------------------------------
function PriceBreakdownCard({
  listing,
  taxEstimate,
  lowestShipping,
}: {
  listing: Listing;
  taxEstimate: TaxEstimate | null;
  lowestShipping: number;
}) {
  const subtotal = listing.price * listing.quantity;
  const commissionCents = Math.round(subtotal * 100 * 0.035);
  const commission = commissionCents / 100;
  const tax = taxEstimate?.total_tax ?? 0;
  const total = subtotal + commission + tax + (lowestShipping > 0 ? lowestShipping : 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
        <CreditCard size={15} className="text-brand-600" />
        Price Breakdown
      </h4>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Listing Price</span>
          <span className="font-medium text-gray-800">{fmtCAD(subtotal)} CAD</span>
        </div>
        {taxEstimate && (
          <>
            {taxEstimate.hst !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-500">HST</span>
                <span className="text-gray-700">{fmtCAD(taxEstimate.hst)}</span>
              </div>
            )}
            {taxEstimate.gst !== undefined && !taxEstimate.hst && (
              <div className="flex justify-between">
                <span className="text-gray-500">GST</span>
                <span className="text-gray-700">{fmtCAD(taxEstimate.gst)}</span>
              </div>
            )}
            {taxEstimate.pst !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-500">PST</span>
                <span className="text-gray-700">{fmtCAD(taxEstimate.pst)}</span>
              </div>
            )}
            {taxEstimate.qst !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-500">QST</span>
                <span className="text-gray-700">{fmtCAD(taxEstimate.qst)}</span>
              </div>
            )}
          </>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">Shipping (est.)</span>
          <span className="text-gray-700">{lowestShipping > 0 ? fmtCAD(lowestShipping) : "TBD"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500 flex items-center gap-1">
            Matex Commission
            <span className="text-xs bg-gray-100 px-1 rounded">3.5%</span>
          </span>
          <span className="text-gray-700">{fmtCAD(commission)}</span>
        </div>
        <div className="border-t border-gray-100 pt-2 flex justify-between font-bold">
          <span className="text-gray-700">Total Estimate</span>
          <span className="text-brand-600 text-base">{fmtCAD(total)}</span>
        </div>
      </div>
      <p className="text-[10px] text-gray-400 leading-relaxed">
        * Estimate only. Final price confirmed at checkout based on actual weight, selected carrier, and applicable taxes.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shipping Quotes Table
// ---------------------------------------------------------------------------
function ShippingQuotesTable({ quotes }: { quotes: ShippingQuote[] }) {
  if (quotes.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-3 py-2 font-semibold">Carrier</th>
            <th className="px-3 py-2 font-semibold">Service</th>
            <th className="px-3 py-2 font-semibold text-right">Price (CAD)</th>
            <th className="px-3 py-2 font-semibold text-right">Transit</th>
            <th className="px-3 py-2 font-semibold text-right">CO₂ (kg)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {quotes.map((q, i) => (
            <tr key={i} className="hover:bg-gray-50 transition-colors">
              <td className="px-3 py-2.5 font-medium text-gray-800">{q.carrier_name}</td>
              <td className="px-3 py-2.5 text-gray-600">{q.service_level}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-brand-600">{fmtCAD(q.price)}</td>
              <td className="px-3 py-2.5 text-right text-gray-600">{q.transit_days}d</td>
              <td className="px-3 py-2.5 text-right text-gray-600 flex items-center justify-end gap-1">
                <Leaf size={11} className="text-emerald-500" />
                {q.co2_emissions_kg.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------
function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex gap-6">
        <div className="flex-1 space-y-4">
          <div className="aspect-[16/9] rounded-xl bg-gray-100" />
          <div className="h-6 bg-gray-100 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="h-32 bg-gray-100 rounded" />
        </div>
        <div className="w-80 flex-shrink-0 space-y-4">
          <div className="h-40 bg-gray-100 rounded-xl" />
          <div className="h-32 bg-gray-100 rounded-xl" />
          <div className="h-48 bg-gray-100 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = String(params.id ?? "");

  const [listing, setListing] = useState<Listing | null>(null);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [taxEstimate, setTaxEstimate] = useState<TaxEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState(false);

  // Modals
  const [bidModal, setBidModal] = useState(false);
  const [auctionModal, setAuctionModal] = useState(false);
  const [buyModal, setBuyModal] = useState(false);

  const lowestShipping = quotes.length > 0 ? Math.min(...quotes.map((q) => q.price)) : 0;

  const loadData = useCallback(async () => {
    setLoading(true);

    // Fetch listing
    const listingRes = await callTool("listing.get_listing", { listing_id: listingId });
    if (!listingRes.success || !listingRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const upRes = (listingRes.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
    const raw = (upRes?.listing ?? upRes ?? listingRes.data) as Record<string, unknown>;
    const listingData: Listing = {
      ...(raw as unknown as Listing),
      price: Number(raw.asking_price ?? raw.price ?? 0),
      quantity: Number(raw.quantity ?? 1),
      created_at: String(raw.created_at ?? new Date().toISOString()),
    };
    setListing(listingData);

    // Fetch highest bid (for bidding listings)
    if (listingData.sale_mode === "bidding") {
      const bidRes = await callTool("bidding.get_highest_bid", { listing_id: listingId });
      if (bidRes.success && bidRes.data) {
        const bidData = bidRes.data as Record<string, unknown>;
        setListing((prev) =>
          prev
            ? { ...prev, current_bid: bidData.amount as number, bid_count: bidData.bid_count as number }
            : prev
        );
      }
    }

    // Fetch shipping quotes
    const quotesRes = await callTool("logistics.get_quotes", {
      listing_id: listingId,
      origin_province: listingData.seller_province,
    });
    if (quotesRes.success && Array.isArray(quotesRes.data)) {
      const quotesData = quotesRes.data as ShippingQuote[];
      const sorted = [...quotesData].sort((a, b) => a.price - b.price);
      setQuotes(sorted.slice(0, 3));
    }

    // Fetch tax estimate
    const user = getUser();
    if (user) {
      const taxRes = await callTool("tax.calculate_tax", {
        listing_id: listingId,
        amount: listingData.price * listingData.quantity,
        seller_province: listingData.seller_province,
      });
      if (taxRes.success && taxRes.data) {
        setTaxEstimate(taxRes.data as unknown as TaxEstimate);
      }
    }

    setLoading(false);
  }, [listingId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleMessageSeller() {
    if (!listing) return;
    const res = await callTool("messaging.create_thread", {
      listing_id: listingId,
      subject: `Inquiry about: ${listing.title}`,
    });
    if (res.success) {
      const threadId = extractId(res, "thread_id");
      router.push(threadId ? `/messages?thread=${threadId}` : "/messages");
    }
  }

  async function handleSaveListing() {
    await callTool("listing.add_favorite", { listing_id: listingId });
    setSaved((s) => !s);
  }

  if (loading) {
    return (
      <div>
        <div className="mb-4">
          <Link href="/search" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 transition-colors">
            <ChevronLeft size={15} /> Back to Search
          </Link>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  if (notFound || !listing) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Package size={28} className="text-gray-400" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Listing Not Found</h3>
        <p className="text-sm text-gray-500 mb-4">This listing may have been removed or is no longer available.</p>
        <Link href="/search" className="text-sm font-medium text-brand-600 hover:underline">
          Browse all materials →
        </Link>
      </div>
    );
  }

  const envConfig = ENV_CLASS_CONFIG[listing.environmental_classification] ?? ENV_CLASS_CONFIG.non_hazardous;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm text-gray-500">
        <Link href="/search" className="hover:text-brand-600 transition-colors flex items-center gap-1">
          <ChevronLeft size={14} /> Search
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-500">{listing.material_category}</span>
        <span className="text-gray-300">/</span>
        <span className="text-gray-800 font-medium truncate max-w-xs">{listing.title}</span>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ======== LEFT COLUMN (2/3) ======== */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Gallery */}
          <PhotoGallery photos={listing.photos ?? []} videoUrl={listing.video_url} title={listing.title} />

          {/* Title + meta */}
          <div>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <h1 className="app-inpage-title leading-tight">{listing.title}</h1>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <Badge variant={envConfig.variant}>{envConfig.label}</Badge>
                  {listing.hazmat_class && listing.hazmat_class !== "none" && (
                    <Badge variant="danger">
                      <AlertTriangle size={10} className="inline mr-1" />
                      {HAZMAT_LABELS[listing.hazmat_class] ?? listing.hazmat_class}
                    </Badge>
                  )}
                  <span className="text-xs text-gray-400">
                    Listed {new Date(listing.created_at).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}
                  </span>
                </div>
              </div>

              {/* Share / Report */}
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors" aria-label="Share">
                  <Share2 size={15} />
                </button>
                <button className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors" aria-label="Report">
                  <Flag size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Sale mode banner */}
          <div className={clsx(
            "rounded-xl p-4 border",
            listing.sale_mode === "fixed" && "bg-emerald-50 border-emerald-200",
            listing.sale_mode === "bidding" && "bg-brand-50 border-brand-200",
            listing.sale_mode === "auction" && "bg-amber-50 border-amber-200",
          )}>
            {listing.sale_mode === "fixed" && (
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-sm text-emerald-700 font-medium">Fixed Price</p>
                  <p className="text-3xl font-bold text-emerald-800 mt-1">
                    {fmtCAD(listing.price)} <span className="text-base font-semibold text-emerald-600">CAD / {listing.unit}</span>
                  </p>
                  <p className="text-sm text-emerald-600 mt-0.5">
                    {listing.quantity.toLocaleString()} {listing.unit} available
                  </p>
                </div>
                <button
                  onClick={() => setBuyModal(true)}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors text-sm shadow-sm"
                >
                  Buy Now for {fmtCAD(listing.price * listing.quantity)} CAD
                </button>
              </div>
            )}

            {listing.sale_mode === "bidding" && (
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-sm text-brand-700 font-medium">Live Bidding</p>
                  <p className="text-2xl font-bold text-brand-800 mt-1">
                    {fmtCAD(listing.current_bid ?? listing.price)} CAD
                    <span className="text-sm font-normal text-brand-500 ml-2">current bid</span>
                  </p>
                  <p className="text-sm text-brand-600 mt-0.5">{listing.bid_count ?? 0} bids placed</p>
                  {listing.bidding_ends_at && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <Clock size={13} className="text-brand-500" />
                      <span className="text-sm text-brand-700">Ends in:</span>
                      <CountdownTimer targetDate={listing.bidding_ends_at} className="text-brand-800" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setBidModal(true)}
                    className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors text-sm shadow-sm"
                  >
                    Place Bid
                  </button>
                </div>
              </div>
            )}

            {listing.sale_mode === "auction" && (
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-sm text-amber-700 font-medium">Live Auction Session</p>
                  {listing.auction_session_date && (
                    <>
                      <p className="text-base font-bold text-amber-800 mt-1">
                        <Calendar size={15} className="inline mr-1" />
                        {new Date(listing.auction_session_date).toLocaleDateString("en-CA", {
                          weekday: "long", year: "numeric", month: "long", day: "numeric",
                        })}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock size={13} className="text-amber-500" />
                        <span className="text-sm text-amber-700">Starts in:</span>
                        <CountdownTimer targetDate={listing.auction_session_date} className="text-amber-800" />
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setAuctionModal(true)}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors text-sm shadow-sm"
                >
                  Register + Pay Deposit
                </button>
              </div>
            )}
          </div>

          {/* Material Specifications */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <Scale size={15} className="text-brand-600" />
              <h3 className="font-semibold text-gray-900 text-sm">Material Specifications</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { label: "Category", value: listing.material_category },
                { label: "Grade", value: listing.material_grade },
                { label: "Contamination", value: `${listing.contamination_pct?.toFixed(1) ?? "N/A"}%` },
                { label: "Moisture", value: `${listing.moisture_pct?.toFixed(1) ?? "N/A"}%` },
                { label: "Quantity", value: `${listing.quantity?.toLocaleString()} ${listing.unit}` },
                { label: "Hazmat Class", value: HAZMAT_LABELS[listing.hazmat_class] ?? listing.hazmat_class ?? "None" },
                { label: "Inspection Required", value: listing.inspection_required ? "Yes — Third-party inspection" : "No" },
              ].map(({ label, value }) => (
                <div key={label} className="flex px-4 py-2.5 text-sm">
                  <span className="w-44 flex-shrink-0 text-gray-500 font-medium">{label}</span>
                  <span className="text-gray-800">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chain of Custody */}
          {listing.chain_of_custody && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <FileText size={15} className="text-brand-600" />
                Chain of Custody
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{listing.chain_of_custody}</p>
            </div>
          )}

          {/* Certifications */}
          {listing.certifications?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <ShieldCheck size={15} className="text-brand-600" />
                Certifications
              </h3>
              <div className="flex flex-wrap gap-2">
                {listing.certifications.map((cert) => (
                  <span key={cert} className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                    <CheckCircle size={10} />
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Environmental Permits */}
          {listing.environmental_permits?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <Leaf size={15} className="text-emerald-600" />
                Environmental Permits
              </h3>
              <div className="space-y-2">
                {listing.environmental_permits.map((permit, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                    <div>
                      <span className="font-medium text-gray-800 capitalize">{permit.permit_type.replace("_", " ")}</span>
                      <span className="text-gray-500 ml-2">#{permit.number}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-500">
                      <Calendar size={10} />
                      Expires: {new Date(permit.expiry).toLocaleDateString("en-CA")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inspection Notice */}
          {listing.inspection_required && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 text-sm">Inspection Required</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  This listing requires a third-party inspection before funds are released. You can book an inspection slot in the sidebar. Minimum 48-hour lead time required.
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <Info size={15} className="text-brand-600" />
              Description
            </h3>
            <ExpandableText text={listing.description} />
          </div>

          {/* Shipping estimates */}
          {quotes.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <Truck size={15} className="text-brand-600" />
                <h3 className="font-semibold text-gray-900 text-sm">Shipping Estimates</h3>
                <span className="text-xs text-gray-400 ml-auto">From {listing.seller_province}</span>
              </div>
              <div className="p-1">
                <ShippingQuotesTable quotes={quotes} />
              </div>
            </div>
          )}
        </div>

        {/* ======== RIGHT COLUMN (1/3) ======== */}
        <div className="w-full lg:w-80 flex-shrink-0 space-y-4 lg:sticky lg:top-24">

          {/* Trust signals — first thing a buyer sees in the side rail. */}
          <ConfidenceStack
            sellerKycLevel={listing.seller_kyc_level}
            photosCount={(listing.photos ?? []).length}
            certifications={listing.certifications ?? []}
            inspectionRequired={listing.inspection_required}
            lmeReferenceCadPerMt={null}
          />

          {/* Seller card */}
          <SellerCard
            listing={listing}
            onMessage={handleMessageSeller}
            onSave={handleSaveListing}
            saved={saved}
          />

          {/* Inspection booking (if required) */}
          {listing.inspection_required && (
            <InspectionBookingCard listingId={listingId} />
          )}

          {/* Price breakdown */}
          <PriceBreakdownCard
            listing={listing}
            taxEstimate={taxEstimate}
            lowestShipping={lowestShipping}
          />

          {/* Quick CTA repeat */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
            {listing.sale_mode === "fixed" && (
              <button
                onClick={() => setBuyModal(true)}
                className="w-full py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Buy Now
              </button>
            )}
            {listing.sale_mode === "bidding" && (
              <button
                onClick={() => setBidModal(true)}
                className="w-full py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
              >
                Place Bid
              </button>
            )}
            {listing.sale_mode === "auction" && (
              <button
                onClick={() => setAuctionModal(true)}
                className="w-full py-2.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors"
              >
                Register for Auction
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {bidModal && listing.sale_mode === "bidding" && (
        <BidModal
          open={bidModal}
          onClose={() => setBidModal(false)}
          listing={listing}
          onBidPlaced={loadData}
        />
      )}
      {auctionModal && listing.sale_mode === "auction" && (
        <AuctionRegisterModal
          open={auctionModal}
          onClose={() => setAuctionModal(false)}
          listing={listing}
        />
      )}
      {buyModal && listing.sale_mode === "fixed" && (
        <BuyNowModal
          open={buyModal}
          onClose={() => setBuyModal(false)}
          listing={listing}
          taxEstimate={taxEstimate}
          shippingEstimate={lowestShipping}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable Text helper (inlined to keep single file)
// ---------------------------------------------------------------------------
function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text?.length > 400;
  const displayText = isLong && !expanded ? text.slice(0, 400) + "…" : text;

  if (!text) return <p className="text-sm text-gray-400 italic">No description provided.</p>;

  return (
    <div>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{displayText}</p>
      {isLong && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-xs font-medium text-brand-600 hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
