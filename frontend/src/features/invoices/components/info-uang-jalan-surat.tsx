import { formatRupiah } from "@/lib/utils";

interface Props {
  uangJalanPagu: number | null | undefined;
  uangJalanCair: number | null | undefined;
  suratJalanUrls: string[] | null | undefined;
}

/** Ringkasan uang jalan & surat jalan job — konteks cepat saat menagihkan. */
export function InfoUangJalanSurat({ uangJalanPagu, uangJalanCair, suratJalanUrls }: Props) {
  const pagu = uangJalanPagu ?? 0;
  const cair = uangJalanCair ?? 0;
  const urls = suratJalanUrls ?? [];
  const lunas = pagu > 0 && cair >= pagu;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        className="mono"
        style={{ fontSize: 11, color: lunas ? "var(--brand-primary-dark)" : "var(--text-secondary)" }}
      >
        UJ {formatRupiah(cair)} / {formatRupiah(pagu)}
      </span>
      {urls.length > 0 ? (
        <a
          href={urls[0]}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ fontSize: 11, color: "var(--brand-primary-dark)", textDecoration: "underline" }}
        >
          Surat jalan{urls.length > 1 ? ` (${urls.length})` : ""}
        </a>
      ) : (
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Surat jalan belum ada</span>
      )}
    </div>
  );
}
