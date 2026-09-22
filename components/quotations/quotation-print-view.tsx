"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Quotation } from "@/lib/types";

interface Props {
  quotation: Quotation;
}

/** "4 Agustus 2026" — format tanggal surat resmi, bukan singkatan. */
function tanggalPanjang(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(d);
}

/** "Rp. 5.000.000,-" — gaya penulisan yang dipakai di surat Word MAS. */
function rp(n: number): string {
  return `Rp. ${new Intl.NumberFormat("id-ID").format(n)},-`;
}

export function QuotationPrintView({ quotation: q }: Props) {
  const router = useRouter();
  const sapaan = q.pic_sapaan ?? "Bapak";

  return (
    <>
      {/* Action bar — hilang saat dicetak */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-border">
        <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => router.push(`/quotations/${q.id}`)}
            className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke penawaran
          </button>
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
              onClick={() => window.print()}
            >
              Cetak / Simpan PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Surat */}
      <div className="surat-page max-w-[820px] mx-auto my-6 bg-white border border-border print:border-0 print:my-0 print:max-w-none">
        <div className="px-8 sm:px-12 py-8 print:px-10 print:py-6">
          {/* Kop — logo yang sama dengan kop Word */}
          <header className="pb-3 border-b-2 border-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="MAS GROUP"
              className="h-16 w-auto object-contain"
            />
          </header>

          {/* Nomor surat + tanggal */}
          <section className="mt-5 flex items-start justify-between gap-6">
            <table className="text-[12.5px]">
              <tbody>
                <tr>
                  <td className="pr-2 align-top whitespace-nowrap">Surat No.</td>
                  <td className="pr-1 align-top">:</td>
                  <td className="align-top font-medium">{q.quote_number}</td>
                </tr>
                <tr>
                  <td className="pr-2 align-top">Lamp.</td>
                  <td className="pr-1 align-top">:</td>
                  <td className="align-top">{q.lampiran || "-"}</td>
                </tr>
                <tr>
                  <td className="pr-2 align-top">Perihal</td>
                  <td className="pr-1 align-top">:</td>
                  <td className="align-top">{q.perihal}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[12.5px] whitespace-nowrap shrink-0">
              {q.kota_terbit}, {tanggalPanjang(q.tanggal)}
            </p>
          </section>

          {/* Tujuan */}
          <section className="mt-6 text-[12.5px] leading-relaxed">
            <p>Kepada Yth,</p>
            <p className="font-semibold">{q.customer_nama}</p>
            {q.customer_kota && <p>Di {q.customer_kota}</p>}
            {q.pic_nama && (
              <p>
                Up : {sapaan} {q.pic_nama}
              </p>
            )}
          </section>

          {/* Pembuka */}
          <section className="mt-5 text-[12.5px] leading-relaxed">
            <p>Dengan hormat,</p>
            <p className="mt-1.5">
              Dengan ini kami menawarkan kepada {sapaan} biaya pengangkutan
              {q.objek ? ` ${q.objek}` : ""} dengan rincian sebagai berikut :
            </p>
          </section>

          {/* Tabel rincian */}
          <section className="mt-4">
            <table className="w-full text-[12px] border-collapse quote-table">
              <thead>
                <tr>
                  <th className="w-[36px]">No</th>
                  <th>Dari</th>
                  <th>Tujuan</th>
                  <th className="w-[92px]">Unit</th>
                  <th className="w-[122px] text-right">@ Price</th>
                  <th className="w-[122px] text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {q.items.map((it, idx) => (
                  <tr key={it.id}>
                    <td className="text-center align-top">{idx + 1}</td>
                    <td className="align-top">{it.dari}</td>
                    <td className="align-top">{it.tujuan}</td>
                    <td className="align-top">
                      {it.qty} {it.satuan}
                      {it.nama_alat && (
                        <>
                          <br />
                          {it.nama_alat}
                        </>
                      )}
                    </td>
                    <td className="align-top text-right whitespace-nowrap">
                      {rp(it.harga_satuan)}
                    </td>
                    <td className="align-top text-right whitespace-nowrap">
                      {rp(it.subtotal)}
                    </td>
                  </tr>
                ))}

                {/* Baris ringkasan. Subtotal hanya ditampilkan kalau ada lebih
                    dari satu baris — pada surat satu baris, subtotal dan total
                    baris nilainya sama dan justru membingungkan. */}
                {q.items.length > 1 && (
                  <tr>
                    <td colSpan={4} className="text-right font-medium">
                      Subtotal
                    </td>
                    <td />
                    <td className="text-right whitespace-nowrap">
                      {rp(q.subtotal)}
                    </td>
                  </tr>
                )}

                {q.ppn_aktif && (
                  <tr>
                    <td colSpan={4} className="text-right font-medium">
                      PPN {Number(q.ppn_persen)}%
                    </td>
                    <td />
                    <td className="text-right whitespace-nowrap">
                      {rp(q.ppn_nominal)}
                    </td>
                  </tr>
                )}

                <tr className="total-row">
                  <td colSpan={4} className="text-right font-bold">
                    {q.ppn_aktif ? "TOTAL + PPN" : "TOTAL"}
                  </td>
                  <td />
                  <td className="text-right font-bold whitespace-nowrap">
                    {rp(q.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {q.berlaku_sampai && (
            <p className="mt-3 text-[11.5px] text-text-muted">
              Penawaran ini berlaku sampai {tanggalPanjang(q.berlaku_sampai)}.
            </p>
          )}

          {/* Penutup */}
          <section className="mt-5 text-[12.5px] leading-relaxed">
            <p>
              Demikian penawaran ini kami buat, atas perhatian dan kerjasamanya
              kami ucapkan terimakasih.
            </p>
          </section>

          {/* Tanda tangan */}
          <section className="mt-8 flex justify-end">
            <div className="text-center" style={{ minWidth: 200 }}>
              <p className="text-[12.5px]">Hormat Kami,</p>
              <div style={{ height: 64 }} />
              <p className="text-[12.5px] font-semibold underline">
                {q.ttd_nama || "—"}
              </p>
              <p className="text-[12px] text-text-muted">
                {q.ttd_jabatan || "Admin"}
              </p>
            </div>
          </section>
        </div>
      </div>

      <style jsx global>{`
        .quote-table th,
        .quote-table td {
          border: 1px solid #333;
          padding: 5px 7px;
        }
        .quote-table th {
          background: #f1f1f1;
          font-weight: 600;
          text-align: left;
        }
        .quote-table .total-row td {
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
