-- ============================================================================
-- Migration 20261001000005: nilai enum 'completed' untuk status penawaran
--
-- Dipisah dari 20261001000006 karena nilai enum baru baru bisa dipakai
-- setelah transaksi yang menambahkannya selesai (commit). Jalankan file ini
-- dulu, baru 20261001000006.
--
-- AMAN UNTUK KODE LAMA: hanya menambah nilai enum.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TYPE transport.quotation_status ADD VALUE IF NOT EXISTS 'completed';
