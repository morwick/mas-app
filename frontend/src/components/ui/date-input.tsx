/**
 * Isian tanggal format Indonesia dd/mm/yyyy.
 *
 * `<input type="date">` bawaan browser mengikuti bahasa sistem operasi — di
 * Windows berbahasa Inggris tampil "mm/dd/yyyy" dan tidak bisa diatur.
 * Komponen ini menampilkan tanggal sendiri (dd/mm/yyyy) dan hanya memakai
 * kalender bawaan browser untuk memilih tanggal.
 *
 * Nilai masuk/keluar tetap "YYYY-MM-DD" (sama dengan input date bawaan),
 * jadi pemanggil & data yang dikirim ke server tidak berubah.
 */

import { useRef } from "react";
import { CalendarDays, X } from "lucide-react";

export interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Batas bawah/atas "YYYY-MM-DD" untuk kalender. */
  min?: string;
  max?: string;
  error?: string;
  /** Border merah tanpa pesan (pesan ditampilkan pemanggil). */
  invalid?: boolean;
  disabled?: boolean;
  /** Tampilkan tombol hapus untuk field opsional. */
  clearable?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  style?: React.CSSProperties;
}

/** "2026-09-26" → "26/09/2026". */
export function formatTanggalInput(tanggal: string): string {
  const [y, m, d] = tanggal.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

export function DateInput({
  value,
  onChange,
  min,
  max,
  error,
  invalid,
  disabled,
  clearable,
  placeholder = "dd/mm/yyyy",
  "aria-label": ariaLabel,
  style
}: DateInputProps) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const tanggal = value ? value.slice(0, 10) : "";
  const bisaHapus = clearable && !!tanggal && !disabled;

  function bukaKalender() {
    const el = nativeRef.current;
    if (!el || disabled) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  return (
    <div className="w-full" style={style}>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          className="input"
          onClick={bukaKalender}
          disabled={disabled}
          aria-label={ariaLabel}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            textAlign: "left",
            cursor: disabled ? "not-allowed" : "pointer",
            borderColor: error || invalid ? "#c13838" : undefined,
            background: disabled ? "var(--bg-muted)" : undefined,
            color: tanggal ? undefined : "var(--text-tertiary)",
            paddingRight: bisaHapus ? 34 : undefined,
            height: style?.height
          }}
        >
          <CalendarDays style={{ width: 15, height: 15, flexShrink: 0, color: "var(--text-tertiary)" }} />
          <span className="mono" style={{ flex: 1, whiteSpace: "nowrap" }}>
            {tanggal ? formatTanggalInput(tanggal) : placeholder}
          </span>
        </button>
        {bisaHapus && (
          <button
            type="button"
            aria-label="Kosongkan tanggal"
            title="Kosongkan"
            onClick={() => onChange("")}
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              border: 0,
              background: "none",
              padding: 4,
              cursor: "pointer",
              color: "var(--text-tertiary)",
              display: "inline-flex"
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        )}
        {/* Kalender bawaan browser — tak terlihat, hanya dibuka lewat tombol di atas. */}
        <input
          ref={nativeRef}
          type="date"
          tabIndex={-1}
          aria-hidden
          value={tanggal}
          min={min ? min.slice(0, 10) : undefined}
          max={max ? max.slice(0, 10) : undefined}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "100%",
            height: 0,
            opacity: 0,
            border: 0,
            padding: 0,
            pointerEvents: "none"
          }}
        />
      </div>
      {error && (
        <p className="field-error" style={{ marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
}
