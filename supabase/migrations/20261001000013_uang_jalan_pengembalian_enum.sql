-- ============================================================================
-- Migration 20261001000013: jenis uang jalan 'pengembalian' & 'kasbon'
--
-- Dipakai saat ganti driver / ganti unit (migration 20261001000014):
--   * pengembalian — uang jalan yang dikembalikan supir lama ke kas;
--   * kasbon       — sisa uang jalan di tangan supir lama yang tidak
--                    dikembalikan dan dicatat sebagai kasbon (utang) supir.
-- Keduanya mengurangi uang yang sudah cair untuk job itu (bukan biaya job).
--
-- File terpisah karena nilai enum baru belum boleh dipakai di transaksi yang
-- sama dengan ALTER TYPE ... ADD VALUE.
-- AMAN DIJALANKAN ULANG. WAJIB: jalankan setelah 20261001000012.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TYPE transport.uang_jalan_jenis ADD VALUE IF NOT EXISTS 'pengembalian';
ALTER TYPE transport.uang_jalan_jenis ADD VALUE IF NOT EXISTS 'kasbon';
