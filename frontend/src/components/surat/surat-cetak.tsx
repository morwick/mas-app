import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PeringatanBatal, WatermarkBatal } from "@/components/surat/watermark-batal";
import type { AsetDokumen, JenisAset } from "@/features/penjualan-unit/api";

/**
 * Kerangka halaman cetak surat (pola sama dengan cetak penawaran & invoice):
 * bar aksi yang hilang saat dicetak, kertas A4, dan tombol Cetak / Simpan PDF.
 */
export function SuratCetak({
  kembaliKe,
  kembaliLabel,
  batal = false,
  children
}: {
  kembaliKe: string;
  kembaliLabel: string;
  /** Pengajuan dibatalkan → watermark CANCELED. */
  batal?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <>
      <div className="no-print sticky top-0 z-10 bg-white border-b border-border">
        <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate(kembaliKe)}
            className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
          >
            <ArrowLeft className="w-4 h-4" />
            {kembaliLabel}
          </button>
          <PeringatanBatal aktif={batal} teks="Pengajuan ini dibatalkan" />
          <div className="flex items-center gap-2">
            {/* Dialog cetak dimiliki browser — "Save as PDF" ada di dropdown Destination. */}
            <p className="hidden md:block text-[11px] text-text-muted max-w-[280px] leading-snug">
              Di dialog yang muncul, ubah <strong>Destination</strong> (Tujuan) menjadi{" "}
              <strong>Save as PDF</strong>, lalu klik Save.
            </p>
            <Button leftIcon={<Printer className="w-4 h-4" />} onClick={() => window.print()}>
              Cetak / Simpan PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="surat-page relative max-w-[820px] mx-auto my-6 bg-white border border-border print:border-0 print:my-0 print:max-w-none">
        <WatermarkBatal aktif={batal} />
        <div className="px-8 sm:px-12 py-8 print:px-10 print:py-6 text-[12.5px] leading-relaxed">{children}</div>
      </div>

      <style>{`
        .surat-tabel th,
        .surat-tabel td {
          border: 1px solid #333;
          padding: 5px 8px;
          vertical-align: top;
        }
        .surat-tabel th {
          background: #f1f1f1;
          font-weight: 600;
          text-align: left;
          width: 38%;
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 1.2cm;
          }
          body {
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          .surat-page {
            box-shadow: none !important;
            border: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
        }
      `}</style>
    </>
  );
}

/** Kop (logo sama dengan kop Word) + judul dokumen & nomor otomatisnya. */
export function KopSurat({ judul, nomor }: { judul: string; nomor: string | null }) {
  return (
    <>
      <header className="pb-3 border-b-2 border-brand">
        <img src="/logo.png" alt="MAS GROUP" className="h-16 w-auto object-contain" />
      </header>
      <div className="mt-5 text-center">
        <p className="text-[15px] font-bold underline tracking-wide">{judul}</p>
        <p className="text-[12.5px]">Nomor: {nomor ?? "—"}</p>
      </div>
    </>
  );
}

function formatKapasitas(ton: number | null) {
  if (ton == null) return null;
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(ton)} ton`;
}

/** Rincian aset: baris yang datanya kosong tidak ditampilkan. */
export function TabelAset({ jenisAset, aset }: { jenisAset: JenisAset; aset: AsetDokumen | null }) {
  const baris: [string, string | number | null | undefined][] = [
    ["Jenis aset", jenisAset === "unit" ? "Unit (kendaraan)" : "Unit trailer"],
    ["Kode aset", aset?.kode],
    ["Jenis", aset?.jenis_nama],
    ["No. polisi", aset?.no_polisi],
    ["Tahun", aset?.tahun],
    ["Kapasitas muatan", formatKapasitas(aset?.kapasitas_ton ?? null)],
    ["No. STNK", aset?.stnk_nomor],
    ["No. KIR", aset?.kir_nomor],
    ["No. SRUT", aset?.srut_nomor]
  ];
  return (
    <table className="w-full border-collapse surat-tabel text-[12px]">
      <tbody>
        {baris
          .filter(([, nilai]) => nilai != null && nilai !== "")
          .map(([label, nilai]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{nilai}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

/** Kolom tanda tangan sejajar; nama kosong → garis titik untuk diisi tangan. */
export function TandaTangan({
  kolom
}: {
  kolom: { peran: string; nama?: string | null; jabatan?: string | null; sub?: string }[];
}) {
  return (
    <section className="mt-10 grid gap-6" style={{ gridTemplateColumns: `repeat(${kolom.length}, 1fr)` }}>
      {kolom.map((k) => (
        <div key={k.peran} className="text-center">
          <p>{k.peran}</p>
          {k.sub && <p className="text-[11.5px] text-text-muted">{k.sub}</p>}
          <div style={{ height: 72 }} />
          <p className="font-semibold underline">{k.nama || "(..............................)"}</p>
          {k.jabatan && <p className="text-[12px]">{k.jabatan}</p>}
        </div>
      ))}
    </section>
  );
}
