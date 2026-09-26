import { formatDate, formatRupiah } from "@/lib/utils";
import type { UangJalanTransaksi } from "@/types";

interface Props {
  uangJalanPagu: number | null | undefined;
  uangJalanCair: number | null | undefined;
  /** Pagu awal job (sebelum penambahan). */
  uangJalanPaguAwal?: number | null;
  /** Tiap pencairan / penambahan uang jalan, dengan bukti transfer bila ada. */
  uangJalanTransaksi?: UangJalanTransaksi[] | null;
  /** Foto surat jalan saat loading & saat unloading. */
  suratJalanLoadingUrls: string[] | null | undefined;
  suratJalanUnloadingUrls: string[] | null | undefined;
}

/** Foto kecil; diklik → versi besar di tab baru. */
function FotoKecil({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`${label} — klik untuk perbesar`}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-block",
        width: 56,
        height: 56,
        borderRadius: 6,
        overflow: "hidden",
        border: "0.5px solid var(--border-strong)",
        background: "var(--bg-subtle)",
        flexShrink: 0
      }}
    >
      <img src={url} alt={label} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </a>
  );
}

function SuratJalan({ label, urls }: { label: string; urls: string[] }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 3 }}>{label}</div>
      {urls.length === 0 ? (
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Belum ada</span>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {urls.map((u, i) => (
            <FotoKecil key={u} url={u} label={`${label}${urls.length > 1 ? ` ${i + 1}` : ""}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Konteks saat menagihkan sebuah job: foto surat jalan loading & unloading,
 * dan uang jalan — ringkasan, penambahan pagu, dan tiap pencairan beserta
 * foto bukti transfernya. Foto tampil kecil, diklik → tab baru.
 */
export function InfoUangJalanSurat({
  uangJalanPagu,
  uangJalanCair,
  uangJalanPaguAwal,
  uangJalanTransaksi,
  suratJalanLoadingUrls,
  suratJalanUnloadingUrls
}: Props) {
  const pagu = uangJalanPagu ?? 0;
  const cair = uangJalanCair ?? 0;
  const lunas = pagu > 0 && cair >= pagu;
  const transaksi = uangJalanTransaksi ?? [];
  const penambahan = transaksi.filter((t) => t.jenis === "penambahan_pagu");
  const pencairan = transaksi.filter((t) => t.jenis === "pencairan");

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        padding: 10,
        borderRadius: 8,
        background: "var(--bg-subtle)"
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <SuratJalan label="Surat jalan loading" urls={suratJalanLoadingUrls ?? []} />
        <SuratJalan label="Surat jalan unloading" urls={suratJalanUnloadingUrls ?? []} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <span
          className="mono"
          style={{ fontSize: 11.5, fontWeight: 600, color: lunas ? "var(--brand-primary-dark)" : "var(--text-primary)" }}
        >
          Uang jalan {formatRupiah(cair)} / {formatRupiah(pagu)}
        </span>

        {penambahan.length > 0 && (
          <div
            style={{
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 6,
              background: "var(--status-perbaikan-bg)",
              color: "var(--status-perbaikan-text)"
            }}
          >
            Ada penambahan uang jalan: pagu awal {formatRupiah(uangJalanPaguAwal ?? pagu)}
            {penambahan.map((t, i) => (
              <div key={i}>
                + {formatRupiah(t.jumlah)} ({formatDate(t.tanggal)}){t.keterangan ? ` — ${t.keterangan}` : ""}
              </div>
            ))}
          </div>
        )}

        {pencairan.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Belum ada pencairan</span>
        ) : (
          pencairan.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {t.bukti_url ? (
                <FotoKecil url={t.bukti_url} label={`Bukti transfer ${formatDate(t.tanggal)}`} />
              ) : (
                <span
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 6,
                    border: "0.5px dashed var(--border-strong)",
                    fontSize: 9.5,
                    color: "var(--text-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    flexShrink: 0
                  }}
                >
                  Tanpa bukti
                </span>
              )}
              <div style={{ fontSize: 11, minWidth: 0 }}>
                <div className="mono" style={{ fontWeight: 600 }}>
                  {formatRupiah(t.jumlah)}
                </div>
                <div style={{ color: "var(--text-secondary)" }}>
                  Pencairan · {formatDate(t.tanggal)}
                  {t.keterangan ? ` · ${t.keterangan}` : ""}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
