-- ============================================================================
-- Migration 20260924000010: daftar log sistem untuk halaman "Log Sistem"
--
-- Satu fungsi baca dengan filter, pencarian, dan paging di server (log bisa
-- puluhan ribu baris). Nama karyawan diambil dari hr.karyawan — schema hr
-- tidak dibuka di Data API, jadi join-nya dilakukan di sini.
--
-- SECURITY INVOKER: RLS tetap berlaku — hanya superadmin yang bisa membaca
-- log_sistem (policy superadmin_read_log_sistem) dan hr.karyawan.
-- Hanya baris aktif (status = 1) yang dibaca.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.daftar_log_sistem(
  p_dari      DATE    DEFAULT NULL,   -- tanggal WIB, inklusif
  p_sampai    DATE    DEFAULT NULL,   -- tanggal WIB, inklusif
  p_karyawan  UUID    DEFAULT NULL,
  p_aksi      TEXT    DEFAULT NULL,
  p_cari      TEXT    DEFAULT NULL,   -- cari di keterangan / IP
  p_limit     INTEGER DEFAULT 10,
  p_offset    INTEGER DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  waktu         TIMESTAMPTZ,
  aksi          TEXT,
  keterangan    TEXT,
  ip_address    TEXT,
  karyawan_id   UUID,
  karyawan_nama TEXT,
  total         BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = transport, extensions
AS $$
DECLARE
  v_cari TEXT := NULLIF(btrim(COALESCE(p_cari, '')), '');
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya super administrator yang boleh melihat log sistem'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT l.id, l.waktu, l.aksi, l.keterangan, l.ip_address,
         l.karyawan_id, k.nama,
         count(*) OVER () AS total
    FROM transport.log_sistem l
    LEFT JOIN hr.karyawan k ON k.id = l.karyawan_id AND k.status = 1
   WHERE l.status = 1
     AND (p_dari     IS NULL OR (l.waktu AT TIME ZONE 'Asia/Jakarta')::date >= p_dari)
     AND (p_sampai   IS NULL OR (l.waktu AT TIME ZONE 'Asia/Jakarta')::date <= p_sampai)
     AND (p_karyawan IS NULL OR l.karyawan_id = p_karyawan)
     AND (p_aksi     IS NULL OR l.aksi = p_aksi)
     -- strpos, bukan ILIKE: `%` dan `_` dari kata kunci tidak jadi wildcard.
     AND (v_cari     IS NULL OR strpos(lower(l.keterangan || ' ' || COALESCE(l.ip_address, '')), lower(v_cari)) > 0)
   ORDER BY l.waktu DESC, l.id
   -- Pagar atas sama dengan opsi "Semua" di backend (app/core/paging.py).
   LIMIT GREATEST(LEAST(COALESCE(p_limit, 10), 5000), 1)
   OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION transport.daftar_log_sistem(DATE, DATE, UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_log_sistem(DATE, DATE, UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
