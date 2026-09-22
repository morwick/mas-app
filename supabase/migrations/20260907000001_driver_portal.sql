-- ============================================================================
-- Migration 20260907000001: Portal driver — sesi, PIN, dan konfirmasi job
--
-- Sebelum ini portal driver tidak punya sesi sama sekali. Identitas driver
-- dibawa sebagai `?driver_id=<uuid>` di URL, jadi siapa pun yang menebak atau
-- meneruskan link bisa membuka job driver lain. Dan karena driver bukan user
-- Supabase, tidak ada policy UPDATE yang berlaku untuk dia — tombol update
-- status di portal mengenai nol baris lalu melapor "berhasil".
--
-- Model di sini:
--   drivers.pin_hash        → PIN 6 digit, disimpan sebagai hash (bcrypt)
--   driver_sessions         → satu baris per login, token acak di cookie
--   current_driver_id()     → menerjemahkan token di header jadi driver_id
--
-- Token dikirim lewat header `x-driver-token`, bukan di URL, supaya tidak
-- ikut ter-log di riwayat browser, referer, atau screenshot yang dikirim
-- driver ke grup WA. RLS memakai current_driver_id() sebagai identitas, jadi
-- driver_id tidak lagi bisa dikarang dari sisi klien.
--
-- Semua tulisan dari driver lewat RPC SECURITY DEFINER, bukan UPDATE langsung.
-- Alasannya: RLS mengunci baris, bukan kolom. Kalau driver diberi UPDATE pada
-- jobs, dia bisa mengubah harga, ETD, atau unit di job miliknya sendiri. Lewat
-- RPC, kolom yang boleh berubah ditentukan di satu tempat.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- drivers: PIN
--
-- Login lama hanya meminta nomor HP. Nomor HP driver beredar di surat jalan,
-- grup WA, dan pintu gerbang lokasi — itu identitas, bukan rahasia. Karena
-- "Terima job" akan jadi catatan bahwa driver menyatakan siap, login perlu
-- sesuatu yang hanya dia tahu.
-- ---------------------------------------------------------------------------
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS pin_hash       TEXT,
  ADD COLUMN IF NOT EXISTS pin_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN drivers.pin_hash IS
  'Hash bcrypt PIN portal driver. NULL = driver belum bisa login.';

-- ---------------------------------------------------------------------------
-- jobs: jejak konfirmasi driver
--
-- Driver tidak boleh menolak job — penugasan tetap keputusan operasional.
-- Yang dicatat di sini adalah kapan driver menyatakan sudah membaca dan siap
-- jalan, supaya admin tahu job mana yang belum sampai ke orangnya.
-- ---------------------------------------------------------------------------
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN jobs.accepted_at IS
  'Kapan driver menekan "Terima Job" di portal. NULL = belum dikonfirmasi.';

CREATE INDEX IF NOT EXISTS idx_jobs_driver_belum_konfirmasi
  ON jobs(driver_id, etd)
  WHERE accepted_at IS NULL
    AND status IN ('menunggu_pickup', 'loading', 'dalam_perjalanan', 'unloading');

-- ---------------------------------------------------------------------------
-- job_status_history: siapa yang mengubah, kalau bukan admin
--
-- changed_by menunjuk ke profiles (user admin). Perubahan dari portal driver
-- selama ini masuk sebagai NULL dan terbaca "Sistem" di riwayat job, padahal
-- ada orang yang menekannya.
-- ---------------------------------------------------------------------------
ALTER TABLE job_status_history
  ADD COLUMN IF NOT EXISTS changed_by_driver UUID REFERENCES drivers(id);

-- ---------------------------------------------------------------------------
-- driver_sessions
--
-- expires_at absolut (bukan sliding tanpa batas) supaya HP yang hilang atau
-- dipinjam tidak jadi akses selamanya. 30 hari dipilih karena driver bisa di
-- jalan berminggu-minggu dan login ulang di tengah rute itu merepotkan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_driver_sessions_token  ON driver_sessions(token);
CREATE INDEX IF NOT EXISTS idx_driver_sessions_driver ON driver_sessions(driver_id, last_seen_at DESC);

ALTER TABLE driver_sessions ENABLE ROW LEVEL SECURITY;

-- Tidak ada policy untuk anon maupun driver: tabel ini hanya disentuh lewat
-- fungsi SECURITY DEFINER di bawah. Admin boleh melihat untuk audit.
DROP POLICY IF EXISTS "admin_read_driver_sessions" ON driver_sessions;
CREATE POLICY "admin_read_driver_sessions"
  ON driver_sessions FOR SELECT
  USING (is_active_admin());

DROP POLICY IF EXISTS "admin_revoke_driver_sessions" ON driver_sessions;
CREATE POLICY "admin_revoke_driver_sessions"
  ON driver_sessions FOR UPDATE
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

-- ---------------------------------------------------------------------------
-- current_driver_id — identitas driver untuk RLS
--
-- Membaca header `x-driver-token` yang dipasang createDriverClient() di sisi
-- server Next.js. Dibuat STABLE supaya cukup dievaluasi sekali per query,
-- bukan sekali per baris.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_driver_token()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.headers', true)::json ->> 'x-driver-token',
    ''
  );
$$;

CREATE OR REPLACE FUNCTION current_driver_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.driver_id
  FROM driver_sessions s
  JOIN drivers d ON d.id = s.driver_id
  WHERE s.token = current_driver_token()
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND d.is_active = true
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Policy baca untuk driver
--
-- Cakupannya sempit dengan sengaja: hanya job miliknya sendiri, dan hanya
-- baris pendukung yang menempel ke job itu.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "driver_read_own_jobs" ON jobs;
CREATE POLICY "driver_read_own_jobs"
  ON jobs FOR SELECT
  USING (driver_id = current_driver_id());

DROP POLICY IF EXISTS "driver_read_own_job_photos" ON job_photos;
CREATE POLICY "driver_read_own_job_photos"
  ON job_photos FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = job_photos.job_id
      AND j.driver_id = current_driver_id()
  ));

DROP POLICY IF EXISTS "driver_insert_own_job_photos" ON job_photos;
CREATE POLICY "driver_insert_own_job_photos"
  ON job_photos FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = job_photos.job_id
      AND j.driver_id = current_driver_id()
      AND j.accepted_at IS NOT NULL
      AND j.status NOT IN ('selesai', 'cancelled')
  ));

DROP POLICY IF EXISTS "driver_read_units_of_own_jobs" ON units;
CREATE POLICY "driver_read_units_of_own_jobs"
  ON units FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.unit_id = units.id
      AND j.driver_id = current_driver_id()
  ));

DROP POLICY IF EXISTS "driver_read_customers_of_own_jobs" ON customers;
CREATE POLICY "driver_read_customers_of_own_jobs"
  ON customers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.customer_id = customers.id
      AND j.driver_id = current_driver_id()
  ));

DROP POLICY IF EXISTS "driver_read_self" ON drivers;
CREATE POLICY "driver_read_self"
  ON drivers FOR SELECT
  USING (id = current_driver_id());

-- ---------------------------------------------------------------------------
-- Perketat policy anon lama
--
-- "public_read_jobs_by_token" dulu berbunyi: siapa pun tanpa login boleh
-- membaca SEMUA job aktif, asal job itu punya share_token — dan setiap job
-- selalu punya. Artinya seluruh daftar job berjalan, nama customer, dan nomor
-- HP PIC bisa ditarik oleh siapa saja yang tahu URL Supabase-nya. Yang
-- dimaksud jelas "job yang tokennya dibawa pengunjung", jadi tokennya sekarang
-- benar-benar dicocokkan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_share_token()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.headers', true)::json ->> 'x-share-token',
    ''
  );
$$;

DROP POLICY IF EXISTS "public_read_jobs_by_token" ON jobs;
CREATE POLICY "public_read_jobs_by_token"
  ON jobs FOR SELECT
  USING (
    auth.uid() IS NULL
    AND current_share_token() IS NOT NULL
    AND share_token = current_share_token()
    AND status NOT IN ('selesai', 'cancelled')
  );

DROP POLICY IF EXISTS "public_read_photos_via_token" ON job_photos;
CREATE POLICY "public_read_photos_via_token"
  ON job_photos FOR SELECT
  USING (
    auth.uid() IS NULL AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = job_photos.job_id
        AND current_share_token() IS NOT NULL
        AND j.share_token = current_share_token()
        AND j.status NOT IN ('selesai', 'cancelled')
    )
  );

DROP POLICY IF EXISTS "public_read_units_via_jobs" ON units;
CREATE POLICY "public_read_units_via_jobs"
  ON units FOR SELECT
  USING (
    auth.uid() IS NULL AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.unit_id = units.id
        AND current_share_token() IS NOT NULL
        AND j.share_token = current_share_token()
        AND j.status NOT IN ('selesai', 'cancelled')
    )
  );

DROP POLICY IF EXISTS "public_read_drivers_via_jobs" ON drivers;
CREATE POLICY "public_read_drivers_via_jobs"
  ON drivers FOR SELECT
  USING (
    auth.uid() IS NULL AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.driver_id = drivers.id
        AND current_share_token() IS NOT NULL
        AND j.share_token = current_share_token()
        AND j.status NOT IN ('selesai', 'cancelled')
    )
  );

DROP POLICY IF EXISTS "public_read_customers_via_jobs" ON customers;
CREATE POLICY "public_read_customers_via_jobs"
  ON customers FOR SELECT
  USING (
    auth.uid() IS NULL AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.customer_id = customers.id
        AND current_share_token() IS NOT NULL
        AND j.share_token = current_share_token()
        AND j.status NOT IN ('selesai', 'cancelled')
    )
  );

-- ---------------------------------------------------------------------------
-- Trigger history: catat driver sebagai pelaku
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_job_status_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Catatan dititipkan lewat setting transaksi oleh pemanggil, supaya
    -- tersimpan bersama baris history-nya, bukan lewat UPDATE susulan yang
    -- bisa mengenai baris lain kalau ada dua perubahan berdekatan.
    v_note := NULLIF(current_setting('app.status_note', true), '');

    INSERT INTO job_status_history (
      job_id, status_old, status_new, changed_by, changed_by_driver, notes
    )
    VALUES (
      NEW.id, OLD.status, NEW.status, auth.uid(), current_driver_id(), v_note
    );

    IF NEW.status = 'selesai' AND OLD.status <> 'selesai' THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- RPC: login driver
--
-- Tidak membedakan "nomor tidak terdaftar" dan "PIN salah" di pesan error,
-- supaya daftar nomor HP driver tidak bisa diuji satu per satu dari halaman
-- login.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION driver_login(
  p_no_hp      TEXT,
  p_pin        TEXT,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (token TEXT, driver_id UUID, nama TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  WHERE regexp_replace(d.no_hp, '[^0-9]', '', 'g') = v_norm
     OR '0' || substring(regexp_replace(d.no_hp, '[^0-9]', '', 'g') FROM 3) = v_norm
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

  RETURN QUERY SELECT v_token, v_driver.id, v_driver.nama, v_expires;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: profil driver yang sedang login
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION driver_me()
RETURNS TABLE (id UUID, nama TEXT, no_hp TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID := current_driver_id();
BEGIN
  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE driver_sessions
     SET last_seen_at = now()
   WHERE token = current_driver_token();

  RETURN QUERY
    SELECT d.id, d.nama, d.no_hp FROM drivers d WHERE d.id = v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: logout
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION driver_logout()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE driver_sessions
     SET revoked_at = now()
   WHERE token = current_driver_token()
     AND revoked_at IS NULL;
$$;

-- ---------------------------------------------------------------------------
-- RPC: driver menerima job
--
-- Idempoten: menekan dua kali tidak menggeser waktu konfirmasi yang pertama,
-- karena yang bernilai adalah kapan driver pertama menyatakan siap.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION driver_accept_job(p_job_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver UUID := current_driver_id();
  v_job    jobs%ROWTYPE;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND driver_id = v_driver;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;

  IF v_job.status IN ('selesai', 'cancelled') THEN
    RAISE EXCEPTION 'Job sudah ditutup, tidak bisa dikonfirmasi' USING ERRCODE = '22023';
  END IF;

  IF v_job.accepted_at IS NOT NULL THEN
    RETURN v_job.accepted_at;
  END IF;

  UPDATE jobs SET accepted_at = now(), updated_at = now() WHERE id = p_job_id;

  RETURN (SELECT accepted_at FROM jobs WHERE id = p_job_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: driver mengubah status job
--
-- Urutan status dikunci di sini, bukan di tampilan. Tombol di HP bisa
-- ditekan dua kali, halaman bisa dibuka dari cache lama, dan koneksi di jalan
-- sering mengirim ulang permintaan yang sama.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION driver_update_job_status(
  p_job_id UUID,
  p_status job_status,
  p_notes  TEXT DEFAULT NULL
)
RETURNS job_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver UUID := current_driver_id();
  v_job    jobs%ROWTYPE;
  v_next   job_status;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND driver_id = v_driver;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;

  IF v_job.accepted_at IS NULL THEN
    RAISE EXCEPTION 'Terima job dulu sebelum mengubah status' USING ERRCODE = '22023';
  END IF;

  -- Satu langkah maju saja. Driver tidak boleh melompati tahap atau mundur;
  -- koreksi status yang terlanjur salah adalah wewenang admin.
  v_next := CASE v_job.status
    WHEN 'menunggu_pickup'  THEN 'loading'
    WHEN 'loading'          THEN 'dalam_perjalanan'
    WHEN 'dalam_perjalanan' THEN 'unloading'
    WHEN 'unloading'        THEN 'selesai'
    ELSE NULL
  END;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Job sudah selesai atau dibatalkan' USING ERRCODE = '22023';
  END IF;

  IF p_status IS DISTINCT FROM v_next THEN
    RAISE EXCEPTION 'Status berikutnya untuk job ini adalah %, bukan %', v_next, p_status
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.status_note', COALESCE(NULLIF(btrim(p_notes), ''), ''), true);
  UPDATE jobs SET status = v_next, updated_at = now() WHERE id = p_job_id;
  PERFORM set_config('app.status_note', '', true);

  RETURN v_next;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC admin: set / reset PIN driver
--
-- Hashing harus di database supaya PIN mentah tidak pernah singgah di log
-- aplikasi maupun di payload PostgREST yang tersimpan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_set_driver_pin(p_driver_id UUID, p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_active_admin() THEN
    RAISE EXCEPTION 'Hanya admin yang boleh mengatur PIN driver' USING ERRCODE = '42501';
  END IF;

  IF p_pin !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN harus 6 angka' USING ERRCODE = '22023';
  END IF;

  UPDATE drivers
     SET pin_hash = crypt(p_pin, gen_salt('bf')),
         pin_updated_at = now(),
         updated_at = now()
   WHERE id = p_driver_id;

  -- PIN berganti berarti perangkat lama tidak boleh tetap masuk.
  UPDATE driver_sessions
     SET revoked_at = now()
   WHERE driver_id = p_driver_id AND revoked_at IS NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Hak akses fungsi
--
-- Driver mengakses database sebagai `anon` (dia bukan user Supabase), jadi
-- fungsi portal harus bisa dipanggil anon. Keamanannya ada di dalam fungsi:
-- semuanya berangkat dari current_driver_id().
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION driver_login(TEXT, TEXT, TEXT)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_me()                                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_logout()                            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_accept_job(UUID)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_update_job_status(UUID, job_status, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_driver_id()                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_driver_token()                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_share_token()                      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_set_driver_pin(UUID, TEXT)           TO authenticated;

-- admin_set_driver_pin dan driver_login memakai crypt()/gen_salt() dari
-- pgcrypto; ekstensinya sudah dipasang di migration 01.

-- ---------------------------------------------------------------------------
-- Storage: driver boleh unggah foto job miliknya
--
-- Path foto berpola `<job_id>/<loading|unloading>/<timestamp>.<ext>`, jadi
-- segmen folder pertama dipakai untuk mengecek kepemilikan job. Tanpa policy
-- ini tombol "Foto Loading" di portal driver selalu gagal — hanya admin yang
-- punya hak tulis ke bucket.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "drivers_upload_own_job_photos" ON storage.objects;
CREATE POLICY "drivers_upload_own_job_photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'job-photos'
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id::text = (storage.foldername(name))[1]
        AND j.driver_id = current_driver_id()
        AND j.status NOT IN ('selesai', 'cancelled')
    )
  );
