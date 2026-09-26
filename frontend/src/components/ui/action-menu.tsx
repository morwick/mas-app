import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  /** Tautan dibuka di tab baru (mis. dokumen cetak). */
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Alasan singkat bila disabled, tampil di bawah label. */
  hint?: string;
}

const LEBAR = 240;

/**
 * Tombol "Aksi" yang membuka daftar aksi — supaya baris tabel tidak penuh
 * tombol. Menu dirender lewat portal (posisi fixed) karena kartu tabel
 * memakai overflow: hidden.
 */
export function ActionMenu({ items, label = "Aksi" }: { items: ActionMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tombol = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !tombol.current) return;
    const r = tombol.current.getBoundingClientRect();
    const tinggi = menu.current?.offsetHeight ?? 0;
    // Buka ke atas bila ruang di bawah tidak cukup.
    const top = r.bottom + 4 + tinggi > window.innerHeight ? Math.max(8, r.top - 4 - tinggi) : r.bottom + 4;
    const left = Math.min(Math.max(8, r.right - LEBAR), window.innerWidth - LEBAR - 8);
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function tutup(e: MouseEvent) {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !tombol.current?.contains(t)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function geser() {
      setOpen(false);
    }
    document.addEventListener("mousedown", tutup);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", geser, true);
    window.addEventListener("resize", geser);
    return () => {
      document.removeEventListener("mousedown", tutup);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", geser, true);
      window.removeEventListener("resize", geser);
    };
  }, [open]);

  return (
    <>
      <button
        ref={tombol}
        type="button"
        className="btn btn-secondary btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal style={{ width: 14, height: 14 }} />
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: LEBAR,
              zIndex: 60,
              background: "white",
              border: "0.5px solid var(--border-strong)",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              padding: 4
            }}
          >
            {items.map((it) => {
              const isi = (
                <>
                  <span style={{ display: "inline-flex", width: 16, flexShrink: 0 }}>{it.icon}</span>
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span>{it.label}</span>
                    {it.hint && (
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.3 }}>{it.hint}</span>
                    )}
                  </span>
                </>
              );
              const gaya = {
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                width: "100%",
                padding: "7px 10px",
                borderRadius: 6,
                fontSize: 13,
                textAlign: "left" as const,
                textDecoration: "none",
                background: "transparent",
                border: 0,
                cursor: it.disabled ? "not-allowed" : "pointer",
                opacity: it.disabled ? 0.55 : 1,
                color: it.danger ? "#C13838" : "var(--text-primary)"
              };
              return it.href && !it.disabled ? (
                <a
                  key={it.label}
                  role="menuitem"
                  href={it.href}
                  target="_blank"
                  rel="noopener"
                  className="action-menu-item"
                  style={gaya}
                  onClick={() => setOpen(false)}
                >
                  {isi}
                </a>
              ) : (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  className="action-menu-item"
                  style={gaya}
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.onSelect?.();
                  }}
                >
                  {isi}
                </button>
              );
            })}
          </div>,
          document.body
        )}
      <style>{`.action-menu-item:not(:disabled):hover { background: var(--bg-subtle) !important; }`}</style>
    </>
  );
}
