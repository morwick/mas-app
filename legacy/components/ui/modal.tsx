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
      className="fixed inset-0 z-50 flex items-center justify-center fade-in"
      style={{ background: "rgba(0,0,0,0.45)", padding: 16 }}
      onClick={onClose}
    >
      <div
        className={cn(
          "bg-white w-full flex flex-col slide-up",
          maxWidth
        )}
        style={{
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          maxHeight: "88vh"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || !hideClose) && (
          <div
            className="flex items-start justify-between gap-3"
            style={{
              padding: "16px 20px",
              borderBottom: "0.5px solid var(--border-default)"
            }}
          >
            <div className="min-w-0">
              {title && <h2 className="h3">{title}</h2>}
              {description && (
                <p className="caption" style={{ marginTop: 4 }}>
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 6,
                  borderRadius: 6,
                  color: "var(--text-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer"
                }}
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto" style={{ padding: 20 }}>
          {children}
        </div>
        {footer && (
          <div
            className="flex items-center justify-end gap-2 flex-wrap"
            style={{
              padding: "14px 20px",
              borderTop: "0.5px solid var(--border-default)",
              background: "var(--bg-muted)",
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
