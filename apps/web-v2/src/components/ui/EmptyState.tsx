import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

type CTA = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type IconTone = "brand" | "neutral" | "success" | "warning" | "danger";

type EmptyStateProps = {
  /** Lucide icon — preferred. Renders as a centered icon-in-badge. */
  icon?: LucideIcon;
  /** Color tone for the icon-in-badge. Defaults to "brand". */
  iconTone?: IconTone;
  /** Raster/SVG illustration. Used only when `icon` is not provided. */
  image?: string;
  title: string;
  description?: string;
  cta?: CTA;
  secondaryCta?: CTA;
  className?: string;
  imageWidth?: number;
  imageHeight?: number;
  size?: "sm" | "md" | "lg";
};

const SIZE_CLASSES: Record<NonNullable<EmptyStateProps["size"]>, string> = {
  sm: "py-6 px-4",
  md: "py-10 px-6",
  lg: "py-16 px-8",
};

const IMAGE_SIZES: Record<NonNullable<EmptyStateProps["size"]>, { w: number; h: number }> = {
  sm: { w: 180, h: 110 },
  md: { w: 280, h: 170 },
  lg: { w: 380, h: 220 },
};

const ICON_BOX: Record<NonNullable<EmptyStateProps["size"]>, { box: string; px: number }> = {
  sm: { box: "h-12 w-12 rounded-xl", px: 22 },
  md: { box: "h-16 w-16 rounded-2xl", px: 30 },
  lg: { box: "h-20 w-20 rounded-2xl", px: 38 },
};

const TONE_CLASSES: Record<IconTone, string> = {
  brand:   "border-brand-500/40 bg-brand-500/15 text-brand-400",
  neutral: "border-line bg-elevated text-fg-subtle",
  success: "border-success-500/40 bg-success-500/15 text-success-400",
  warning: "border-warning-500/40 bg-warning-500/15 text-warning-400",
  danger:  "border-danger-500/40 bg-danger-500/15 text-danger-400",
};

function CTAButton({ cta, primary }: { cta: CTA; primary: boolean }) {
  const className = clsx(
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
    primary
      ? "bg-brand-600 text-white hover:bg-brand-700"
      : "border border-line bg-surfaceBg text-fg hover:bg-canvas"
  );

  if (cta.href) {
    return (
      <Link href={cta.href} className={className}>
        {cta.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={cta.onClick} className={className}>
      {cta.label}
    </button>
  );
}

export function EmptyState({
  icon: Icon,
  iconTone = "brand",
  image,
  title,
  description,
  cta,
  secondaryCta,
  className,
  imageWidth,
  imageHeight,
  size = "md",
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center text-center",
        SIZE_CLASSES[size],
        className
      )}
    >
      {Icon ? (
        <div
          aria-hidden
          className={clsx(
            "mb-4 flex flex-shrink-0 items-center justify-center border",
            ICON_BOX[size].box,
            TONE_CLASSES[iconTone],
          )}
        >
          <Icon size={ICON_BOX[size].px} />
        </div>
      ) : image ? (
        <Image
          src={image}
          alt=""
          width={imageWidth ?? IMAGE_SIZES[size].w}
          height={imageHeight ?? IMAGE_SIZES[size].h}
          className="mb-4 h-auto w-auto max-w-full select-none"
          aria-hidden
        />
      ) : null}
      <h3 className="text-base font-bold text-fg">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm text-fg-muted">{description}</p>
      )}
      {(cta || secondaryCta) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {cta && <CTAButton cta={cta} primary />}
          {secondaryCta && <CTAButton cta={secondaryCta} primary={false} />}
        </div>
      )}
    </div>
  );
}
