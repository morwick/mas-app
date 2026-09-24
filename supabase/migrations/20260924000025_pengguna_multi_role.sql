-- ============================================================================
-- Migration 20260924000025: satu akun pengguna, banyak role
--
-- Sebelumnya: satu akun = satu role; karyawan yang butuh dua role harus punya
-- dua akun (dua email). Sekarang:
--   * profiles.roles TEXT[] — role yang DIMILIKI akun (superadmin/operator).
--     Kolom lama `role` tetap ada sebagai turunan (role tertinggi) untuk
--     kompatibilitas; hak akses TIDAK lagi membacanya.
--   * Role yang DIPAKAI disimpan per sesi login: sesi_pengguna.role_aktif.
--     Login memakai role terendah (operator) bila akun punya beberapa role;
--     pengguna lalu memilih/ganti role (ganti_role_aktif) — tercatat di log.
--   * Semua pemeriksaan hak akses (is_superadmin, current_user_role,
--     is_active_admin, current_user_jenis_scope, storage) memakai role aktif.
--   * Satu karyawan + satu role tidak boleh di dua akun aktif (dicek irisan
--     roles). Akun lama per-role bisa digabung: nonaktifkan akun keduanya,
--     lalu tambahkan role-nya ke akun utama.
--   * Celah lama ditutup: pengguna non-superadmin tidak bisa mengubah role,
--     scope, status aktif, karyawan, atau email di baris profilnya sendiri
--     (policy users_update_own_profile dulu mengizinkannya).
--
-- Email tetap unik per akun — itu identitas login Supabase Auth.
-- Perubahan data: profiles.roles diisi dari role lama (tercatat di log
-- sistem, "Migrasi 20260924000025"); sesi aktif diberi role_aktif = role lama.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Kolom roles + isi dari role lama ─────────────────────────────────────
ALTER TABLE transport.profiles ADD COLUMN IF NOT EXISTS roles TEXT[];

DO $$
DECLARE
  v_admin UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM transport.profiles WHERE roles IS NULL) THEN
    RETURN;
  END IF;
  SELECT p.karyawan_id INTO v_admin FROM transport.profiles p
   WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat pengisian roles.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_admin, 'Migrasi 20260924000025');
  UPDATE transport.profiles SET roles = ARRAY[role] WHERE roles IS NULL;
  PERFORM transport.selesai_sesi_manual();
END $$;

ALTER TABLE transport.profiles ALTER COLUMN roles SET NOT NULL;
ALTER TABLE transport.profiles DROP CONSTRAINT IF EXISTS profiles_roles_check;
ALTER TABLE transport.profiles ADD CONSTRAINT profiles_roles_check
  CHECK (cardinality(roles) >= 1 AND roles <@ ARRAY['superadmin', 'operator']::TEXT[]);

-- Karyawan + role unik kini dicek lewat irisan roles (trigger di bawah).
DROP INDEX IF EXISTS transport.profiles_karyawan_role_unique;

-- ── 2. Role aktif per sesi login ────────────────────────────────────────────
ALTER TABLE transport.sesi_pengguna ADD COLUMN IF NOT EXISTS role_aktif TEXT;
ALTER TABLE transport.sesi_pengguna DROP CONSTRAINT IF EXISTS sesi_pengguna_role_aktif_check;
ALTER TABLE transport.sesi_pengguna ADD CONSTRAINT sesi_pengguna_role_aktif_check
  CHECK (role_aktif IS NULL OR role_aktif IN ('superadmin', 'operator'));

-- Sesi yang sedang login tetap berjalan dengan role lamanya (tabel sesi tidak dicatat log).
UPDATE transport.sesi_pengguna s SET role_aktif = p.role
  FROM transport.profiles p
 WHERE p.id = s.user_id AND s.status = 1 AND s.role_aktif IS NULL;

CREATE OR REPLACE FUNCTION transport.role_aktif()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_sesi UUID;
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_sesi := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  SELECT s.role_aktif INTO v_role
    FROM transport.sesi_pengguna s
    JOIN transport.profiles p ON p.id = s.user_id
   WHERE s.auth_session_id = v_sesi
     AND s.user_id = auth.uid()
     AND s.status = 1
     AND p.is_active AND p.status = 1
     AND s.role_aktif = ANY (p.roles)
     AND transport.karyawan_aktif(p.karyawan_id);
  RETURN v_role;
END;
$$;
REVOKE ALL ON FUNCTION transport.role_aktif() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.role_aktif() TO authenticated, service_role;

-- ── 3. Hak akses memakai role aktif ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.is_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT COALESCE(transport.role_aktif() = 'superadmin', false);
$function$;

CREATE OR REPLACE FUNCTION transport.current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT transport.role_aktif();
$function$;

CREATE OR REPLACE FUNCTION transport.is_active_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT transport.role_aktif() IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION transport.storage_is_active_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT transport.role_aktif() IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION transport.current_user_jenis_scope()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT p.allowed_jenis_unit_ids
    FROM profiles p
   WHERE p.id = auth.uid() AND transport.role_aktif() IS NOT NULL
   LIMIT 1;
$function$;

-- ── 4. Aturan baris profil ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.profiles_aturan_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_bentrok TEXT;
  v_nama TEXT;
BEGIN
  -- Celah lama: pengguna biasa tidak boleh mengubah hak aksesnya sendiri.
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NOT transport.is_superadmin()
     AND (NEW.roles IS DISTINCT FROM OLD.roles
          OR NEW.role IS DISTINCT FROM OLD.role
          OR NEW.allowed_jenis_unit_ids IS DISTINCT FROM OLD.allowed_jenis_unit_ids
          OR NEW.is_active IS DISTINCT FROM OLD.is_active
          OR NEW.karyawan_id IS DISTINCT FROM OLD.karyawan_id
          OR NEW.email IS DISTINCT FROM OLD.email
          OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Hanya super administrator yang boleh mengubah role, scope, atau status akun.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Kompatibilitas: kode lama yang hanya mengisi/mengubah `role`.
  IF NEW.roles IS NULL OR cardinality(NEW.roles) = 0 THEN
    NEW.roles := ARRAY[COALESCE(NEW.role, 'operator')];
  ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role AND NEW.roles = OLD.roles THEN
    NEW.roles := ARRAY[NEW.role];
  END IF;
  NEW.roles := ARRAY(SELECT DISTINCT r FROM unnest(NEW.roles) r ORDER BY r);
  NEW.role := CASE WHEN 'superadmin' = ANY (NEW.roles) THEN 'superadmin' ELSE 'operator' END;
  -- Scope jenis unit hanya berarti untuk role operator.
  IF NOT ('operator' = ANY (NEW.roles)) THEN
    NEW.allowed_jenis_unit_ids := NULL;
  END IF;

  -- Satu karyawan + satu role hanya di satu akun AKTIF. Akun nonaktif tidak
  -- dihitung, supaya akun lama per-role bisa digabung: nonaktifkan akun yang
  -- lama, lalu tambahkan role-nya ke akun utama.
  IF NEW.status = 1 AND NEW.is_active AND NEW.karyawan_id IS NOT NULL THEN
    SELECT string_agg(DISTINCT r, ', ') INTO v_bentrok
      FROM transport.profiles p, unnest(p.roles) r
     WHERE p.karyawan_id = NEW.karyawan_id AND p.id <> NEW.id AND p.status = 1 AND p.is_active
       AND r = ANY (NEW.roles);
    IF v_bentrok IS NOT NULL THEN
      SELECT k.nama INTO v_nama FROM hr.karyawan k WHERE k.id = NEW.karyawan_id;
      RAISE EXCEPTION 'Data sudah terdaftar: % sudah punya akun lain dengan role %.',
        COALESCE(v_nama, 'karyawan ini'),
        replace(replace(v_bentrok, 'superadmin', 'Super Administrator'), 'operator', 'Operator')
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_aturan_role ON transport.profiles;
CREATE TRIGGER trg_profiles_aturan_role BEFORE INSERT OR UPDATE ON transport.profiles
  FOR EACH ROW EXECUTE FUNCTION transport.profiles_aturan_role();

-- ── 5. Login, ganti role, profil sendiri ────────────────────────────────────
DROP FUNCTION IF EXISTS transport.mulai_sesi(TEXT, TEXT);
CREATE OR REPLACE FUNCTION transport.mulai_sesi(p_ip TEXT, p_user_agent TEXT DEFAULT NULL, p_role TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_sesi_id UUID;
  v_karyawan UUID;
  v_email TEXT;
  v_roles TEXT[];
  v_role TEXT;
  v_ip TEXT := NULLIF(btrim(COALESCE(p_ip, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Butuh login' USING ERRCODE = '28000';
  END IF;
  BEGIN
    v_sesi_id := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_sesi_id := NULL;
  END;
  IF v_sesi_id IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak dikenali. Silakan login lagi.' USING ERRCODE = '28000';
  END IF;
  IF v_ip IS NULL THEN
    RAISE EXCEPTION 'IP address pengguna tidak diketahui — login dibatalkan.' USING ERRCODE = '28000';
  END IF;

  SELECT p.karyawan_id, p.email, p.roles INTO v_karyawan, v_email, v_roles
    FROM transport.profiles p
   WHERE p.id = auth.uid() AND p.is_active AND p.status = 1;
  IF v_karyawan IS NULL THEN
    RAISE EXCEPTION 'Akun tidak aktif atau tidak terhubung ke karyawan.' USING ERRCODE = '28000';
  END IF;
  IF NOT transport.karyawan_aktif(v_karyawan) THEN
    RAISE EXCEPTION 'Karyawan pemilik akun ini berstatus nonaktif. Hubungi super-admin.' USING ERRCODE = '28000';
  END IF;

  -- Beberapa role → mulai dari yang paling terbatas; pengguna memilih setelahnya.
  v_role := COALESCE(p_role, CASE WHEN 'operator' = ANY (v_roles) THEN 'operator' ELSE v_roles[1] END);
  IF NOT (v_role = ANY (v_roles)) THEN
    RAISE EXCEPTION 'Akun ini tidak punya role %.', v_role USING ERRCODE = '42501';
  END IF;

  -- Sesi yang sama dibuka ulang → ganti yang lama.
  UPDATE transport.sesi_pengguna SET status = 2, logout_at = now()
   WHERE auth_session_id = v_sesi_id AND status = 1;

  INSERT INTO transport.sesi_pengguna (user_id, auth_session_id, karyawan_id, ip_address, user_agent, role_aktif)
  VALUES (auth.uid(), v_sesi_id, v_karyawan, left(v_ip, 100), left(p_user_agent, 300), v_role);

  PERFORM transport._tulis_log('Login',
    'Login ke aplikasi web (' || v_email || ') sebagai '
      || CASE v_role WHEN 'superadmin' THEN 'Super Administrator' ELSE 'Operator' END,
    v_karyawan, v_ip);
  RETURN v_role;
END;
$$;
REVOKE ALL ON FUNCTION transport.mulai_sesi(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.mulai_sesi(TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION transport.ganti_role_aktif(p_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_sesi transport.sesi_pengguna%ROWTYPE;
  v_prof transport.profiles%ROWTYPE;
BEGIN
  BEGIN
    SELECT * INTO v_sesi FROM transport.sesi_pengguna
     WHERE auth_session_id = NULLIF(auth.jwt() ->> 'session_id', '')::uuid
       AND user_id = auth.uid() AND status = 1;
  EXCEPTION WHEN others THEN
    v_sesi := NULL;
  END;
  IF v_sesi.id IS NULL THEN
    RAISE EXCEPTION 'Sesi tidak ditemukan. Silakan login lagi.' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_prof FROM transport.profiles WHERE id = v_sesi.user_id AND is_active AND status = 1;
  IF v_prof.id IS NULL OR NOT (p_role = ANY (v_prof.roles)) THEN
    RAISE EXCEPTION 'Akun ini tidak punya role tersebut.' USING ERRCODE = '42501';
  END IF;
  IF v_sesi.role_aktif IS DISTINCT FROM p_role THEN
    UPDATE transport.sesi_pengguna SET role_aktif = p_role WHERE id = v_sesi.id;
    PERFORM transport._tulis_log('Update Data',
      'Ganti role aktif menjadi '
        || CASE p_role WHEN 'superadmin' THEN 'Super Administrator' ELSE 'Operator' END
        || ' (' || v_prof.email || ')',
      v_sesi.karyawan_id, v_sesi.ip_address);
  END IF;
  RETURN p_role;
END;
$$;
REVOKE ALL ON FUNCTION transport.ganti_role_aktif(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.ganti_role_aktif(TEXT) TO authenticated;

-- Identitas untuk backend: role yang dimiliki + role aktif sesi ini.
CREATE OR REPLACE FUNCTION transport.profil_saya()
RETURNS TABLE (nama TEXT, email TEXT, roles TEXT[], role_aktif TEXT, allowed_jenis_unit_ids UUID[], is_active BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT p.nama, p.email, p.roles, transport.role_aktif(), p.allowed_jenis_unit_ids, p.is_active
    FROM transport.profiles p
   WHERE p.id = auth.uid() AND p.status = 1;
$$;
REVOKE ALL ON FUNCTION transport.profil_saya() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.profil_saya() TO authenticated;

-- ── 6. Fungsi lain yang membaca role ────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.mulai_sesi_manual(p_karyawan_id UUID, p_keterangan TEXT DEFAULT 'SQL Editor')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  -- Hanya karyawan yang punya akun dengan role superadmin (aktif).
  IF NOT EXISTS (SELECT 1 FROM transport.profiles p
                  WHERE p.karyawan_id = p_karyawan_id AND 'superadmin' = ANY (p.roles)
                    AND p.is_active AND p.status = 1) THEN
    RAISE EXCEPTION 'Karyawan % bukan superadmin aktif — tidak bisa dipakai untuk sesi manual.', p_karyawan_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Tingkat koneksi (bukan transaksi) supaya berlaku untuk perintah berikutnya.
  PERFORM set_config('app.manual_karyawan', p_karyawan_id::text, false);
  PERFORM set_config('app.manual_ip', left(COALESCE(NULLIF(btrim(p_keterangan), ''), 'SQL Editor'), 100), false);
END;
$$;
REVOKE ALL ON FUNCTION transport.mulai_sesi_manual(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION transport._cek_karyawan_boleh_nonaktif(p_id UUID, p_aksi TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM transport.profiles p WHERE p.id = auth.uid() AND p.karyawan_id = p_id) THEN
    RAISE EXCEPTION 'Tidak bisa % karyawan milik akun yang sedang Anda pakai.', p_aksi
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM transport.profiles p
      JOIN hr.karyawan k ON k.id = p.karyawan_id
     WHERE 'superadmin' = ANY (p.roles) AND p.is_active AND p.status = 1
       AND k.is_active AND k.status = 1 AND k.id <> p_id
  ) THEN
    RAISE EXCEPTION 'Tidak bisa % karyawan ini: sistem akan kehilangan super-admin aktif.', p_aksi
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION transport._cek_karyawan_boleh_nonaktif(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Pilihan karyawan di form pengguna: role milik akun AKTIF (satu baris per role).
CREATE OR REPLACE FUNCTION transport.karyawan_untuk_pengguna()
RETURNS TABLE (id UUID, nama TEXT, tanggal_lahir DATE, akun JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT k.id, k.nama, k.tanggal_lahir,
         COALESCE(
           (SELECT jsonb_agg(jsonb_build_object('user_id', p.id, 'role', r) ORDER BY r)
              FROM transport.profiles p, unnest(p.roles) r
             WHERE p.karyawan_id = k.id AND p.status = 1 AND p.is_active),
           '[]'::jsonb) AS akun
    FROM hr.karyawan k
   WHERE transport.is_superadmin()
     AND k.status = 1
     AND k.is_active
   ORDER BY k.nama;
$$;

CREATE OR REPLACE FUNCTION transport.daftar_karyawan(
  p_q      TEXT    DEFAULT NULL,
  p_aktif  BOOLEAN DEFAULT NULL,
  p_limit  INT     DEFAULT 10,
  p_offset INT     DEFAULT 0
)
RETURNS TABLE (
  id UUID, nama TEXT, tanggal_lahir DATE, alamat TEXT, is_active BOOLEAN,
  akun JSONB, driver JSONB, total BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_q TEXT := NULLIF(btrim(COALESCE(p_q, '')), '');
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya super administrator yang boleh melihat data karyawan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT k.id, k.nama, k.tanggal_lahir, k.alamat, k.is_active,
         COALESCE(
           (SELECT jsonb_agg(jsonb_build_object('user_id', p.id, 'role', r, 'email', p.email) ORDER BY r)
              FROM transport.profiles p, unnest(p.roles) r
             WHERE p.karyawan_id = k.id AND p.status = 1),
           '[]'::jsonb),
         (SELECT jsonb_build_object('id', d.id, 'no_hp', d.no_hp)
            FROM transport.drivers d
           WHERE d.karyawan_id = k.id AND d.status = 1
           LIMIT 1),
         count(*) OVER ()
    FROM hr.karyawan k
   WHERE k.status = 1
     AND (p_aktif IS NULL OR k.is_active = p_aktif)
     AND (v_q IS NULL OR k.nama ILIKE '%' || v_q || '%' OR k.alamat ILIKE '%' || v_q || '%')
   ORDER BY k.nama, k.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 5000)
   OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

-- Akun baru dari Supabase Auth: roles titipan superadmin (metadata `roles`,
-- atau `role` dari backend lama).
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
  v_roles TEXT[] := ARRAY['operator'];
  v_minta TEXT[];
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

  -- Pembuat akun (untuk log sistem & roles) — dipercaya hanya bila superadmin aktif.
  BEGIN
    v_pembuat := NULLIF(NEW.raw_user_meta_data->>'dibuat_oleh', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_pembuat := NULL;
  END;
  v_pembuat_valid := v_pembuat IS NOT NULL AND EXISTS (
    SELECT 1 FROM transport.profiles p
     WHERE p.id = v_pembuat AND 'superadmin' = ANY (p.roles) AND p.is_active AND p.status = 1);

  IF v_pembuat_valid THEN
    PERFORM set_config('app.log_pelaku_id', v_pembuat::text, true);
    PERFORM set_config('app.log_ip', COALESCE(NEW.raw_user_meta_data->>'ip_pembuat', ''), true);
    IF jsonb_typeof(NEW.raw_user_meta_data->'roles') = 'array' THEN
      SELECT array_agg(DISTINCT r) INTO v_minta
        FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'roles') r
       WHERE r IN ('superadmin', 'operator');
    ELSIF NEW.raw_user_meta_data->>'role' IN ('superadmin', 'operator') THEN
      v_minta := ARRAY[NEW.raw_user_meta_data->>'role'];
    END IF;
    IF cardinality(v_minta) >= 1 THEN
      v_roles := v_minta;
    END IF;
  END IF;

  -- Irisan karyawan + role dengan akun lain ditolak oleh trigger profiles_aturan_role.
  INSERT INTO transport.profiles (id, email, nama, role, roles, karyawan_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'nama', ''), v_nama),
    CASE WHEN 'superadmin' = ANY (v_roles) THEN 'superadmin' ELSE 'operator' END,
    v_roles,
    v_karyawan_id
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('app.log_pelaku_id', '', true);
  PERFORM set_config('app.log_ip', '', true);
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
