-- ============================================================================
-- Migration 20260925000003: role login baru "admin"
--
-- Role keempat: admin. Menu: Jenis Unit, Unit, Unit Trailer, Driver, Customer,
-- Penawaran, Job, Pantau, Uang Jalan, Service, Laporan — bebas tambah/ubah/
-- hapus di semuanya (setara superadmin untuk menu-menu itu saja; TIDAK dapat
-- Tagihan/Piutang/Log Sistem/Pengguna/Karyawan).
--
-- Beda dengan finance kemarin: banyak tabel di sini RLS-nya SUDAH dikunci
-- superadmin-only (bukan cuma is_active_admin() generik), jadi menambahkan
-- 'admin' sebagai role yang sah TIDAK CUKUP — kebijakan RLS tulis (dan
-- beberapa baca yang di-scope jenis unit) harus diperluas eksplisit supaya
-- admin benar-benar bisa memakainya. Ini beda dari kasus invoices/customers-
-- baca yang otomatis kebuka lewat is_active_admin().
--
-- Fungsi/policy di bawah disalin dari definisi TERAKHIRNYA:
--   * profiles_aturan_role()  — terakhir dari migration 20260925000001.
--   * handle_new_user()       — terakhir dari migration 20260924000030.
--   * mulai_sesi()/ganti_role_aktif() — dari 20260924000025 (lalu disentuh
--     lagi migration 20260925000001 untuk label finance).
--   * can_access_unit()       — terakhir dari migration 20260923000002.
--   * Policy units/jobs/drivers/customers/jenis_unit — terakhir dari
--     20260601000001 (jobs read/write disederhanakan 20260601000002 memakai
--     can_access_unit()).
--   * Policy unit_trailer/jenis_unit_trailer — dari 20260924000013/000014.
--   * Policy quotations (delete) — dari 20260804000001.
-- Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. CHECK constraint role — tambah 'admin' ───────────────────────────────
ALTER TABLE transport.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE transport.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('superadmin', 'operator', 'finance', 'admin'));

ALTER TABLE transport.profiles DROP CONSTRAINT IF EXISTS profiles_roles_check;
ALTER TABLE transport.profiles ADD CONSTRAINT profiles_roles_check
  CHECK (cardinality(roles) >= 1 AND roles <@ ARRAY['superadmin', 'operator', 'finance', 'admin']::TEXT[]);

ALTER TABLE transport.sesi_pengguna DROP CONSTRAINT IF EXISTS sesi_pengguna_role_aktif_check;
ALTER TABLE transport.sesi_pengguna ADD CONSTRAINT sesi_pengguna_role_aktif_check
  CHECK (role_aktif IS NULL OR role_aktif IN ('superadmin', 'operator', 'finance', 'admin'));

-- ── 2. Helper is_admin(), pola sama seperti is_superadmin()/is_finance() ────
CREATE OR REPLACE FUNCTION transport.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT COALESCE(transport.role_aktif() = 'admin', false);
$function$;

-- ── 3. profiles_aturan_role() — kolom `role` kompat kini bisa 'admin' ───────
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

  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NEW.id = auth.uid()
     AND ((OLD.is_active AND NOT NEW.is_active) OR (OLD.status = 1 AND NEW.status <> 1)) THEN
    RAISE EXCEPTION 'Anda tidak bisa menonaktifkan atau menghapus akun sendiri.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 1 AND NEW.is_active AND NEW.karyawan_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NOT OLD.is_active OR NEW.karyawan_id IS DISTINCT FROM OLD.karyawan_id)
     AND NOT transport.karyawan_aktif(NEW.karyawan_id) THEN
    SELECT k.nama INTO v_nama FROM hr.karyawan k WHERE k.id = NEW.karyawan_id;
    RAISE EXCEPTION 'Pengguna tidak bisa diaktifkan: karyawan % berstatus Nonaktif. Aktifkan dulu karyawannya di menu Karyawan.',
      COALESCE(v_nama, 'ini') USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.roles IS NULL OR cardinality(NEW.roles) = 0 THEN
    NEW.roles := ARRAY[COALESCE(NEW.role, 'operator')];
  ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role AND NEW.roles = OLD.roles THEN
    NEW.roles := ARRAY[NEW.role];
  END IF;
  NEW.roles := ARRAY(SELECT DISTINCT r FROM unnest(NEW.roles) r ORDER BY r);
  NEW.role := CASE
    WHEN 'superadmin' = ANY (NEW.roles) THEN 'superadmin'
    WHEN 'admin' = ANY (NEW.roles) THEN 'admin'
    WHEN 'finance' = ANY (NEW.roles) THEN 'finance'
    ELSE 'operator'
  END;
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NEW.id = auth.uid()
     AND 'superadmin' = ANY (OLD.roles) AND NOT ('superadmin' = ANY (NEW.roles)) THEN
    RAISE EXCEPTION 'Role Super Administrator tidak bisa dilepas dari akun sendiri — minta super administrator lain.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Scope jenis unit hanya berarti untuk role operator.
  IF NOT ('operator' = ANY (NEW.roles)) THEN
    NEW.allowed_jenis_unit_ids := NULL;
  END IF;

  IF NEW.status = 1 AND NEW.is_active AND NEW.karyawan_id IS NOT NULL THEN
    SELECT string_agg(DISTINCT r, ', ') INTO v_bentrok
      FROM transport.profiles p, unnest(p.roles) r
     WHERE p.karyawan_id = NEW.karyawan_id AND p.id <> NEW.id AND p.status = 1 AND p.is_active
       AND r = ANY (NEW.roles);
    IF v_bentrok IS NOT NULL THEN
      SELECT k.nama INTO v_nama FROM hr.karyawan k WHERE k.id = NEW.karyawan_id;
      RAISE EXCEPTION 'Data sudah terdaftar: % sudah punya akun lain dengan role %.',
        COALESCE(v_nama, 'karyawan ini'),
        replace(replace(replace(replace(v_bentrok,
          'superadmin', 'Super Administrator'), 'operator', 'Operator'), 'finance', 'Finance'), 'admin', 'Admin')
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4. mulai_sesi() / ganti_role_aktif() — label log ikut kenal 'admin' ─────
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

  v_role := COALESCE(p_role, CASE WHEN 'operator' = ANY (v_roles) THEN 'operator' ELSE v_roles[1] END);
  IF NOT (v_role = ANY (v_roles)) THEN
    RAISE EXCEPTION 'Akun ini tidak punya role %.', v_role USING ERRCODE = '42501';
  END IF;

  UPDATE transport.sesi_pengguna SET status = 2, logout_at = now()
   WHERE auth_session_id = v_sesi_id AND status = 1;

  INSERT INTO transport.sesi_pengguna (user_id, auth_session_id, karyawan_id, ip_address, user_agent, role_aktif)
  VALUES (auth.uid(), v_sesi_id, v_karyawan, left(v_ip, 100), left(p_user_agent, 300), v_role);

  PERFORM transport._tulis_log('Login',
    'Login ke aplikasi web (' || v_email || ') sebagai '
      || CASE v_role
           WHEN 'superadmin' THEN 'Super Administrator'
           WHEN 'finance' THEN 'Finance'
           WHEN 'admin' THEN 'Admin'
           ELSE 'Operator'
         END,
    v_karyawan, v_ip);
  RETURN v_role;
END;
$$;

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
        || CASE p_role
             WHEN 'superadmin' THEN 'Super Administrator'
             WHEN 'finance' THEN 'Finance'
             WHEN 'admin' THEN 'Admin'
             ELSE 'Operator'
           END
        || ' (' || v_prof.email || ')',
      v_sesi.karyawan_id, v_sesi.ip_address);
  END IF;
  RETURN p_role;
END;
$$;

-- ── 5. handle_new_user() — roles titipan superadmin kini terima 'admin' ─────
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
    v_karyawan_id := NULLIF(NEW.raw_app_meta_data->>'karyawan_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_karyawan_id := NULL;
  END;

  SELECT k.nama INTO v_nama FROM hr.karyawan k WHERE k.id = v_karyawan_id AND k.status = 1;
  IF v_nama IS NULL THEN
    RAISE EXCEPTION 'Hanya karyawan yang boleh menjadi pengguna. Pilih karyawan yang valid.'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_pembuat := NULLIF(NEW.raw_app_meta_data->>'dibuat_oleh', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_pembuat := NULL;
  END;
  v_pembuat_valid := v_pembuat IS NOT NULL AND EXISTS (
    SELECT 1 FROM transport.profiles p
     WHERE p.id = v_pembuat AND 'superadmin' = ANY (p.roles) AND p.is_active AND p.status = 1);

  IF NOT v_pembuat_valid THEN
    RAISE EXCEPTION 'Akun pengguna hanya bisa dibuat super administrator lewat menu Pengguna.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_pembuat_valid THEN
    PERFORM set_config('app.log_pelaku_id', v_pembuat::text, true);
    PERFORM set_config('app.log_ip', COALESCE(NULLIF(NEW.raw_app_meta_data->>'ip_pembuat', ''), 'Supabase Auth'), true);
    IF jsonb_typeof(NEW.raw_app_meta_data->'roles') = 'array' THEN
      SELECT array_agg(DISTINCT r) INTO v_minta
        FROM jsonb_array_elements_text(NEW.raw_app_meta_data->'roles') r
       WHERE r IN ('superadmin', 'operator', 'finance', 'admin');
    ELSIF NEW.raw_app_meta_data->>'role' IN ('superadmin', 'operator', 'finance', 'admin') THEN
      v_minta := ARRAY[NEW.raw_app_meta_data->>'role'];
    END IF;
    IF cardinality(v_minta) >= 1 THEN
      v_roles := v_minta;
    END IF;
  END IF;

  INSERT INTO transport.profiles (id, email, nama, role, roles, karyawan_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'nama', ''), v_nama),
    CASE
      WHEN 'superadmin' = ANY (v_roles) THEN 'superadmin'
      WHEN 'admin' = ANY (v_roles) THEN 'admin'
      WHEN 'finance' = ANY (v_roles) THEN 'finance'
      ELSE 'operator'
    END,
    v_roles,
    v_karyawan_id
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('app.log_pelaku_id', '', true);
  PERFORM set_config('app.log_ip', '', true);
  RETURN NEW;
END;
$function$;

-- ── 6. can_access_unit() — admin dianggap seperti superadmin untuk scope ────
-- Otomatis ikut memperbaiki can_access_job() dan seluruh RLS jobs (pakai
-- can_access_unit() sejak migration 20260601000002), plus ganti_unit_job().
CREATE OR REPLACE FUNCTION transport.can_access_unit(p_unit_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = transport
STABLE
AS $$
  SELECT
    transport.is_superadmin()
    OR transport.is_admin()
    OR EXISTS (
      SELECT 1
      FROM transport.units u
      WHERE u.id = p_unit_id
        AND u.jenis_unit_id = ANY (
          COALESCE(transport.current_user_jenis_scope(), ARRAY[]::UUID[])
        )
    );
$$;

-- ── 7. RLS: units — baca (scope) & tulis kini juga buat admin ───────────────
DROP POLICY IF EXISTS "user_read_units_in_scope" ON transport.units;
CREATE POLICY "user_read_units_in_scope"
  ON transport.units FOR SELECT
  USING (
    transport.is_active_admin()
    AND (
      transport.is_superadmin()
      OR transport.is_admin()
      OR jenis_unit_id = ANY (COALESCE(transport.current_user_jenis_scope(), ARRAY[]::UUID[]))
    )
  );

DROP POLICY IF EXISTS "owner_write_units" ON transport.units;
CREATE POLICY "owner_write_units"
  ON transport.units FOR INSERT
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

DROP POLICY IF EXISTS "owner_update_units" ON transport.units;
CREATE POLICY "owner_update_units"
  ON transport.units FOR UPDATE
  USING (transport.is_superadmin() OR transport.is_admin())
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

DROP POLICY IF EXISTS "owner_delete_units" ON transport.units;
CREATE POLICY "owner_delete_units"
  ON transport.units FOR DELETE
  USING (transport.is_superadmin() OR transport.is_admin());

-- ── 8. RLS: drivers — tulis kini juga buat admin ────────────────────────────
DROP POLICY IF EXISTS "owner_write_drivers" ON transport.drivers;
CREATE POLICY "owner_write_drivers"
  ON transport.drivers FOR INSERT
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

DROP POLICY IF EXISTS "owner_update_drivers" ON transport.drivers;
CREATE POLICY "owner_update_drivers"
  ON transport.drivers FOR UPDATE
  USING (transport.is_superadmin() OR transport.is_admin())
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

DROP POLICY IF EXISTS "owner_delete_drivers" ON transport.drivers;
CREATE POLICY "owner_delete_drivers"
  ON transport.drivers FOR DELETE
  USING (transport.is_superadmin() OR transport.is_admin());

-- ── 9. RLS: customers — tulis kini juga buat admin ──────────────────────────
DROP POLICY IF EXISTS "owner_write_customers" ON transport.customers;
CREATE POLICY "owner_write_customers"
  ON transport.customers FOR INSERT
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

DROP POLICY IF EXISTS "owner_update_customers" ON transport.customers;
CREATE POLICY "owner_update_customers"
  ON transport.customers FOR UPDATE
  USING (transport.is_superadmin() OR transport.is_admin())
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

DROP POLICY IF EXISTS "owner_delete_customers" ON transport.customers;
CREATE POLICY "owner_delete_customers"
  ON transport.customers FOR DELETE
  USING (transport.is_superadmin() OR transport.is_admin());

-- ── 10. RLS: jenis_unit — tulis kini juga buat admin ────────────────────────
DROP POLICY IF EXISTS "owner_write_jenis_unit" ON transport.jenis_unit;
CREATE POLICY "owner_write_jenis_unit"
  ON transport.jenis_unit FOR ALL
  USING (transport.is_superadmin() OR transport.is_admin())
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

-- ── 11. RLS: unit_trailer — baca (scope) & tulis kini juga buat admin ───────
-- Sejak migration 20260924000014, unit_trailer TIDAK PUNYA kolom jenis_unit_id
-- lagi (dipindah ke jenis_unit_trailer.jenis_unit_id, migration 000016) —
-- scope-nya dicek lewat join ke jenis_unit_trailer, bukan kolom langsung.
DROP POLICY IF EXISTS "user_read_unit_trailer_in_scope" ON transport.unit_trailer;
CREATE POLICY "user_read_unit_trailer_in_scope"
  ON transport.unit_trailer FOR SELECT TO authenticated
  USING (
    transport.is_active_admin()
    AND (
      transport.is_superadmin()
      OR transport.is_admin()
      OR EXISTS (
        SELECT 1 FROM transport.jenis_unit_trailer jt
         WHERE jt.id = unit_trailer.jenis_unit_trailer_id
           AND jt.jenis_unit_id = ANY (COALESCE(transport.current_user_jenis_scope(), ARRAY[]::UUID[]))
      )
    )
  );

DROP POLICY IF EXISTS "superadmin_insert_unit_trailer" ON transport.unit_trailer;
CREATE POLICY "superadmin_insert_unit_trailer"
  ON transport.unit_trailer FOR INSERT TO authenticated
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

DROP POLICY IF EXISTS "superadmin_update_unit_trailer" ON transport.unit_trailer;
CREATE POLICY "superadmin_update_unit_trailer"
  ON transport.unit_trailer FOR UPDATE TO authenticated
  USING (transport.is_superadmin() OR transport.is_admin())
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

-- ── 12. RLS: jenis_unit_trailer — baca (scope) & tulis kini juga buat admin ─
DROP POLICY IF EXISTS "admin_read_jenis_unit_trailer" ON transport.jenis_unit_trailer;
CREATE POLICY "admin_read_jenis_unit_trailer"
  ON transport.jenis_unit_trailer FOR SELECT TO authenticated
  USING (
    transport.is_active_admin()
    AND (
      transport.is_superadmin()
      OR transport.is_admin()
      OR jenis_unit_id = ANY (COALESCE(transport.current_user_jenis_scope(), ARRAY[]::UUID[]))
    )
  );

DROP POLICY IF EXISTS "superadmin_insert_jenis_unit_trailer" ON transport.jenis_unit_trailer;
CREATE POLICY "superadmin_insert_jenis_unit_trailer"
  ON transport.jenis_unit_trailer FOR INSERT TO authenticated
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

DROP POLICY IF EXISTS "superadmin_update_jenis_unit_trailer" ON transport.jenis_unit_trailer;
CREATE POLICY "superadmin_update_jenis_unit_trailer"
  ON transport.jenis_unit_trailer FOR UPDATE TO authenticated
  USING (transport.is_superadmin() OR transport.is_admin())
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

-- ── 13. RLS: quotations — hapus kini juga buat admin (insert/update sudah
--     terbuka is_active_admin() sejak 20260804000001) ───────────────────────
DROP POLICY IF EXISTS "owner_delete_quotations" ON transport.quotations;
CREATE POLICY "owner_delete_quotations"
  ON transport.quotations FOR DELETE
  USING (transport.is_superadmin() OR transport.is_admin());

NOTIFY pgrst, 'reload schema';
