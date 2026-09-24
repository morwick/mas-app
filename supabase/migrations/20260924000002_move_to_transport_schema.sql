-- ============================================================================
-- Migration 20260924000002: pindahkan seluruh objek aplikasi public → transport
--
-- URUTAN DEPLOY — PENTING:
--   1. Jalankan migrasi ini.
--   2. Supabase Dashboard → Project Settings → Data API → Exposed schemas:
--      tambahkan `transport` (boleh hapus `public`). Tanpa langkah ini
--      PostgREST menolak semua request ke tabel/fungsi aplikasi.
--   3. Naikkan backend versi baru (SUPABASE_DB_SCHEMA, default `transport`).
--   Di antara langkah 1 dan 3 aplikasi tidak bisa dipakai — lakukan di luar
--   jam operasional.
--
-- Apa yang ikut pindah otomatis dan apa yang tidak:
--   * Policy RLS, trigger, default kolom, index, constraint, grant, dan
--     keanggotaan publication realtime menyimpan referensi OID — semuanya
--     tetap utuh setelah objeknya pindah schema. Begitu juga policy di
--     storage.objects dan trigger on_auth_user_created di auth.users.
--   * BADAN FUNGSI disimpan sebagai teks dan dicari lewat search_path.
--     Hampir semua fungsi dikunci `SET search_path = public`, jadi setelah
--     dipindah, search_path-nya harus diarahkan ke transport — kalau tidak,
--     setiap RLS yang memanggil is_superadmin()/can_access_unit() gagal
--     dengan "relation profiles does not exist" (pola bug yang sama dengan
--     migration 20260923000002).
--
-- Semua langkah ada di satu blok DO, jadi atomik: kalau ada yang gagal,
-- tidak ada satu objek pun yang berpindah.
--
-- MIGRASI BERIKUTNYA: objek tanpa nama schema akan dibuat di `public` lagi.
-- Awali setiap file migrasi baru dengan
--     SET search_path = transport, extensions;
-- dan pakai `SET search_path = transport, extensions` pada fungsi baru.
-- ============================================================================

DO $$
DECLARE
  obj RECORD;
  ext_schema TEXT;
  sp TEXT;
  n_tipe INT := 0;
  n_relasi INT := 0;
  n_fungsi INT := 0;
  n_sp INT := 0;
  sisa TEXT;
BEGIN
  -- Dicek lewat nama, bukan cast 'transport'::regnamespace: cast itu
  -- dievaluasi lebih dulu dan gagal kalau schema-nya belum ada.
  IF EXISTS (
       SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'transport'
     )
     AND NOT EXISTS (
       SELECT 1 FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
     )
  THEN
    RAISE NOTICE 'Objek aplikasi sudah berada di schema transport — tidak ada yang dipindah.';
    RETURN;
  END IF;

  CREATE SCHEMA IF NOT EXISTS transport;
  -- Setara hak default Supabase atas schema public. Hak per tabel/fungsi
  -- (termasuk GRANT EXECUTE yang sengaja dibatasi) ikut pindah bersama
  -- objeknya, jadi tidak di-GRANT ulang secara massal di sini.
  GRANT USAGE ON SCHEMA transport TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA transport
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA transport
    GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA transport
    GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

  -- ── 0. Ekstensi yang terpasang di public ──────────────────────────────────
  -- Di Supabase ekstensi sudah di schema `extensions`; di Postgres biasa
  -- pgcrypto bisa jatuh ke public. Yang relocatable dipindah ke `extensions`
  -- supaya public benar-benar kosong.
  FOR obj IN
    SELECT e.extname, e.extrelocatable
      FROM pg_extension e
     WHERE e.extnamespace = 'public'::regnamespace
  LOOP
    IF obj.extrelocatable THEN
      CREATE SCHEMA IF NOT EXISTS extensions;
      EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', obj.extname);
      RAISE NOTICE 'Ekstensi % dipindah ke schema extensions.', obj.extname;
    ELSE
      RAISE NOTICE 'Ekstensi % tidak bisa dipindah (non-relocatable) dan tetap di public.', obj.extname;
    END IF;
  END LOOP;

  -- ── 1. Tipe mandiri (enum, domain, composite yang bukan rowtype tabel) ────
  -- Array type (_nama) ikut pindah bersama tipe dasarnya.
  FOR obj IN
    SELECT t.oid::regtype AS nama
      FROM pg_type t
      LEFT JOIN pg_class c ON c.oid = t.typrelid
     WHERE t.typnamespace = 'public'::regnamespace
       AND (t.typtype IN ('e', 'd') OR (t.typtype = 'c' AND c.relkind = 'c'))
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e'
       )
  LOOP
    EXECUTE format('ALTER TYPE %s SET SCHEMA transport', obj.nama);
    n_tipe := n_tipe + 1;
  END LOOP;

  -- ── 2. Tabel, view, materialized view, foreign table, sequence mandiri ────
  -- Index dan sequence milik kolom (serial/identity) ikut pindah bersama
  -- tabelnya, jadi sequence yang dimiliki tabel dilewati di sini.
  FOR obj IN
    SELECT c.oid::regclass AS nama,
           CASE c.relkind
             WHEN 'r' THEN 'TABLE' WHEN 'p' THEN 'TABLE'
             WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
             WHEN 'f' THEN 'FOREIGN TABLE' WHEN 'S' THEN 'SEQUENCE'
           END AS jenis
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       AND NOT c.relispartition
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
            AND (d.deptype = 'e' OR (c.relkind = 'S' AND d.deptype IN ('a', 'i')))
       )
     ORDER BY c.relkind
  LOOP
    EXECUTE format('ALTER %s %s SET SCHEMA transport', obj.jenis, obj.nama);
    n_relasi := n_relasi + 1;
  END LOOP;

  -- ── 3. Fungsi & prosedur ──────────────────────────────────────────────────
  FOR obj IN
    SELECT p.oid::regprocedure AS sig,
           CASE p.prokind WHEN 'a' THEN 'AGGREGATE' ELSE 'ROUTINE' END AS jenis
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
       )
  LOOP
    EXECUTE format('ALTER %s %s SET SCHEMA transport', obj.jenis, obj.sig);
    n_fungsi := n_fungsi + 1;
  END LOOP;

  -- ── 4. Arahkan search_path fungsi ke transport ────────────────────────────
  -- Fungsi yang sudah punya search_path: ganti entri public → transport,
  -- entri lain (mis. `extensions` untuk pgcrypto) dipertahankan. Fungsi
  -- tanpa search_path (trigger sederhana, dll.) dikunci ke transport juga
  -- supaya tidak bergantung pada search_path pemanggil, yang tidak lagi
  -- memuat tabel aplikasi.
  SELECT n.nspname INTO ext_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pgcrypto';

  FOR obj IN
    SELECT p.oid::regprocedure AS sig,
           (SELECT substr(cfg, length('search_path=') + 1)
              FROM unnest(p.proconfig) cfg
             WHERE cfg LIKE 'search_path=%') AS sp_lama
      FROM pg_proc p
     WHERE p.pronamespace = 'transport'::regnamespace
       AND p.prokind IN ('f', 'p')
  LOOP
    IF obj.sp_lama IS NULL THEN
      sp := 'transport' || CASE WHEN ext_schema IS NOT NULL AND ext_schema <> 'transport'
                                THEN ', ' || quote_ident(ext_schema) ELSE '' END;
    ELSE
      SELECT string_agg(
               CASE WHEN btrim(x, ' "') = 'public' THEN 'transport' ELSE btrim(x) END,
               ', ' ORDER BY i)
        INTO sp
        FROM unnest(string_to_array(obj.sp_lama, ',')) WITH ORDINALITY AS u(x, i);
    END IF;
    EXECUTE format('ALTER ROUTINE %s SET search_path = %s', obj.sig, sp);
    n_sp := n_sp + 1;
  END LOOP;

  -- ── 5. Pastikan public kosong ─────────────────────────────────────────────
  SELECT string_agg(nama, ', ') INTO sisa FROM (
    SELECT c.oid::regclass::text AS nama
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
    UNION ALL
    SELECT p.oid::regprocedure::text
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    UNION ALL
    SELECT t.oid::regtype::text
      FROM pg_type t
     WHERE t.typnamespace = 'public'::regnamespace
       AND t.typtype IN ('e', 'd')
  ) s;

  IF sisa IS NOT NULL THEN
    RAISE EXCEPTION 'Masih ada objek di schema public setelah migrasi: %', sisa;
  END IF;

  -- ── 6. Pastikan fungsi tidak lagi menunjuk ke public ──────────────────────
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO sisa
    FROM pg_proc p
   WHERE p.pronamespace = 'transport'::regnamespace
     AND (p.prosrc ~* '\mpublic\.' OR array_to_string(p.proconfig, ',') ~* '\mpublic\M');
  IF sisa IS NOT NULL THEN
    RAISE EXCEPTION 'Fungsi berikut masih merujuk schema public: %', sisa;
  END IF;

  RAISE NOTICE 'Dipindah ke transport: % tipe, % tabel/view/sequence, % fungsi; search_path % fungsi diperbarui.',
    n_tipe, n_relasi, n_fungsi, n_sp;
END $$;

-- PostgREST memuat ulang cache schema supaya objek di transport langsung
-- terlihat (tetap perlu `transport` di Exposed schemas — lihat header).
NOTIFY pgrst, 'reload schema';
