import clsx from "clsx";

type AppPageHeaderProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

/**
 * In-page title block (shell header shows route segment; use this for richer page context).
 * Uses app shell typography tokens from globals.css.
 */
export function AppPageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: AppPageHeaderProps) {
  return (
    <header
      className={clsx(
        "mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-brand-600">{eyebrow}</p>
        ) : null}
        <h1 className="app-inpage-title">{title}</h1>
        {description ? <p className="app-inpage-sub max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
