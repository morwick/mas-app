import { useState } from "react";

/**
 * Status minimize / expand sebuah kartu, diingat per browser (localStorage).
 * `paksaTerlipat` = selalu mulai terlipat (mis. kartu yang isinya kosong),
 * tanpa menimpa pilihan yang tersimpan.
 */
export function useTerlipat(kunci: string, paksaTerlipat = false): [boolean, () => void] {
  const [terlipat, setTerlipat] = useState(() => {
    if (paksaTerlipat) return true;
    try {
      return localStorage.getItem(kunci) === "1";
    } catch {
      return false;
    }
  });

  function ubah() {
    setTerlipat((v) => {
      try {
        localStorage.setItem(kunci, v ? "0" : "1");
      } catch {
        // Penyimpanan browser tidak tersedia — cukup berlaku di sesi ini.
      }
      return !v;
    });
  }

  return [terlipat, ubah];
}
