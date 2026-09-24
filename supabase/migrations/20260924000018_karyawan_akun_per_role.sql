-- ============================================================================
-- Migration 20260924000018: satu karyawan boleh punya akun per ROLE
--
-- Sebelumnya: satu karyawan hanya boleh satu akun (profiles.karyawan_id unik).
-- Sekarang : satu karyawan boleh punya beberapa akun asal ROLE-nya berbeda
--            (mis. satu akun Operator + satu akun Super Administrator).
--            Kombinasi karyawan + role yang sama ditolak ("data sudah terdaftar").
--            Email login tetap unik per akun.
--
-- Karena akun Auth dibuat dulu lalu profilnya, handle_new_user() kini langsung
-- memakai role yang dititipkan backend (hanya bila pembuatnya superadmin aktif
-- yang valid) — kalau tidak, profil selalu dibuat sebagai operator seperti
-- sebelumnya. Tanpa ini, membuat akun superadmin untuk karyawan yang sudah
-- punya akun operator akan bentrok di langkah pembuatan profil.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TABLE transport.profiles DROP CONSTRAINT IF EXISTS profiles_karyawan_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_karyawan_role_unique
  ON transport.profiles (karyawan_id, role) WHERE status = 1;

-- ── Pilihan karyawan di form Tambah/Edit Pengguna ───────────────────────────
-- Semua karyawan aktif + akun yang sudah dimilikinya (untuk cek "sudah terdaftar").
CREATE OR REPLACE FUNCTION transport.karyawan_untuk_pengguna()
RETURNS TABLE (id UUID, nama TEXT, tanggal_lahir DATE, akun JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT k.id, k.nama, k.tanggal_lahir,
         COALESCE(
           (SELECT jsonb_agg(jsonb_build_object('user_id', p.id, 'role', p.role) ORDER BY p.role)
              FROM transport.profiles p
             WHERE p.karyawan_id = k.id AND p.status = 1),
           '[]'::jsonb) AS akun
    FROM hr.karyawan k
   WHERE transport.is_superadmin()
     AND k.status = 1
   ORDER BY k.nama;
$$;
REVOKE ALL ON FUNCTION transport.karyawan_untuk_pengguna() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.karyawan_untuk_pengguna() TO authenticated, service_role;

-- ── Pembuatan profil: role titipan superadmin ───────────────────────────────
CREATE OR REPLACE FUNCTION transport.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_karyawan_id UUID;
  v_nama TEXT;
  v_pembuat UUID;
  v_pembuat_valid BOOLEAN := false;
  v_role TEXT := 'operator';
BEGIN
  BEGIN
    v_karyawan_id := NULLIF(NEW.raw_user_meta_data->>'karyawan_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_karyawan_id := NULL;
  END;

  SELECT k.nama INTO v_nama FROM hr.karyawan k WHERE k.id = v_karyawan_id AND k.status = 1;
  IF v_nama IS NULL THEN
    RAISE EXCEPTION 'Hanya karyawan yang boleh menjadi pengguna. Pilih karyawan yang valid.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Pembuat akun (untuk log sistem & role) — dipercaya hanya bila superadmin aktif.
  BEGIN
    v_pembuat := NULLIF(NEW.raw_user_meta_data->>'dibuat_oleh', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_pembuat := NULL;
  END;
  v_pembuat_valid := v_pembuat IS NOT NULL AND EXISTS (
    SELECT 1 FROM transport.profiles p
     WHERE p.id = v_pembuat AND p.role = 'superadmin' AND p.is_active AND p.status = 1);

  IF v_pembuat_valid THEN
    PERFORM set_config('app.log_pelaku_id', v_pembuat::text, true);
    PERFORM set_config('app.log_ip', COALESCE(NEW.raw_user_meta_data->>'ip_pembuat', ''), true);
    IF NEW.raw_user_meta_data->>'role' IN ('superadmin', 'operator') THEN
      v_role := NEW.raw_user_meta_data->>'role';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM transport.profiles p
              WHERE p.karyawan_id = v_karyawan_id AND p.role = v_role AND p.status = 1) THEN
    RAISE EXCEPTION 'Data sudah terdaftar: % sudah punya akun dengan role %.',
      v_nama, CASE v_role WHEN 'superadmin' THEN 'Super Administrator' ELSE 'Operator' END
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO transport.profiles (id, email, nama, role, karyawan_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'nama', ''), v_nama),
    v_role,
    v_karyawan_id
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('app.log_pelaku_id', '', true);
  PERFORM set_config('app.log_ip', '', true);
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
