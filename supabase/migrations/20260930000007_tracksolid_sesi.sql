-- ============================================================================
-- Migration 20260930000007: Sesi login TrackSolid (login dibantu captcha)
--
-- TrackSolid kadang meminta captcha saat login (balasan kode 20227). Captcha
-- TIDAK diakali: login otomatis berhenti, superadmin diberi tahu, lalu
-- superadmin sendiri mengetik kode captcha di aplikasi. Sesi hasil login
-- disimpan di sini supaya dipakai bersama semua proses backend & tahan restart.
--
--   * transport.tracksolid_sesi — SATU baris (id = 1). Token & cookie sesi
--     bersifat rahasia: RLS aktif TANPA policy → hanya backend (service role)
--     dan fungsi di bawah yang bisa membaca / menulis.
--   * transport.tracksolid_status()          — ringkasan untuk superadmin
--     (tersambung? butuh captcha? kapan & oleh siapa login terakhir).
--   * transport.tracksolid_simpan_captcha()  — cookie sesi captcha yang sedang
--     ditampilkan (superadmin).
--   * transport.tracksolid_simpan_login()    — sesi hasil login dengan captcha
--     (superadmin); tercatat di log sistem.
--
-- AMAN UNTUK KODE LAMA: tabel & fungsi baru saja.
-- WAJIB: jalankan setelah 20260930000006.
-- ============================================================================

SET search_path = transport, extensions;

CREATE TABLE IF NOT EXISTS transport.tracksolid_sesi (
  id               SMALLINT PRIMARY KEY DEFAULT 1 CONSTRAINT tracksolid_sesi_satu_baris CHECK (id = 1),
  token            TEXT,
  akun_id          TEXT,
  cookies          TEXT,
  -- Cookie (JSESSIONID) milik gambar captcha yang sedang ditampilkan.
  captcha_cookies  TEXT,
  captcha_at       TIMESTAMPTZ,
  -- TRUE = login otomatis ditolak karena butuh captcha; backend berhenti
  -- mencoba login sampai superadmin mengisi captcha.
  perlu_captcha    BOOLEAN NOT NULL DEFAULT false,
  perlu_captcha_at TIMESTAMPTZ,
  diperbarui_at    TIMESTAMPTZ,
  -- Karyawan yang login dengan captcha; NULL = login otomatis oleh sistem.
  diperbarui_oleh  UUID REFERENCES hr.karyawan(id),
  status           SMALLINT NOT NULL DEFAULT 1 CONSTRAINT tracksolid_sesi_status_check CHECK (status IN (1, 2))
);
COMMENT ON TABLE transport.tracksolid_sesi IS
  'Sesi login TrackSolid (satu baris). Rahasia: hanya backend / fungsi SECURITY DEFINER.';

ALTER TABLE transport.tracksolid_sesi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON transport.tracksolid_sesi FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON transport.tracksolid_sesi TO service_role;

INSERT INTO transport.tracksolid_sesi (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Status (superadmin) ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.tracksolid_status()
RETURNS TABLE (
  tersambung      BOOLEAN,
  perlu_captcha   BOOLEAN,
  perlu_captcha_at TIMESTAMPTZ,
  diperbarui_at   TIMESTAMPTZ,
  diperbarui_oleh_nama TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NOT COALESCE(transport.is_superadmin(), false) THEN
    RAISE EXCEPTION 'Hanya super administrator.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT s.token IS NOT NULL AND NOT s.perlu_captcha, s.perlu_captcha, s.perlu_captcha_at, s.diperbarui_at, k.nama
    FROM transport.tracksolid_sesi s
    LEFT JOIN hr.karyawan k ON k.id = s.diperbarui_oleh
   WHERE s.id = 1 AND s.status = 1;
END;
$$;
REVOKE ALL ON FUNCTION transport.tracksolid_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.tracksolid_status() TO authenticated;

-- ── Simpan cookie captcha (superadmin) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.tracksolid_simpan_captcha(p_cookies TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NOT COALESCE(transport.is_superadmin(), false) THEN
    RAISE EXCEPTION 'Hanya super administrator.' USING ERRCODE = '42501';
  END IF;
  UPDATE transport.tracksolid_sesi
     SET captcha_cookies = p_cookies, captcha_at = now()
   WHERE id = 1 AND status = 1;
END;
$$;
REVOKE ALL ON FUNCTION transport.tracksolid_simpan_captcha(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.tracksolid_simpan_captcha(TEXT) TO authenticated;

-- Cookie captcha yang tersimpan — dibaca saat superadmin mengirim kodenya.
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
  IF NOT COALESCE(transport.is_superadmin(), false) THEN
    RAISE EXCEPTION 'Hanya super administrator.' USING ERRCODE = '42501';
  END IF;
  SELECT s.captcha_cookies INTO v_cookies
    FROM transport.tracksolid_sesi s
   WHERE s.id = 1 AND s.status = 1 AND s.captcha_at > now() - INTERVAL '10 minutes';
  RETURN v_cookies;
END;
$$;
REVOKE ALL ON FUNCTION transport.tracksolid_captcha_cookies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.tracksolid_captcha_cookies() TO authenticated;

-- ── Simpan sesi hasil login dengan captcha (superadmin) ─────────────────────
CREATE OR REPLACE FUNCTION transport.tracksolid_simpan_login(p_token TEXT, p_akun_id TEXT, p_cookies TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NOT COALESCE(transport.is_superadmin(), false) THEN
    RAISE EXCEPTION 'Hanya super administrator.' USING ERRCODE = '42501';
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
REVOKE ALL ON FUNCTION transport.tracksolid_simpan_login(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.tracksolid_simpan_login(TEXT, TEXT, TEXT) TO authenticated;
