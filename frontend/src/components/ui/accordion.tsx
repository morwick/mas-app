import { ChevronDown } from "lucide-react";

interface AccordionItemProps {
  title: React.ReactNode;
  /** Teks kecil di bawah judul (mis. ringkasan isi saat tertutup). */
  subtitle?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Elemen kecil di kiri judul (mis. nomor langkah). */
  leading?: React.ReactNode;
  /** Penanda di kanan judul (mis. "Lengkap"). */
  badge?: React.ReactNode;
  /** Tombol di sisi kanan header (mis. hapus). Klik-nya tidak membuka/menutup. */
  actions?: React.ReactNode;
  /** Ada isian yang belum benar di dalamnya. */
  error?: boolean;
  /**
   * "card" = kotak berbingkai (item utama);
   * "flat" = tanpa kotak, hanya garis pemisah — untuk bagian di dalam item
   *          supaya tidak bertumpuk kotak di dalam kotak.
   */
  variant?: "card" | "flat";
  children: React.ReactNode;
}

/**
 * Bagian yang bisa dibuka/tutup dengan mengeklik header-nya. Isi yang tertutup
 * tetap ter-render (hanya disembunyikan) supaya isian & state di dalamnya
 * tidak hilang saat ditutup.
 */
export function AccordionItem({
  title,
  subtitle,
  open,
  onToggle,
  leading,
  badge,
  actions,
  error,
  variant = "card",
  children
}: AccordionItemProps) {
  const card = variant === "card";
  const merah = "var(--status-cancelled-text, #b91c1c)";
  return (
    <div
      style={
        card
          ? {
              border: "1px solid var(--border-default)",
              borderLeft: error ? `3px solid ${merah}` : undefined,
              borderRadius: 10,
              background: "white"
            }
          : { borderTop: "0.5px solid var(--border-default)" }
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: card ? "12px 14px" : "10px 0" }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
            color: "inherit"
          }}
        >
          {leading}
          <span style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 600,
                fontSize: card ? 14 : 13,
                color: error && !card ? merah : undefined
              }}
            >
              {title}
              {badge}
            </span>
            {subtitle && !open && (
              <span
                className="caption"
                style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {subtitle}
              </span>
            )}
          </span>
          <ChevronDown
            style={{
              width: 16,
              height: 16,
              flexShrink: 0,
              color: "var(--text-tertiary)",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 120ms"
            }}
          />
        </button>
        {actions}
      </div>
      <div hidden={!open} style={{ padding: card ? "0 14px 14px" : "0 0 14px", display: open ? undefined : "none" }}>
        {children}
      </div>
    </div>
  );
}
