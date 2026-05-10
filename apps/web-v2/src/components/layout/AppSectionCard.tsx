import clsx from "clsx";

type AppSectionCardProps = {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div";
};

/**
 * Default marketplace section surface — matches login glass-adjacent vocabulary (rounded-2xl, soft border).
 */
export function AppSectionCard({
  title,
  action,
  children,
  className,
  bodyClassName,
  as: Tag = "section",
}: AppSectionCardProps) {
  return (
    <Tag className={clsx("marketplace-card p-4 sm:p-5", className)}>
      {title != null || action != null ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-line/80 pb-2">
          {title != null ? (
            <div className="text-[11px] font-bold uppercase tracking-widest text-fg-subtle">{title}</div>
          ) : (
            <span className="min-w-0" />
          )}
          {action}
        </div>
      ) : null}
      <div className={clsx(bodyClassName)}>{children}</div>
    </Tag>
  );
}
