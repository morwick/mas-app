-- ============================================================================
-- Migration 20260924000001: email pengguna unik di profiles
--
-- Supabase Auth sudah menolak email ganda di auth.users, tapi profiles.email
-- hanya salinan dan tidak dijaga apa pun. Backend (users/router.py) memang
-- mengecek duplikat sebelum menyimpan, tapi dua permintaan bersamaan tetap
-- bisa lolos berdua. Index ini menjadikan database penjaga terakhirnya.
--
-- Unik tanpa membedakan huruf besar/kecil: "Budi@mas.co.id" dan
-- "budi@mas.co.id" dianggap email yang sama, sama seperti pengecekan di
-- backend. Spasi di tepi juga diabaikan.
--
-- Data yang sudah ganda TIDAK dibereskan otomatis — memilih akun mana yang
-- dipertahankan adalah keputusan manusia. Migrasi berhenti dengan daftar
-- email yang bentrok supaya bisa dirapikan dulu, lalu dijalankan ulang.
-- ============================================================================

DO $$
DECLARE
  bentrok TEXT;
BEGIN
  SELECT string_agg(format('%s (%s akun)', e, n), ', ')
    INTO bentrok
    FROM (
      SELECT lower(btrim(email)) AS e, count(*) AS n
        FROM profiles
       GROUP BY lower(btrim(email))
      HAVING count(*) > 1
    ) d;

  IF bentrok IS NOT NULL THEN
    RAISE EXCEPTION
      'Email ganda di profiles, rapikan dulu sebelum migrasi ini: %', bentrok;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
  ON profiles (lower(btrim(email)));
