import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind class merger used by shadcn-style components.
 * `cn("px-2", condition && "px-4")` correctly resolves to `px-4` instead of
 * leaving both classes in conflict.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
