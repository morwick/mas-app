/**
 * Status & sinyal sesi TrackSolid di browser.
 *
 *   * `sedangButuhCaptcha()` — TRUE sejak backend menyatakan sesi TrackSolid
 *     tidak valid & butuh captcha (galat `kode: "tracksolid_captcha"` atau cek
 *     saat membuka halaman). Selama TRUE, fungsi API lokasi / jarak tempuh
 *     TIDAK mengirim request (lihat `jagaSesiTrackSolid`) — polling tidak
 *     membebani server sampai captcha diisi.
 *   * "minta popup" — hanya dikirim halaman yang memang memakai TrackSolid
 *     (Unit, Pantau) lewat useSesiTrackSolid; popup di AdminLayout
 *     mendengarkannya. Request yang kebetulan selesai setelah pindah halaman
 *     tidak memunculkan popup.
 *   * "tersambung" — login captcha berhasil; status kembali normal dan halaman
 *     yang mem-polling lokasi memuat ulang saat itu juga.
 */

import { ApiError } from "@/lib/api/client";

export const KODE_GALAT_CAPTCHA = "tracksolid_captcha";

const EVENT_BUTUH_CAPTCHA = "mas:tracksolid-butuh-captcha";
const EVENT_MINTA_POPUP = "mas:tracksolid-minta-popup";
const EVENT_TERSAMBUNG = "mas:tracksolid-tersambung";

let butuhCaptcha = false;

export function sedangButuhCaptcha(): boolean {
  return butuhCaptcha;
}

export function kabariButuhCaptcha(): void {
  butuhCaptcha = true;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT_BUTUH_CAPTCHA));
}

/** Cek halaman menyatakan sesi valid (mis. diisi pengguna lain) — tanpa event. */
export function tandaiSesiValid(): void {
  butuhCaptcha = false;
}

export function kabariTersambung(): void {
  butuhCaptcha = false;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT_TERSAMBUNG));
}

export function mintaPopupCaptcha(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT_MINTA_POPUP));
}

function dengar(nama: string, fn: () => void): () => void {
  window.addEventListener(nama, fn);
  return () => window.removeEventListener(nama, fn);
}

/** Pendaftar event; kembalikan fungsi pelepas (untuk cleanup useEffect). */
export const dengarButuhCaptcha = (fn: () => void) => dengar(EVENT_BUTUH_CAPTCHA, fn);
export const dengarMintaPopup = (fn: () => void) => dengar(EVENT_MINTA_POPUP, fn);
export const dengarTersambung = (fn: () => void) => dengar(EVENT_TERSAMBUNG, fn);

/**
 * Bungkus request yang memanggil TrackSolid di backend: selama sesi butuh
 * captcha, langsung gagal tanpa request ke server.
 */
export function jagaSesiTrackSolid<T>(request: () => Promise<T>): Promise<T> {
  if (butuhCaptcha) {
    return Promise.reject(
      new ApiError(502, "Sesi TrackSolid tidak valid. Isi kode captcha untuk menampilkan data GPS.", {
        kode: KODE_GALAT_CAPTCHA
      })
    );
  }
  return request();
}
