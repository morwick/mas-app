-- ============================================================================
-- Migration 20260924000012: log "Tambah Data Pengguna" lengkap karyawan & IP
--
-- Akun pengguna dibuat oleh server Supabase Auth lewat koneksinya sendiri —
-- tanpa identitas superadmin yang login (auth.uid() kosong) dan tanpa IP
-- pengguna. Akibatnya log "Tambah Data Pengguna" tercatat tanpa karyawan_id
-- dan ip_address ("— oleh sistem").
--
-- Perbaikan: backend menitipkan pembuatnya di user_metadata akun baru
-- (`dibuat_oleh` = id akun superadmin, `ip_pembuat`). handle_new_user()
-- memakainya untuk log HANYA bila id tersebut benar milik superadmin aktif —
-- titipan palsu (mis. lewat pendaftaran publik) diabaikan dan log tetap
-- tercatat "oleh sistem". Konteks ini hanya hidup selama pembuatan profil.
-- ============================================================================

SET search_path = transport, extensions;

-- Pencatat log: pakai konteks titipan bila tidak ada user login / header IP.
CREATE OR REPLACE FUNCTION transport._tulis_log(p_aksi TEXT, p_keterangan TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_headers JSON;
  v_ip TEXT;
  v_pelaku UUID;
  v_karyawan UUID;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  v_ip := COALESCE(
    NULLIF(btrim(COALESCE(v_headers ->> 'x-client-ip', '')), ''),
    NULLIF(current_setting('app.log_ip', true), ''));

  v_pelaku := COALESCE(auth.uid(), NULLIF(current_setting('app.log_pelaku_id', true), '')::uuid);
  SELECT p.karyawan_id INTO v_karyawan
    FROM transport.profiles p
   WHERE p.id = v_pelaku AND p.status = 1;

  INSERT INTO transport.log_sistem (karyawan_id, aksi, keterangan, ip_address)
  VALUES (v_karyawan, p_aksi, left(p_keterangan, 1000), left(v_ip, 100));
END;
$$;
REVOKE ALL ON FUNCTION transport._tulis_log(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Keterangan pelaku: pembuatan akun oleh superadmin bukan "oleh sistem".
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
  RETURN ' — oleh sistem';
END;
$$;

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

  -- Pembuat akun untuk log sistem — dipercaya hanya bila superadmin aktif.
  BEGIN
    v_pembuat := NULLIF(NEW.raw_user_meta_data->>'dibuat_oleh', '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_pembuat := NULL;
  END;
  IF v_pembuat IS NOT NULL AND EXISTS (
       SELECT 1 FROM transport.profiles p
        WHERE p.id = v_pembuat AND p.role = 'superadmin' AND p.is_active AND p.status = 1)
  THEN
    PERFORM set_config('app.log_pelaku_id', v_pembuat::text, true);
    PERFORM set_config('app.log_ip', COALESCE(NEW.raw_user_meta_data->>'ip_pembuat', ''), true);
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

  PERFORM set_config('app.log_pelaku_id', '', true);
  PERFORM set_config('app.log_ip', '', true);
  RETURN NEW;
END;
$function$;
