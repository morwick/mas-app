/**
 * Kunci scroll halaman selama modal / lightbox / drawer terbuka, TANPA
 * mengubah posisi gulir.
 *
 * Dulu `document.body.style.overflow = "hidden"`: karena html & body diberi
 * `height: 100%` dan html memakai `overflow-x: clip`, body lalu menjadi kotak
 * setinggi layar yang terpotong — tinggi dokumen "menyusut" dan halaman
 * melompat ke paling atas setiap modal dibuka. Mengunci di elemen <html>
 * (viewport) menahan scroll di posisinya.
 *
 * Bisa bertumpuk (mis. konfirmasi di atas modal): scroll baru dilepas setelah
 * penguncian terakhir dilepas.
 */
let jumlahKunci = 0;
let overflowAwal = "";

export function kunciScroll(): () => void {
  const html = document.documentElement;
  if (jumlahKunci === 0) {
    overflowAwal = html.style.overflow;
    html.style.overflow = "hidden";
  }
  jumlahKunci += 1;
  let dilepas = false;
  return () => {
    if (dilepas) return;
    dilepas = true;
    jumlahKunci -= 1;
    if (jumlahKunci === 0) html.style.overflow = overflowAwal;
  };
}
