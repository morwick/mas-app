import { KopSurat, SuratCetak, TabelAset, TandaTangan } from "@/components/surat/surat-cetak";
import { PERUSAHAAN, namaHari, tanggalPanjang } from "@/lib/surat";
import type { PenghapusanAset } from "../api";

/** Berita acara penghapusan aset — nomor otomatis 0001/BAP/MAS/<bulan>/<tahun>. */
export function BeritaAcaraPenghapusanView({ penghapusan: p }: { penghapusan: PenghapusanAset }) {
  const label = p.jenis_aset === "unit" ? "unit" : "unit trailer";
  return (
    <SuratCetak kembaliKe="/penghapusan-aset" kembaliLabel="Kembali ke penghapusan">
      <KopSurat judul="BERITA ACARA PENGHAPUSAN ASET" nomor={p.nomor_berita_acara} />

      <p className="mt-6">
        Pada hari ini, <strong>{namaHari(p.tanggal_hapus)}</strong>, tanggal{" "}
        <strong>{tanggalPanjang(p.tanggal_hapus)}</strong>, telah dilakukan penghapusan aset milik{" "}
        <strong>{PERUSAHAAN.nama}</strong> dari daftar armada, yaitu satu {label} dengan rincian sebagai berikut:
      </p>

      <section className="mt-3">
        <TabelAset jenisAset={p.jenis_aset} aset={p.aset} />
      </section>

      <p className="mt-4">Alasan penghapusan:</p>
      <p className="mt-1 ml-4 whitespace-pre-line">{p.alasan}</p>
      {p.catatan && (
        <>
          <p className="mt-3">Catatan:</p>
          <p className="mt-1 ml-4 whitespace-pre-line">{p.catatan}</p>
        </>
      )}

      <p className="mt-4">
        Terhitung sejak tanggal tersebut, {label} di atas berstatus <strong>Diafkirkan</strong>, dikeluarkan dari
        daftar armada, dan tidak lagi digunakan untuk kegiatan operasional perusahaan.
      </p>
      <p className="mt-3">Demikian berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>

      <p className="mt-6 text-right">
        {PERUSAHAAN.kota}, {tanggalPanjang(p.tanggal_hapus)}
      </p>
      <TandaTangan
        kolom={[
          { peran: "Dibuat oleh", nama: p.created_by_nama },
          { peran: "Diperiksa oleh" },
          { peran: "Disetujui oleh" }
        ]}
      />
    </SuratCetak>
  );
}
