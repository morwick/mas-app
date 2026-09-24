-- ============================================================================
-- Migration 20260924000005: tambah karyawan + pilihan karyawan saat edit
--
-- * tambah_karyawan(): dipakai tombol "Tambah karyawan" di halaman Pengguna.
-- * karyawan_pilihan_pengguna(): pilihan nama di form "Edit pengguna" —
--   karyawan yang belum punya akun ditambah karyawan milik pengguna itu
--   sendiri, supaya pilihannya saat ini tetap ada di daftar.
--
-- Keduanya SECURITY DEFINER (seperti karyawan_tanpa_akun) supaya schema hr
-- tidak perlu dibuka di Data API; hanya superadmin aktif yang boleh memakai.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.tambah_karyawan(
  p_nama          TEXT,
  p_tanggal_lahir DATE DEFAULT NULL,
  p_alamat        TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID, nama TEXT, tanggal_lahir DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya super administrator yang boleh menambah karyawan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(coalesce(p_nama, '')) = '' THEN
    RAISE EXCEPTION 'Nama karyawan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_lahir IS NOT NULL AND p_tanggal_lahir > current_date THEN
    RAISE EXCEPTION 'Tanggal lahir tidak boleh di masa depan.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  INSERT INTO hr.karyawan AS k (nama, tanggal_lahir, alamat)
  VALUES (btrim(p_nama), p_tanggal_lahir, NULLIF(btrim(coalesce(p_alamat, '')), ''))
  RETURNING k.id, k.nama, k.tanggal_lahir;
END;
$$;

REVOKE ALL ON FUNCTION transport.tambah_karyawan(TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.tambah_karyawan(TEXT, DATE, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION transport.karyawan_pilihan_pengguna(p_user_id UUID)
RETURNS TABLE (id UUID, nama TEXT, tanggal_lahir DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT k.id, k.nama, k.tanggal_lahir
    FROM hr.karyawan k
   WHERE transport.is_superadmin()
     AND NOT EXISTS (
       SELECT 1 FROM transport.profiles p
        WHERE p.karyawan_id = k.id AND p.id <> p_user_id
     )
   ORDER BY k.nama;
$$;

REVOKE ALL ON FUNCTION transport.karyawan_pilihan_pengguna(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.karyawan_pilihan_pengguna(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
