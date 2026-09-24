-- ============================================================================
-- Migration 20260924000006: nama jenis unit unik tanpa beda huruf besar/kecil
--
-- Constraint UNIQUE bawaan (migration 01) membedakan huruf, jadi "Lowbed" dan
-- "lowbed" sama-sama bisa tersimpan. Diganti index unik atas nama yang sudah
-- dinormalkan: huruf kecil, spasi di tepi dibuang, spasi ganda dirapatkan —
-- sama dengan pembanding di backend (jenis_unit/router.py `_kunci`).
--
-- Data ganda tidak dibereskan otomatis (unit menunjuk ke jenisnya); migrasi
-- berhenti dengan daftar nama yang bentrok supaya dirapikan dulu.
-- ============================================================================

SET search_path = transport, extensions;

DO $$
DECLARE
  bentrok TEXT;
BEGIN
  SELECT string_agg(format('%s (%s baris)', k, n), ', ')
    INTO bentrok
    FROM (
      SELECT lower(regexp_replace(btrim(nama), '\s+', ' ', 'g')) AS k, count(*) AS n
        FROM transport.jenis_unit
       GROUP BY 1
      HAVING count(*) > 1
    ) d;

  IF bentrok IS NOT NULL THEN
    RAISE EXCEPTION
      'Nama jenis unit ganda, rapikan dulu sebelum migrasi ini: %', bentrok;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS jenis_unit_nama_unique
  ON transport.jenis_unit (lower(regexp_replace(btrim(nama), '\s+', ' ', 'g')));

-- Constraint lama sudah tercakup index di atas.
ALTER TABLE transport.jenis_unit DROP CONSTRAINT IF EXISTS jenis_unit_nama_key;
