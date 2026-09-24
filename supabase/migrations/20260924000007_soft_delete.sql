-- ============================================================================
-- Migration 20260924000007: soft delete — kolom `status` seragam di semua tabel
--
-- Aturan (berlaku untuk SETIAP tabel di schema transport dan hr):
--   status SMALLINT NOT NULL DEFAULT 1
--     1 = aktif
--     2 = dihapus pengguna lewat web/mobile — barisnya TIDAK hilang, jadi
--         bisa dikembalikan kalau ternyata salah hapus:
--           UPDATE transport.<tabel> SET status = 1 WHERE id = '...';
--
-- Isi migrasi:
--   1. Kolom `status` lama yang punya arti lain diganti nama sesuai fungsinya.
--   2. Kolom `status` (1/2) ditambahkan ke semua tabel.
--   3. Kunci unik bisnis (nama jenis unit, kode unit, dst.) hanya berlaku di
--      antara baris aktif, supaya data yang dihapus tidak menghalangi input
--      ulang dengan nama yang sama.
--   4. Jaring pengaman di database:
--        - DELETE apa pun (dari aplikasi, fungsi, atau SQL biasa) diubah jadi
--          UPDATE status = 2. Hapus permanen hanya bisa dengan sengaja:
--            SET app.hard_delete = 'on';  (dalam transaksi yang sama)
--        - Soft delete meniru aturan foreign key yang dulu dijalankan DELETE:
--          ON DELETE CASCADE → anak ikut status = 2; ON DELETE SET NULL →
--          kolom rujukan dikosongkan; selain itu → ditolak (23503) selama
--          masih ada anak aktif yang merujuk.
--   5. Semua fungsi yang membaca tabel hanya melihat baris status = 1, dan
--      memakai nama kolom baru.
--
-- Backend: klien data (backend/app/core/soft_delete.py) otomatis memberi
-- WHERE status = 1 pada setiap select dan mengubah delete jadi update.
--
-- URUTAN DEPLOY: jalankan migrasi ini lalu naikkan backend versi baru
-- bersamaan — backend lama masih memakai nama kolom `status` yang lama.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Ganti nama kolom `status` lama sesuai fungsinya ──────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('units',               'status_operasional'),  -- standby / bertugas / perbaikan
      ('jobs',                'status_job'),          -- tahapan job
      ('incident_logs',       'status_penanganan'),   -- open / in_progress / resolved
      ('quotations',          'status_penawaran'),    -- draft / terkirim / ...
      ('invoices',            'status_tagihan'),      -- draft / terkirim / lunas / batal
      ('uang_jalan_requests', 'status_pengajuan')     -- diajukan / dicairkan / ditolak
    ) AS t(tabel, kolom_baru)
  LOOP
    -- Idempoten: hanya rename kalau kolom lama masih ada dan belum berupa
    -- kolom soft delete (smallint).
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'transport' AND table_name = r.tabel
         AND column_name = 'status' AND data_type <> 'smallint'
    ) THEN
      EXECUTE format('ALTER TABLE transport.%I RENAME COLUMN status TO %I', r.tabel, r.kolom_baru);
    END IF;
  END LOOP;
END $$;

-- Nama index/constraint ikut disesuaikan supaya tidak menyesatkan.
ALTER INDEX IF EXISTS transport.idx_units_status     RENAME TO idx_units_status_operasional;
ALTER INDEX IF EXISTS transport.idx_jobs_status      RENAME TO idx_jobs_status_job;
ALTER INDEX IF EXISTS transport.idx_incident_status  RENAME TO idx_incident_status_penanganan;
ALTER INDEX IF EXISTS transport.idx_quotations_status RENAME TO idx_quotations_status_penawaran;
ALTER INDEX IF EXISTS transport.idx_invoices_status  RENAME TO idx_invoices_status_tagihan;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uang_jalan_requests_status_check'
              AND conrelid = 'transport.uang_jalan_requests'::regclass) THEN
    ALTER TABLE transport.uang_jalan_requests
      RENAME CONSTRAINT uang_jalan_requests_status_check TO uang_jalan_requests_status_pengajuan_check;
  END IF;
END $$;

-- ── 2. Kolom status (1 = aktif, 2 = dihapus) di semua tabel ─────────────────
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS tabel, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('transport', 'hr')
       AND c.relkind IN ('r', 'p')
       AND NOT EXISTS (
         SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid AND a.attname = 'status' AND NOT a.attisdropped
       )
  LOOP
    EXECUTE format(
      'ALTER TABLE %s ADD COLUMN status SMALLINT NOT NULL DEFAULT 1 CONSTRAINT %I CHECK (status IN (1, 2))',
      t.tabel, t.relname || '_status_aktif_check');
    EXECUTE format(
      'COMMENT ON COLUMN %s.status IS %L',
      t.tabel, '1 = aktif, 2 = dihapus pengguna (soft delete, bisa dikembalikan)');
  END LOOP;
END $$;

-- ── 3. Kunci unik bisnis hanya di antara baris aktif ────────────────────────
DROP INDEX IF EXISTS transport.jenis_unit_nama_unique;
CREATE UNIQUE INDEX jenis_unit_nama_unique
  ON transport.jenis_unit (lower(regexp_replace(btrim(nama), '\s+', ' ', 'g')))
  WHERE status = 1;

ALTER TABLE transport.units DROP CONSTRAINT IF EXISTS units_kode_unit_key;
CREATE UNIQUE INDEX IF NOT EXISTS units_kode_unit_unique
  ON transport.units (kode_unit) WHERE status = 1;

DROP INDEX IF EXISTS transport.units_default_driver_unique;
CREATE UNIQUE INDEX units_default_driver_unique
  ON transport.units (default_driver_id)
  WHERE default_driver_id IS NOT NULL AND is_active = true AND status = 1;

DROP INDEX IF EXISTS transport.uq_job_photos_slot;
CREATE UNIQUE INDEX uq_job_photos_slot
  ON transport.job_photos (job_id, stage, slot)
  WHERE slot IS NOT NULL AND status = 1;

ALTER TABLE transport.sumber_dana DROP CONSTRAINT IF EXISTS sumber_dana_nama_key;
CREATE UNIQUE INDEX IF NOT EXISTS sumber_dana_nama_unique
  ON transport.sumber_dana (nama) WHERE status = 1;

-- Nomor dokumen, token, dan email tetap unik untuk SEMUA baris (termasuk yang
-- dihapus): nomor tidak boleh terpakai dua kali, token adalah kunci akses.

-- ── 4a. DELETE → UPDATE status = 2 ──────────────────────────────────────────
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

  EXECUTE format('UPDATE %I.%I SET status = 2 WHERE %s AND status = 1',
                 TG_TABLE_SCHEMA, TG_TABLE_NAME, v_kondisi)
    USING OLD;
  RETURN NULL;  -- DELETE aslinya dibatalkan
END;
$$;

-- ── 4b. Aturan foreign key untuk soft delete ────────────────────────────────
-- Satu fungsi, dua trigger:
--   BEFORE UPDATE — cek RESTRICT/NO ACTION dulu, supaya penolakan terjadi
--                   sebelum apa pun berubah.
--   AFTER UPDATE  — CASCADE dan SET NULL ke anak. Harus sesudah baris induk
--                   tersimpan dengan status = 2: trigger anak (mis. hitung
--                   ulang total invoice saat item dihapus) mengubah baris
--                   induk, dan kalau itu terjadi di tengah UPDATE induk yang
--                   sama, Postgres menolaknya ("tuple to be updated was already
--                   modified"). Sesudahnya, fungsi hitung ulang melihat induk
--                   sudah status 2 dan melewatinya.
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

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS tabel
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('transport', 'hr') AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete ON %s', t.tabel);
    EXECUTE format(
      'CREATE TRIGGER trg_soft_delete BEFORE DELETE ON %s
         FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead()', t.tabel);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete_propagate ON %s', t.tabel);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete_guard ON %s', t.tabel);
    EXECUTE format(
      'CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON %s
         FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
         EXECUTE FUNCTION transport.soft_delete_propagate()', t.tabel);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON %s', t.tabel);
    EXECUTE format(
      'CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON %s
         FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
         EXECUTE FUNCTION transport.soft_delete_propagate()', t.tabel);
  END LOOP;
END $$;

-- ── 4c. Hak hapus tidak melebar ─────────────────────────────────────────────
-- Soft delete adalah UPDATE. Invoice dan penawaran boleh di-UPDATE admin mana
-- pun tapi dulu hanya boleh DI-HAPUS superadmin — pertahankan batas itu.
DROP POLICY IF EXISTS "soft_delete_invoices_superadmin" ON transport.invoices;
CREATE POLICY "soft_delete_invoices_superadmin"
  ON transport.invoices AS RESTRICTIVE FOR UPDATE
  USING (true)
  WITH CHECK (status = 1 OR transport.is_superadmin());

DROP POLICY IF EXISTS "soft_delete_quotations_superadmin" ON transport.quotations;
CREATE POLICY "soft_delete_quotations_superadmin"
  ON transport.quotations AS RESTRICTIVE FOR UPDATE
  USING (true)
  WITH CHECK (status = 1 OR transport.is_superadmin());

-- ── 5. Fungsi: nama kolom baru + hanya baris status = 1 ─────────────────────

CREATE OR REPLACE FUNCTION transport.admin_return_job(p_job_id uuid, p_note text, p_to_status job_status DEFAULT 'serah_terima_pool'::job_status)
 RETURNS job_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  IF NOT is_active_admin() OR NOT can_access_job(p_job_id) THEN
    RAISE EXCEPTION 'Tidak berhak mengembalikan job ini' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND status = 1;
  IF v_job.status_job <> 'menunggu_validasi' THEN
    RAISE EXCEPTION 'Hanya job berstatus menunggu validasi yang bisa dikembalikan' USING ERRCODE = '22023';
  END IF;
  IF p_to_status NOT IN ('loading', 'dalam_perjalanan', 'unloading', 'serah_terima_pool') THEN
    RAISE EXCEPTION 'Status tujuan tidak valid' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(p_note), '') = '' THEN
    RAISE EXCEPTION 'Catatan pengembalian wajib diisi' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.status_note', 'Dikembalikan admin: ' || btrim(p_note), true);
  UPDATE jobs
     SET status_job = p_to_status, validation_note = btrim(p_note), updated_at = now()
   WHERE id = p_job_id AND status = 1;
  PERFORM set_config('app.status_note', '', true);
  RETURN p_to_status;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.admin_set_driver_pin(p_driver_id uuid, p_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
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
   WHERE id = p_driver_id AND status = 1;

  -- PIN berganti berarti perangkat lama tidak boleh tetap masuk.
  UPDATE driver_sessions
     SET revoked_at = now()
   WHERE driver_id = p_driver_id AND revoked_at IS NULL AND status = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.admin_validate_job(p_job_id uuid)
 RETURNS job_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  IF NOT is_active_admin() OR NOT can_access_job(p_job_id) THEN
    RAISE EXCEPTION 'Tidak berhak memvalidasi job ini' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND status = 1;
  IF v_job.status_job <> 'menunggu_validasi' THEN
    RAISE EXCEPTION 'Hanya job berstatus menunggu validasi yang bisa di-approve' USING ERRCODE = '22023';
  END IF;

  UPDATE jobs
     SET status_job = 'selesai', validated_by = auth.uid(), validated_at = now(),
         validation_note = NULL, updated_at = now()
   WHERE id = p_job_id AND status = 1;
  RETURN 'selesai';
END;
$function$;

CREATE OR REPLACE FUNCTION transport.can_access_job(p_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = p_job_id
      AND j.status = 1
      AND (is_superadmin() OR can_access_unit(j.unit_id))
  );
$function$;

CREATE OR REPLACE FUNCTION transport.can_access_unit(p_unit_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT
    is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM units u
      WHERE u.id = p_unit_id
        AND u.status = 1
        AND u.jenis_unit_id = ANY (
          COALESCE(current_user_jenis_scope(), ARRAY[]::UUID[])
        )
    );
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
  WHERE id = auth.uid() AND is_active = true AND status = 1
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION transport.current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active = true AND status = 1 LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION transport.driver_accept_job(p_job_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_driver UUID := current_driver_id();
  v_job    jobs%ROWTYPE;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND driver_id = v_driver AND status = 1;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;
  IF v_job.status_job IN ('selesai', 'cancelled') THEN
    RAISE EXCEPTION 'Job sudah ditutup, tidak bisa dikonfirmasi' USING ERRCODE = '22023';
  END IF;
  IF v_job.accepted_at IS NOT NULL THEN
    RETURN v_job.accepted_at;
  END IF;

  UPDATE jobs
     SET accepted_at = now(),
         status_job = CASE WHEN status_job = 'ditugaskan' THEN 'diterima'::job_status ELSE status_job END,
         updated_at = now()
   WHERE id = p_job_id AND status = 1;

  RETURN (SELECT accepted_at FROM jobs WHERE id = p_job_id AND status = 1);
END;
$function$;

CREATE OR REPLACE FUNCTION transport.driver_active_job_id(p_driver_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT j.id FROM jobs j
  WHERE j.driver_id = p_driver_id
    AND j.status = 1
    AND j.status_job NOT IN ('selesai', 'cancelled')
  ORDER BY j.created_at
  LIMIT 1;
$function$;

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

  RETURN QUERY SELECT v_token, v_driver.id, v_driver.nama, v_expires;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.driver_logout()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  UPDATE driver_sessions
     SET revoked_at = now()
   WHERE token = current_driver_token()
     AND revoked_at IS NULL
     AND status = 1;
$function$;

CREATE OR REPLACE FUNCTION transport.driver_me()
 RETURNS TABLE(id uuid, nama text, no_hp text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_id UUID := current_driver_id();
BEGIN
  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE driver_sessions
     SET last_seen_at = now()
   WHERE token = current_driver_token() AND status = 1;

  RETURN QUERY
    SELECT d.id, d.nama, d.no_hp FROM drivers d WHERE d.id = v_id AND d.status = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.driver_register_device(p_fcm_token text, p_platform text DEFAULT 'android'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_driver UUID := current_driver_id();
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;
  IF COALESCE(btrim(p_fcm_token), '') = '' THEN
    RAISE EXCEPTION 'Token perangkat kosong' USING ERRCODE = '22023';
  END IF;
  -- Token yang sama bisa berpindah driver (HP dipakai bergantian). Token yang
  -- pernah di-unregister (status = 2) dihidupkan lagi.
  INSERT INTO driver_devices (driver_id, fcm_token, platform)
  VALUES (v_driver, p_fcm_token, COALESCE(p_platform, 'android'))
  ON CONFLICT (fcm_token) DO UPDATE
    SET driver_id = EXCLUDED.driver_id, platform = EXCLUDED.platform,
        last_seen_at = now(), status = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.driver_register_job_photo(p_job_id uuid, p_stage text, p_slot text, p_file_path text, p_file_size integer DEFAULT NULL::integer, p_sharpness numeric DEFAULT NULL::numeric, p_kualitas_rendah boolean DEFAULT false, p_taken_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(id uuid, replaced_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_driver UUID := current_driver_id();
  v_job    jobs%ROWTYPE;
  v_old    job_photos%ROWTYPE;
  v_id     UUID;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE jobs.id = p_job_id AND driver_id = v_driver AND jobs.status = 1;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;
  IF v_job.accepted_at IS NULL OR v_job.status_job IN ('selesai', 'cancelled') THEN
    RAISE EXCEPTION 'Job tidak dalam tahap yang menerima foto' USING ERRCODE = '22023';
  END IF;
  IF p_file_path NOT LIKE (p_job_id::text || '/%') THEN
    RAISE EXCEPTION 'Path foto tidak sah' USING ERRCODE = '42501';
  END IF;

  -- Foto hanya untuk tahap yang sedang atau sudah dilalui.
  IF (p_stage = 'loading'      AND v_job.status_job NOT IN ('diterima', 'loading', 'dalam_perjalanan', 'unloading', 'serah_terima_pool'))
  OR (p_stage = 'unloading'    AND v_job.status_job NOT IN ('dalam_perjalanan', 'unloading', 'serah_terima_pool'))
  OR (p_stage = 'serah_terima' AND v_job.status_job NOT IN ('serah_terima_pool')) THEN
    RAISE EXCEPTION 'Foto % belum bisa diunggah pada status %', p_stage, v_job.status_job
      USING ERRCODE = '22023';
  END IF;

  -- Foto lama di slot yang sama di-soft delete (status = 2), bukan dihapus,
  -- supaya masih bisa dikembalikan.
  SELECT * INTO v_old FROM job_photos jp
   WHERE jp.job_id = p_job_id AND jp.stage = p_stage AND jp.slot = p_slot AND jp.status = 1;
  IF v_old.id IS NOT NULL THEN
    UPDATE job_photos SET status = 2 WHERE job_photos.id = v_old.id;
  END IF;

  INSERT INTO job_photos (
    job_id, type, stage, slot, file_path, file_size,
    sharpness_score, kualitas_rendah, taken_at, lat, lng, uploaded_by_driver
  ) VALUES (
    p_job_id, p_stage::photo_type, p_stage, p_slot, p_file_path, p_file_size,
    p_sharpness, COALESCE(p_kualitas_rendah, false), p_taken_at, p_lat, p_lng, v_driver
  )
  RETURNING job_photos.id INTO v_id;

  RETURN QUERY SELECT v_id, v_old.file_path;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.driver_request_uang_jalan(p_job_id uuid, p_nominal bigint, p_catatan text DEFAULT NULL::text)
 RETURNS uang_jalan_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_driver UUID := current_driver_id();
  v_job    jobs%ROWTYPE;
  v_pos    RECORD;
  v_row    uang_jalan_requests;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND driver_id = v_driver AND status = 1;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;
  IF v_job.accepted_at IS NULL OR v_job.status_job IN ('ditugaskan', 'menunggu_validasi', 'selesai', 'cancelled') THEN
    RAISE EXCEPTION 'Uang jalan hanya bisa diajukan setelah Terima Pekerjaan dan sebelum job diselesaikan'
      USING ERRCODE = '22023';
  END IF;
  IF p_nominal IS NULL OR p_nominal <= 0 THEN
    RAISE EXCEPTION 'Nominal harus lebih dari nol' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pos FROM job_uang_jalan_posisi(p_job_id);
  IF v_pos.pending_request THEN
    RAISE EXCEPTION 'Masih ada pengajuan yang menunggu dicairkan' USING ERRCODE = '22023';
  END IF;
  IF v_pos.sisa <= 0 THEN
    RAISE EXCEPTION 'Uang jalan job sudah diterima seluruhnya' USING ERRCODE = '22023';
  END IF;
  IF p_nominal > v_pos.sisa THEN
    RAISE EXCEPTION 'Nominal melebihi sisa uang jalan (Rp %)', v_pos.sisa USING ERRCODE = '22023';
  END IF;

  INSERT INTO uang_jalan_requests (job_id, driver_id, nominal, catatan)
  VALUES (p_job_id, v_driver, p_nominal, NULLIF(btrim(COALESCE(p_catatan, '')), ''))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.driver_unregister_device(p_fcm_token text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  UPDATE driver_devices
     SET status = 2
   WHERE fcm_token = p_fcm_token AND driver_id = current_driver_id() AND status = 1;
$function$;

CREATE OR REPLACE FUNCTION transport.driver_update_job_status(p_job_id uuid, p_status job_status, p_notes text DEFAULT NULL::text)
 RETURNS job_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_driver UUID := current_driver_id();
  v_job    jobs%ROWTYPE;
  v_next   job_status;
  v_pos    RECORD;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND driver_id = v_driver AND status = 1;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;
  IF v_job.accepted_at IS NULL THEN
    RAISE EXCEPTION 'Terima pekerjaan dulu sebelum mengubah status' USING ERRCODE = '22023';
  END IF;

  -- Satu langkah maju saja; koreksi mundur adalah wewenang admin.
  v_next := CASE v_job.status_job
    WHEN 'diterima'          THEN 'loading'
    WHEN 'loading'           THEN 'dalam_perjalanan'
    WHEN 'dalam_perjalanan'  THEN 'unloading'
    WHEN 'unloading'         THEN 'serah_terima_pool'
    WHEN 'serah_terima_pool' THEN 'menunggu_validasi'
    ELSE NULL
  END;
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Job tidak bisa dimajukan dari status %', v_job.status_job USING ERRCODE = '22023';
  END IF;
  IF p_status IS DISTINCT FROM v_next THEN
    RAISE EXCEPTION 'Status berikutnya untuk job ini adalah %, bukan %', v_next, p_status
      USING ERRCODE = '22023';
  END IF;

  -- BR-02 Sequence Lock.
  SELECT * INTO v_pos FROM job_uang_jalan_posisi(p_job_id);
  IF v_pos.pending_request THEN
    RAISE EXCEPTION 'Menunggu admin mengunggah bukti transfer uang jalan.' USING ERRCODE = '22023';
  END IF;
  IF v_next = 'loading' AND NOT v_pos.ada_bukti THEN
    RAISE EXCEPTION 'Menunggu admin mengunggah bukti transfer uang jalan.' USING ERRCODE = '22023';
  END IF;

  -- BR-06 kelengkapan foto tahap.
  IF v_next = 'dalam_perjalanan' AND NOT job_stage_complete(p_job_id, 'loading') THEN
    RAISE EXCEPTION 'Lengkapi 5 foto loading (depan, belakang, kanan, kiri, surat timbang) dulu.'
      USING ERRCODE = '22023';
  END IF;
  IF v_next = 'serah_terima_pool' AND NOT job_stage_complete(p_job_id, 'unloading') THEN
    RAISE EXCEPTION 'Lengkapi 5 foto unloading (depan, belakang, kanan, kiri, surat timbang) dulu.'
      USING ERRCODE = '22023';
  END IF;
  IF v_next = 'menunggu_validasi' AND NOT job_stage_complete(p_job_id, 'serah_terima') THEN
    RAISE EXCEPTION 'Unggah foto serah terima dokumen dulu.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.status_note', COALESCE(NULLIF(btrim(p_notes), ''), ''), true);
  UPDATE jobs SET status_job = v_next, updated_at = now() WHERE id = p_job_id AND status = 1;
  PERFORM set_config('app.status_note', '', true);

  RETURN v_next;
END;
$function$;

-- gen_job_number SENGAJA menghitung semua job, termasuk yang dihapus
-- (status = 2): nomor job unik seumur hidup, jadi nomor job yang dihapus tidak
-- boleh dipakai ulang. Badan fungsinya tidak berubah.

CREATE OR REPLACE FUNCTION transport.get_job_profitability(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS TABLE(job_id uuid, job_number text, customer_nama text, unit_kode text, etd timestamp with time zone, status job_status, pendapatan bigint, uang_jalan bigint, biaya_insiden bigint, laba bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'transport', 'extensions'
AS $function$
  -- Kolom keluaran `status` = status job (nama keluaran dipertahankan untuk API).
  SELECT
    j.id,
    j.job_number,
    c.nama_perusahaan,
    u.kode_unit,
    j.etd,
    j.status_job,
    COALESCE(inv.pendapatan, 0)      AS pendapatan,
    COALESCE(uj.dicairkan, 0)        AS uang_jalan,
    COALESCE(ins.biaya, 0)           AS biaya_insiden,
    COALESCE(inv.pendapatan, 0)
      - COALESCE(uj.dicairkan, 0)
      - COALESCE(ins.biaya, 0)       AS laba
  FROM jobs j
  JOIN customers c ON c.id = j.customer_id
  JOIN units u     ON u.id = j.unit_id
  LEFT JOIN LATERAL (
    SELECT SUM(ii.subtotal) AS pendapatan
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE ii.job_id = j.id AND ii.status = 1 AND i.status = 1 AND i.status_tagihan <> 'batal'
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT SUM(x.jumlah) AS dicairkan
    FROM uang_jalan x
    WHERE x.job_id = j.id AND x.status = 1 AND x.jenis = 'pencairan'
  ) uj ON true
  LEFT JOIN LATERAL (
    SELECT SUM(COALESCE(n.biaya_repair, 0)) AS biaya
    FROM incident_logs n
    WHERE n.job_id = j.id AND n.status = 1
  ) ins ON true
  WHERE j.status = 1
    AND (p_start IS NULL OR j.etd >= p_start::TIMESTAMPTZ)
    AND (p_end   IS NULL OR j.etd <  (p_end + 1)::TIMESTAMPTZ)
    AND j.status_job <> 'cancelled'
  ORDER BY j.etd DESC;
$function$;

CREATE OR REPLACE FUNCTION transport.get_piutang_summary()
 RETURNS TABLE(customer_id uuid, customer_nama text, jumlah_invoice integer, total_tagihan bigint, total_dibayar bigint, sisa bigint, belum_jatuh_tempo bigint, umur_1_30 bigint, umur_31_60 bigint, umur_60_plus bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'transport', 'extensions'
AS $function$
  SELECT
    i.customer_id,
    MAX(i.customer_nama)                              AS customer_nama,
    COUNT(*)::INTEGER                                 AS jumlah_invoice,
    SUM(i.total)                                      AS total_tagihan,
    SUM(i.dibayar)                                    AS total_dibayar,
    SUM(i.total - i.dibayar)                          AS sisa,
    SUM(CASE WHEN i.jatuh_tempo IS NULL OR i.jatuh_tempo >= CURRENT_DATE
             THEN i.total - i.dibayar ELSE 0 END)     AS belum_jatuh_tempo,
    SUM(CASE WHEN i.jatuh_tempo < CURRENT_DATE
              AND CURRENT_DATE - i.jatuh_tempo BETWEEN 1 AND 30
             THEN i.total - i.dibayar ELSE 0 END)     AS umur_1_30,
    SUM(CASE WHEN i.jatuh_tempo < CURRENT_DATE
              AND CURRENT_DATE - i.jatuh_tempo BETWEEN 31 AND 60
             THEN i.total - i.dibayar ELSE 0 END)     AS umur_31_60,
    SUM(CASE WHEN i.jatuh_tempo < CURRENT_DATE
              AND CURRENT_DATE - i.jatuh_tempo > 60
             THEN i.total - i.dibayar ELSE 0 END)     AS umur_60_plus
  FROM invoices i
  WHERE i.status = 1
    AND i.status_tagihan = 'terkirim'
    AND i.total > i.dibayar
  GROUP BY i.customer_id
  ORDER BY SUM(i.total - i.dibayar) DESC;
$function$;

CREATE OR REPLACE FUNCTION transport.get_unit_utilization(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(unit_id uuid, kode_unit text, jenis text, hari_bertugas numeric, hari_standby numeric, hari_perbaikan numeric, persentase_utilisasi numeric)
 LANGUAGE plpgsql
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_total_days NUMERIC;
BEGIN
  v_total_days := GREATEST(EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400.0, 0.0001);

  RETURN QUERY
  WITH segments AS (
    SELECT
      u.id AS unit_id,
      u.kode_unit,
      ju.nama AS jenis,
      h.status_new AS kondisi,
      h.changed_at AS started_at,
      LEAD(h.changed_at, 1, p_end_date) OVER (PARTITION BY u.id ORDER BY h.changed_at) AS ended_at
    FROM units u
    JOIN jenis_unit ju ON ju.id = u.jenis_unit_id
    LEFT JOIN LATERAL (
      -- baseline: latest history before p_start_date (or current status if none)
      SELECT
        COALESCE(
          (SELECT us.status_new FROM unit_status_history us
            WHERE us.unit_id = u.id AND us.status = 1 AND us.changed_at < p_start_date
            ORDER BY us.changed_at DESC LIMIT 1),
          u.status_operasional
        ) AS status_new,
        p_start_date AS changed_at
      UNION ALL
      SELECT us2.status_new, us2.changed_at
      FROM unit_status_history us2
      WHERE us2.unit_id = u.id
        AND us2.status = 1
        AND us2.changed_at >= p_start_date
        AND us2.changed_at <  p_end_date
    ) h ON true
    WHERE u.is_active = true AND u.status = 1
  ),
  agg AS (
    SELECT
      s.unit_id,
      s.kode_unit,
      s.jenis,
      SUM(CASE WHEN s.kondisi = 'bertugas'  THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_bertugas,
      SUM(CASE WHEN s.kondisi = 'standby'   THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_standby,
      SUM(CASE WHEN s.kondisi = 'perbaikan' THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_perbaikan
    FROM segments s
    GROUP BY s.unit_id, s.kode_unit, s.jenis
  )
  SELECT
    a.unit_id,
    a.kode_unit,
    a.jenis,
    ROUND(a.hari_bertugas::NUMERIC,  2) AS hari_bertugas,
    ROUND(a.hari_standby::NUMERIC,   2) AS hari_standby,
    ROUND(a.hari_perbaikan::NUMERIC, 2) AS hari_perbaikan,
    ROUND((a.hari_bertugas / v_total_days * 100)::NUMERIC, 2) AS persentase_utilisasi
  FROM agg a
  ORDER BY a.hari_bertugas DESC, a.kode_unit;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_karyawan_id UUID;
  v_nama TEXT;
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

  INSERT INTO transport.profiles (id, email, nama, role, karyawan_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'nama', ''), v_nama),
    'operator',
    v_karyawan_id
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.incident_set_resolved_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  IF NEW.status_penanganan = 'resolved' AND (OLD.status_penanganan IS DISTINCT FROM 'resolved') THEN
    NEW.resolved_at := now();
  ELSIF NEW.status_penanganan <> 'resolved' THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.incident_set_unit_perbaikan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  IF NEW.tipe IN ('kerusakan', 'breakdown') AND NEW.status_penanganan = 'open' THEN
    UPDATE units
       SET status_operasional = 'perbaikan', updated_at = now()
     WHERE id = NEW.unit_id AND status = 1 AND status_operasional <> 'perbaikan';
  END IF;
  RETURN NEW;
END;
$function$;

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
  );
$function$;

CREATE OR REPLACE FUNCTION transport.job_stage_complete(p_job_id uuid, p_stage text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT CASE p_stage
    WHEN 'serah_terima' THEN EXISTS (
      SELECT 1 FROM job_photos
      WHERE job_id = p_job_id AND status = 1 AND stage = 'serah_terima' AND slot = 'serah_terima')
    ELSE (
      SELECT COUNT(DISTINCT slot) = 5 FROM job_photos
      WHERE job_id = p_job_id AND status = 1 AND stage = p_stage
        AND slot IN ('depan', 'belakang', 'kanan', 'kiri', 'surat_timbang'))
  END;
$function$;

CREATE OR REPLACE FUNCTION transport.job_uang_jalan_posisi(p_job_id uuid)
 RETURNS TABLE(pagu bigint, cair bigint, sisa bigint, ada_bukti boolean, pending_request boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  WITH t AS (
    SELECT
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'penambahan_pagu'), 0) AS tambah,
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'pencairan'), 0)       AS cair,
      bool_or(jenis = 'pencairan' AND bukti_transfer_path IS NOT NULL)  AS ada_bukti
    FROM uang_jalan WHERE job_id = p_job_id AND status = 1
  )
  SELECT
    (j.uang_jalan_pagu + t.tambah)::BIGINT,
    t.cair::BIGINT,
    (j.uang_jalan_pagu + t.tambah - t.cair)::BIGINT,
    COALESCE(t.ada_bukti, false),
    EXISTS (SELECT 1 FROM uang_jalan_requests r
             WHERE r.job_id = p_job_id AND r.status = 1 AND r.status_pengajuan = 'diajukan')
  FROM jobs j, t WHERE j.id = p_job_id AND j.status = 1;
$function$;

CREATE OR REPLACE FUNCTION transport.jobs_driver_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_other UUID;
BEGIN
  IF NEW.status_job IN ('selesai', 'cancelled') OR NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.driver_id = OLD.driver_id
     AND OLD.status_job NOT IN ('selesai', 'cancelled') THEN
    RETURN NEW; -- job yang sama tetap aktif, bukan penugasan baru
  END IF;

  SELECT j.id INTO v_other FROM jobs j
   WHERE j.driver_id = NEW.driver_id
     AND j.id <> NEW.id
     AND j.status = 1
     AND j.status_job NOT IN ('selesai', 'cancelled')
   LIMIT 1;

  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION 'Driver masih In Job (job %). Tunggu admin memvalidasi job itu.',
      (SELECT job_number FROM jobs WHERE id = v_other)
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.jobs_emit_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_driver(NEW.driver_id, 'job_baru', 'Job baru untuk Anda',
      NEW.job_number || ' — ' || NEW.asal || ' → ' || NEW.tujuan,
      '/driver/jobs/' || NEW.id, NEW.id);
    RETURN NEW;
  END IF;

  -- Job yang di-soft delete tidak memicu notifikasi apa pun.
  IF NEW.status <> 1 THEN
    RETURN NEW;
  END IF;

  IF OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL THEN
    PERFORM notify_admin('job_diterima', 'Driver menerima job',
      NEW.job_number || ' diterima ' || (SELECT nama FROM drivers WHERE id = NEW.driver_id),
      '/jobs/' || NEW.id, NEW.id);
  END IF;

  IF OLD.status_job IS DISTINCT FROM NEW.status_job THEN
    IF NEW.status_job = 'menunggu_validasi' THEN
      PERFORM notify_admin('job_menunggu_validasi', 'Job menunggu validasi',
        NEW.job_number || ' — ' || (SELECT nama FROM drivers WHERE id = NEW.driver_id) || ' sudah menyelesaikan orderan',
        '/jobs/' || NEW.id || '/validasi', NEW.id);
    ELSIF NEW.status_job = 'selesai' AND NEW.validated_at IS NOT NULL THEN
      PERFORM notify_driver(NEW.driver_id, 'job_divalidasi', 'Job divalidasi admin',
        NEW.job_number || ' selesai. Anda kembali Stand By.', '/driver/jobs/' || NEW.id, NEW.id);
    ELSIF OLD.status_job = 'menunggu_validasi' AND NEW.validation_note IS NOT NULL THEN
      PERFORM notify_driver(NEW.driver_id, 'job_dikembalikan', 'Job dikembalikan admin',
        NEW.job_number || ': ' || NEW.validation_note, '/driver/jobs/' || NEW.id, NEW.id);
    ELSIF NEW.status_job = 'cancelled' THEN
      PERFORM notify_driver(NEW.driver_id, 'job_dibatalkan', 'Job dibatalkan',
        NEW.job_number || COALESCE(': ' || NEW.cancelled_reason, ''), '/driver/dashboard', NEW.id);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.driver_id <> NEW.driver_id AND NEW.status_job NOT IN ('selesai', 'cancelled') THEN
    PERFORM notify_driver(NEW.driver_id, 'job_baru', 'Job baru untuk Anda',
      NEW.job_number || ' — ' || NEW.asal || ' → ' || NEW.tujuan, '/driver/jobs/' || NEW.id, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.jobs_require_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'transport', 'extensions'
AS $function$
BEGIN
  IF NEW.status_job = 'selesai' AND OLD.status_job <> 'selesai' AND NEW.validated_at IS NULL THEN
    RAISE EXCEPTION 'Job harus divalidasi admin (Approve) sebelum selesai'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.karyawan_pilihan_pengguna(p_user_id uuid)
 RETURNS TABLE(id uuid, nama text, tanggal_lahir date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
  SELECT k.id, k.nama, k.tanggal_lahir
    FROM hr.karyawan k
   WHERE transport.is_superadmin()
     AND k.status = 1
     AND NOT EXISTS (
       SELECT 1 FROM transport.profiles p
        WHERE p.karyawan_id = k.id AND p.id <> p_user_id AND p.status = 1
     )
   ORDER BY k.nama;
$function$;

CREATE OR REPLACE FUNCTION transport.karyawan_tanpa_akun()
 RETURNS TABLE(id uuid, nama text, tanggal_lahir date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
  SELECT k.id, k.nama, k.tanggal_lahir
    FROM hr.karyawan k
   WHERE transport.is_superadmin()
     AND k.status = 1
     AND NOT EXISTS (SELECT 1 FROM transport.profiles p WHERE p.karyawan_id = k.id AND p.status = 1)
   ORDER BY k.nama;
$function$;

CREATE OR REPLACE FUNCTION transport.log_job_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_note TEXT;
BEGIN
  IF NEW.status_job IS DISTINCT FROM OLD.status_job THEN
    -- Catatan dititipkan lewat setting transaksi oleh pemanggil, supaya
    -- tersimpan bersama baris history-nya, bukan lewat UPDATE susulan yang
    -- bisa mengenai baris lain kalau ada dua perubahan berdekatan.
    v_note := NULLIF(current_setting('app.status_note', true), '');

    INSERT INTO job_status_history (
      job_id, status_old, status_new, changed_by, changed_by_driver, notes
    )
    VALUES (
      NEW.id, OLD.status_job, NEW.status_job, auth.uid(), current_driver_id(), v_note
    );

    IF NEW.status_job = 'selesai' AND OLD.status_job <> 'selesai' THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.log_job_status_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  INSERT INTO job_status_history (job_id, status_old, status_new, changed_by)
  VALUES (NEW.id, NULL, NEW.status_job, NEW.created_by);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.log_unit_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  IF NEW.status_operasional IS DISTINCT FROM OLD.status_operasional THEN
    INSERT INTO unit_status_history (unit_id, status_old, status_new, changed_by)
    VALUES (NEW.id, OLD.status_operasional, NEW.status_operasional, auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.recalc_invoice_payment_state(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_dibayar BIGINT;
  v_inv     invoices%ROWTYPE;
BEGIN
  SELECT COALESCE(SUM(jumlah), 0) INTO v_dibayar
  FROM invoice_payments WHERE invoice_id = p_invoice_id AND status = 1;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id AND status = 1;
  IF v_inv.id IS NULL THEN RETURN; END IF;

  -- Invoice batal tidak ikut berubah status walau ada pembayaran nyasar —
  -- itu justru harus terlihat sebagai kejanggalan, bukan disembunyikan.
  IF v_inv.status_tagihan = 'batal' THEN
    UPDATE invoices SET dibayar = v_dibayar, updated_at = now()
     WHERE id = p_invoice_id;
    RETURN;
  END IF;

  IF v_inv.total > 0 AND v_dibayar >= v_inv.total THEN
    UPDATE invoices
       SET dibayar        = v_dibayar,
           status_tagihan = 'lunas',
           lunas_at       = COALESCE(v_inv.lunas_at, now()),
           updated_at     = now()
     WHERE id = p_invoice_id;
  ELSE
    UPDATE invoices
       SET dibayar        = v_dibayar,
           -- Turun lagi dari lunas kalau pembayaran dihapus/dikoreksi.
           status_tagihan = CASE
                              WHEN v_inv.status_tagihan = 'lunas' THEN 'terkirim'::invoice_status
                              ELSE v_inv.status_tagihan
                            END,
           lunas_at       = CASE WHEN v_inv.status_tagihan = 'lunas' THEN NULL ELSE v_inv.lunas_at END,
           updated_at     = now()
     WHERE id = p_invoice_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.recalc_invoice_totals(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_subtotal   BIGINT;
  v_ppn_aktif  BOOLEAN;
  v_ppn_persen NUMERIC(5,2);
  v_ppn        BIGINT;
BEGIN
  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = p_invoice_id AND status = 1;

  SELECT ppn_aktif, ppn_persen INTO v_ppn_aktif, v_ppn_persen
  FROM invoices WHERE id = p_invoice_id AND status = 1;

  IF v_ppn_aktif THEN
    v_ppn := ROUND(v_subtotal * v_ppn_persen / 100.0);
  ELSE
    v_ppn := 0;
  END IF;

  UPDATE invoices
     SET subtotal    = v_subtotal,
         ppn_nominal = v_ppn,
         total       = v_subtotal + v_ppn,
         updated_at  = now()
   WHERE id = p_invoice_id AND status = 1;

  -- Total berubah bisa mengubah status lunas (misal item ditambah setelah
  -- pembayaran masuk), jadi status dihitung ulang di sini juga.
  PERFORM recalc_invoice_payment_state(p_invoice_id);
END;
$function$;

CREATE OR REPLACE FUNCTION transport.recalc_quotation_totals(p_quotation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_subtotal BIGINT;
  v_ppn_aktif BOOLEAN;
  v_ppn_persen NUMERIC(5,2);
  v_ppn BIGINT;
BEGIN
  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM quotation_items WHERE quotation_id = p_quotation_id AND status = 1;

  SELECT ppn_aktif, ppn_persen INTO v_ppn_aktif, v_ppn_persen
  FROM quotations WHERE id = p_quotation_id AND status = 1;

  IF v_ppn_aktif THEN
    v_ppn := ROUND(v_subtotal * v_ppn_persen / 100.0);
  ELSE
    v_ppn := 0;
  END IF;

  UPDATE quotations
     SET subtotal    = v_subtotal,
         ppn_nominal = v_ppn,
         total       = v_subtotal + v_ppn,
         updated_at  = now()
   WHERE id = p_quotation_id AND status = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.recompute_unit_odometer(p_unit uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  UPDATE units u
     SET current_odometer_km = u.odometer_baseline_km + COALESCE((
           SELECT SUM(daily_km)::NUMERIC(12, 2)
             FROM unit_odometer_snapshots
            WHERE unit_id = p_unit AND status = 1
         ), 0),
         updated_at = now()
   WHERE u.id = p_unit AND u.status = 1;
END;
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
  );
$function$;

CREATE OR REPLACE FUNCTION transport.sync_unit_status_with_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status_job NOT IN ('selesai', 'cancelled') THEN
    UPDATE units SET status_operasional = 'bertugas', updated_at = now()
     WHERE id = NEW.unit_id AND status = 1 AND status_operasional <> 'perbaikan';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status_job IS DISTINCT FROM NEW.status_job THEN
    IF NEW.status_job IN ('selesai', 'cancelled') THEN
      UPDATE units SET status_operasional = 'standby', updated_at = now()
       WHERE id = NEW.unit_id AND status = 1 AND status_operasional = 'bertugas';
    ELSIF OLD.status_job IN ('selesai', 'cancelled') THEN
      UPDATE units SET status_operasional = 'bertugas', updated_at = now()
       WHERE id = NEW.unit_id AND status = 1 AND status_operasional = 'standby';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.uang_jalan_emit_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  IF NEW.jenis = 'pencairan' AND NEW.bukti_transfer_path IS NOT NULL THEN
    SELECT * INTO v_job FROM jobs WHERE id = NEW.job_id AND status = 1;
    IF v_job.id IS NULL THEN
      RETURN NEW;
    END IF;
    PERFORM notify_driver(v_job.driver_id, 'bukti_transfer', 'Uang jalan sudah ditransfer',
      v_job.job_number || ' — Rp ' || to_char(NEW.jumlah, 'FM999G999G999') || '. Anda bisa melanjutkan perjalanan.',
      '/driver/jobs/' || v_job.id, v_job.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.uang_jalan_fulfil_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  IF NEW.jenis = 'pencairan' AND NEW.request_id IS NOT NULL THEN
    UPDATE uang_jalan_requests
       SET status_pengajuan = 'dicairkan', uang_jalan_id = NEW.id,
           decided_at = now(), decided_by = COALESCE(NEW.created_by, auth.uid())
     WHERE id = NEW.request_id AND status = 1 AND status_pengajuan = 'diajukan';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.uj_requests_emit_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = NEW.job_id AND status = 1;
  IF v_job.id IS NULL OR NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_admin('uang_jalan_diajukan', 'Pengajuan uang jalan',
      v_job.job_number || ' — ' || (SELECT nama FROM drivers WHERE id = NEW.driver_id)
        || ' mengajukan Rp ' || to_char(NEW.nominal, 'FM999G999G999'),
      '/jobs/' || v_job.id, v_job.id);
  ELSIF NEW.status_pengajuan = 'ditolak' AND OLD.status_pengajuan <> 'ditolak' THEN
    PERFORM notify_driver(NEW.driver_id, 'uang_jalan_ditolak', 'Pengajuan uang jalan ditolak',
      v_job.job_number || COALESCE(': ' || NEW.alasan_tolak, ''), '/driver/jobs/' || v_job.id, v_job.id);
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 5b. Perbaikan next_invoice_number(): "column reference tahun is ambiguous" ─
-- Kolom keluaran `tahun` (RETURNS TABLE) bentrok dengan kolom
-- document_counters.tahun di ON CONFLICT (doc_type, tahun), sehingga setiap
-- penerbitan nomor invoice gagal. Perbaikannya sama dengan
-- next_quotation_number() di migration 20260804000002: utamakan kolom tabel.
CREATE OR REPLACE FUNCTION transport.next_invoice_number()
 RETURNS TABLE(nomor text, seq integer, tahun integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
#variable_conflict use_column
DECLARE
  v_tahun INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_bulan INTEGER := EXTRACT(MONTH FROM now())::INTEGER;
  v_seq   INTEGER;
BEGIN
  INSERT INTO document_counters (doc_type, tahun, last_seq)
  VALUES ('invoice', v_tahun, 1)
  ON CONFLICT (doc_type, tahun) DO UPDATE
    SET last_seq   = document_counters.last_seq + 1,
        updated_at = now()
  RETURNING document_counters.last_seq INTO v_seq;

  RETURN QUERY SELECT
    LPAD(v_seq::TEXT, 4, '0') || '/INV/MAS/' || to_roman_month(v_bulan) || '/' || v_tahun::TEXT,
    v_seq,
    v_tahun;
END;
$function$;

-- ── 6. Pemeriksaan akhir ────────────────────────────────────────────────────
DO $$
DECLARE
  kurang TEXT;
  lama TEXT;
BEGIN
  -- Semua tabel punya kolom status.
  SELECT string_agg(c.oid::regclass::text, ', ') INTO kurang
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('transport', 'hr') AND c.relkind IN ('r', 'p')
     AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = c.oid AND a.attname = 'status' AND NOT a.attisdropped);
  IF kurang IS NOT NULL THEN
    RAISE EXCEPTION 'Tabel tanpa kolom status: %', kurang;
  END IF;

  -- Tidak ada fungsi yang masih memakai kolom status lama lewat NEW/OLD/v_job.
  SELECT string_agg(p.proname, ', ') INTO lama
    FROM pg_proc p
   WHERE p.pronamespace = 'transport'::regnamespace
     AND p.proname NOT IN ('soft_delete_instead', 'soft_delete_propagate')
     AND p.prosrc ~ '\m(NEW|OLD|v_job|v_inv|j|u|i|r)\.status\M(?!_)'
     AND p.prosrc !~ '\m(NEW|OLD|v_job|v_inv|j|u|i|r)\.status\s*(=|<>)\s*[12]\M';
  IF lama IS NOT NULL THEN
    RAISE WARNING 'Periksa pemakaian kolom status di fungsi: %', lama;
  END IF;

  RAISE NOTICE 'Soft delete aktif di semua tabel transport & hr.';
END $$;

NOTIFY pgrst, 'reload schema';
