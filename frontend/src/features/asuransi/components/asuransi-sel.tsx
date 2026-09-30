import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import type { PolisAsuransi } from "../api";

/**
 * Isi kolom "Asuransi" di tabel daftar unit / unit trailer: nama asuransi dari
 * polis terkini (tautan ke detail asuransi), atau "Tidak ada".
 */
export function AsuransiSel({ polis }: { polis: PolisAsuransi | null | undefined }) {
  if (!polis) {
    return <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Tidak ada</span>;
  }
  const catatan =
    polis.keadaan === "berakhir" ? "Polis berakhir" : polis.keadaan === "akan_datang" ? "Belum mulai" : null;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <Link
        to={`/asuransi/${polis.asuransi_id}`}
        // Baris tabel trailer bisa diklik ke detail trailer — jangan ikut terpicu.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        title={`Polis ${polis.nomor_polis}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
          fontWeight: 500,
          color: "var(--brand-primary-dark)",
          textDecoration: "none"
        }}
        className="hover:underline"
      >
        <ShieldCheck style={{ width: 14, height: 14, flexShrink: 0 }} />
        {polis.asuransi_nama ?? "Asuransi"}
      </Link>
      {catatan && (
        <span style={{ fontSize: 11, color: "var(--status-danger-text)" }}>{catatan}</span>
      )}
    </span>
  );
}
