-- ============================================================================
-- Migration 20260923000003: fungsi tidak bisa melihat pgcrypto
--
-- Gejala: set PIN driver gagal, login portal driver gagal, dengan pesan
--   "function crypt(text, text) does not exist".
--
-- Sebabnya bukan ekstensinya hilang. Di Supabase, pgcrypto sudah terpasang
-- lebih dulu di schema `extensions`. Karena migration 01 memakai
-- `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` tanpa menyebut schema, perintah
-- itu diam saja — ekstensinya memang sudah ada, hanya bukan di `public`.
-- Sementara fungsi-fungsi kita dikunci dengan `SET search_path = public`
-- (benar, demi keamanan), sehingga crypt()/gen_salt()/gen_random_bytes()
-- tidak pernah ketemu.
--
-- Perbaikannya menambahkan schema ekstensi ke search_path fungsi yang
-- membutuhkannya — bukan memindahkan ekstensi, yang berisiko memutus objek
-- lain yang sudah menunjuk ke sana.
--
-- Dipakai ALTER FUNCTION ... SET search_path, bukan CREATE OR REPLACE, supaya
-- badan fungsinya tidak perlu disalin ulang dan tidak ada risiko salah ketik.
--
-- Daftar fungsinya dicari sendiri dari katalog, bukan ditulis tangan, supaya
-- tidak ada yang terlewat.
-- ============================================================================

DO $$
DECLARE
  ext_schema TEXT;
  fn RECORD;
  diubah INT := 0;
  daftar TEXT := '';
BEGIN
  SELECT n.nspname
    INTO ext_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pgcrypto';

  IF ext_schema IS NULL THEN
    RAISE EXCEPTION 'Ekstensi pgcrypto belum terpasang. Jalankan: CREATE EXTENSION pgcrypto;';
  END IF;

  IF ext_schema = 'public' THEN
    RAISE NOTICE 'pgcrypto sudah berada di public — tidak ada yang perlu diubah.';
    RETURN;
  END IF;

  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.prokind = 'f'
       -- \m = batas awal kata, supaya `encrypt_something` tidak ikut terjaring.
       AND p.prosrc ~ '\m(crypt|gen_salt|gen_random_bytes|digest|hmac)\s*\('
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, %I', fn.sig, ext_schema);
    diubah := diubah + 1;
    daftar := daftar || CASE WHEN daftar = '' THEN '' ELSE ', ' END || fn.sig::TEXT;
  END LOOP;

  RAISE NOTICE 'search_path % fungsi kini mencakup %: %', diubah, ext_schema, daftar;
END $$;

-- ── Bukti bahwa pgcrypto benar-benar terjangkau sekarang ────────────────────
DO $$
DECLARE
  ext_schema TEXT;
  hasil TEXT;
BEGIN
  SELECT n.nspname INTO ext_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pgcrypto';

  EXECUTE format('SELECT %I.crypt(%L, %I.gen_salt(%L))', ext_schema, '123456', ext_schema, 'bf')
     INTO hasil;

  IF hasil IS NULL OR length(hasil) < 20 THEN
    RAISE EXCEPTION 'crypt() tidak menghasilkan hash yang wajar.';
  END IF;

  RAISE NOTICE 'crypt() berfungsi. PIN driver dan login portal siap dipakai.';
END $$;
