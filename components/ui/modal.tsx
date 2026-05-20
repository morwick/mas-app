"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  hideClose?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "max-w-[500px]",
  hideClose
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className={cn(
          "bg-white w-full rounded-t-lg sm:rounded-lg shadow-xl",
          maxWidth,
          "max-h-[90vh] flex flex-col"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b border-border">
            <div className="min-w-0">
              {title && (
                <h2 className="text-[18px] font-medium text-text">{title}</h2>
              )}
              {description && (
                <p className="mt-0.5 text-[13px] text-text-muted">{description}</p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="shrink-0 p-1 -m-1 text-text-muted hover:text-text rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2 flex-wrap">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
