-- ============================================================================
-- Migration 20260924000026: superadmin boleh mengedit akunnya sendiri
--
-- Sebelumnya akun sendiri hanya bisa diubah dari halaman Profil (nama &
-- password); menu Pengguna menolaknya. Sekarang akun sendiri bisa diedit di
-- menu Pengguna (email, karyawan, role, scope) dengan pengaman supaya tidak
-- mengunci diri:
--   * role Super Administrator tidak bisa dilepas dari akun sendiri,
--   * akun sendiri tidak bisa dinonaktifkan / dihapus.
-- Policy users_update_own_profile sudah mengizinkan UPDATE baris sendiri;
-- perubahan role/scope/status tetap hanya untuk superadmin (trigger ini).
-- Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

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

  -- Akun sendiri boleh diedit superadmin, tapi tidak boleh mengunci diri:
  -- role Super Administrator tidak bisa dilepas, akun tidak bisa dinonaktifkan
  -- atau dihapus (role dicek setelah normalisasi roles di bawah).
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NEW.id = auth.uid()
     AND ((OLD.is_active AND NOT NEW.is_active) OR (OLD.status = 1 AND NEW.status <> 1)) THEN
    RAISE EXCEPTION 'Anda tidak bisa menonaktifkan atau menghapus akun sendiri.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Kompatibilitas: kode lama yang hanya mengisi/mengubah `role`.
  IF NEW.roles IS NULL OR cardinality(NEW.roles) = 0 THEN
    NEW.roles := ARRAY[COALESCE(NEW.role, 'operator')];
  ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role AND NEW.roles = OLD.roles THEN
    NEW.roles := ARRAY[NEW.role];
  END IF;
  NEW.roles := ARRAY(SELECT DISTINCT r FROM unnest(NEW.roles) r ORDER BY r);
  NEW.role := CASE WHEN 'superadmin' = ANY (NEW.roles) THEN 'superadmin' ELSE 'operator' END;
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND NEW.id = auth.uid()
     AND 'superadmin' = ANY (OLD.roles) AND NOT ('superadmin' = ANY (NEW.roles)) THEN
    RAISE EXCEPTION 'Role Super Administrator tidak bisa dilepas dari akun sendiri — minta super administrator lain.'
      USING ERRCODE = 'check_violation';
  END IF;
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
NOTIFY pgrst, 'reload schema';
