-- ============================================================================
-- Migration 20260924000020: menu Karyawan + status aktif karyawan
--
-- 1. hr.karyawan.is_active — status aktif karyawan (BUKAN kolom `status`, yang
--    tetap dipakai soft delete 1/2).
-- 2. Karyawan NONAKTIF → akun pengguna & driver miliknya diblokir: tidak bisa
--    login, dan semua pemeriksaan hak akses (is_active_admin, is_superadmin,
--    current_user_role, current_user_jenis_scope, current_driver_id, storage)
--    menganggapnya tidak aktif. Tidak muncul di pilihan dropdown.
-- 3. Menu Karyawan (superadmin): daftar_karyawan (LIMIT/OFFSET + cari + filter
--    aktif), simpan_karyawan (tambah/ubah), hapus_karyawan (soft delete).
--    Semua SECURITY DEFINER supaya schema hr tidak perlu dibuka di Data API.
-- 4. Driver dipilih dari karyawan: nama driver (dan nama akun pengguna)
--    mengikuti nama karyawan. Driver baru WAJIB memilih karyawan aktif —
--    tidak lagi dibuatkan karyawan otomatis. karyawan_untuk_driver() untuk
--    dropdown di form driver (admin).
-- 5. Riwayat (log_sistem, sesi_pengguna) tidak menghalangi hapus karyawan.
--
-- Perubahan data di migration ini: tidak ada (hanya struktur & fungsi).
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Status aktif karyawan ────────────────────────────────────────────────
ALTER TABLE hr.karyawan ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION transport.karyawan_aktif(p_karyawan_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT EXISTS (SELECT 1 FROM hr.karyawan k
                  WHERE k.id = p_karyawan_id AND k.is_active AND k.status = 1);
$$;
REVOKE ALL ON FUNCTION transport.karyawan_aktif(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.karyawan_aktif(UUID) TO authenticated, service_role;

-- ── 2. Hak akses ikut status karyawan ───────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.is_active_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND status = 1
      AND karyawan_aktif(karyawan_id)
  );
$function$;

CREATE OR REPLACE FUNCTION transport.storage_is_active_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND status = 1
      AND karyawan_aktif(karyawan_id)
  );
$function$;

CREATE OR REPLACE FUNCTION transport.is_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND status = 1
      AND role = 'superadmin'
      AND karyawan_aktif(karyawan_id)
  );
$function$;

CREATE OR REPLACE FUNCTION transport.current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT role FROM profiles
   WHERE id = auth.uid() AND is_active = true AND status = 1 AND karyawan_aktif(karyawan_id)
   LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION transport.current_user_jenis_scope()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT allowed_jenis_unit_ids
  FROM profiles
  WHERE id = auth.uid() AND is_active = true AND status = 1 AND karyawan_aktif(karyawan_id)
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION transport.current_driver_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT s.driver_id
  FROM driver_sessions s
  JOIN drivers d ON d.id = s.driver_id
  WHERE s.token = current_driver_token()
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND s.status = 1
    AND d.is_active = true
    AND d.status = 1
    AND karyawan_aktif(d.karyawan_id)
  LIMIT 1;
$function$;

-- Login web: karyawan nonaktif ditolak dengan pesan yang jelas.
CREATE OR REPLACE FUNCTION transport.mulai_sesi(p_ip TEXT, p_user_agent TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_sesi_id UUID;
  v_karyawan UUID;
  v_email TEXT;
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

  SELECT p.karyawan_id, p.email INTO v_karyawan, v_email
    FROM transport.profiles p
   WHERE p.id = auth.uid() AND p.is_active AND p.status = 1;
  IF v_karyawan IS NULL THEN
    RAISE EXCEPTION 'Akun tidak aktif atau tidak terhubung ke karyawan.' USING ERRCODE = '28000';
  END IF;
  IF NOT transport.karyawan_aktif(v_karyawan) THEN
    RAISE EXCEPTION 'Karyawan pemilik akun ini berstatus nonaktif. Hubungi super-admin.' USING ERRCODE = '28000';
  END IF;

  -- Sesi yang sama dibuka ulang → ganti yang lama.
  UPDATE transport.sesi_pengguna SET status = 2, logout_at = now()
   WHERE auth_session_id = v_sesi_id AND status = 1;

  INSERT INTO transport.sesi_pengguna (user_id, auth_session_id, karyawan_id, ip_address, user_agent)
  VALUES (auth.uid(), v_sesi_id, v_karyawan, left(v_ip, 100), left(p_user_agent, 300));

  PERFORM transport._tulis_log('Login', 'Login ke aplikasi web (' || v_email || ')', v_karyawan, v_ip);
END;
$$;

-- Login driver: karyawan nonaktif ditolak.
CREATE OR REPLACE FUNCTION transport.driver_login(p_no_hp text, p_pin text, p_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(token text, driver_id uuid, nama text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_driver   drivers%ROWTYPE;
  v_norm     TEXT;
  v_token    TEXT;
  v_expires  TIMESTAMPTZ;
  v_headers  JSON;
  v_ip       TEXT;
BEGIN
  -- Normalisasi nomor: 0812…, +62812…, dan 62812… harus dianggap sama.
  v_norm := regexp_replace(COALESCE(p_no_hp, ''), '[^0-9]', '', 'g');
  IF v_norm LIKE '62%' THEN
    v_norm := '0' || substring(v_norm FROM 3);
  END IF;

  SELECT * INTO v_driver
  FROM drivers d
  WHERE d.status = 1
    AND (regexp_replace(d.no_hp, '[^0-9]', '', 'g') = v_norm
         OR '0' || substring(regexp_replace(d.no_hp, '[^0-9]', '', 'g') FROM 3) = v_norm)
  LIMIT 1;

  IF v_driver.id IS NULL
     OR v_driver.is_active = false
     OR v_driver.pin_hash IS NULL
     OR v_driver.pin_hash <> crypt(COALESCE(p_pin, ''), v_driver.pin_hash) THEN
    RAISE EXCEPTION 'Nomor HP atau PIN salah'
      USING ERRCODE = '28000';
  END IF;

  IF NOT karyawan_aktif(v_driver.karyawan_id) THEN
    RAISE EXCEPTION 'Karyawan pemilik akun driver ini berstatus nonaktif. Hubungi admin.'
      USING ERRCODE = '28000';
  END IF;

  -- IP disimpan di sesi supaya setiap aksi driver tercatat lengkap.
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  v_ip := NULLIF(btrim(COALESCE(v_headers ->> 'x-client-ip', '')), '');
  IF v_ip IS NULL THEN
    RAISE EXCEPTION 'IP address perangkat tidak diketahui — login dibatalkan.' USING ERRCODE = '28000';
  END IF;

  v_token   := encode(gen_random_bytes(32), 'hex');
  v_expires := now() + INTERVAL '30 days';

  INSERT INTO driver_sessions (driver_id, token, user_agent, expires_at, ip_address)
  VALUES (v_driver.id, v_token, left(COALESCE(p_user_agent, ''), 300), v_expires, left(v_ip, 100));

  PERFORM transport._tulis_log('Login',
    'Driver ' || v_driver.nama || ' (' || v_driver.no_hp || ') login ke aplikasi driver',
    v_driver.karyawan_id, v_ip);

  RETURN QUERY SELECT v_token, v_driver.id, v_driver.nama, v_expires;
END;
$function$;

-- Pilihan karyawan di form pengguna: hanya karyawan aktif.
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
     AND k.is_active
   ORDER BY k.nama;
$$;

-- ── 3. Menu Karyawan ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.daftar_karyawan(
  p_q      TEXT    DEFAULT NULL,
  p_aktif  BOOLEAN DEFAULT NULL,   -- NULL = semua
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
           (SELECT jsonb_agg(jsonb_build_object('user_id', p.id, 'role', p.role, 'email', p.email) ORDER BY p.role)
              FROM transport.profiles p
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
REVOKE ALL ON FUNCTION transport.daftar_karyawan(TEXT, BOOLEAN, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_karyawan(TEXT, BOOLEAN, INT, INT) TO authenticated, service_role;

-- Tidak boleh mengunci diri sendiri / meninggalkan sistem tanpa superadmin.
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
     WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
       AND k.is_active AND k.status = 1 AND k.id <> p_id
  ) THEN
    RAISE EXCEPTION 'Tidak bisa % karyawan ini: sistem akan kehilangan super-admin aktif.', p_aksi
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION transport._cek_karyawan_boleh_nonaktif(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION transport.simpan_karyawan(
  p_id            UUID,     -- NULL = tambah
  p_nama          TEXT,
  p_tanggal_lahir DATE    DEFAULT NULL,
  p_alamat        TEXT    DEFAULT NULL,
  p_is_active     BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_id UUID;
  v_lama hr.karyawan%ROWTYPE;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya super administrator yang boleh mengelola karyawan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(COALESCE(p_nama, '')) = '' THEN
    RAISE EXCEPTION 'Nama karyawan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_lahir IS NOT NULL AND p_tanggal_lahir > (now() AT TIME ZONE 'Asia/Jakarta')::date THEN
    RAISE EXCEPTION 'Tanggal lahir tidak boleh di masa depan.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO hr.karyawan (nama, tanggal_lahir, alamat, is_active)
    VALUES (btrim(p_nama), p_tanggal_lahir, NULLIF(btrim(COALESCE(p_alamat, '')), ''), COALESCE(p_is_active, true))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  SELECT * INTO v_lama FROM hr.karyawan WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_lama.id IS NULL THEN
    RAISE EXCEPTION 'Karyawan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_lama.is_active AND NOT COALESCE(p_is_active, true) THEN
    PERFORM transport._cek_karyawan_boleh_nonaktif(p_id, 'menonaktifkan');
  END IF;

  UPDATE hr.karyawan
     SET nama = btrim(p_nama),
         tanggal_lahir = p_tanggal_lahir,
         alamat = NULLIF(btrim(COALESCE(p_alamat, '')), ''),
         is_active = COALESCE(p_is_active, true)
   WHERE id = p_id;
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION transport.simpan_karyawan(UUID, TEXT, DATE, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.simpan_karyawan(UUID, TEXT, DATE, TEXT, BOOLEAN) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION transport.hapus_karyawan(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_akun TEXT;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya super administrator yang boleh menghapus karyawan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hr.karyawan WHERE id = p_id AND status = 1) THEN
    RAISE EXCEPTION 'Karyawan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM transport._cek_karyawan_boleh_nonaktif(p_id, 'menghapus');

  SELECT string_agg(x, ', ') INTO v_akun FROM (
    SELECT 'akun pengguna ' || p.email AS x FROM transport.profiles p WHERE p.karyawan_id = p_id AND p.status = 1
    UNION ALL
    SELECT 'driver ' || d.nama FROM transport.drivers d WHERE d.karyawan_id = p_id AND d.status = 1
  ) s;
  IF v_akun IS NOT NULL THEN
    RAISE EXCEPTION 'Karyawan masih dipakai oleh %. Hapus akun/driver tersebut dulu, atau ubah karyawan menjadi nonaktif.', v_akun
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  UPDATE hr.karyawan SET status = 2 WHERE id = p_id;  -- soft delete
END;
$$;
REVOKE ALL ON FUNCTION transport.hapus_karyawan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.hapus_karyawan(UUID) TO authenticated, service_role;

-- Tombol "Tambah karyawan" di halaman Pengguna dihapus — diganti menu Karyawan.
DROP FUNCTION IF EXISTS transport.tambah_karyawan(TEXT, DATE, TEXT);

-- ── 4. Driver & akun mengikuti karyawan ─────────────────────────────────────
-- Nama driver = nama karyawan; karyawan wajib dipilih dan aktif.
CREATE OR REPLACE FUNCTION transport.driver_pastikan_karyawan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_nama TEXT;
BEGIN
  IF NEW.status <> 1 THEN
    RETURN NEW;  -- soft delete tidak perlu dicek
  END IF;
  IF NEW.karyawan_id IS NULL THEN
    RAISE EXCEPTION 'Driver wajib dipilih dari data karyawan.' USING ERRCODE = 'not_null_violation';
  END IF;
  SELECT k.nama INTO v_nama FROM hr.karyawan k WHERE k.id = NEW.karyawan_id AND k.status = 1;
  IF v_nama IS NULL THEN
    RAISE EXCEPTION 'Karyawan untuk driver tidak ditemukan.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.karyawan_id IS DISTINCT FROM OLD.karyawan_id)
     AND NOT transport.karyawan_aktif(NEW.karyawan_id) THEN
    RAISE EXCEPTION 'Karyawan % berstatus nonaktif — tidak bisa dijadikan driver.', v_nama
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.nama := v_nama;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_driver_pastikan_karyawan ON transport.drivers;
CREATE TRIGGER trg_driver_pastikan_karyawan BEFORE INSERT OR UPDATE OF karyawan_id, nama, status ON transport.drivers
  FOR EACH ROW EXECUTE FUNCTION transport.driver_pastikan_karyawan();

-- Nama karyawan diubah → nama driver & akun pengguna ikut.
CREATE OR REPLACE FUNCTION transport.karyawan_sinkron_nama()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  UPDATE transport.drivers  SET nama = NEW.nama WHERE karyawan_id = NEW.id AND status = 1 AND nama IS DISTINCT FROM NEW.nama;
  UPDATE transport.profiles SET nama = NEW.nama WHERE karyawan_id = NEW.id AND status = 1 AND nama IS DISTINCT FROM NEW.nama;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_karyawan_sinkron_nama ON hr.karyawan;
CREATE TRIGGER trg_karyawan_sinkron_nama AFTER UPDATE OF nama ON hr.karyawan
  FOR EACH ROW WHEN (OLD.nama IS DISTINCT FROM NEW.nama)
  EXECUTE FUNCTION transport.karyawan_sinkron_nama();

-- Pilihan karyawan di form driver (admin): karyawan aktif + driver yang sudah memakainya.
CREATE OR REPLACE FUNCTION transport.karyawan_untuk_driver()
RETURNS TABLE (id UUID, nama TEXT, driver_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT k.id, k.nama,
         (SELECT d.id FROM transport.drivers d WHERE d.karyawan_id = k.id AND d.status = 1 LIMIT 1)
    FROM hr.karyawan k
   WHERE transport.is_active_admin()
     AND k.status = 1
     AND k.is_active
   ORDER BY k.nama, k.id;
$$;
REVOKE ALL ON FUNCTION transport.karyawan_untuk_driver() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.karyawan_untuk_driver() TO authenticated, service_role;

-- ── 5. Riwayat tidak menghalangi soft delete ────────────────────────────────
-- log_sistem & sesi_pengguna adalah catatan sejarah: tetap menunjuk ke
-- karyawan yang sudah dihapus, tidak ikut terhapus, tidak memblokir.
CREATE OR REPLACE FUNCTION transport.soft_delete_propagate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  fk RECORD;
  v_ada BOOLEAN;
  v_nilai TEXT;
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS anak,
           c.confdeltype,
           ca.attname AS kolom_anak,
           pa.attname AS kolom_induk
      FROM pg_constraint c
      JOIN pg_attribute ca ON ca.attrelid = c.conrelid  AND ca.attnum = c.conkey[1]
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = TG_RELID
       AND array_length(c.conkey, 1) = 1
       -- Hanya anak yang punya kolom soft delete (tabel aplikasi).
       AND EXISTS (SELECT 1 FROM pg_attribute s
                    WHERE s.attrelid = c.conrelid AND s.attname = 'status' AND NOT s.attisdropped)
       -- Tabel riwayat tidak ikut.
       AND c.conrelid NOT IN ('transport.log_sistem'::regclass, 'transport.sesi_pengguna'::regclass)
  LOOP
    EXECUTE format('SELECT ($1).%I::text', fk.kolom_induk) INTO v_nilai USING OLD;
    IF v_nilai IS NULL THEN
      CONTINUE;
    END IF;

    IF fk.confdeltype = 'c' THEN          -- ON DELETE CASCADE
      IF TG_WHEN = 'AFTER' THEN
        EXECUTE format('UPDATE %s SET status = 2 WHERE %I::text = $1 AND status = 1',
                       fk.anak, fk.kolom_anak) USING v_nilai;
      END IF;
    ELSIF fk.confdeltype = 'n' THEN       -- ON DELETE SET NULL
      IF TG_WHEN = 'AFTER' THEN
        EXECUTE format('UPDATE %s SET %I = NULL WHERE %I::text = $1 AND status = 1',
                       fk.anak, fk.kolom_anak, fk.kolom_anak) USING v_nilai;
      END IF;
    ELSIF TG_WHEN = 'BEFORE' THEN         -- NO ACTION / RESTRICT
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I::text = $1 AND status = 1)',
                     fk.anak, fk.kolom_anak) INTO v_ada USING v_nilai;
      IF v_ada THEN
        RAISE EXCEPTION 'Data tidak bisa dihapus karena masih dipakai di %.', fk.anak
          USING ERRCODE = 'foreign_key_violation';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;  -- diabaikan untuk trigger AFTER
END;
$$;

NOTIFY pgrst, 'reload schema';
