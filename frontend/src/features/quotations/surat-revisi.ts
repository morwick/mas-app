import { hariIniWIB, isoToLocalInput, tambahHari } from "@/lib/utils";
import type { Quotation } from "@/types";

/** True bila ada item yang harganya direvisi — tombol "Cetak versi revisi" tampil. */
export function adaRevisi(q: Pick<Quotation, "items">): boolean {
  return q.items.some((it) => it.harga_revisi != null);
}

/** Tanggal revisi harga terakhir (WIB, "YYYY-MM-DD"), atau undefined. */
function tanggalRevisiTerakhir(q: Pick<Quotation, "items">): string | undefined {
  return q.items
    .filter((it) => it.harga_revisi != null && it.diputuskan_at)
    .map((it) => isoToLocalInput(it.diputuskan_at).slice(0, 10))
    .sort()
    .at(-1);
}

/** Masa berlaku surat asli: sejak surat revisi dicetak, berlaku_sampai milik surat revisi. */
export function berlakuSuratAsli(q: Pick<Quotation, "berlaku_sampai" | "berlaku_sampai_asli">): string | null {
  return q.berlaku_sampai_asli ?? q.berlaku_sampai ?? null;
}

export interface TanggalRevisi {
  /** Tanggal surat revisi ("YYYY-MM-DD"). */
  tanggal: string;
  /** Berlaku sampai ("YYYY-MM-DD"). */
  berlakuSampai: string;
}

/**
 * Isian awal dialog cetak revisi. Sudah pernah dicetak → tanggal yang
 * tersimpan. Belum → tanggal revisi harga terakhir (atau hari ini) + masa
 * berlaku surat asli.
 */
export function tanggalRevisiAwal(
  q: Pick<Quotation, "items" | "tanggal" | "berlaku_sampai" | "berlaku_sampai_asli" | "tanggal_revisi">
): TanggalRevisi {
  if (q.tanggal_revisi && q.berlaku_sampai) {
    return { tanggal: q.tanggal_revisi.slice(0, 10), berlakuSampai: q.berlaku_sampai.slice(0, 10) };
  }
  const tanggal = tanggalRevisiTerakhir(q) ?? hariIniWIB();
  const asli = berlakuSuratAsli(q);
  if (!asli) return { tanggal, berlakuSampai: "" };
  const hari = Math.round(
    (Date.parse(`${asli.slice(0, 10)}T00:00:00Z`) - Date.parse(`${q.tanggal.slice(0, 10)}T00:00:00Z`)) / 86_400_000
  );
  return { tanggal, berlakuSampai: tambahHari(tanggal, Math.max(hari, 1)) };
}

/** Surat versi asli — masa berlaku asli walau surat revisi sudah dicetak. */
export function suratAsli(q: Quotation): Quotation {
  return { ...q, berlaku_sampai: berlakuSuratAsli(q) };
}

/**
 * Isi surat penawaran versi revisi, dengan nomor surat yang sama:
 *   * item yang ditolak customer tidak ikut;
 *   * harga memakai harga final (revisi bila ada, selain itu harga awal);
 *   * subtotal, PPN, dan total dihitung ulang dengan aturan database
 *     (PPN = ROUND(subtotal × persen / 100));
 *   * tanggal surat = tanggal_revisi yang disimpan saat dicetak (berlaku_sampai
 *     sudah ikut surat revisi); belum pernah disimpan → tanggal revisi harga
 *     terakhir / tanggal asli.
 */
export function suratRevisi(q: Quotation): Quotation {
  const items = q.items
    .filter((it) => it.keputusan !== "ditolak")
    .map((it) => ({ ...it, harga_satuan: it.harga_final, subtotal: it.subtotal_final }));
  const subtotal = items.reduce((sum, it) => sum + it.subtotal, 0);
  const ppn = q.ppn_aktif ? Math.round((subtotal * Number(q.ppn_persen)) / 100) : 0;
  return {
    ...q,
    items,
    subtotal,
    ppn_nominal: ppn,
    total: subtotal + ppn,
    tanggal: q.tanggal_revisi ?? tanggalRevisiTerakhir(q) ?? q.tanggal,
    perihal: `${q.perihal} (Revisi)`
  };
}
