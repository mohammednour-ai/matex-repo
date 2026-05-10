import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, className, id, ...props }, ref) => {
    const inputId =
      id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-fg">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          className={cn(
            "w-full rounded-xl border px-3 py-2 text-sm text-fg",
            "placeholder:text-fg-subtle",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            "transition-colors duration-150",
            error
              ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/30"
              : "border-line-strong focus:border-brand-500 focus:ring-brand-500/35",
            "disabled:bg-canvas disabled:text-fg-subtle disabled:cursor-not-allowed",
            className,
          )}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-danger-600" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-fg-muted">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export type { InputProps };
