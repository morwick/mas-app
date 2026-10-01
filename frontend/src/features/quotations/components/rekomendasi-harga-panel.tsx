import { ExternalLink, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRekomendasiHarga } from "@/features/quotations/queries";
import type { RekomendasiHarga } from "@/types";
import { formatDate, formatRupiah } from "@/lib/utils";

interface Props {
  dariKecamatanKode: string;
  tujuanKecamatanKode: string;
  jenisUnitId: string;
  jenisUnitNama?: string;
  customerId: string;
  /** Penawaran yang sedang diedit — tidak ikut jadi rekomendasi. */
  kecualiQuotationId?: string;
  onPakai: (harga: number) => void;
}

const SEL: { lingkup: RekomendasiHarga["lingkup"]; kategori: RekomendasiHarga["kategori"]; judul: string }[] = [
  { lingkup: "customer", kategori: "deal", judul: "Deal terakhir · customer ini" },
  { lingkup: "customer", kategori: "menunggu", judul: "Penawaran terbaru · customer ini" },
  { lingkup: "semua", kategori: "deal", judul: "Deal terakhir · semua customer" },
  { lingkup: "semua", kategori: "menunggu", judul: "Penawaran terbaru · semua customer" }
];

/**
 * Harga terakhir untuk rute (kecamatan dari → tujuan) + jenis unit yang sama:
 * {customer ini, semua customer} × {deal, masih menunggu}. Hanya saran —
 * harga tetap diisi admin, atau diambil lewat tombol "Pakai".
 */
export function RekomendasiHargaPanel({
  dariKecamatanKode,
  tujuanKecamatanKode,
  jenisUnitId,
  jenisUnitNama,
  customerId,
  kecualiQuotationId,
  onPakai
}: Props) {
  const lengkap = Boolean(dariKecamatanKode && tujuanKecamatanKode && jenisUnitId);
  const query = useRekomendasiHarga(
    lengkap
      ? {
          dariKecamatanKode,
          tujuanKecamatanKode,
          jenisUnitId,
          customerId: customerId || undefined,
          kecualiQuotationId
        }
      : null
  );

  if (!lengkap) return null;

  const data = query.data ?? [];

  return (
    <div
      style={{
        marginTop: 10,
        border: "1px dashed var(--border-default)",
        borderRadius: 8,
        padding: 10,
        background: "var(--bg-card)"
      }}
    >
      <p
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
          fontWeight: 600,
          marginBottom: 8,
          color: "var(--text-secondary)"
        }}
      >
        <Lightbulb style={{ width: 14, height: 14 }} />
        Harga terakhir rute ini{jenisUnitNama ? ` (${jenisUnitNama})` : ""}
      </p>

      {query.isLoading ? (
        <p className="caption" style={{ color: "var(--text-tertiary)" }}>
          Mencari harga terakhir…
        </p>
      ) : query.isError ? (
        <p className="caption" style={{ color: "var(--text-tertiary)" }}>
          Rekomendasi harga gagal dimuat.
        </p>
      ) : data.length === 0 ? (
        <p className="caption" style={{ color: "var(--text-tertiary)" }}>
          Belum ada penawaran sebelumnya untuk rute & jenis unit ini.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 8,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
          }}
        >
          {SEL.map((sel) => {
            const r = data.find((x) => x.lingkup === sel.lingkup && x.kategori === sel.kategori);
            return (
              <SelRekomendasi
                key={`${sel.lingkup}-${sel.kategori}`}
                judul={sel.judul}
                data={r}
                tanpaCustomer={sel.lingkup === "customer" && !customerId}
                onPakai={onPakai}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SelRekomendasi({
  judul,
  data,
  tanpaCustomer,
  onPakai
}: {
  judul: string;
  data?: RekomendasiHarga;
  tanpaCustomer: boolean;
  onPakai: (harga: number) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12.5,
        background: "var(--bg-page)"
      }}
    >
      <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginBottom: 4 }}>{judul}</p>
      {!data ? (
        <p style={{ color: "var(--text-tertiary)" }}>
          {tanpaCustomer ? "Pilih customer dulu" : "—"}
        </p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>
              {formatRupiah(data.harga)}
            </strong>
            <Button size="sm" variant="secondary" onClick={() => onPakai(data.harga)}>
              Pakai
            </Button>
          </div>
          <p style={{ color: "var(--text-secondary)", marginTop: 2 }}>
            {data.kategori === "deal"
              ? `Deal ${formatDate(data.diputuskan_at ?? data.tanggal)}`
              : `Ditawarkan ${formatDate(data.tanggal)}`}
            {data.harga_revisi != null && (
              <span style={{ color: "var(--text-tertiary)" }}>
                {" "}
                · revisi dari {formatRupiah(data.harga_satuan)}
              </span>
            )}
            {data.kedaluwarsa && (
              <span style={{ color: "#b45309", fontWeight: 600 }}> · kedaluwarsa</span>
            )}
          </p>
          <p style={{ color: "var(--text-tertiary)", marginTop: 2 }}>
            <a
              href={`/quotations/${data.quotation_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                color: "var(--brand-primary-dark)",
                textDecoration: "underline",
                textUnderlineOffset: 2
              }}
            >
              {data.quote_number}
              <ExternalLink style={{ width: 11, height: 11 }} />
            </a>{" "}
            · {data.customer_nama}
            {data.nama_alat ? ` · ${data.nama_alat}` : ""}
          </p>
        </>
      )}
    </div>
  );
}
