-- Migration 20260925000004: unit_trailer bisa dibaca anon lewat job aktif
--
-- Setiap select job (JOB_SELECT/PUBLIC_JOB_SELECT/DRIVER_JOB_SELECT di
-- backend/app/modules/jobs/mappers.py, _BASE_COLUMNS) menyertakan
-- `trailer:unit_trailer(kode_trailer)`. Portal driver (X-Driver-Token) dan
-- halaman tracking publik (share token) sama-sama jalan sebagai role
-- Postgres `anon` (lihat SupabaseClientFactory.for_driver()/anonymous() di
-- backend/app/core/supabase.py).
--
-- Tapi migration 20260924000013_unit_trailer.sql sengaja menjalankan
-- `REVOKE ALL ON transport.unit_trailer FROM anon` (saat itu belum ada yang
-- butuh baca trailer lewat anon). Begitu job punya unit_trailer_id, query
-- jobs manapun yang jalan sebagai anon gagal dengan:
--   "permission denied for table unit_trailer" (SQLSTATE 42501)
-- — inilah penyebab error "Anda tidak berhak melakukan aksi ini" di
-- aplikasi mobil driver saat memuat daftar job (GET /api/driver/jobs/page).
--
-- Perbaikan: GRANT SELECT ke anon (RLS tetap yang menentukan baris mana
-- yang boleh terlihat), lalu tambah policy SELECT untuk anon yang meniru
-- persis pola sudah ada di units/drivers (20260520000003_rls_policies.sql)
-- — anon cuma boleh baca trailer yang sedang dipakai job yang belum selesai.

SET search_path = transport, extensions;

GRANT SELECT ON transport.unit_trailer TO anon;

DROP POLICY IF EXISTS "public_read_unit_trailer_via_jobs" ON transport.unit_trailer;
CREATE POLICY "public_read_unit_trailer_via_jobs"
  ON transport.unit_trailer FOR SELECT
  USING (
    auth.uid() IS NULL AND EXISTS (
      SELECT 1 FROM transport.jobs j
      WHERE j.unit_trailer_id = unit_trailer.id
        AND j.status_job NOT IN ('selesai', 'cancelled')
    )
  );

NOTIFY pgrst, 'reload schema';
