import { cn } from "@/lib/cn";

/**
 * Loading-state placeholder. Match the rendered content's height/width to
 * avoid layout shift. Pair with `animate-pulse` (default).
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-steel-200/70", className)}
      {...props}
    />
  );
}
