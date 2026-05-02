"use client";

import { Clock, Gavel, ShoppingCart, Calendar } from "lucide-react";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { Button } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/cn";

type SaleMode = "fixed" | "bidding" | "auction";

type StickyBidPanelProps = {
  saleMode: SaleMode;
  unit: string;
  // Fixed
  price: number;
  quantity: number;
  // Bidding
  currentBid?: number | null;
  bidCount?: number | null;
  biddingEndsAt?: string | null;
  // Auction
  auctionSessionDate?: string | null;
  auctionDepositAmount?: number | null;
  // Actions
  onBuy?: () => void;
  onBid?: () => void;
  onRegister?: () => void;
};

function fmtCAD(amount: number): string {
  return amount.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
  });
}

/**
 * Side-rail panel that always surfaces the live price + countdown + primary
 * CTA, regardless of which sale mode the listing is in. The parent column
 * already opts into `lg:sticky lg:top-24` so this component renders inside
 * a sticky container.
 *
 * Replaces the stripped-down "Quick CTA repeat" block that previously lived
 * inline in apps/web-v2/src/app/(app)/listings/[id]/page.tsx.
 */
export function StickyBidPanel({
  saleMode,
  unit,
  price,
  quantity,
  currentBid,
  bidCount,
  biddingEndsAt,
  auctionSessionDate,
  auctionDepositAmount,
  onBuy,
  onBid,
  onRegister,
}: StickyBidPanelProps) {
  if (saleMode === "fixed") {
    return (
      <aside
        aria-label="Buy panel"
        className={cn(
          "rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white",
          "p-5 shadow-sm",
        )}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
          Fixed price
        </p>
        <p className="mt-1 text-2xl font-bold text-emerald-800">
          {fmtCAD(price)}{" "}
          <span className="text-sm font-semibold text-emerald-600">
            CAD / {unit}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-emerald-700">
          Order total {fmtCAD(price * quantity)} CAD ·{" "}
          {quantity.toLocaleString("en-CA")} {unit}
        </p>
        <Button
          variant="accent"
          className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700"
          onClick={onBuy}
        >
          <ShoppingCart className="h-4 w-4" />
          Buy now
        </Button>
        <p className="mt-3 text-[11px] text-emerald-700/80">
          Funds held in escrow. Released after delivery + buyer acceptance.
        </p>
      </aside>
    );
  }

  if (saleMode === "bidding") {
    return (
      <aside
        aria-label="Bidding panel"
        className={cn(
          "rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/80 to-white",
          "p-5 shadow-sm",
        )}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
          Live bidding
        </p>
        <p className="mt-1 text-2xl font-bold text-brand-800">
          {fmtCAD(currentBid ?? price)}{" "}
          <span className="text-sm font-normal text-brand-500">CAD</span>
        </p>
        <p className="mt-0.5 text-xs text-brand-700">
          {bidCount ?? 0} bid{bidCount === 1 ? "" : "s"} placed
        </p>
        {biddingEndsAt && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 ring-1 ring-brand-100">
            <Clock className="h-4 w-4 text-brand-500" />
            <span className="text-xs text-brand-700">Ends in</span>
            <CountdownTimer
              targetDate={biddingEndsAt}
              className="ml-auto text-sm font-semibold text-brand-800"
            />
          </div>
        )}
        <Button variant="primary" className="mt-4 w-full" onClick={onBid}>
          <Gavel className="h-4 w-4" />
          Place bid
        </Button>
        <p className="mt-3 text-[11px] text-brand-700/80">
          Outbid alerts sent by email. Top bid at close wins.
        </p>
      </aside>
    );
  }

  // auction
  return (
    <aside
      aria-label="Auction panel"
      className={cn(
        "rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white",
        "p-5 shadow-sm",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
        Live auction session
      </p>
      {auctionSessionDate && (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-base font-bold text-amber-800">
            <Calendar className="h-4 w-4" />
            {new Date(auctionSessionDate).toLocaleDateString("en-CA", {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 ring-1 ring-amber-200">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-amber-700">Starts in</span>
            <CountdownTimer
              targetDate={auctionSessionDate}
              className="ml-auto text-sm font-semibold text-amber-800"
            />
          </div>
        </>
      )}
      {typeof auctionDepositAmount === "number" && auctionDepositAmount > 0 && (
        <p className="mt-3 text-xs text-amber-800">
          Refundable deposit:{" "}
          <span className="font-semibold">{fmtCAD(auctionDepositAmount)}</span>{" "}
          CAD
        </p>
      )}
      <Button
        variant="accent"
        className="mt-4 w-full bg-amber-500 hover:bg-amber-600"
        onClick={onRegister}
      >
        Register + pay deposit
      </Button>
      <p className="mt-3 text-[11px] text-amber-800/80">
        Deposit refunded if you don&apos;t win. Lost-bid deposits returned within 3
        business days.
      </p>
    </aside>
  );
}
