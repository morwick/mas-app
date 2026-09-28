/**
 * Isian tanggal & jam format Indonesia: tanggal dd/mm/yyyy, jam 24 jam
 * (00–23, tanpa AM/PM), berlabel WIB.
 *
 * `<input type="datetime-local">` bawaan browser mengikuti bahasa sistem
 * operasi — di Windows berbahasa Inggris tampil "mm/dd/yyyy hh:mm AM" dan
 * tidak bisa diatur. Komponen ini memakai kalender bawaan browser hanya untuk
 * memilih tanggal, sedangkan jam & menit dipilih lewat dropdown 24 jam.
 *
 * Nilai masuk/keluar tetap string "YYYY-MM-DDTHH:mm" (jam WIB), sama dengan
 * format datetime-local, supaya pemanggil & helper `localInputToIso` tidak berubah.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { DateInput, formatTanggalInput } from "@/components/ui/date-input";

export { formatTanggalInput };

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Batas bawah "YYYY-MM-DDTHH:mm" — hanya bagian tanggalnya yang dibatasi di kalender. */
  min?: string;
  error?: string;
  disabled?: boolean;
  /** Tampilkan tombol hapus (untuk field opsional seperti ETA). */
  clearable?: boolean;
  /** Jam awal saat tanggal dipilih pertama kali. */
  defaultTime?: string;
}

const JAM = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MENIT = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

export function DateTimeInput({
  value,
  onChange,
  min,
  error,
  disabled,
  clearable,
  defaultTime = "08:00"
}: Props) {
  const tanggal = value ? value.slice(0, 10) : "";
  const jam = value ? value.slice(11, 13) : "";
  const menit = value ? value.slice(14, 16) : "";
  // Jam dipilih sebelum tanggal — simpan dulu, dipakai saat tanggal dipilih.
  const [jamTunda, setJamTunda] = useState<string | null>(null);

  function setTanggal(t: string) {
    if (!t) return;
    onChange(`${t}T${value ? value.slice(11, 16) : jamTunda ?? defaultTime}`);
  }

  function setWaktu(h: string, m: string) {
    // Baru salah satu (jam/menit) yang dipilih — yang lain dianggap 00.
    h = h || "00";
    m = m || "00";
    if (!tanggal) {
      setJamTunda(`${h}:${m}`);
      return;
    }
    onChange(`${tanggal}T${h}:${m}`);
  }

  // Kosong ditampilkan "--", bukan jam default, supaya field opsional (ETA)
  // tidak terlihat sudah terisi.
  const jamTampil = jam || jamTunda?.slice(0, 2) || "";
  const menitTampil = menit || jamTunda?.slice(3, 5) || "";
  const border = error ? "#c13838" : undefined;

  return (
    <div className="w-full">
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <DateInput
          value={tanggal}
          onChange={setTanggal}
          min={min}
          disabled={disabled}
          invalid={!!error}
          style={{ flex: "1 1 150px", minWidth: 140, width: "auto" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <select
            className="select"
            aria-label="Jam"
            value={jamTampil}
            disabled={disabled}
            onChange={(e) => setWaktu(e.target.value, menitTampil)}
            style={{ width: 68, paddingRight: 24, borderColor: border }}
          >
            {!jamTampil && <option value="">--</option>}
            {JAM.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <span style={{ fontWeight: 600 }}>:</span>
          <select
            className="select"
            aria-label="Menit"
            value={menitTampil}
            disabled={disabled}
            onChange={(e) => setWaktu(jamTampil, e.target.value)}
            style={{ width: 68, paddingRight: 24, borderColor: border }}
          >
            {!menitTampil && <option value="">--</option>}
            {MENIT.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginLeft: 2 }}>
            WIB
          </span>
          {clearable && value && !disabled && (
            <button
              type="button"
              className="btn btn-secondary"
              aria-label="Kosongkan"
              title="Kosongkan"
              onClick={() => {
                setJamTunda(null);
                onChange("");
              }}
              style={{ padding: "0 8px", height: 40 }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="field-error" style={{ marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
}
