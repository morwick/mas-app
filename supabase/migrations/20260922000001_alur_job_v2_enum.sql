-- ============================================================================
-- Migration 20260922000001: Alur Job v2 — nilai enum baru
--
-- HARUS DIJALANKAN SENDIRI, SEBELUM 20260922000002. Postgres menolak nilai
-- enum yang baru ditambahkan dipakai di transaksi yang sama, sedangkan SQL
-- Editor Supabase menjalankan satu tempelan sebagai satu transaksi.
--
-- Status baru (lihat PRD-Alur-Kerja-Job-v2.md §6):
--   ditugaskan         admin membuat job (menggantikan menunggu_pickup)
--   diterima           driver menekan Terima Pekerjaan
--   serah_terima_pool  driver kembali ke pool, serah dokumen ke mandor
--   menunggu_validasi  driver menekan Selesaikan; menunggu Approve admin
-- Nilai lama `menunggu_pickup` tetap ada di enum (tidak bisa dihapus) tapi
-- tidak dipakai lagi setelah migrasi data di file berikutnya.
-- ============================================================================

ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'ditugaskan';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'diterima';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'serah_terima_pool';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'menunggu_validasi';

-- Foto serah terima dokumen di pool memakai tahap sendiri.
ALTER TYPE photo_type ADD VALUE IF NOT EXISTS 'serah_terima';
