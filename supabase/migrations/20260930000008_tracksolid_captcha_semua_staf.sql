-- ============================================================================
-- Migration 20260930000008: Captcha TrackSolid bisa diisi semua staf
--
-- Popup captcha muncul di halaman ber-data TrackSolid (lokasi unit, peta
-- armada, jarak tempuh) untuk siapa pun yang sedang membukanya. Karena itu
-- ambil / kirim captcha kini boleh untuk semua staf yang login (role aktif),
-- bukan hanya superadmin. Status sesi (menu Master → Login TrackSolid) tetap
-- superadmin. Login dengan captcha tetap tercatat di log sistem (karyawan
-- pengisi tersimpan di tracksolid_sesi.diperbarui_oleh).
--
-- AMAN UNTUK KODE LAMA: hanya melonggarkan pengecekan di 3 fungsi.
-- WAJIB: jalankan setelah 20260930000007.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.tracksolid_simpan_captcha(p_cookies TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF transport.role_aktif() IS NULL THEN
    RAISE EXCEPTION 'Butuh login' USING ERRCODE = '28000';
  END IF;
  UPDATE transport.tracksolid_sesi
     SET captcha_cookies = p_cookies, captcha_at = now()
   WHERE id = 1 AND status = 1;
END;
$$;

CREATE OR REPLACE FUNCTION transport.tracksolid_captcha_cookies()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_cookies TEXT;
BEGIN
  IF transport.role_aktif() IS NULL THEN
    RAISE EXCEPTION 'Butuh login' USING ERRCODE = '28000';
  END IF;
  SELECT s.captcha_cookies INTO v_cookies
    FROM transport.tracksolid_sesi s
   WHERE s.id = 1 AND s.status = 1 AND s.captcha_at > now() - INTERVAL '10 minutes';
  RETURN v_cookies;
END;
$$;

CREATE OR REPLACE FUNCTION transport.tracksolid_simpan_login(p_token TEXT, p_akun_id TEXT, p_cookies TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF transport.role_aktif() IS NULL THEN
    RAISE EXCEPTION 'Butuh login' USING ERRCODE = '28000';
  END IF;
  IF btrim(COALESCE(p_token, '')) = '' THEN
    RAISE EXCEPTION 'Token TrackSolid kosong.' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE transport.tracksolid_sesi
     SET token = p_token, akun_id = p_akun_id, cookies = p_cookies,
         captcha_cookies = NULL, captcha_at = NULL,
         perlu_captcha = false, perlu_captcha_at = NULL,
         diperbarui_at = now(), diperbarui_oleh = transport._karyawan_sesi()
   WHERE id = 1 AND status = 1;
  PERFORM transport._tulis_log('Update Data', 'Login TrackSolid dengan captcha — pelacakan GPS tersambung lagi');
END;
$$;
