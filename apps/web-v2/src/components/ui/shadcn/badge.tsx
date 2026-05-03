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
        success: "bg-success-50 text-success-700 ring-success-500/20",
        warning: "bg-warning-50 text-warning-700 ring-warning-500/20",
        danger: "bg-danger-50 text-danger-700 ring-danger-500/20",
        info: "bg-brand-50 text-brand-700 ring-brand-500/20",
        gray: "bg-sky-100 text-sky-700 ring-sky-300/40",
        accent: "bg-accent-50 text-accent-700 ring-accent-500/20",
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
