import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { dengarMintaPopup, dengarTersambung, sedangButuhCaptcha } from "@/lib/tracksolid-captcha";
import { CaptchaForm } from "./captcha-form";

/**
 * Popup captcha TrackSolid — dipasang sekali di AdminLayout, dibuka HANYA
 * oleh halaman yang memakai data TrackSolid (useSesiTrackSolid: Unit, Pantau,
 * Service). Ditutup tanpa login → tombol kecil di pojok bisa membukanya lagi
 * selama masih di halaman itu; permintaan lokasi tetap berhenti sampai
 * captcha diisi, jadi tidak ada polling berulang ke server.
 */
export function CaptchaPopup() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [tertunda, setTertunda] = useState(false);

  useEffect(() => dengarMintaPopup(() => setOpen(true)), []);

  // Login captcha berhasil → semua tanda hilang.
  useEffect(
    () =>
      dengarTersambung(() => {
        setTertunda(false);
        setOpen(false);
      }),
    []
  );

  // Pindah halaman → tombol pengingat hilang; halaman ber-TrackSolid yang
  // dibuka berikutnya mengecek sesi sendiri dan membuka popup bila perlu.
  useEffect(() => {
    setTertunda(false);
  }, [pathname]);

  function tutup() {
    setOpen(false);
    setTertunda(sedangButuhCaptcha());
  }

  return (
    <>
      <Modal
        open={open}
        onClose={tutup}
        title="Sesi TrackSolid perlu login ulang"
        description="Data GPS (lokasi & jarak tempuh unit) belum bisa tampil karena sesi TrackSolid tidak valid. Ketik kode captcha di bawah untuk login ulang — sesinya lalu dipakai semua pengguna."
      >
        {open && <CaptchaForm otomatis />}
      </Modal>

      {tertunda && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-sm"
          style={{
            position: "fixed",
            right: 16,
            bottom: 88,
            zIndex: 40,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--status-cancelled-bg)",
            color: "var(--status-cancelled-text)",
            border: "0.5px solid var(--status-cancelled-text)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)"
          }}
        >
          <ShieldAlert style={{ width: 15, height: 15 }} />
          TrackSolid butuh captcha — Isi sekarang
        </button>
      )}
    </>
  );
}
