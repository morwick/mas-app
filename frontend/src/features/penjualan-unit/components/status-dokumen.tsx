import { Check, X } from "lucide-react";

export interface DokumenTtd {
  label: string;
  ada: boolean;
}

/**
 * Status dokumen bertanda tangan di daftar penjualan & penghapusan aset.
 * Belum satu pun diunggah → badge merah "Belum ada"; selain itu tiap dokumen
 * ditandai centang (sudah) atau silang (belum).
 */
export function StatusDokumen({ dokumen }: { dokumen: DokumenTtd[] }) {
  if (!dokumen.some((d) => d.ada)) {
    return <span className="badge badge-cancelled">Belum ada</span>;
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      {dokumen.map((d) => {
        const Icon = d.ada ? Check : X;
        return (
          <span
            key={d.label}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}
            aria-label={`${d.label}: ${d.ada ? "sudah diunggah" : "belum diunggah"}`}
          >
            <Icon
              style={{
                width: 14,
                height: 14,
                flexShrink: 0,
                color: d.ada ? "var(--status-selesai-text)" : "var(--status-cancelled-text)"
              }}
            />
            <span style={{ color: d.ada ? "var(--text-primary)" : "var(--text-tertiary)" }}>{d.label}</span>
          </span>
        );
      })}
    </span>
  );
}
