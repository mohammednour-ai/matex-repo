import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  cn(
    "inline-flex items-center rounded-full px-2.5 py-0.5",
    "text-xs font-semibold ring-1 ring-inset tracking-wide",
  ),
  {
    variants: {
      variant: {
        success: "bg-success-500/15 text-success-400 ring-success-500/30",
        warning: "bg-warning-500/15 text-warning-400 ring-warning-500/30",
        danger: "bg-danger-500/15 text-danger-400 ring-danger-500/30",
        info: "bg-brand-500/15 text-brand-400 ring-brand-500/30",
        gray: "bg-night-800 text-night-200 ring-night-600/60",
        accent: "bg-accent-500/15 text-accent-400 ring-accent-500/30",
      },
    },
    defaultVariants: {
      variant: "gray",
    },
  },
);

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ variant, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
export type { BadgeProps };
