import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Driver, Job, Unit } from "@/types";
import { formatDate, formatDateTime } from "@/lib/utils";

interface Props {
  job: Job;
  unit: Unit | null;
  driver: Driver | null;
  currentUserNama: string;
}

const COMPANY = {
  nama: "PT. MITRA ANGKUTAN SEJATI",
  tagline: "Layanan Angkutan Alat Berat",
  alamat: "Jl. Industri Raya Blok C12, Cikarang, Jawa Barat",
  telepon: "(021) 1234-5678",
  email: "info@mitraangkutansejati.id"
};

export function SuratJalanView({
  job,
  unit,
  driver,
  currentUserNama
}: Props) {
  const navigate = useNavigate();

  const shareUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/track/${job.share_token}`;
    }
    return `/track/${job.share_token}`;
  }, [job.share_token]);

  return (
    <>
      {/* Action bar — di-hide saat print */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-border">
        <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke job
          </button>
          <div className="flex items-center gap-2">
            <p className="hidden sm:block text-[11px] text-text-muted">
              Klik Cetak, lalu pilih &quot;Save as PDF&quot; di dialog browser
            </p>
            <Button
              leftIcon={<Printer className="w-4 h-4" />}
              onClick={() => window.print()}
            >
              Cetak
            </Button>
          </div>
        </div>
      </div>

      {/* Surat jalan content */}
      <div className="surat-jalan-page max-w-[820px] mx-auto my-6 bg-white border border-border print:border-0 print:my-0 print:max-w-none">
        <div className="px-8 sm:px-12 py-8 print:px-12 print:py-10">
          {/* Header */}
          <header className="flex items-start justify-between gap-6 pb-5 border-b-2 border-brand">
            <div className="flex items-start gap-3">
              <img
                src="/logo.png"
                alt="MAS"
                className="h-14 w-auto object-contain"
              />
              <div>
                <p className="text-[16px] font-bold text-text leading-tight">
                  {COMPANY.nama}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {COMPANY.tagline}
                </p>
                <p className="text-[10px] text-text-muted mt-1.5">
                  {COMPANY.alamat}
                </p>
                <p className="text-[10px] text-text-muted">
                  Telp: {COMPANY.telepon} · {COMPANY.email}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[18px] font-bold tracking-wider text-brand-dark">
                SURAT JALAN
              </p>
              <p className="text-[12px] font-mono mt-1">
                No: SJ-{job.job_number}
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">
                Tanggal: {formatDate(new Date())}
              </p>
            </div>
          </header>

          {/* Pengirim & Penerima */}
          <section className="grid grid-cols-2 gap-6 mt-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-1">
                Pengirim
              </p>
              <p className="text-[13px] font-medium">{COMPANY.nama}</p>
              <p className="text-[11px] text-text-muted">{COMPANY.alamat}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-1">
                Diterima oleh (Customer)
              </p>
              <p className="text-[13px] font-medium">{job.customer_nama}</p>
              {job.pic_nama && (
                <p className="text-[11px] text-text-muted">
                  PIC: {job.pic_nama}
                  {job.pic_no_hp ? ` · ${job.pic_no_hp}` : ""}
                </p>
              )}
            </div>
          </section>

          {/* Detail pengiriman */}
          <section className="mt-6">
            <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-2">
              Detail Pengiriman
            </p>
            <table className="w-full text-[12px] border-collapse">
              <tbody>
                <Tr label="Alat yang diangkut" value={job.alat_diangkut} bold />
                <Tr label="Lokasi asal" value={job.asal} />
                <Tr label="Lokasi tujuan" value={job.tujuan} />
                <Tr
                  label="Tanggal & jam berangkat"
                  value={formatDateTime(job.etd)}
                />
                {job.eta && (
                  <Tr
                    label="Perkiraan tiba"
                    value={formatDateTime(job.eta)}
                  />
                )}
              </tbody>
            </table>
          </section>

          {/* Unit & Driver */}
          <section className="mt-6">
            <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-2">
              Armada & Pengemudi
            </p>
            <table className="w-full text-[12px] border-collapse">
              <tbody>
                <Tr
                  label="Unit"
                  value={
                    unit
                      ? `${unit.kode_unit} — ${unit.jenis_unit_nama}`
                      : "—"
                  }
                />
                <Tr label="Nomor polisi" value={unit?.no_polisi ?? "—"} />
                <Tr
                  label="Driver"
                  value={
                    driver
                      ? `${driver.nama} · ${driver.no_hp}`
                      : "—"
                  }
                />
              </tbody>
            </table>
          </section>

          {/* QR tracking link */}
          <section className="mt-6 flex items-start gap-4 p-4 border border-border rounded">
            <div className="shrink-0 p-2 bg-white rounded border border-border">
              <QRCodeSVG value={shareUrl} size={88} fgColor="#1C9600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-text-subtle">
                Tracking Real-Time
              </p>
              <p className="text-[12px] text-text mt-1">
                Scan QR atau buka link untuk pantau lokasi & status pengiriman.
              </p>
              <p className="text-[10px] font-mono text-text-muted mt-1 break-all">
                {shareUrl}
              </p>
            </div>
          </section>

          {/* Tanda tangan.
              Kalau driver sudah mengambil tanda tangan penerima di lokasi,
              yang tercetak adalah tanda tangan itu — bukan kotak kosong yang
              masih menunggu kertasnya kembali ke kantor. */}
          <section className="mt-10 grid grid-cols-2 gap-8">
            <SignatureBlock
              label="Pengirim"
              subline={`Admin: ${currentUserNama}`}
            />
            {job.pod_at && job.pod_signature_url ? (
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-wider text-text-subtle">
                  Penerima
                </p>
                <img
                  src={job.pod_signature_url}
                  alt="Tanda tangan penerima"
                  className="mx-auto h-16 w-auto object-contain"
                />
                <div className="border-t border-text pt-1 mx-4">
                  <p className="text-[12px] font-medium">
                    {job.pod_penerima_nama}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {job.pod_penerima_jabatan
                      ? `${job.pod_penerima_jabatan} · `
                      : ""}
                    diterima {formatDateTime(job.pod_at)}
                  </p>
                </div>
              </div>
            ) : (
              <SignatureBlock
                label="Penerima"
                subline={`Customer / PIC${job.pic_nama ? `: ${job.pic_nama}` : ""}`}
              />
            )}
          </section>

          {job.pod_catatan && (
            <p className="mt-4 text-[11px] text-text-muted">
              Catatan serah terima: {job.pod_catatan}
            </p>
          )}

          <footer className="mt-8 pt-4 border-t border-border text-center">
            <p className="text-[9px] text-text-subtle">
              Surat jalan ini diterbitkan otomatis oleh sistem MAS-APP. Mohon
              periksa kondisi alat sebelum tanda tangan penerimaan.
            </p>
          </footer>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
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
          .surat-jalan-page {
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

function Tr({
  label,
  value,
  bold
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-1.5 pr-3 text-text-muted align-top w-[35%] sm:w-[30%]">
        {label}
      </td>
      <td
        className={`py-1.5 align-top ${bold ? "font-medium" : ""}`}
      >
        : {value}
      </td>
    </tr>
  );
}

function SignatureBlock({
  label,
  subline
}: {
  label: string;
  subline: string;
}) {
  return (
    <div className="text-center">
      <p className="text-[11px] text-text-muted mb-12">{label}</p>
      <div className="border-t border-text pt-1">
        <p className="text-[10px] text-text-muted">({subline})</p>
      </div>
    </div>
  );
}
