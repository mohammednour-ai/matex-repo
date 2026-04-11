"use client";

import { forwardRef } from "react";
import clsx from "clsx";
import { Spinner } from "./Spinner";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "accent" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500 disabled:bg-brand-300 shadow-sm hover:shadow-glow-brand",
  secondary:
    "bg-white text-steel-700 border border-steel-200 hover:bg-surface-100 hover:border-steel-300 focus-visible:ring-steel-400 disabled:text-steel-400",
  accent:
    "bg-accent-500 text-white hover:bg-accent-600 focus-visible:ring-accent-400 disabled:bg-accent-300 shadow-sm hover:shadow-glow-accent",
  danger:
    "bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-500 disabled:bg-danger-300",
  ghost:
    "bg-transparent text-steel-600 hover:bg-steel-100 focus-visible:ring-steel-400 disabled:text-steel-400",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          "inline-flex items-center justify-center font-semibold rounded-xl",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && (
          <Spinner
            className={clsx(
              "shrink-0",
              size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"
            )}
          />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
