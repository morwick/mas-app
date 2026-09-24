-- ============================================================================
-- Migration 20260924000019: sesi login + karyawan & IP WAJIB di log sistem
--
-- Aturan: setiap baris log sistem wajib punya karyawan_id DAN ip_address.
--
-- 1. SESI LOGIN ADMIN (tabel sesi_pengguna). Saat login, karyawan & IP
--    disimpan ke sesi (terikat session_id Supabase Auth; tetap sama walau
--    token di-refresh). Setiap aksi mengambil karyawan & IP dari sesi itu.
--    Sesi tidak ditemukan → aksi DITOLAK (kode 28000 → backend membalas 401 →
--    aplikasi meminta login lagi). Sesi hanya dihapus (status = 2) saat logout.
--
-- 2. DRIVER = KARYAWAN. drivers.karyawan_id wajib (satu karyawan satu
--    driver). Driver lama dihubungkan ke karyawan bernama sama yang belum
--    dipakai driver lain; bila tidak ada, karyawannya dibuatkan. Driver baru
--    tanpa karyawan_id otomatis dibuatkan karyawan bernama sama. Sesi driver
--    menyimpan IP saat login; aksi driver memakai karyawan & IP dari sesinya.
--
-- 3. SQL EDITOR / MIGRASI. Perubahan data di luar aplikasi ditolak kecuali
--    identitas diisi dulu (berlaku sampai koneksi ditutup):
--      SELECT transport.mulai_sesi_manual('<karyawan_id superadmin>', 'keterangan');
--      ... UPDATE / INSERT ...
--      SELECT transport.selesai_sesi_manual();
--
-- 4. Constraint log_sistem_wajib_lengkap berlaku untuk baris BARU (NOT VALID):
--    baris lama yang terlanjur kosong tidak dikarang isinya.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Tabel sesi login admin ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.sesi_pengguna (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES transport.profiles(id) ON DELETE CASCADE,
  auth_session_id  UUID NOT NULL,
  karyawan_id      UUID NOT NULL REFERENCES hr.karyawan(id),
  ip_address       TEXT NOT NULL CONSTRAINT sesi_pengguna_ip_check CHECK (btrim(ip_address) <> ''),
  user_agent       TEXT,
  login_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_at        TIMESTAMPTZ,
  status           SMALLINT NOT NULL DEFAULT 1
                   CONSTRAINT sesi_pengguna_status_aktif_check CHECK (status IN (1, 2))
);
COMMENT ON COLUMN transport.sesi_pengguna.status IS '1 = sesi aktif, 2 = sudah logout (soft delete)';
CREATE UNIQUE INDEX IF NOT EXISTS sesi_pengguna_auth_session_unique
  ON transport.sesi_pengguna (auth_session_id) WHERE status = 1;

DROP TRIGGER IF EXISTS trg_soft_delete ON transport.sesi_pengguna;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.sesi_pengguna
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.sesi_pengguna;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.sesi_pengguna
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.sesi_pengguna;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.sesi_pengguna
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();

-- Hanya lewat fungsi SECURITY DEFINER di bawah.
ALTER TABLE transport.sesi_pengguna ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON transport.sesi_pengguna FROM anon, authenticated;
GRANT ALL ON transport.sesi_pengguna TO service_role;

-- IP login driver disimpan di sesi driver.
ALTER TABLE transport.driver_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- ── 2. Identitas manual untuk SQL Editor / migrasi ──────────────────────────
CREATE OR REPLACE FUNCTION transport.mulai_sesi_manual(p_karyawan_id UUID, p_keterangan TEXT DEFAULT 'SQL Editor')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  -- Hanya karyawan yang punya akun superadmin aktif.
  IF NOT EXISTS (SELECT 1 FROM transport.profiles p
                  WHERE p.karyawan_id = p_karyawan_id AND p.role = 'superadmin'
                    AND p.is_active AND p.status = 1) THEN
    RAISE EXCEPTION 'Karyawan % bukan superadmin aktif — tidak bisa dipakai untuk sesi manual.', p_karyawan_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Tingkat koneksi (bukan transaksi) supaya berlaku untuk perintah berikutnya.
  PERFORM set_config('app.manual_karyawan', p_karyawan_id::text, false);
  PERFORM set_config('app.manual_ip', left(COALESCE(NULLIF(btrim(p_keterangan), ''), 'SQL Editor'), 100), false);
END;
$$;

CREATE OR REPLACE FUNCTION transport.selesai_sesi_manual()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT set_config('app.manual_karyawan', '', false), set_config('app.manual_ip', '', false);
$$;

REVOKE ALL ON FUNCTION transport.mulai_sesi_manual(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION transport.selesai_sesi_manual() FROM PUBLIC, anon, authenticated;

-- ── 3. Penulis log: karyawan & IP dari sesi, wajib ada ──────────────────────
DROP FUNCTION IF EXISTS transport._tulis_log(TEXT, TEXT);
CREATE OR REPLACE FUNCTION transport._tulis_log(
  p_aksi TEXT,
  p_keterangan TEXT,
  p_karyawan UUID DEFAULT NULL,  -- diisi langsung oleh login/logout
  p_ip TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_karyawan UUID := p_karyawan;
  v_ip TEXT := NULLIF(btrim(COALESCE(p_ip, '')), '');
  v_sesi_id UUID;
  v_pelaku UUID;
BEGIN
  IF v_karyawan IS NULL THEN
    v_pelaku := NULLIF(current_setting('app.log_pelaku_id', true), '')::uuid;

    IF v_pelaku IS NOT NULL THEN
      -- Akun dibuat superadmin lewat Supabase Auth (titipan divalidasi handle_new_user).
      SELECT p.karyawan_id INTO v_karyawan FROM transport.profiles p WHERE p.id = v_pelaku AND p.status = 1;
      v_ip := COALESCE(v_ip, NULLIF(current_setting('app.log_ip', true), ''));

    ELSIF auth.uid() IS NOT NULL THEN
      -- Admin yang login: karyawan & IP dari sesi login-nya.
      BEGIN
        v_sesi_id := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
      EXCEPTION WHEN others THEN
        v_sesi_id := NULL;
      END;
      SELECT s.karyawan_id, s.ip_address INTO v_karyawan, v_ip
        FROM transport.sesi_pengguna s
       WHERE s.auth_session_id = v_sesi_id AND s.user_id = auth.uid() AND s.status = 1;
      IF v_karyawan IS NULL THEN
        RAISE EXCEPTION 'Sesi tidak ditemukan. Silakan login lagi.' USING ERRCODE = '28000';
      END IF;

    ELSIF transport.current_driver_token() IS NOT NULL THEN
      -- Driver: karyawan dari data driver, IP dari sesi login driver.
      SELECT d.karyawan_id, s.ip_address INTO v_karyawan, v_ip
        FROM transport.driver_sessions s
        JOIN transport.drivers d ON d.id = s.driver_id
       WHERE s.token = transport.current_driver_token()
         AND s.revoked_at IS NULL AND s.expires_at > now() AND s.status = 1
         AND d.status = 1;
      IF v_karyawan IS NULL OR v_ip IS NULL THEN
        RAISE EXCEPTION 'Sesi tidak ditemukan. Silakan login lagi.' USING ERRCODE = '28000';
      END IF;

    ELSIF NULLIF(current_setting('app.manual_karyawan', true), '') IS NOT NULL THEN
      -- SQL Editor / migrasi dengan identitas manual.
      v_karyawan := current_setting('app.manual_karyawan', true)::uuid;
      v_ip := COALESCE(v_ip, NULLIF(current_setting('app.manual_ip', true), ''));
    END IF;
  END IF;

  IF v_karyawan IS NULL OR v_ip IS NULL THEN
    RAISE EXCEPTION
      'Perubahan data tanpa sesi ditolak. Login ke aplikasi, atau di SQL Editor jalankan dulu transport.mulai_sesi_manual(''<karyawan_id superadmin>'').'
      USING ERRCODE = '28000';
  END IF;

  INSERT INTO transport.log_sistem (karyawan_id, aksi, keterangan, ip_address)
  VALUES (v_karyawan, p_aksi, left(p_keterangan, 1000), left(v_ip, 100));
END;
$$;
REVOKE ALL ON FUNCTION transport._tulis_log(TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION transport._log_pelaku()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_nama TEXT;
BEGIN
  IF auth.uid() IS NOT NULL OR NULLIF(current_setting('app.log_pelaku_id', true), '') IS NOT NULL THEN
    RETURN '';
  END IF;
  SELECT d.nama INTO v_nama
    FROM transport.drivers d
   WHERE d.id = transport.current_driver_id() AND d.status = 1;
  IF v_nama IS NOT NULL THEN
    RETURN ' — oleh driver ' || v_nama;
  END IF;
  IF NULLIF(current_setting('app.manual_karyawan', true), '') IS NOT NULL THEN
    RETURN ' — lewat ' || COALESCE(NULLIF(current_setting('app.manual_ip', true), ''), 'SQL Editor');
  END IF;
  RETURN ' — oleh sistem';
END;
$$;

-- ── 4. Sesi admin: mulai (login) & akhiri (logout) ──────────────────────────
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

  -- Sesi yang sama dibuka ulang → ganti yang lama.
  UPDATE transport.sesi_pengguna SET status = 2, logout_at = now()
   WHERE auth_session_id = v_sesi_id AND status = 1;

  INSERT INTO transport.sesi_pengguna (user_id, auth_session_id, karyawan_id, ip_address, user_agent)
  VALUES (auth.uid(), v_sesi_id, v_karyawan, left(v_ip, 100), left(p_user_agent, 300));

  PERFORM transport._tulis_log('Login', 'Login ke aplikasi web (' || v_email || ')', v_karyawan, v_ip);
END;
$$;

CREATE OR REPLACE FUNCTION transport.akhiri_sesi()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_sesi transport.sesi_pengguna%ROWTYPE;
  v_email TEXT;
BEGIN
  BEGIN
    SELECT * INTO v_sesi FROM transport.sesi_pengguna
     WHERE auth_session_id = NULLIF(auth.jwt() ->> 'session_id', '')::uuid
       AND user_id = auth.uid() AND status = 1;
  EXCEPTION WHEN others THEN
    v_sesi := NULL;
  END;
  IF v_sesi.id IS NULL THEN
    RETURN;  -- tidak ada sesi aktif: logout tetap dianggap berhasil
  END IF;
  SELECT email INTO v_email FROM transport.profiles WHERE id = v_sesi.user_id;
  PERFORM transport._tulis_log('Logout', 'Logout dari aplikasi web (' || COALESCE(v_email, '-') || ')',
                               v_sesi.karyawan_id, v_sesi.ip_address);
  -- Sesi hanya dihapus saat logout (soft delete).
  UPDATE transport.sesi_pengguna SET status = 2, logout_at = now() WHERE id = v_sesi.id;
END;
$$;

REVOKE ALL ON FUNCTION transport.mulai_sesi(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION transport.akhiri_sesi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.mulai_sesi(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION transport.akhiri_sesi() TO authenticated;

-- Login/Logout admin kini dicatat mulai_sesi/akhiri_sesi.
DROP FUNCTION IF EXISTS transport.catat_log(TEXT, TEXT);

-- ── 5. Driver: karyawan wajib, sesi menyimpan IP ────────────────────────────
ALTER TABLE transport.drivers ADD COLUMN IF NOT EXISTS karyawan_id UUID REFERENCES hr.karyawan(id);

-- Driver baru tanpa karyawan → dibuatkan karyawan bernama sama.
CREATE OR REPLACE FUNCTION transport.driver_pastikan_karyawan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.karyawan_id IS NULL THEN
    INSERT INTO hr.karyawan (nama) VALUES (btrim(NEW.nama)) RETURNING id INTO NEW.karyawan_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_driver_pastikan_karyawan ON transport.drivers;
CREATE TRIGGER trg_driver_pastikan_karyawan BEFORE INSERT ON transport.drivers
  FOR EACH ROW EXECUTE FUNCTION transport.driver_pastikan_karyawan();

-- Driver lama: dihubungkan ke karyawan (perubahan data → identitas manual
-- memakai superadmin aktif paling awal; dicatat "lewat Migrasi ...").
DO $$
DECLARE
  v_admin UUID;
  d RECORD;
  v_k UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM transport.drivers WHERE karyawan_id IS NULL) THEN
    RETURN;
  END IF;
  SELECT p.karyawan_id INTO v_admin FROM transport.profiles p
   WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat penghubungan driver ke karyawan.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_admin, 'Migrasi 20260924000019');

  FOR d IN SELECT id, nama FROM transport.drivers WHERE karyawan_id IS NULL ORDER BY created_at LOOP
    -- Karyawan bernama sama yang belum dipakai driver lain dan belum punya akun.
    SELECT k.id INTO v_k FROM hr.karyawan k
     WHERE k.status = 1
       AND lower(btrim(k.nama)) = lower(btrim(d.nama))
       AND NOT EXISTS (SELECT 1 FROM transport.drivers x WHERE x.karyawan_id = k.id)
     ORDER BY k.nama, k.id
     LIMIT 1;
    IF v_k IS NULL THEN
      INSERT INTO hr.karyawan (nama) VALUES (btrim(d.nama)) RETURNING id INTO v_k;
    END IF;
    UPDATE transport.drivers SET karyawan_id = v_k WHERE id = d.id;
  END LOOP;

  PERFORM transport.selesai_sesi_manual();
END $$;

ALTER TABLE transport.drivers ALTER COLUMN karyawan_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS drivers_karyawan_unique
  ON transport.drivers (karyawan_id) WHERE status = 1;

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

CREATE OR REPLACE FUNCTION transport.driver_logout(p_fcm_token TEXT DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_nama TEXT;
BEGIN
  SELECT d.nama INTO v_nama FROM drivers d WHERE d.id = current_driver_id() AND d.status = 1;

  -- Dicatat selagi sesi masih aktif (karyawan & IP diambil dari sesinya).
  IF v_nama IS NOT NULL THEN
    PERFORM transport._tulis_log('Logout', 'Driver ' || v_nama || ' logout dari aplikasi driver');
  END IF;

  IF COALESCE(btrim(p_fcm_token), '') <> '' THEN
    UPDATE driver_devices
       SET status = 2
     WHERE fcm_token = p_fcm_token AND driver_id = current_driver_id() AND status = 1;
  END IF;

  -- Sesi hanya dihapus saat logout (dicabut + soft delete).
  UPDATE driver_sessions
     SET revoked_at = now(), status = 2
   WHERE token = current_driver_token()
     AND revoked_at IS NULL
     AND status = 1;
END;
$function$;

-- ── 6. Log sistem: karyawan & IP wajib untuk baris baru ─────────────────────
ALTER TABLE transport.log_sistem DROP CONSTRAINT IF EXISTS log_sistem_wajib_lengkap;
ALTER TABLE transport.log_sistem
  ADD CONSTRAINT log_sistem_wajib_lengkap
  CHECK (karyawan_id IS NOT NULL AND ip_address IS NOT NULL AND btrim(ip_address) <> '')
  NOT VALID;

NOTIFY pgrst, 'reload schema';
