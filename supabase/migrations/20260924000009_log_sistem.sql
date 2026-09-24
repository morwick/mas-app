-- ============================================================================
-- Migration 20260924000009: log sistem (audit trail)
--
-- Setiap aksi pengguna dicatat di transport.log_sistem:
--   karyawan_id  — karyawan pelaku (dari akun yang login; NULL untuk driver/sistem)
--   aksi         — Login | Logout | Tambah Data | Update Data | Hapus Data
--   keterangan   — mis. "Data Penawaran 0001/SK/MAS/IX/2026 (ID …)"
--   waktu        — timestamp kejadian
--   ip_address   — IP pengguna (diteruskan backend lewat header x-client-ip)
--
-- Cara kerja:
--   * Tambah/Update/Hapus dicatat TRIGGER database pada tabel data utama,
--     jadi log ditulis dalam TRANSAKSI YANG SAMA dengan perubahannya:
--     simpan gagal → rollback → log ikut batal; simpan berhasil → log pasti ada.
--     Semua jalur tercatat (web, aplikasi driver, fungsi database).
--   * Hanya aksi pengguna yang dicatat. Perubahan yang dipicu trigger lain
--     (hitung ulang total, riwayat status, notifikasi, cascade soft delete)
--     dilewati lewat pg_trigger_depth(), supaya log tidak penuh sampah.
--   * Soft delete (status 1 → 2) dicatat sebagai "Hapus Data".
--   * Login/Logout admin dicatat backend lewat catat_log(); login/logout
--     driver dicatat langsung di driver_login()/driver_logout().
--
-- Tabel ini mengikuti aturan soft delete: kolom status default 1.
-- ============================================================================

SET search_path = transport, extensions;

CREATE TABLE IF NOT EXISTS transport.log_sistem (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  karyawan_id  UUID REFERENCES hr.karyawan(id),
  aksi         TEXT NOT NULL
               CONSTRAINT log_sistem_aksi_check
               CHECK (aksi IN ('Login', 'Logout', 'Tambah Data', 'Update Data', 'Hapus Data')),
  keterangan   TEXT NOT NULL,
  -- clock_timestamp(): saat kejadian sebenarnya, bukan awal transaksi — supaya
  -- beberapa log dalam satu transaksi tetap berurutan.
  waktu        TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ip_address   TEXT,
  status       SMALLINT NOT NULL DEFAULT 1
               CONSTRAINT log_sistem_status_aktif_check CHECK (status IN (1, 2))
);
COMMENT ON COLUMN transport.log_sistem.status IS '1 = aktif, 2 = dihapus pengguna (soft delete, bisa dikembalikan)';

CREATE INDEX IF NOT EXISTS idx_log_sistem_waktu    ON transport.log_sistem (waktu DESC) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_log_sistem_karyawan ON transport.log_sistem (karyawan_id, waktu DESC) WHERE status = 1;

-- Soft delete seperti tabel lain (migration 20260924000007).
DROP TRIGGER IF EXISTS trg_soft_delete ON transport.log_sistem;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.log_sistem
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.log_sistem;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.log_sistem
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.log_sistem;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.log_sistem
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();

-- Log hanya ditulis lewat fungsi di bawah (SECURITY DEFINER); pengguna biasa
-- tidak bisa menulis/mengubah log sendiri. Superadmin boleh membaca.
ALTER TABLE transport.log_sistem ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON transport.log_sistem FROM anon, authenticated;
GRANT SELECT ON transport.log_sistem TO authenticated;
DROP POLICY IF EXISTS "superadmin_read_log_sistem" ON transport.log_sistem;
CREATE POLICY "superadmin_read_log_sistem"
  ON transport.log_sistem FOR SELECT TO authenticated
  USING (transport.is_superadmin());

-- ── Penulis log ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport._tulis_log(p_aksi TEXT, p_keterangan TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_headers JSON;
  v_ip TEXT;
  v_karyawan UUID;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  v_ip := NULLIF(btrim(COALESCE(v_headers ->> 'x-client-ip', '')), '');

  SELECT p.karyawan_id INTO v_karyawan
    FROM transport.profiles p
   WHERE p.id = auth.uid() AND p.status = 1;

  INSERT INTO transport.log_sistem (karyawan_id, aksi, keterangan, ip_address)
  VALUES (v_karyawan, p_aksi, left(p_keterangan, 1000), left(v_ip, 100));
END;
$$;
REVOKE ALL ON FUNCTION transport._tulis_log(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Siapa pelakunya, untuk keterangan (karyawan sudah ada di kolom sendiri).
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
  IF auth.uid() IS NOT NULL THEN
    RETURN '';
  END IF;
  SELECT d.nama INTO v_nama FROM transport.drivers d WHERE d.id = transport.current_driver_id();
  IF v_nama IS NOT NULL THEN
    RETURN ' — oleh driver ' || v_nama;
  END IF;
  RETURN ' — oleh sistem';
END;
$$;

-- Nama data & pengenalnya per tabel (tabel yang tidak ada di sini tidak dicatat).
CREATE OR REPLACE FUNCTION transport._log_label(p_tabel TEXT, p_baris JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = transport, extensions
AS $$
  SELECT CASE p_tabel
    WHEN 'transport.customers'           THEN 'Customer '             || COALESCE(p_baris ->> 'nama_perusahaan', '')
    WHEN 'transport.drivers'             THEN 'Driver '               || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.units'               THEN 'Unit '                 || COALESCE(p_baris ->> 'kode_unit', '')
    WHEN 'transport.jenis_unit'          THEN 'Jenis Unit '           || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.jobs'                THEN 'Job '                  || COALESCE(p_baris ->> 'job_number', '')
    WHEN 'transport.job_photos'          THEN 'Foto Job '             || COALESCE(p_baris ->> 'stage', '') || COALESCE(' ' || (p_baris ->> 'slot'), '')
    WHEN 'transport.incident_logs'       THEN 'Insiden '              || COALESCE(p_baris ->> 'tipe', '')
    WHEN 'transport.incident_photos'     THEN 'Foto Insiden'
    WHEN 'transport.service_records'     THEN 'Servis Unit '          || COALESCE(p_baris ->> 'jenis', '')
    WHEN 'transport.quotations'          THEN 'Penawaran '            || COALESCE(p_baris ->> 'quote_number', '')
    WHEN 'transport.invoices'            THEN 'Tagihan '              || COALESCE(p_baris ->> 'invoice_number', '')
    WHEN 'transport.invoice_payments'    THEN 'Pembayaran Tagihan Rp ' || COALESCE(p_baris ->> 'jumlah', '')
    WHEN 'transport.uang_jalan'          THEN 'Uang Jalan '           || COALESCE(p_baris ->> 'jenis', '') || ' Rp ' || COALESCE(p_baris ->> 'jumlah', '')
    WHEN 'transport.uang_jalan_requests' THEN 'Pengajuan Uang Jalan Rp ' || COALESCE(p_baris ->> 'nominal', '')
    WHEN 'transport.sumber_dana'         THEN 'Sumber Dana '          || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.profiles'            THEN 'Pengguna '             || COALESCE(p_baris ->> 'email', '')
    WHEN 'hr.karyawan'                   THEN 'Karyawan '             || COALESCE(p_baris ->> 'nama', '')
  END;
$$;

-- ── Trigger pencatat Tambah/Update/Hapus Data ───────────────────────────────
CREATE OR REPLACE FUNCTION transport.log_perubahan_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_tabel TEXT := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
  v_baru JSONB := to_jsonb(NEW);
  v_lama JSONB;
  v_aksi TEXT;
BEGIN
  -- Hanya aksi langsung pengguna (kedalaman trigger 1). Perubahan yang dipicu
  -- trigger lain dilewati — kecuali DELETE yang diubah jadi soft delete oleh
  -- soft_delete_instead() (kedalaman 2, ditandai app.log_hapus).
  IF pg_trigger_depth() > 1
     AND NOT (pg_trigger_depth() = 2 AND current_setting('app.log_hapus', true) = 'on') THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_aksi := 'Tambah Data';
  ELSE
    v_lama := to_jsonb(OLD);
    IF (v_lama ->> 'status') = '1' AND (v_baru ->> 'status') = '2' THEN
      v_aksi := 'Hapus Data';
    ELSIF (v_baru - 'updated_at' - 'last_seen_at') = (v_lama - 'updated_at' - 'last_seen_at') THEN
      RETURN NULL;  -- tidak ada isi yang berubah
    ELSE
      v_aksi := 'Update Data';
    END IF;
  END IF;

  PERFORM transport._tulis_log(
    v_aksi,
    'Data ' || btrim(transport._log_label(v_tabel, v_baru))
      || ' (ID ' || COALESCE(v_baru ->> 'id', '-') || ')'
      || transport._log_pelaku());
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transport.customers', 'transport.drivers', 'transport.units', 'transport.jenis_unit',
    'transport.jobs', 'transport.job_photos', 'transport.incident_logs', 'transport.incident_photos',
    'transport.service_records', 'transport.quotations', 'transport.invoices',
    'transport.invoice_payments', 'transport.uang_jalan', 'transport.uang_jalan_requests',
    'transport.sumber_dana', 'transport.profiles', 'hr.karyawan'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_log_sistem ON %s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON %s
         FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data()', t);
  END LOOP;
END $$;

-- DELETE yang diubah jadi soft delete tetap tercatat sebagai "Hapus Data".
CREATE OR REPLACE FUNCTION transport.soft_delete_instead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_kondisi TEXT;
BEGIN
  -- Hapus permanen tetap mungkin, tapi hanya dengan sengaja:
  --   * app.hard_delete = 'on' di transaksi yang sama (perawatan manual);
  --   * cascade dari luar aplikasi, mis. akun dihapus di Supabase Auth
  --     (auth.users → profiles). Aksi foreign key berjalan di dalam trigger,
  --     jadi kedalamannya > 1.
  IF current_setting('app.hard_delete', true) = 'on' OR pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  SELECT string_agg(format('%1$I = ($1).%1$I', a.attname), ' AND ')
    INTO v_kondisi
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
   WHERE i.indrelid = TG_RELID AND i.indisprimary;

  PERFORM set_config('app.log_hapus', 'on', true);
  EXECUTE format('UPDATE %I.%I SET status = 2 WHERE %s AND status = 1',
                 TG_TABLE_SCHEMA, TG_TABLE_NAME, v_kondisi)
    USING OLD;
  PERFORM set_config('app.log_hapus', '', true);
  RETURN NULL;  -- DELETE aslinya dibatalkan
END;
$$;

-- ── Login/Logout admin (dipanggil backend) ──────────────────────────────────
CREATE OR REPLACE FUNCTION transport.catat_log(p_aksi TEXT, p_keterangan TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  -- Hanya Login/Logout: aksi data dicatat trigger, tidak boleh dikarang klien.
  IF p_aksi NOT IN ('Login', 'Logout') THEN
    RAISE EXCEPTION 'Aksi log % tidak diizinkan', p_aksi USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Butuh login' USING ERRCODE = '42501';
  END IF;
  PERFORM transport._tulis_log(p_aksi, COALESCE(NULLIF(btrim(p_keterangan), ''), p_aksi));
END;
$$;
REVOKE ALL ON FUNCTION transport.catat_log(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.catat_log(TEXT, TEXT) TO authenticated;

-- ── Login/Logout driver: dicatat dalam transaksi yang sama ──────────────────
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

  v_token   := encode(gen_random_bytes(32), 'hex');
  v_expires := now() + INTERVAL '30 days';

  INSERT INTO driver_sessions (driver_id, token, user_agent, expires_at)
  VALUES (v_driver.id, v_token, left(COALESCE(p_user_agent, ''), 300), v_expires);

  PERFORM transport._tulis_log('Login',
    'Driver ' || v_driver.nama || ' (' || v_driver.no_hp || ') login ke aplikasi driver');

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
  SELECT d.nama INTO v_nama FROM drivers d WHERE d.id = current_driver_id();

  -- Perangkat dilepas dulu selagi sesi masih dikenali current_driver_id().
  IF COALESCE(btrim(p_fcm_token), '') <> '' THEN
    UPDATE driver_devices
       SET status = 2
     WHERE fcm_token = p_fcm_token AND driver_id = current_driver_id() AND status = 1;
  END IF;

  UPDATE driver_sessions
     SET revoked_at = now()
   WHERE token = current_driver_token()
     AND revoked_at IS NULL
     AND status = 1;

  IF v_nama IS NOT NULL THEN
    PERFORM transport._tulis_log('Logout', 'Driver ' || v_nama || ' logout dari aplikasi driver');
  END IF;
END;
$function$;

NOTIFY pgrst, 'reload schema';
