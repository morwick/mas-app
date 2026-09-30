-- ============================================================================
-- Migration 20260930000005: Tanggal surat penawaran versi revisi
--
--   * transport.quotations.tanggal_revisi      — tanggal surat versi revisi
--     (harga hasil negosiasi). NULL = surat revisi belum pernah dicetak.
--   * transport.quotations.berlaku_sampai_asli — masa berlaku surat ASLI,
--     disimpan saat surat revisi pertama kali dicetak. Sejak itu
--     berlaku_sampai berisi masa berlaku surat revisi, sehingga status
--     kedaluwarsa & pengingat "akan kedaluwarsa" mengikuti surat revisi.
--     Cetak versi asli memakai COALESCE(berlaku_sampai_asli, berlaku_sampai).
--   * Nomor surat tidak berubah.
--
-- AMAN UNTUK KODE LAMA: hanya kolom baru (boleh NULL) + satu CHECK yang
-- tidak berlaku bagi baris lama (tanggal_revisi masih NULL). Tidak ada
-- perubahan data.
-- WAJIB: jalankan setelah 20260930000004.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TABLE transport.quotations ADD COLUMN IF NOT EXISTS tanggal_revisi DATE;
ALTER TABLE transport.quotations ADD COLUMN IF NOT EXISTS berlaku_sampai_asli DATE;

COMMENT ON COLUMN transport.quotations.tanggal_revisi IS
  'Tanggal surat penawaran versi revisi (harga hasil negosiasi); NULL = belum pernah dicetak.';
COMMENT ON COLUMN transport.quotations.berlaku_sampai_asli IS
  'Masa berlaku surat asli, disimpan saat surat revisi pertama kali dicetak (berlaku_sampai lalu mengikuti surat revisi).';

ALTER TABLE transport.quotations DROP CONSTRAINT IF EXISTS quotations_berlaku_revisi_check;
ALTER TABLE transport.quotations ADD CONSTRAINT quotations_berlaku_revisi_check
  CHECK (tanggal_revisi IS NULL OR berlaku_sampai > tanggal_revisi);
