import type { KeyboardEvent, MouseEvent } from "react";
import { Eye, Settings } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

/** Tujuan baris: alamat halaman detail, atau aksi sendiri (mis. buka modal). */
type Tujuan = string | (() => void);

export const PETUNJUK_BARIS = "Tekan 2 kali untuk lihat detail";

// Satu label petunjuk untuk seluruh aplikasi, mengikuti kursor saat baris
// di-hover. Dibuat sekali saat pertama dibutuhkan.
let label: HTMLDivElement | null = null;

function ambilLabel(): HTMLDivElement {
  if (label && document.body.contains(label)) return label;
  label = document.createElement("div");
  label.className = "petunjuk-baris";
  label.setAttribute("role", "tooltip");
  label.textContent = PETUNJUK_BARIS;
  document.body.appendChild(label);
  // Scroll memindahkan baris dari bawah kursor — petunjuk disembunyikan.
  window.addEventListener("scroll", sembunyikanPetunjuk, { capture: true, passive: true });
  return label;
}

function tampilkanPetunjuk(e: MouseEvent<HTMLElement>) {
  const el = ambilLabel();
  // Di atas tautan / tombol dalam baris, petunjuk disembunyikan (klik-nya milik elemen itu).
  const diAtasKontrol = (e.target as HTMLElement).closest("a, button, input, select, textarea");
  el.style.display = diAtasKontrol ? "none" : "block";
  el.style.left = `${e.clientX + 14}px`;
  el.style.top = `${e.clientY + 16}px`;
}

function sembunyikanPetunjuk() {
  if (label) label.style.display = "none";
}

/**
 * Props baris tabel yang membuka detail dengan KLIK 2 KALI.
 *
 * BATASAN: klik 1 kali sengaja tidak melakukan apa pun, supaya isi tabel bisa
 * diblok & disalin tanpa pindah halaman. Ctrl/⌘ + klik 2 kali membuka alamat
 * di tab baru; Enter (baris difokus lewat Tab) juga membuka detail. Saat
 * di-hover muncul petunjuk "Tekan 2 kali untuk lihat detail" di dekat kursor.
 * Kartu di tampilan HP tetap sekali ketuk (ketuk 2 kali di HP memicu zoom).
 */
export function useBarisDetail() {
  const navigate = useNavigate();

  function buka(tujuan: Tujuan, tabBaru: boolean) {
    sembunyikanPetunjuk();
    if (typeof tujuan === "function") return tujuan();
    if (tabBaru) window.open(tujuan, "_blank", "noopener");
    else navigate(tujuan);
  }

  return (tujuan: Tujuan) => ({
    className: "row-link",
    tabIndex: 0,
    onMouseMove: tampilkanPetunjuk,
    onMouseLeave: sembunyikanPetunjuk,
    onDoubleClick: (e: MouseEvent<HTMLElement>) => {
      // Klik 2 kali pada tautan / tombol di dalam baris diurus elemen itu sendiri.
      if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
      window.getSelection()?.removeAllRanges();
      buka(tujuan, e.ctrlKey || e.metaKey);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" && e.target === e.currentTarget) buka(tujuan, e.ctrlKey || e.metaKey);
    }
  });
}

/**
 * Isi kolom pertama tabel: ikon mata untuk membuka detail dengan SEKALI klik —
 * untuk pengguna yang tidak tahu bahwa baris bisa diklik 2 kali.
 */
export function TombolLihat({ tujuan }: { tujuan: Tujuan }) {
  const gaya = "inline-flex p-1.5 rounded-md text-text-muted hover:text-brand-dark hover:bg-brand-light";
  const ikon = <Eye style={{ width: 16, height: 16 }} />;
  if (typeof tujuan === "function") {
    return (
      <button type="button" onClick={tujuan} className={gaya} aria-label="Lihat detail" title="Lihat detail">
        {ikon}
      </button>
    );
  }
  return (
    <Link
      to={tujuan}
      onClick={sembunyikanPetunjuk}
      className={gaya}
      aria-label="Lihat detail"
      title="Lihat detail"
    >
      {ikon}
    </Link>
  );
}

/** Kepala kolom ikon mata: ikon setting (kolom aksi baris). */
export function KepalaKolomLihat() {
  return (
    <th style={{ width: 44 }} aria-label="Aksi" title="Aksi">
      <Settings style={{ width: 15, height: 15, display: "block", margin: "0 auto" }} aria-hidden />
    </th>
  );
}
