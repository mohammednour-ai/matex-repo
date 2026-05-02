"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from "./dialog";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  children: React.ReactNode;
};

/**
 * Drop-in compatible replacement for the legacy `components/ui/Modal.tsx`.
 * Same `open`/`onClose`/`title`/`size` props, but built on Radix Dialog via
 * the shadcn primitives in `./dialog`. Keeps the migration mechanical for
 * the four existing callsites.
 *
 * For new code prefer using the `Dialog`/`DialogContent`/`DialogHeader`/
 * `DialogTitle`/`DialogBody`/`DialogFooter` primitives directly — they
 * compose better and let you opt into footer / no-header layouts.
 */
export function Modal({ open, onClose, title, size = "md", className, children }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size={size} className={className}>
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        <DialogBody>{children}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}
