import { createContext, useContext } from "react";
import { ChevronDown } from "lucide-react";

/** Kedalaman accordion: 0 = paling luar; accordion di dalam isi accordion lain = anak. */
const TingkatAccordion = createContext(0);

/** Warna header per tingkat: induk biru muda, anak (bersarang) abu-abu muda. */
const WARNA_HEADER = {
  induk: {
    bg: "var(--accordion-head-bg)",
    border: "var(--accordion-head-border)",
    teksBuka: "var(--accordion-head-text-open)"
  },
  anak: {
    bg: "var(--accordion-child-head-bg)",
    border: "var(--accordion-child-head-border)",
    teksBuka: "var(--accordion-child-head-text-open)"
  }
};

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
  const tingkat = useContext(TingkatAccordion);
  const warna = tingkat > 0 ? WARNA_HEADER.anak : WARNA_HEADER.induk;
  const merah = "var(--status-cancelled-text, #b91c1c)";
  return (
    <div
      style={
        card
          ? {
              border: "1px solid var(--border-default)",
              borderLeft: error ? `3px solid ${merah}` : undefined,
              borderRadius: 10,
              background: "white",
              // Sudut header biru ikut membulat mengikuti kartu.
              overflow: "hidden"
            }
          : { borderTop: "0.5px solid var(--border-default)" }
      }
    >
      {/* Header berwarna supaya jelas terpisah dari isinya (induk biru muda,
          anak abu-abu muda); saat terbuka ada garis pemisah & judul lebih tegas. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: card ? "12px 14px" : "10px 12px",
          background: warna.bg,
          borderBottom: open ? `1px solid ${warna.border}` : "1px solid transparent",
          ...(card ? {} : { borderRadius: 8, margin: "6px 0" })
        }}
      >
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
                color: error && !card ? merah : open ? warna.teksBuka : undefined
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
      <div hidden={!open} style={{ padding: card ? "14px" : "4px 0 14px", display: open ? undefined : "none" }}>
        <TingkatAccordion.Provider value={tingkat + 1}>{children}</TingkatAccordion.Provider>
      </div>
    </div>
  );
}
