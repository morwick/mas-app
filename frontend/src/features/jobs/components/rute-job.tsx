import { Flag, MapPin } from "lucide-react";

/** BATASAN: alamat rute di tabel maksimal 50 karakter; lebih dari itu dipotong + "…" (alamat penuh di tooltip). */
const MAKS_ALAMAT_RUTE = 50;

export function potongAlamat(text: string): string {
  const t = text.trim();
  return t.length > MAKS_ALAMAT_RUTE ? `${t.slice(0, MAKS_ALAMAT_RUTE).trimEnd()}…` : t;
}

/**
 * Kolom Rute di tabel: asal (ikon titik) di atas, tujuan (ikon bendera) di
 * bawah — dipakai daftar Job & tab Proyek per unit supaya tampilannya sama.
 */
export function RuteJob({ asal, tujuan }: { asal: string | null | undefined; tujuan: string | null | undefined }) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 2,
          color: "var(--text-secondary)"
        }}
      >
        <MapPin style={{ width: 11, height: 11, color: "var(--text-tertiary)" }} />
        <span title={asal ?? undefined} style={{ whiteSpace: "nowrap" }}>
          {asal ? potongAlamat(asal) : "—"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--brand-primary-dark)" }}>
        <Flag style={{ width: 11, height: 11 }} />
        <span title={tujuan ?? undefined} style={{ whiteSpace: "nowrap" }}>
          {tujuan ? potongAlamat(tujuan) : "—"}
        </span>
      </div>
    </>
  );
}
