import { useCallback, useState } from "react";

const KUNCI = "mas_sidebar_mini";

function baca(): boolean {
  try {
    return localStorage.getItem(KUNCI) === "1";
  } catch {
    return false;
  }
}

/**
 * Menu kiri (desktop) dilipat jadi deretan ikon / dibuka penuh. Pilihan
 * disimpan per browser supaya tetap sama setelah halaman dimuat ulang; bila
 * penyimpanan tidak tersedia, menu tampil penuh seperti biasa.
 */
export function useSidebarMini(): [boolean, () => void] {
  const [mini, setMini] = useState(baca);
  const toggle = useCallback(() => {
    setMini((lama) => {
      const baru = !lama;
      try {
        localStorage.setItem(KUNCI, baru ? "1" : "0");
      } catch {
        // Penyimpanan tidak tersedia (mode privat) — cukup berlaku di tab ini.
      }
      return baru;
    });
  }, []);
  return [mini, toggle];
}
