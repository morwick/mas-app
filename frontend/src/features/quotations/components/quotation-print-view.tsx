import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import { PeringatanBatal, WatermarkBatal } from "@/components/surat/watermark-batal";
import { rp, tanggalPanjang } from "@/lib/surat";
import type { Quotation } from "@/types";
import { catatCetakPenawaran } from "../api";

/** Semua item sudah diputuskan dan tidak ada satu pun yang deal. */
function semuaDitolak(q: Quotation): boolean {
  return q.status === "completed" && !(q.items ?? []).some((it) => it.keputusan === "deal");
}

interface Props {
  quotation: Quotation;
  /** Versi revisi (harga hasil negosiasi) — isi sudah disiapkan suratRevisi(). */
  revisi?: boolean;
}

/**
 * Surat penawaran — mengikuti template Word perusahaan
 * ("0840-SK-MAS-IX-2026 penawaran …docx"): kop logo + nama PT + alamat dengan
 * garis ganda, Times New Roman 11pt, tabel rincian dengan baris PPN / TOTAL
 * hanya di dua kolom terakhir, dan tanda tangan rata kiri.
 */
export function QuotationPrintView({ quotation: q, revisi = false }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const sapaan = q.pic_sapaan ?? "Bapak";
  const versi = revisi ? "revisi" : "asli";
  const [busy, setBusy] = useState<string | null>(null);
  // Waktu pencatatan terakhir — supaya cetak lewat tombol tidak tercatat dua
  // kali oleh event "beforeprint".
  const terakhirDicatat = useRef(0);

  // Setiap cetak tercatat di log sistem (siapa, kapan, IP). Tombol mencatat
  // dulu baru membuka dialog print; bila gagal, cetak dibatalkan.
  async function cetak() {
    setBusy("Mencatat cetak…");
    const res = await catatCetakPenawaran(q.id, versi);
    setBusy(null);
    if (!res.ok) {
      toast.error(`Cetak dibatalkan: ${res.error}`);
      return;
    }
    terakhirDicatat.current = Date.now();
    window.print();
  }

  // Cetak lewat menu browser / Ctrl+P tidak bisa ditahan — tetap dicatat.
  useEffect(() => {
    function sebelumCetak() {
      if (Date.now() - terakhirDicatat.current < 5_000) return;
      terakhirDicatat.current = Date.now();
      void catatCetakPenawaran(q.id, versi);
    }
    window.addEventListener("beforeprint", sebelumCetak);
    return () => window.removeEventListener("beforeprint", sebelumCetak);
  }, [q.id, versi]);

  return (
    <>
      {/* Action bar — hilang saat dicetak */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-border">
        <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate(`/quotations/${q.id}`)}
            className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke penawaran
          </button>
          {revisi && (
            <span className="badge badge-pickup">Versi revisi — harga hasil negosiasi</span>
          )}
          <PeringatanBatal aktif={semuaDitolak(q)} teks="Penawaran ini ditolak / dibatalkan" />
          <PeringatanBatal aktif={q.status === "kedaluwarsa"} teks="Penawaran ini sudah kedaluwarsa" tanda="EXPIRED" />
          <div className="flex items-center gap-2">
            {/* Dialog cetak dimiliki browser dan tidak bisa dilewati dari kode,
                jadi petunjuknya menyebut nama dropdown-nya secara spesifik —
                "Save as PDF" ada di sana, bukan di halaman ini. */}
            <p className="hidden md:block text-[11px] text-text-muted max-w-[280px] leading-snug">
              Di dialog yang muncul, ubah <strong>Destination</strong> (Tujuan)
              menjadi <strong>Save as PDF</strong>, lalu klik Save.
            </p>
            <Button
              leftIcon={<Printer className="w-4 h-4" />}
              onClick={() => void cetak()}
              loading={busy !== null}
            >
              Cetak / Simpan PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Surat */}
      <div className="surat-page surat-penawaran relative max-w-[820px] mx-auto my-6 bg-white border border-border print:border-0 print:my-0 print:max-w-none">
        <WatermarkBatal aktif={semuaDitolak(q)} />
        <WatermarkBatal aktif={q.status === "kedaluwarsa"} teks="EXPIRED" />
        <div className="px-8 sm:px-12 py-8 print:px-10 print:py-6">
          {/* Kop — sama dengan header template Word */}
          <header className="kop">
            {/* Logo kop dari template Word ("Heavy Equipment & Transport"). */}
            <img src="/logo-kop.png" alt="MAS GROUP" className="kop-logo" />
            <div className="kop-teks">
              <p className="kop-nama">PT. MITRA ANGKUTAN SEJATI</p>
              <p>Jl. SM. Amin No.226, Kel. Simpang Baru, Kec. Tampan, Pekanbaru, Riau 28292</p>
              <p>Telp. 0761-565226 HP/WA 0811-7670-761</p>
            </div>
          </header>
          <div className="kop-garis" aria-hidden />

          {/* Nomor surat */}
          <table className="mt-5 info-surat">
            <tbody>
              <tr>
                <td>Surat No.</td>
                <td>: {q.quote_number}</td>
              </tr>
              <tr>
                <td>Lamp.</td>
                <td>: {q.lampiran || "-"}</td>
              </tr>
              <tr>
                <td>Perihal</td>
                <td>
                  : <strong className="underline">{q.perihal}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mt-4">
            {q.kota_terbit}, {tanggalPanjang(q.tanggal)}
          </p>

          {/* Tujuan */}
          <div className="mt-4">
            <p>Kepada Yth,</p>
            <p>{q.customer_nama}</p>
            {q.customer_kota && <p>Di {q.customer_kota}</p>}
          </div>
          {q.pic_nama && (
            <table className="mt-4 info-surat">
              <tbody>
                <tr>
                  <td>Up</td>
                  <td>
                    : {sapaan} {q.pic_nama}
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {/* Pembuka */}
          <div className="mt-4">
            <p>Dengan hormat,</p>
            <p className="pembuka">
              Dengan ini kami menawarkan kepada {sapaan} biaya pengangkutan
              {q.objek ? ` ${q.objek}` : ""} dengan rincian sebagai berikut:
            </p>
          </div>

          {/* Tabel rincian */}
          <table className="mt-4 w-full quote-table">
            <thead>
              <tr>
                <th style={{ width: "7%" }}>No</th>
                <th style={{ width: "20%" }}>Dari</th>
                <th style={{ width: "20%" }}>Tujuan</th>
                <th style={{ width: "13%" }}>Unit</th>
                <th style={{ width: "20%" }}>@ Price</th>
                <th style={{ width: "20%" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((it, idx) => (
                <tr key={it.id}>
                  <td>{idx + 1}</td>
                  <td>{it.dari}</td>
                  <td>{it.tujuan}</td>
                  <td>
                    {it.qty} {it.satuan}
                    {it.nama_alat ? ` ${it.nama_alat}` : ""}
                  </td>
                  <td className="whitespace-nowrap">{rp(it.harga_satuan)}</td>
                  <td className="whitespace-nowrap">{rp(it.subtotal)}</td>
                </tr>
              ))}

              {/* Baris ringkasan hanya berbingkai di dua kolom terakhir (seperti
                  template). Subtotal hanya tampil bila rinciannya lebih dari
                  satu baris — pada surat satu baris nilainya sama dengan total. */}
              {q.items.length > 1 && (
                <tr className="ringkasan">
                  <td colSpan={4} className="kosong" />
                  <td>
                    <strong>Subtotal</strong>
                  </td>
                  <td className="whitespace-nowrap">
                    <strong>{rp(q.subtotal)}</strong>
                  </td>
                </tr>
              )}
              {q.ppn_aktif && (
                <tr className="ringkasan">
                  <td colSpan={4} className="kosong" />
                  <td>
                    <strong>PPN {Number(q.ppn_persen)}%</strong>
                  </td>
                  <td className="whitespace-nowrap">
                    <strong>{rp(q.ppn_nominal)}</strong>
                  </td>
                </tr>
              )}
              <tr className="ringkasan">
                <td colSpan={4} className="kosong" />
                <td>
                  <strong>{q.ppn_aktif ? "TOTAL + PPN" : "TOTAL"}</strong>
                </td>
                <td className="whitespace-nowrap">
                  <strong>{rp(q.total)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          {q.berlaku_sampai && (
            <p className="mt-4">Penawaran ini berlaku sampai {tanggalPanjang(q.berlaku_sampai)}.</p>
          )}

          {/* Penutup */}
          <p className="mt-4">
            Demikian penawaran ini kami buat, atas perhatian dan kerjasamanya
            kami ucapkan terimakasih.
          </p>

          {/* Tanda tangan — rata kiri seperti template */}
          <div className="mt-5">
            <p>Hormat Kami,</p>
            <div style={{ height: 80 }} />
            <p>
              <strong className="underline">{q.ttd_nama || "—"}</strong>
            </p>
            <p>{q.ttd_jabatan || "Admin"}</p>
          </div>
        </div>
      </div>

      <LoadingOverlay message={busy} />

      <style>{`
        .surat-penawaran {
          font-family: "Times New Roman", Times, serif;
          font-size: 11pt;
          line-height: 1.35;
          color: #000;
        }
        .surat-penawaran .kop {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .surat-penawaran .kop-logo {
          height: 44px;
          width: auto;
          flex-shrink: 0;
        }
        .surat-penawaran .kop-teks {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 9pt;
          line-height: 1.3;
        }
        .surat-penawaran .kop-nama {
          font-family: "Arial Black", "Arial Bold", Arial, sans-serif;
          font-weight: 900;
          font-size: 19pt;
          line-height: 1.1;
          letter-spacing: -0.01em;
        }
        /* Garis ganda tipis-tebal di bawah kop (thinThick 4.5pt di Word). */
        .surat-penawaran .kop-garis {
          margin-top: 6px;
          border-top: 1px solid #000;
          padding-top: 2px;
          border-bottom: 3.5px solid #000;
        }
        .surat-penawaran .info-surat td {
          padding: 0;
          vertical-align: top;
        }
        .surat-penawaran .info-surat td:first-child {
          width: 72px;
        }
        .surat-penawaran .pembuka {
          text-indent: 36px;
          text-align: justify;
        }
        .quote-table {
          border-collapse: collapse;
          font-size: 10.5pt;
        }
        .quote-table th,
        .quote-table td {
          border: 1px solid #000;
          padding: 6px 6px;
          text-align: center;
          vertical-align: middle;
        }
        .quote-table th {
          font-weight: 700;
          border-bottom: 3px double #000;
        }
        .quote-table td.kosong {
          border: 0;
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
          .quote-table {
            page-break-inside: auto;
          }
          .quote-table tr {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  );
}
