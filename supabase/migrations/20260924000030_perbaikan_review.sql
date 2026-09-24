-- ============================================================================
-- Migration 20260924000030: perbaikan hasil code review PR #2
--
-- A. jalankan_transaksi: langkah `setting` hanya menerima app.status_note.
--    Sebelumnya app.* apa pun — pengguna bisa memalsukan pelaku log sistem
--    (app.log_pelaku_id / app.log_ip) atau menghapus permanen (app.hard_delete).
-- B. soft_delete_instead: app.hard_delete hanya berlaku di luar API
--    (SQL Editor / service role).
-- C. log_perubahan_data: pembuatan akun pengguna (profil dibuat
--    handle_new_user) kini tercatat "Tambah Data".
-- D. handle_new_user: data titipan (karyawan, pembuat, role, IP) dibaca dari
--    app_metadata yang hanya bisa diisi service role; pendaftaran mandiri
--    (sign up) tanpa superadmin pembuat yang sah ditolak.
-- E. Policy halaman tracking publik (share token) menyaring status = 1.
-- F. uang_jalan_fulfil_request: pencairan hanya menandai pengajuan milik job
--    yang sama.
-- G. Rincian tagihan: edit tagihan lama (hapus + sisip ulang rincian) tidak
--    ditolak aturan "job harus tervalidasi" untuk job yang sudah ada di
--    tagihan itu.
-- H. driver_logout: tidak gagal untuk sesi lama yang belum menyimpan IP.
-- I. ganti_unit_job: truk & driver pengganti dikunci (FOR UPDATE) supaya dua
--    pergantian bersamaan tidak memakai unit/driver yang sama.
--
-- Fungsi disalin dari definisi terbaru (pg_get_functiondef setelah migration
-- 000029) dan hanya diubah pada bagian di atas.
-- WAJIB: naikkan backend versi baru bersamaan (pembuatan pengguna kini mengisi
-- app_metadata; tanpa itu tambah pengguna ditolak).
-- Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.jalankan_transaksi(p_langkah jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_langkah JSONB;
  v_idx INT := 0;
  v_hasil JSONB := '[]'::jsonb;
  v_rows JSONB;
  v_rel regclass;
  v_data JSONB;
  v_filter JSONB;
  v_kolom TEXT;
  v_set TEXT;
  v_jml INT;
BEGIN
  IF jsonb_typeof(p_langkah) <> 'array' OR jsonb_array_length(p_langkah) = 0 THEN
    RAISE EXCEPTION 'Transaksi kosong' USING ERRCODE = '22023';
  END IF;

  FOR v_langkah IN SELECT e FROM jsonb_array_elements(p_langkah) AS a(e) LOOP
    v_rows := '[]'::jsonb;

    CASE v_langkah ->> 'op'

      WHEN 'nomor_dokumen' THEN
        IF v_langkah ->> 'jenis' = 'invoice' THEN
          SELECT jsonb_agg(to_jsonb(n)) INTO v_rows FROM transport.next_invoice_number() n;
        ELSIF v_langkah ->> 'jenis' = 'quotation' THEN
          SELECT jsonb_agg(to_jsonb(n)) INTO v_rows FROM transport.next_quotation_number() n;
        ELSE
          RAISE EXCEPTION 'Jenis dokumen % tidak dikenal', v_langkah ->> 'jenis' USING ERRCODE = '22023';
        END IF;

      WHEN 'setting' THEN
        -- Hanya catatan status. Setting lain (app.log_pelaku_id, app.log_ip,
        -- app.hard_delete, app.manual_*) mengatur log & soft delete dan tidak
        -- boleh bisa dipasang pengguna lewat API.
        IF v_langkah ->> 'nama' IS DISTINCT FROM 'app.status_note' THEN
          RAISE EXCEPTION 'Setting % tidak diizinkan', v_langkah ->> 'nama' USING ERRCODE = '42501';
        END IF;
        PERFORM set_config(v_langkah ->> 'nama', COALESCE(v_langkah ->> 'nilai', ''), true);

      WHEN 'insert' THEN
        v_rel := transport._tx_tabel(v_langkah ->> 'tabel');
        v_data := transport._tx_isi_rujukan(v_langkah -> 'data', v_hasil);
        IF jsonb_typeof(v_data) = 'object' THEN
          v_data := jsonb_build_array(v_data);
        END IF;
        IF jsonb_array_length(v_data) > 0 THEN
          -- Kolom diambil dari kunci data; kolom yang tidak disebut memakai
          -- DEFAULT tabel (id, status = 1, created_at, ...).
          SELECT string_agg(DISTINCT format('%I', k), ', ') INTO v_kolom
            FROM jsonb_array_elements(v_data) AS r(o), jsonb_object_keys(r.o) AS k;
          EXECUTE format(
            'WITH ins AS (INSERT INTO %1$s (%2$s) SELECT %2$s FROM jsonb_populate_recordset(NULL::%1$s, $1) RETURNING *)
             SELECT COALESCE(jsonb_agg(to_jsonb(ins)), ''[]''::jsonb) FROM ins',
            v_rel, v_kolom)
            INTO v_rows USING v_data;
        END IF;

      WHEN 'update' THEN
        v_rel := transport._tx_tabel(v_langkah ->> 'tabel');
        v_data := transport._tx_isi_rujukan(v_langkah -> 'data', v_hasil);
        v_filter := transport._tx_isi_rujukan(COALESCE(v_langkah -> 'filter', '{}'::jsonb), v_hasil);
        IF v_filter = '{}'::jsonb THEN
          RAISE EXCEPTION 'Update tanpa filter tidak diizinkan' USING ERRCODE = '22023';
        END IF;
        SELECT string_agg(format('%1$I = (x.d).%1$I', k), ', ') INTO v_set
          FROM jsonb_object_keys(v_data) AS k;
        EXECUTE format(
          'WITH upd AS (
             UPDATE %1$s t SET %2$s
               FROM (SELECT jsonb_populate_record(NULL::%1$s, $1) AS d,
                            jsonb_populate_record(NULL::%1$s, $2) AS f) x
              WHERE %3$s AND t.status = 1
             RETURNING t.*)
           SELECT COALESCE(jsonb_agg(to_jsonb(upd)), ''[]''::jsonb) FROM upd',
          v_rel, v_set, transport._tx_kondisi(v_filter, 'x.f'))
          INTO v_rows USING v_data, v_filter;

      WHEN 'hapus' THEN
        v_rel := transport._tx_tabel(v_langkah ->> 'tabel');
        v_filter := transport._tx_isi_rujukan(COALESCE(v_langkah -> 'filter', '{}'::jsonb), v_hasil);
        IF v_filter = '{}'::jsonb THEN
          RAISE EXCEPTION 'Hapus tanpa filter tidak diizinkan' USING ERRCODE = '22023';
        END IF;
        EXECUTE format(
          'WITH del AS (
             UPDATE %1$s t SET status = 2
               FROM (SELECT jsonb_populate_record(NULL::%1$s, $1) AS f) x
              WHERE %2$s AND t.status = 1
             RETURNING t.*)
           SELECT COALESCE(jsonb_agg(to_jsonb(del)), ''[]''::jsonb) FROM del',
          v_rel, transport._tx_kondisi(v_filter, 'x.f'))
          INTO v_rows USING v_filter;

      ELSE
        RAISE EXCEPTION 'Operasi % tidak dikenal', v_langkah ->> 'op' USING ERRCODE = '22023';
    END CASE;

    v_jml := jsonb_array_length(COALESCE(v_rows, '[]'::jsonb));
    IF COALESCE((v_langkah ->> 'wajib')::boolean, false) AND v_jml = 0 THEN
      RAISE EXCEPTION 'Data tidak ditemukan atau sudah dihapus (langkah %)', v_idx + 1
        USING ERRCODE = 'no_data_found';
    END IF;

    v_hasil := v_hasil || jsonb_build_array(COALESCE(v_rows, '[]'::jsonb));
    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_hasil;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.soft_delete_instead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_kondisi TEXT;
BEGIN
  -- Hapus permanen tetap mungkin, tapi hanya dengan sengaja:
  --   * app.hard_delete = 'on' di transaksi yang sama (perawatan manual);
  --   * cascade dari luar aplikasi, mis. akun dihapus di Supabase Auth
  --     (auth.users → profiles). Aksi foreign key berjalan di dalam trigger,
  --     jadi kedalamannya > 1.
  IF (current_setting('app.hard_delete', true) = 'on'
      -- Hanya dari SQL Editor / service role, tidak pernah dari pengguna API.
      AND COALESCE(auth.jwt() ->> 'role', '') NOT IN ('authenticated', 'anon'))
     OR pg_trigger_depth() > 1 THEN
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
$function$;

CREATE OR REPLACE FUNCTION transport.log_perubahan_data()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
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
     AND NOT (pg_trigger_depth() = 2 AND current_setting('app.log_hapus', true) = 'on')
     -- Akun baru dari Supabase Auth: profil dibuat handle_new_user (kedalaman 2)
     -- dengan pelaku superadmin yang sudah divalidasi.
     AND NOT (pg_trigger_depth() = 2 AND TG_OP = 'INSERT' AND TG_TABLE_NAME = 'profiles'
              AND NULLIF(current_setting('app.log_pelaku_id', true), '') IS NOT NULL) THEN
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
    'Data ' || btrim(COALESCE(transport._log_label(v_tabel, v_baru), TG_TABLE_NAME))
      || ' (ID ' || COALESCE(v_baru ->> 'id', '-') || ')'
      || transport._log_pelaku());
  RETURN NULL;
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

  -- Pembuat akun (untuk log sistem & roles) — dipercaya hanya bila superadmin aktif.
  BEGIN
    v_pembuat := NULLIF(NEW.raw_app_meta_data->>'dibuat_oleh', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_pembuat := NULL;
  END;
  v_pembuat_valid := v_pembuat IS NOT NULL AND EXISTS (
    SELECT 1 FROM transport.profiles p
     WHERE p.id = v_pembuat AND 'superadmin' = ANY (p.roles) AND p.is_active AND p.status = 1);

  -- Pendaftaran mandiri (sign up) ditolak: akun hanya dibuat superadmin lewat
  -- menu Pengguna (backend mengisi app_metadata dengan service role).
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
       WHERE r IN ('superadmin', 'operator');
    ELSIF NEW.raw_app_meta_data->>'role' IN ('superadmin', 'operator') THEN
      v_minta := ARRAY[NEW.raw_app_meta_data->>'role'];
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
     WHERE id = NEW.request_id AND job_id = NEW.job_id AND status = 1 AND status_pengajuan = 'diajukan';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.invoice_item_cek_job_tervalidasi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_job transport.jobs%ROWTYPE;
BEGIN
  IF NEW.job_id IS NULL OR NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.job_id IS NOT DISTINCT FROM OLD.job_id AND OLD.status = 1 THEN
    RETURN NEW;
  END IF;
  -- Edit tagihan menghapus lalu menyisipkan ulang rinciannya. Job yang sudah
  -- pernah ada di tagihan ini tidak diperiksa ulang.
  IF EXISTS (SELECT 1 FROM transport.invoice_items x
              WHERE x.invoice_id = NEW.invoice_id AND x.job_id = NEW.job_id AND x.id <> NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_job FROM transport.jobs WHERE id = NEW.job_id AND status = 1;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job untuk rincian tagihan tidak ditemukan.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_job.status_job <> 'selesai' OR v_job.validated_at IS NULL THEN
    RAISE EXCEPTION 'Job % belum divalidasi admin — hanya job yang sudah divalidasi yang bisa ditagihkan.',
      v_job.job_number USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.driver_logout(p_fcm_token text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_nama TEXT;
  v_karyawan UUID;
  v_ip TEXT;
BEGIN
  SELECT d.nama, d.karyawan_id, s.ip_address INTO v_nama, v_karyawan, v_ip
    FROM driver_sessions s
    JOIN drivers d ON d.id = s.driver_id
   WHERE s.token = current_driver_token() AND d.id = current_driver_id() AND d.status = 1;

  -- Dicatat selagi sesi masih aktif. Sesi lama (sebelum migration 000019)
  -- belum menyimpan IP — logout tetap harus berhasil.
  IF v_nama IS NOT NULL AND v_karyawan IS NOT NULL THEN
    PERFORM transport._tulis_log('Logout', 'Driver ' || v_nama || ' logout dari aplikasi driver',
                                 v_karyawan, COALESCE(NULLIF(btrim(v_ip), ''), 'tidak tercatat (sesi lama)'));
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

CREATE OR REPLACE FUNCTION transport.ganti_unit_job(p_job_id uuid, p_unit_baru_id uuid, p_alasan text, p_driver_baru_id uuid DEFAULT NULL::uuid, p_unit_trailer_baru_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  -- Status job yang sedang "berjalan" (unit/driver sedang dipakai).
  c_berjalan CONSTANT TEXT[] := ARRAY['diterima', 'loading', 'dalam_perjalanan', 'unloading', 'serah_terima_pool'];
  v_job     transport.jobs%ROWTYPE;
  v_unit    transport.units%ROWTYPE;
  v_driver  transport.drivers%ROWTYPE;
  v_driver_baru UUID;
  v_lain    TEXT;
  v_id      UUID;
BEGIN
  IF NOT transport.is_active_admin() THEN
    RAISE EXCEPTION 'Butuh login admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan ganti truk wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_job FROM transport.jobs WHERE id = p_job_id AND status = 1 FOR UPDATE;
  IF v_job.id IS NULL OR NOT transport.can_access_job(p_job_id) THEN
    RAISE EXCEPTION 'Job tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.status_job NOT IN ('loading', 'dalam_perjalanan', 'unloading') THEN
    RAISE EXCEPTION 'Ganti truk hanya bisa saat job di perjalanan (loading, dalam perjalanan, atau unloading).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Truk baru.
  -- Dikunci supaya dua pergantian bersamaan tidak memakai truk yang sama.
  SELECT * INTO v_unit FROM transport.units WHERE id = p_unit_baru_id AND status = 1 FOR UPDATE;
  IF v_unit.id IS NULL OR NOT transport.can_access_unit(p_unit_baru_id) THEN
    RAISE EXCEPTION 'Truk pengganti tidak ditemukan atau di luar scope akses Anda.' USING ERRCODE = 'P0002';
  END IF;
  IF v_unit.id = v_job.unit_id THEN
    RAISE EXCEPTION 'Truk pengganti tidak boleh sama dengan truk saat ini.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_unit.status_operasional <> 'standby' THEN
    RAISE EXCEPTION 'Truk % tidak Stand by (status: %).', v_unit.kode_unit, v_unit.status_operasional
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT j.job_number INTO v_lain FROM transport.jobs j
   WHERE j.unit_id = v_unit.id AND j.id <> p_job_id AND j.status = 1 AND j.status_job::text = ANY (c_berjalan)
   LIMIT 1;
  IF v_lain IS NOT NULL THEN
    RAISE EXCEPTION 'Truk % sedang dipakai job %.', v_unit.kode_unit, v_lain USING ERRCODE = 'check_violation';
  END IF;

  -- Driver (opsional).
  v_driver_baru := COALESCE(p_driver_baru_id, v_job.driver_id);
  IF v_driver_baru IS DISTINCT FROM v_job.driver_id THEN
    SELECT * INTO v_driver FROM transport.drivers WHERE id = v_driver_baru AND status = 1 FOR UPDATE;
    IF v_driver.id IS NULL OR NOT v_driver.is_active OR NOT transport.karyawan_aktif(v_driver.karyawan_id) THEN
      RAISE EXCEPTION 'Driver pengganti tidak ditemukan atau tidak aktif.' USING ERRCODE = 'P0002';
    END IF;
    SELECT j.job_number INTO v_lain FROM transport.jobs j
     WHERE j.driver_id = v_driver.id AND j.id <> p_job_id AND j.status = 1 AND j.status_job::text = ANY (c_berjalan)
     LIMIT 1;
    IF v_lain IS NOT NULL THEN
      RAISE EXCEPTION 'Driver % sedang menjalankan job %.', v_driver.nama, v_lain USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO transport.job_ganti_unit (
    job_id, unit_lama_id, unit_baru_id, driver_lama_id, driver_baru_id,
    unit_trailer_lama_id, unit_trailer_baru_id, status_job_saat_ganti, alasan, diganti_oleh)
  VALUES (
    p_job_id, v_job.unit_id, v_unit.id, v_job.driver_id, v_driver_baru,
    v_job.unit_trailer_id, p_unit_trailer_baru_id, v_job.status_job::text, btrim(p_alasan), auth.uid())
  RETURNING id INTO v_id;

  -- Trailer divalidasi trigger jobs_cek_unit_trailer.
  UPDATE transport.jobs
     SET unit_id = v_unit.id,
         driver_id = v_driver_baru,
         unit_trailer_id = p_unit_trailer_baru_id,
         updated_at = now()
   WHERE id = p_job_id;

  -- Truk lama rusak → Perbaikan; truk baru → Bertugas.
  UPDATE transport.units SET status_operasional = 'perbaikan', updated_at = now()
   WHERE id = v_job.unit_id AND status = 1 AND status_operasional <> 'perbaikan';
  UPDATE transport.units SET status_operasional = 'bertugas', updated_at = now()
   WHERE id = v_unit.id AND status = 1;

  RETURN v_id;
END;
$function$;

-- E. Halaman tracking publik (share token): data yang sudah dihapus
--    (status = 2) tidak boleh terlihat.
DROP POLICY IF EXISTS "public_read_jobs_by_token" ON transport.jobs;
CREATE POLICY "public_read_jobs_by_token"
  ON transport.jobs FOR SELECT
  USING (
    auth.uid() IS NULL
    AND transport.current_share_token() IS NOT NULL
    AND share_token = transport.current_share_token()
    AND status_job NOT IN ('selesai', 'cancelled')
    AND status = 1
  );

DROP POLICY IF EXISTS "public_read_photos_via_token" ON transport.job_photos;
CREATE POLICY "public_read_photos_via_token"
  ON transport.job_photos FOR SELECT
  USING (
    auth.uid() IS NULL AND job_photos.status = 1 AND EXISTS (
      SELECT 1 FROM transport.jobs j
      WHERE j.id = job_photos.job_id
        AND transport.current_share_token() IS NOT NULL
        AND j.share_token = transport.current_share_token()
        AND j.status_job NOT IN ('selesai', 'cancelled')
        AND j.status = 1
    )
  );

DROP POLICY IF EXISTS "public_read_units_via_jobs" ON transport.units;
CREATE POLICY "public_read_units_via_jobs"
  ON transport.units FOR SELECT
  USING (
    auth.uid() IS NULL AND units.status = 1 AND EXISTS (
      SELECT 1 FROM transport.jobs j
      WHERE j.unit_id = units.id
        AND transport.current_share_token() IS NOT NULL
        AND j.share_token = transport.current_share_token()
        AND j.status_job NOT IN ('selesai', 'cancelled')
        AND j.status = 1
    )
  );

DROP POLICY IF EXISTS "public_read_drivers_via_jobs" ON transport.drivers;
CREATE POLICY "public_read_drivers_via_jobs"
  ON transport.drivers FOR SELECT
  USING (
    auth.uid() IS NULL AND drivers.status = 1 AND EXISTS (
      SELECT 1 FROM transport.jobs j
      WHERE j.driver_id = drivers.id
        AND transport.current_share_token() IS NOT NULL
        AND j.share_token = transport.current_share_token()
        AND j.status_job NOT IN ('selesai', 'cancelled')
        AND j.status = 1
    )
  );

DROP POLICY IF EXISTS "public_read_customers_via_jobs" ON transport.customers;
CREATE POLICY "public_read_customers_via_jobs"
  ON transport.customers FOR SELECT
  USING (
    auth.uid() IS NULL AND customers.status = 1 AND EXISTS (
      SELECT 1 FROM transport.jobs j
      WHERE j.customer_id = customers.id
        AND transport.current_share_token() IS NOT NULL
        AND j.share_token = transport.current_share_token()
        AND j.status_job NOT IN ('selesai', 'cancelled')
        AND j.status = 1
    )
  );

NOTIFY pgrst, 'reload schema';
