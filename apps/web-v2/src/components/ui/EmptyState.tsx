import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

type CTA = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type EmptyStateProps = {
  image: string;
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

function CTAButton({ cta, primary }: { cta: CTA; primary: boolean }) {
  const className = clsx(
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
    primary
      ? "bg-brand-600 text-white hover:bg-brand-700"
      : "border border-steel-200 bg-white text-steel-700 hover:bg-steel-50"
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
  const dims = {
    w: imageWidth ?? IMAGE_SIZES[size].w,
    h: imageHeight ?? IMAGE_SIZES[size].h,
  };
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center text-center",
        SIZE_CLASSES[size],
        className
      )}
    >
      <Image
        src={image}
        alt=""
        width={dims.w}
        height={dims.h}
        className="mb-4 h-auto w-auto max-w-full select-none"
        aria-hidden
      />
      <h3 className="text-base font-bold text-steel-900">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm text-steel-500">{description}</p>
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
