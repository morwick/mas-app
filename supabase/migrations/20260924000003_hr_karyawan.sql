-- ============================================================================
-- Migration 20260924000003: schema hr + tabel karyawan
--
-- Schema terpisah dari `transport` untuk data kepegawaian. Semua nama objek
-- ditulis lengkap dengan schema-nya supaya tidak bergantung search_path.
--
-- Akses: RLS aktif, hanya superadmin aktif yang boleh baca/tulis (data
-- pribadi: tanggal lahir & alamat). anon tidak diberi hak apa pun.
-- Kalau schema ini nanti dibuka lewat API, tambahkan `hr` di
-- Project Settings → Data API → Exposed schemas.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS hr;

GRANT USAGE ON SCHEMA hr TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS hr.karyawan (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama           TEXT NOT NULL CHECK (btrim(nama) <> ''),
  tanggal_lahir  DATE,
  alamat         TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON hr.karyawan TO authenticated;
GRANT ALL ON hr.karyawan TO service_role;

ALTER TABLE hr.karyawan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin_all_karyawan" ON hr.karyawan;
CREATE POLICY "superadmin_all_karyawan"
  ON hr.karyawan FOR ALL
  TO authenticated
  USING (transport.is_superadmin())
  WITH CHECK (transport.is_superadmin());
