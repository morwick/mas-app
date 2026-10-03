/** Inisial dari nama: dua kata pertama, mis. "Budi Santoso Putra" → "BS". */
export function inisialNama(nama: string): string {
  return (
    nama
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

/**
 * Foto profil berupa lingkaran berisi inisial nama (dipakai halaman Pengguna
 * & Karyawan). `redup` untuk data nonaktif / di-blacklist.
 */
export function AvatarInisial({ nama, ukuran = 36, redup = false }: { nama: string; ukuran?: number; redup?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        width: ukuran,
        height: ukuran,
        borderRadius: 99,
        background: redup ? "var(--text-tertiary)" : "var(--brand-primary)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(ukuran * 0.35),
        flexShrink: 0
      }}
    >
      {inisialNama(nama)}
    </div>
  );
}

/** Singkatan nama perusahaan tanpa awalan PT/CV: "PT Sumber Ban Jaya" → "SB". */
export function singkatanPerusahaan(nama: string): string {
  return inisialNama(nama.trim().replace(/^(PT|CV)\.?\s+/i, ""));
}

/**
 * Ikon perusahaan: kotak hijau muda berisi singkatan nama (Customer, Vendor,
 * Asuransi, Bengkel Luar). `redup` untuk data nonaktif.
 */
export function IkonPerusahaan({ nama, ukuran = 32, redup = false }: { nama: string; ukuran?: number; redup?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        width: ukuran,
        height: ukuran,
        borderRadius: 6,
        background: redup ? "var(--bg-subtle)" : "var(--brand-primary-light)",
        color: redup ? "var(--text-tertiary)" : "var(--brand-primary-dark)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: ukuran >= 36 ? 12 : 11,
        flexShrink: 0
      }}
    >
      {singkatanPerusahaan(nama)}
    </div>
  );
}
