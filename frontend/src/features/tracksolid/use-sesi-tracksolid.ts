import { useEffect } from "react";
import {
  dengarButuhCaptcha,
  kabariButuhCaptcha,
  mintaPopupCaptcha,
  tandaiSesiValid
} from "@/lib/tracksolid-captcha";
import { cekSesiTrackSolid } from "./api";

/**
 * Dipasang di halaman yang memakai data TrackSolid (Dashboard, Unit, Pantau, Service).
 *
 * Saat halaman dibuka: cek ringan status sesi (hanya database). Butuh captcha
 * → popup muncul dan permintaan lokasi berhenti di browser (lihat
 * jagaSesiTrackSolid) sampai captcha diisi. Selama halaman terbuka, bila
 * sesi ternyata kedaluwarsa saat data diminta → popup juga muncul.
 * Halaman lain (mis. Laporan) tidak memunculkan popup.
 */
export function useSesiTrackSolid(): void {
  useEffect(() => {
    let batal = false;
    cekSesiTrackSolid()
      .then((r) => {
        if (batal) return;
        if (r.perlu_captcha) {
          kabariButuhCaptcha();
          mintaPopupCaptcha();
        } else {
          // Mis. sudah diisi pengguna lain → lanjutkan permintaan lokasi.
          tandaiSesiValid();
        }
      })
      .catch(() => {
        // Cek gagal (jaringan) — biarkan halaman mencoba seperti biasa.
      });
    const lepas = dengarButuhCaptcha(() => {
      if (!batal) mintaPopupCaptcha();
    });
    return () => {
      batal = true;
      lepas();
    };
  }, []);
}
