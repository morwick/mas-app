-- ============================================================================
-- Migration 20260930000009: Verifikasi lokasi oleh customer (captcha TrackSolid)
--
-- Bila sesi TrackSolid butuh captcha, customer di halaman link tracking bisa
-- mengetik kode verifikasi sendiri supaya lokasi unit tampil — tanpa menunggu
-- staf login. Pengaman ada di backend: hanya untuk link tracking yang aktif,
-- hanya saat sesi memang butuh captcha, dan dibatasi jumlah percobaannya.
--
--   * transport.tracksolid_captcha — cookie sesi gambar captcha, SATU baris per
--     permintaan (customer / staf yang meminta bersamaan tidak saling menimpa).
--     Cookie ini menjadi sesi login akun TrackSolid perusahaan setelah kode
--     benar, jadi TIDAK PERNAH dikirim ke browser: RLS aktif tanpa policy,
--     hanya backend (service role) yang membaca / menulis. Browser hanya
--     menerima id baris ini.
--   * transport.tracksolid_sesi.diperbarui_via — 'otomatis' | 'staf' |
--     'customer': asal login terakhir (customer tidak punya karyawan_id).
--   * transport.tracksolid_simpan_login() — ikut mengisi diperbarui_via='staf'.
--
-- AMAN UNTUK KODE LAMA: tabel & kolom baru; satu fungsi hanya menambah kolom.
-- WAJIB: jalankan setelah 20260930000008.
-- ============================================================================

SET search_path = transport, extensions;

CREATE TABLE IF NOT EXISTS transport.tracksolid_captcha (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cookies     TEXT NOT NULL,
  -- 'staf' | 'customer' — siapa yang meminta gambar captcha.
  diminta_via TEXT NOT NULL CONSTRAINT tracksolid_captcha_via_check CHECK (diminta_via IN ('staf', 'customer')),
  dibuat_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  dipakai_at  TIMESTAMPTZ,
  status      SMALLINT NOT NULL DEFAULT 1 CONSTRAINT tracksolid_captcha_status_check CHECK (status IN (1, 2))
);
COMMENT ON TABLE transport.tracksolid_captcha IS
  'Cookie sesi gambar captcha TrackSolid per permintaan. Rahasia: hanya backend (service role).';
CREATE INDEX IF NOT EXISTS idx_tracksolid_captcha_dibuat ON transport.tracksolid_captcha (dibuat_at) WHERE status = 1;

ALTER TABLE transport.tracksolid_captcha ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON transport.tracksolid_captcha FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON transport.tracksolid_captcha TO service_role;

ALTER TABLE transport.tracksolid_sesi ADD COLUMN IF NOT EXISTS diperbarui_via TEXT;
ALTER TABLE transport.tracksolid_sesi DROP CONSTRAINT IF EXISTS tracksolid_sesi_via_check;
ALTER TABLE transport.tracksolid_sesi ADD CONSTRAINT tracksolid_sesi_via_check
  CHECK (diperbarui_via IS NULL OR diperbarui_via IN ('otomatis', 'staf', 'customer'));

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
         diperbarui_at = now(), diperbarui_oleh = transport._karyawan_sesi(),
         diperbarui_via = 'staf'
   WHERE id = 1 AND status = 1;
  PERFORM transport._tulis_log('Update Data', 'Login TrackSolid dengan captcha — pelacakan GPS tersambung lagi');
END;
$$;
