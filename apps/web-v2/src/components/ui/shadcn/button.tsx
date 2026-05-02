"use client";

import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center font-semibold rounded-xl",
    "transition-all duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed",
  ),
  {
    variants: {
      variant: {
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
      },
      size: {
        sm: "h-8 px-3 text-sm gap-1.5",
        md: "h-10 px-4 text-sm gap-2",
        lg: "h-12 px-6 text-base gap-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    asChild?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant, size, loading = false, disabled, className, asChild, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const spinnerSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {loading ? (
          <>
            <Spinner className={cn("shrink-0", spinnerSize)} />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);

Button.displayName = "Button";

export { buttonVariants };
export type { ButtonProps };
