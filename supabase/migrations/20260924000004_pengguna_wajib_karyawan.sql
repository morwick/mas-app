-- ============================================================================
-- Migration 20260924000004: pengguna wajib terhubung ke hr.karyawan
--
-- Aturan bisnis: hanya karyawan yang boleh menjadi pengguna sistem transport.
--   * transport.profiles.karyawan_id → hr.karyawan(id), wajib diisi, dan unik
--     (satu karyawan paling banyak satu akun).
--   * Trigger pendaftaran Auth (handle_new_user) menolak akun baru yang tidak
--     membawa karyawan_id valid di user_metadata — aturan dijaga database,
--     bukan hanya form.
--
-- Data dummy: fitur tambah karyawan belum ada, jadi untuk setiap pengguna
-- yang sudah ada dibuatkan satu baris karyawan dengan nama yang sama, lalu
-- id-nya dihubungkan ke profil tersebut.
--
-- Jalankan setelah 20260924000003_hr_karyawan.sql.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Kolom relasi + data dummy ────────────────────────────────────────────
-- FK dipasang setelah backfill: id karyawan diisi dulu di profiles, baru
-- baris karyawan-nya dibuat dari id tersebut.
ALTER TABLE transport.profiles ADD COLUMN IF NOT EXISTS karyawan_id UUID;

UPDATE transport.profiles
   SET karyawan_id = gen_random_uuid()
 WHERE karyawan_id IS NULL;

INSERT INTO hr.karyawan (id, nama)
SELECT p.karyawan_id, p.nama
  FROM transport.profiles p
 WHERE NOT EXISTS (SELECT 1 FROM hr.karyawan k WHERE k.id = p.karyawan_id);

ALTER TABLE transport.profiles ALTER COLUMN karyawan_id SET NOT NULL;

ALTER TABLE transport.profiles DROP CONSTRAINT IF EXISTS profiles_karyawan_id_fkey;
ALTER TABLE transport.profiles
  ADD CONSTRAINT profiles_karyawan_id_fkey
  FOREIGN KEY (karyawan_id) REFERENCES hr.karyawan(id) ON DELETE RESTRICT;

ALTER TABLE transport.profiles DROP CONSTRAINT IF EXISTS profiles_karyawan_id_key;
ALTER TABLE transport.profiles
  ADD CONSTRAINT profiles_karyawan_id_key UNIQUE (karyawan_id);

-- ── 2. Pendaftaran akun wajib membawa karyawan_id ───────────────────────────
-- Dipanggil trigger on_auth_user_created (menunjuk fungsi lewat OID, jadi
-- CREATE OR REPLACE di sini langsung berlaku).
CREATE OR REPLACE FUNCTION transport.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_karyawan_id UUID;
  v_nama TEXT;
BEGIN
  BEGIN
    v_karyawan_id := NULLIF(NEW.raw_user_meta_data->>'karyawan_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_karyawan_id := NULL;
  END;

  SELECT k.nama INTO v_nama FROM hr.karyawan k WHERE k.id = v_karyawan_id;
  IF v_nama IS NULL THEN
    RAISE EXCEPTION 'Hanya karyawan yang boleh menjadi pengguna. Pilih karyawan yang valid.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO transport.profiles (id, email, nama, role, karyawan_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'nama', ''), v_nama),
    'operator',
    v_karyawan_id
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 3. Daftar karyawan yang belum punya akun ────────────────────────────────
-- Dipakai form "Tambah pengguna". Lewat fungsi SECURITY DEFINER supaya schema
-- hr tidak perlu dibuka di Data API; hanya superadmin yang mendapat isinya.
CREATE OR REPLACE FUNCTION transport.karyawan_tanpa_akun()
RETURNS TABLE (id UUID, nama TEXT, tanggal_lahir DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT k.id, k.nama, k.tanggal_lahir
    FROM hr.karyawan k
   WHERE transport.is_superadmin()
     AND NOT EXISTS (SELECT 1 FROM transport.profiles p WHERE p.karyawan_id = k.id)
   ORDER BY k.nama;
$$;

REVOKE ALL ON FUNCTION transport.karyawan_tanpa_akun() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.karyawan_tanpa_akun() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
