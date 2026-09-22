"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Invoice } from "@/lib/types";

interface Props {
  invoice: Invoice;
}

/** "7 September 2026" — format tanggal dokumen resmi, bukan singkatan. */
function tanggalPanjang(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(d);
}

/** "Rp. 5.000.000,-" — gaya penulisan yang dipakai di dokumen MAS. */
function rp(n: number): string {
  return `Rp. ${new Intl.NumberFormat("id-ID").format(n)},-`;
}

const SATUAN = [
  "", "satu", "dua", "tiga", "empat", "lima",
  "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"
];

/**
 * Terbilang — nilai tagihan dieja dengan huruf.
 *
 * Bukan hiasan: pada dokumen tagihan, angka yang dieja adalah pengaman kalau
 * digitnya terbaca keliru atau berubah saat dipindai. Semua invoice cetak yang
 * dipakai perusahaan transport memuatnya.
 */
function terbilang(n: number): string {
  if (n < 0) return `minus ${terbilang(-n)}`;
  if (n < 12) return SATUAN[n] ?? "nol";
  if (n < 20) return `${terbilang(n - 10)} belas`;
  if (n < 100) return `${terbilang(Math.floor(n / 10))} puluh ${terbilang(n % 10)}`;
  if (n < 200) return `seratus ${terbilang(n - 100)}`;
  if (n < 1000) return `${terbilang(Math.floor(n / 100))} ratus ${terbilang(n % 100)}`;
  if (n < 2000) return `seribu ${terbilang(n - 1000)}`;
  if (n < 1_000_000)
    return `${terbilang(Math.floor(n / 1000))} ribu ${terbilang(n % 1000)}`;
  if (n < 1_000_000_000)
    return `${terbilang(Math.floor(n / 1_000_000))} juta ${terbilang(n % 1_000_000)}`;
  return `${terbilang(Math.floor(n / 1_000_000_000))} miliar ${terbilang(
    n % 1_000_000_000
  )}`;
}

function terbilangRupiah(n: number): string {
  const kata = terbilang(Math.round(n)).replace(/\s+/g, " ").trim();
  if (!kata) return "Nol rupiah";
  return `${kata.charAt(0).toUpperCase()}${kata.slice(1)} rupiah`;
}

export function InvoicePrintView({ invoice: inv }: Props) {
  const router = useRouter();

  return (
    <>
      {/* Action bar — hilang saat dicetak */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-border">
        <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => router.push(`/invoices/${inv.id}`)}
            className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke tagihan
          </button>
          <div className="flex items-center gap-2">
            <p className="hidden md:block text-[11px] text-text-muted max-w-[280px] leading-snug">
              Di dialog yang muncul, ubah <strong>Destination</strong> (Tujuan)
              menjadi <strong>Save as PDF</strong>, lalu klik Save.
            </p>
            <Button
              leftIcon={<Printer className="w-4 h-4" />}
              onClick={() => window.print()}
            >
              Cetak / Simpan PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="surat-page max-w-[820px] mx-auto my-6 bg-white border border-border print:border-0 print:my-0 print:max-w-none">
        <div className="px-8 sm:px-12 py-8 print:px-10 print:py-6">
          {/* Kop */}
          <header className="pb-3 border-b-2 border-brand flex items-end justify-between gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="MAS GROUP"
              className="h-16 w-auto object-contain"
            />
            <p className="text-[20px] font-bold tracking-wide">INVOICE</p>
          </header>

          {/* Nomor & tanggal */}
          <section className="mt-5 flex items-start justify-between gap-6">
            <table className="text-[12.5px]">
              <tbody>
                <tr>
                  <td className="pr-2 align-top whitespace-nowrap">No. Invoice</td>
                  <td className="pr-1 align-top">:</td>
                  <td className="align-top font-medium">{inv.invoice_number}</td>
                </tr>
                <tr>
                  <td className="pr-2 align-top">Tanggal</td>
                  <td className="pr-1 align-top">:</td>
                  <td className="align-top">{tanggalPanjang(inv.tanggal)}</td>
                </tr>
                {inv.jatuh_tempo && (
                  <tr>
                    <td className="pr-2 align-top whitespace-nowrap">Jatuh tempo</td>
                    <td className="pr-1 align-top">:</td>
                    <td className="align-top font-medium">
                      {tanggalPanjang(inv.jatuh_tempo)}
                      {inv.termin_hari != null
                        ? ` (${inv.termin_hari} hari)`
                        : ""}
                    </td>
                  </tr>
                )}
                {inv.quotation_number && (
                  <tr>
                    <td className="pr-2 align-top">Ref. Penawaran</td>
                    <td className="pr-1 align-top">:</td>
                    <td className="align-top">{inv.quotation_number}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="text-[12.5px] max-w-[280px]">
              <p className="text-text-muted">Kepada Yth,</p>
              <p className="font-semibold">{inv.customer_nama}</p>
              {inv.customer_alamat && (
                <p className="leading-snug">{inv.customer_alamat}</p>
              )}
              {inv.customer_npwp && <p>NPWP : {inv.customer_npwp}</p>}
              {inv.pic_nama && (
                <p>
                  Up : {inv.pic_sapaan ?? "Bapak"} {inv.pic_nama}
                </p>
              )}
            </div>
          </section>

          {/* Tabel rincian */}
          <section className="mt-6">
            <table className="w-full text-[12px] border-collapse inv-table">
              <thead>
                <tr>
                  <th className="w-[36px]">No</th>
                  <th>Uraian</th>
                  <th className="w-[80px]">Jumlah</th>
                  <th className="w-[122px] text-right">Harga</th>
                  <th className="w-[130px] text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((it, idx) => (
                  <tr key={it.id}>
                    <td className="text-center align-top">{idx + 1}</td>
                    <td className="align-top">
                      {it.deskripsi}
                      {(it.dari || it.tujuan) && (
                        <>
                          <br />
                          <span className="text-[11px]">
                            {it.dari} → {it.tujuan}
                          </span>
                        </>
                      )}
                      {it.job_number && (
                        <>
                          <br />
                          <span className="text-[10.5px] text-text-muted">
                            Ref. job {it.job_number}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="align-top">
                      {it.qty} {it.satuan}
                    </td>
                    <td className="align-top text-right whitespace-nowrap">
                      {rp(it.harga_satuan)}
                    </td>
                    <td className="align-top text-right whitespace-nowrap">
                      {rp(it.subtotal)}
                    </td>
                  </tr>
                ))}

                {inv.items.length > 1 && (
                  <tr>
                    <td colSpan={3} className="text-right font-medium">
                      Subtotal
                    </td>
                    <td />
                    <td className="text-right whitespace-nowrap">
                      {rp(inv.subtotal)}
                    </td>
                  </tr>
                )}

                {inv.ppn_aktif && (
                  <tr>
                    <td colSpan={3} className="text-right font-medium">
                      PPN {Number(inv.ppn_persen)}%
                    </td>
                    <td />
                    <td className="text-right whitespace-nowrap">
                      {rp(inv.ppn_nominal)}
                    </td>
                  </tr>
                )}

                <tr className="total-row">
                  <td colSpan={3} className="text-right font-bold">
                    {inv.ppn_aktif ? "TOTAL + PPN" : "TOTAL"}
                  </td>
                  <td />
                  <td className="text-right font-bold whitespace-nowrap">
                    {rp(inv.total)}
                  </td>
                </tr>

                {/* Pembayaran sebagian ikut tercetak: kalau tidak, customer
                    yang sudah mencicil akan menerima tagihan yang terlihat
                    seperti belum dibayar sama sekali. */}
                {inv.dibayar > 0 && inv.sisa > 0 && (
                  <>
                    <tr>
                      <td colSpan={3} className="text-right font-medium">
                        Sudah dibayar
                      </td>
                      <td />
                      <td className="text-right whitespace-nowrap">
                        {rp(inv.dibayar)}
                      </td>
                    </tr>
                    <tr className="total-row">
                      <td colSpan={3} className="text-right font-bold">
                        SISA TAGIHAN
                      </td>
                      <td />
                      <td className="text-right font-bold whitespace-nowrap">
                        {rp(inv.sisa)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </section>

          <p className="mt-3 text-[12px] italic">
            Terbilang : {terbilangRupiah(inv.sisa > 0 ? inv.sisa : inv.total)}
          </p>

          {/* Rekening */}
          {(inv.bank_nama || inv.bank_rekening) && (
            <section className="mt-5 text-[12px]">
              <p className="font-semibold">Pembayaran ditransfer ke:</p>
              <p>
                {inv.bank_nama}
                {inv.bank_rekening ? ` — ${inv.bank_rekening}` : ""}
              </p>
              {inv.bank_atas_nama && <p>a.n. {inv.bank_atas_nama}</p>}
            </section>
          )}

          {/* Tanda tangan */}
          <section className="mt-8 flex justify-end">
            <div className="text-center" style={{ minWidth: 220 }}>
              <p className="text-[12.5px]">
                {inv.kota_terbit}, {tanggalPanjang(inv.tanggal)}
              </p>
              <p className="text-[12.5px]">Hormat Kami,</p>
              <div style={{ height: 64 }} />
              <p className="text-[12.5px] font-semibold underline">
                {inv.ttd_nama || "—"}
              </p>
              <p className="text-[12px] text-text-muted">
                {inv.ttd_jabatan || "Admin"}
              </p>
            </div>
          </section>
        </div>
      </div>

      <style jsx global>{`
        .inv-table th,
        .inv-table td {
          border: 1px solid #333;
          padding: 5px 7px;
        }
        .inv-table th {
          background: #f1f1f1;
          font-weight: 600;
          text-align: left;
        }
        .inv-table .total-row td {
          background: #f7f7f7;
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
          .inv-table {
            page-break-inside: auto;
          }
          .inv-table tr {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  );
}
