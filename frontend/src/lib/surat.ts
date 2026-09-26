/**
 * Bahan bersama surat & dokumen cetak: identitas perusahaan, format tanggal
 * resmi, rupiah gaya dokumen MAS, dan terbilang.
 */

export const PERUSAHAAN = {
  nama: "PT. MITRA ANGKUTAN SEJATI",
  tagline: "Layanan Angkutan Alat Berat",
  alamat: "Jl. Industri Raya Blok C12, Cikarang, Jawa Barat",
  telepon: "(021) 1234-5678",
  email: "info@mitraangkutansejati.id",
  kota: "Cikarang"
};

function tanggalLokal(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

/** "7 September 2026" — format tanggal dokumen resmi, bukan singkatan. */
export function tanggalPanjang(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(
    tanggalLokal(iso)
  );
}

/** "Sabtu" — nama hari untuk kalimat "Pada hari ini, …" di berita acara. */
export function namaHari(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(tanggalLokal(iso));
}

/** "Rp. 5.000.000,-" — gaya penulisan yang dipakai di dokumen MAS. */
export function rp(n: number): string {
  return `Rp. ${new Intl.NumberFormat("id-ID").format(n)},-`;
}

const SATUAN = [
  "", "satu", "dua", "tiga", "empat", "lima",
  "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"
];

/**
 * Terbilang — nilai uang dieja dengan huruf.
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

export function terbilangRupiah(n: number): string {
  const kata = terbilang(Math.round(n)).replace(/\s+/g, " ").trim();
  if (!kata) return "Nol rupiah";
  return `${kata.charAt(0).toUpperCase()}${kata.slice(1)} rupiah`;
}
