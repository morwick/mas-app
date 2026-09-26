import { KopSurat, SuratCetak, TabelAset, TandaTangan } from "@/components/surat/surat-cetak";
import { PERUSAHAAN, namaHari, rp, tanggalPanjang, terbilangRupiah } from "@/lib/surat";
import type { PenjualanUnit } from "../api";

function kontakPembeli(p: PenjualanUnit): string | null {
  return [p.no_hp_pembeli, p.email_pembeli].filter(Boolean).join(" · ") || null;
}

function labelAset(p: PenjualanUnit): string {
  return p.jenis_aset === "unit" ? "unit" : "unit trailer";
}

/** Surat penjualan aset — nomor otomatis 0001/SPJ/MAS/<bulan>/<tahun>. */
export function SuratPenjualanView({ penjualan: p }: { penjualan: PenjualanUnit }) {
  return (
    <SuratCetak kembaliKe="/penjualan-unit" kembaliLabel="Kembali ke penjualan">
      <KopSurat judul="SURAT PENJUALAN ASET" nomor={p.nomor_surat} />

      <p className="mt-6">Yang bertanda tangan di bawah ini:</p>
      <table className="mt-2 ml-4">
        <tbody>
          <tr>
            <td className="pr-3 align-top">Nama</td>
            <td className="pr-1 align-top">:</td>
            <td className="font-semibold">{PERUSAHAAN.nama}</td>
          </tr>
          <tr>
            <td className="pr-3 align-top">Alamat</td>
            <td className="pr-1 align-top">:</td>
            <td>{PERUSAHAAN.alamat}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2">
        selanjutnya disebut <strong>PENJUAL</strong>, dengan ini menyatakan telah menjual kepada:
      </p>
      <table className="mt-2 ml-4">
        <tbody>
          <tr>
            <td className="pr-3 align-top">Nama</td>
            <td className="pr-1 align-top">:</td>
            <td className="font-semibold">{p.nama_pembeli}</td>
          </tr>
          {kontakPembeli(p) && (
            <tr>
              <td className="pr-3 align-top">Kontak</td>
              <td className="pr-1 align-top">:</td>
              <td>{kontakPembeli(p)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-2">
        selanjutnya disebut <strong>PEMBELI</strong>, satu {labelAset(p)} dengan rincian sebagai berikut:
      </p>

      <section className="mt-3">
        <TabelAset jenisAset={p.jenis_aset} aset={p.aset} />
      </section>

      <p className="mt-4">
        dengan harga jual sebesar <strong>{rp(p.harga_jual)}</strong> (
        <em>{terbilangRupiah(p.harga_jual)}</em>), pada tanggal {tanggalPanjang(p.tanggal_jual)}.
      </p>
      {p.catatan && <p className="mt-2">Catatan: {p.catatan}</p>}
      <p className="mt-3">
        Aset dijual dalam kondisi sebagaimana adanya pada saat transaksi. Serah terima aset dituangkan dalam Berita
        Acara Serah Terima Nomor {p.nomor_bast ?? "—"}.
      </p>
      <p className="mt-3">Demikian surat penjualan ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>

      <p className="mt-6 text-right">
        {PERUSAHAAN.kota}, {tanggalPanjang(p.tanggal_jual)}
      </p>
      <TandaTangan
        kolom={[
          { peran: "PENJUAL", sub: PERUSAHAAN.nama, nama: p.penyerah_nama, jabatan: p.penyerah_jabatan },
          { peran: "PEMBELI", nama: p.nama_pembeli }
        ]}
      />
    </SuratCetak>
  );
}

/** Berita acara serah terima (BAST) — nomor otomatis 0001/BAST/MAS/<bulan>/<tahun>. */
export function BastPenjualanView({ penjualan: p }: { penjualan: PenjualanUnit }) {
  const kelengkapan = [
    p.aset?.stnk_nomor ? `STNK No. ${p.aset.stnk_nomor}` : null,
    p.aset?.kir_nomor ? `Buku / kartu KIR No. ${p.aset.kir_nomor}` : null,
    p.aset?.srut_nomor ? `SRUT No. ${p.aset.srut_nomor}` : null,
    "Kunci & perlengkapan standar"
  ].filter(Boolean) as string[];

  return (
    <SuratCetak kembaliKe="/penjualan-unit" kembaliLabel="Kembali ke penjualan">
      <KopSurat judul="BERITA ACARA SERAH TERIMA ASET" nomor={p.nomor_bast} />

      <p className="mt-6">
        Pada hari ini, <strong>{namaHari(p.tanggal_jual)}</strong>, tanggal{" "}
        <strong>{tanggalPanjang(p.tanggal_jual)}</strong>, kami yang bertanda tangan di bawah ini:
      </p>
      <ol className="mt-2 ml-5 list-decimal space-y-1">
        <li>
          <strong>{PERUSAHAAN.nama}</strong>, {PERUSAHAAN.alamat}
          {p.penyerah_nama
            ? `, dalam hal ini diwakili oleh ${p.penyerah_nama}${p.penyerah_jabatan ? ` (${p.penyerah_jabatan})` : ""}`
            : ""}
          , selanjutnya disebut <strong>PIHAK PERTAMA</strong> (yang menyerahkan).
        </li>
        <li>
          <strong>{p.nama_pembeli}</strong>
          {kontakPembeli(p) ? `, ${kontakPembeli(p)}` : ""}, selanjutnya disebut <strong>PIHAK KEDUA</strong> (yang
          menerima).
        </li>
      </ol>
      <p className="mt-3">
        Berdasarkan Surat Penjualan Aset Nomor {p.nomor_surat ?? "—"}, PIHAK PERTAMA menyerahkan kepada PIHAK KEDUA,
        dan PIHAK KEDUA menerima dari PIHAK PERTAMA, satu {labelAset(p)} dengan rincian:
      </p>

      <section className="mt-3">
        <TabelAset jenisAset={p.jenis_aset} aset={p.aset} />
      </section>

      <p className="mt-4">Beserta kelengkapan berikut (beri tanda bila diserahkan):</p>
      <ul className="mt-1 ml-5 space-y-0.5">
        {kelengkapan.map((k) => (
          <li key={k}>☐ {k}</li>
        ))}
        <li>☐ Lainnya: ........................................................</li>
      </ul>

      <p className="mt-3">
        Aset diterima PIHAK KEDUA dalam kondisi sebagaimana adanya. Sejak berita acara ini ditandatangani, segala
        tanggung jawab atas aset tersebut beralih sepenuhnya kepada PIHAK KEDUA.
      </p>
      <p className="mt-3">
        Demikian berita acara serah terima ini dibuat dalam rangkap dua, masing-masing mempunyai kekuatan hukum yang
        sama.
      </p>

      <p className="mt-6 text-right">
        {PERUSAHAAN.kota}, {tanggalPanjang(p.tanggal_jual)}
      </p>
      <TandaTangan
        kolom={[
          {
            peran: "PIHAK PERTAMA",
            sub: `Yang menyerahkan — ${PERUSAHAAN.nama}`,
            nama: p.penyerah_nama,
            jabatan: p.penyerah_jabatan
          },
          { peran: "PIHAK KEDUA", sub: "Yang menerima", nama: p.nama_pembeli }
        ]}
      />
    </SuratCetak>
  );
}
