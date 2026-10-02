-- ============================================================================
-- Migration 20261001000011: tambah pengguna gagal "Database error creating
--                           new user" — trigger membaca app_metadata terlalu awal
--
-- Backend menitipkan karyawan_id, roles, dan pembuat akun di app_metadata
-- (hanya bisa diisi service role — migration 20260924000030). Supabase Auth
-- membuat akun dalam satu transaksi dua langkah:
--   1. INSERT auth.users  — app_metadata baru berisi provider;
--   2. UPDATE auth.users  — app_metadata kiriman backend ditambahkan.
-- Trigger AFTER INSERT lama berjalan setelah langkah 1, sehingga karyawan_id
-- belum ada dan akun selalu ditolak ("Hanya karyawan yang boleh menjadi
-- pengguna").
--
-- Perbaikan: trigger menjadi CONSTRAINT TRIGGER DEFERRABLE INITIALLY
-- DEFERRED — dijalankan di akhir transaksi, lalu membaca ulang baris
-- auth.users yang sudah lengkap. Aturannya tidak berubah (salinan
-- 20260925000003):
--   BATASAN: akun wajib terhubung ke karyawan yang valid dan hanya bisa dibuat
--   superadmin aktif lewat menu Pengguna; selain itu transaksi dibatalkan dan
--   akun tidak tercipta.
--
-- AMAN UNTUK KODE LAMA: backend tidak berubah. Data tidak diubah.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_app  JSONB;
  v_user JSONB;
  v_email TEXT;
  v_karyawan_id UUID;
  v_nama TEXT;
  v_pembuat UUID;
  v_pembuat_valid BOOLEAN := false;
  v_roles TEXT[] := ARRAY['operator'];
  v_minta TEXT[];
BEGIN
  -- Trigger ditunda sampai akhir transaksi: baca ulang baris akun yang sudah
  -- lengkap (NEW masih berisi isi saat INSERT, sebelum app_metadata diisi).
  SELECT u.raw_app_meta_data, u.raw_user_meta_data, u.email
    INTO v_app, v_user, v_email
    FROM auth.users u WHERE u.id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;   -- akun sudah dihapus lagi dalam transaksi yang sama
  END IF;
  IF EXISTS (SELECT 1 FROM transport.profiles p WHERE p.id = NEW.id) THEN
    RETURN NULL;   -- profil sudah ada
  END IF;

  BEGIN
    v_karyawan_id := NULLIF(v_app->>'karyawan_id', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_karyawan_id := NULL;
  END;

  SELECT k.nama INTO v_nama FROM hr.karyawan k WHERE k.id = v_karyawan_id AND k.status = 1;
  IF v_nama IS NULL THEN
    RAISE EXCEPTION 'Hanya karyawan yang boleh menjadi pengguna. Pilih karyawan yang valid.'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_pembuat := NULLIF(v_app->>'dibuat_oleh', '')::UUID;
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

  PERFORM set_config('app.log_pelaku_id', v_pembuat::text, true);
  PERFORM set_config('app.log_ip', COALESCE(NULLIF(v_app->>'ip_pembuat', ''), 'Supabase Auth'), true);
  IF jsonb_typeof(v_app->'roles') = 'array' THEN
    SELECT array_agg(DISTINCT r) INTO v_minta
      FROM jsonb_array_elements_text(v_app->'roles') r
     WHERE r IN ('superadmin', 'operator', 'finance', 'admin');
  ELSIF v_app->>'role' IN ('superadmin', 'operator', 'finance', 'admin') THEN
    v_minta := ARRAY[v_app->>'role'];
  END IF;
  IF cardinality(v_minta) >= 1 THEN
    v_roles := v_minta;
  END IF;

  INSERT INTO transport.profiles (id, email, nama, role, roles, karyawan_id)
  VALUES (
    NEW.id,
    v_email,
    COALESCE(NULLIF(v_user->>'nama', ''), v_nama),
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
  RETURN NULL;
END;
$function$;

-- Trigger lama (AFTER INSERT biasa) diganti versi yang ditunda ke akhir transaksi.
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE CONSTRAINT TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION transport.handle_new_user();
