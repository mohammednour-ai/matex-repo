import clsx from "clsx";

type BadgeVariant = "success" | "warning" | "danger" | "info" | "gray" | "accent";

type BadgeProps = {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
};

const variantClasses: Record<BadgeVariant, string> = {
  success: "bg-success-50 text-success-700 ring-success-500/20",
  warning: "bg-warning-50 text-warning-700 ring-warning-500/20",
  danger: "bg-danger-50 text-danger-700 ring-danger-500/20",
  info: "bg-brand-50 text-brand-700 ring-brand-500/20",
  gray: "bg-steel-100 text-steel-600 ring-steel-300/40",
  accent: "bg-accent-50 text-accent-700 ring-accent-500/20",
};

export function Badge({ variant = "gray", children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5",
        "text-xs font-semibold ring-1 ring-inset tracking-wide",
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
