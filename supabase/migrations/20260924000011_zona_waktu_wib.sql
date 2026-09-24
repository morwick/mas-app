-- ============================================================================
-- Migration 20260924000011: zona waktu WIB (Asia/Jakarta)
--
-- Kolom waktu bertipe TIMESTAMPTZ (mis. log_sistem.waktu) menyimpan titik
-- waktu yang pasti — datanya tidak salah dan tidak perlu dikonversi. Yang
-- membuatnya tampak meleset 7 jam adalah zona waktu sesi database Supabase
-- yang default-nya UTC: Table Editor / SQL Editor menampilkan "01:05:09+00"
-- untuk kejadian pukul 08:05:09 WIB.
--
-- 1. Zona waktu default database → Asia/Jakarta (UTC+7, sama dengan Bangkok).
--    Supabase Table Editor, SQL Editor, dan keluaran API menampilkan jam WIB
--    ("2026-09-24 08:05:09+07"). Berlaku untuk koneksi BARU — kalau jam di
--    dashboard belum berubah, restart project di Supabase Dashboard.
--
-- 2. Fungsi yang memakai tanggal/bulan/tahun "hari ini" dibuat EKSPLISIT
--    memakai WIB, supaya benar apa pun pengaturan zona waktu servernya.
--    Sebelumnya, di zona UTC:
--      * tagihan/penawaran yang dibuat 1 Oktober pukul 06.00 WIB mendapat
--        bulan romawi IX (September) di nomor suratnya;
--      * nomor job pada 1 Januari sebelum 07.00 WIB memakai tahun lama;
--      * umur piutang & cek tanggal lahir bisa selisih satu hari.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Zona waktu database ──────────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Jakarta');
END $$;
SET timezone TO 'Asia/Jakarta';

-- ── 2. Fungsi tanggal "hari ini" → WIB eksplisit ────────────────────────────
CREATE OR REPLACE FUNCTION transport.gen_job_number()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_year TEXT;
  v_seq INTEGER;
BEGIN
  -- Tahun menurut WIB. Sengaja menghitung SEMUA job termasuk yang dihapus
  -- (status = 2): nomor job tidak boleh dipakai ulang.
  v_year := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY');

  SELECT COALESCE(MAX(CAST(SPLIT_PART(job_number, '-', 3) AS INTEGER)), 0) + 1
  INTO v_seq
  FROM jobs
  WHERE job_number LIKE 'JOB-' || v_year || '-%';

  RETURN 'JOB-' || v_year || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION transport.next_invoice_number()
 RETURNS TABLE(nomor text, seq integer, tahun integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
#variable_conflict use_column
DECLARE
  v_sekarang TIMESTAMP := now() AT TIME ZONE 'Asia/Jakarta';
  v_tahun INTEGER := EXTRACT(YEAR FROM v_sekarang)::INTEGER;
  v_bulan INTEGER := EXTRACT(MONTH FROM v_sekarang)::INTEGER;
  v_seq   INTEGER;
BEGIN
  INSERT INTO document_counters (doc_type, tahun, last_seq)
  VALUES ('invoice', v_tahun, 1)
  ON CONFLICT (doc_type, tahun) DO UPDATE
    SET last_seq   = document_counters.last_seq + 1,
        updated_at = now()
  RETURNING document_counters.last_seq INTO v_seq;

  RETURN QUERY SELECT
    LPAD(v_seq::TEXT, 4, '0') || '/INV/MAS/' || to_roman_month(v_bulan) || '/' || v_tahun::TEXT,
    v_seq,
    v_tahun;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.next_quotation_number()
 RETURNS TABLE(nomor text, seq integer, tahun integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
#variable_conflict use_column
DECLARE
  v_sekarang TIMESTAMP := now() AT TIME ZONE 'Asia/Jakarta';
  v_tahun INTEGER := EXTRACT(YEAR FROM v_sekarang)::INTEGER;
  v_bulan INTEGER := EXTRACT(MONTH FROM v_sekarang)::INTEGER;
  v_seq   INTEGER;
BEGIN
  INSERT INTO document_counters (doc_type, tahun, last_seq)
  VALUES ('quotation', v_tahun, 1)
  ON CONFLICT (doc_type, tahun) DO UPDATE
    SET last_seq   = document_counters.last_seq + 1,
        updated_at = now()
  RETURNING document_counters.last_seq INTO v_seq;

  RETURN QUERY SELECT
    LPAD(v_seq::TEXT, 4, '0') || '/SK/MAS/' || to_roman_month(v_bulan) || '/' || v_tahun::TEXT,
    v_seq,
    v_tahun;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.get_piutang_summary()
 RETURNS TABLE(customer_id uuid, customer_nama text, jumlah_invoice integer, total_tagihan bigint, total_dibayar bigint, sisa bigint, belum_jatuh_tempo bigint, umur_1_30 bigint, umur_31_60 bigint, umur_60_plus bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'transport', 'extensions'
AS $function$
  WITH hari AS (SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS ini)  -- tanggal WIB
  SELECT
    i.customer_id,
    MAX(i.customer_nama)                              AS customer_nama,
    COUNT(*)::INTEGER                                 AS jumlah_invoice,
    SUM(i.total)                                      AS total_tagihan,
    SUM(i.dibayar)                                    AS total_dibayar,
    SUM(i.total - i.dibayar)                          AS sisa,
    SUM(CASE WHEN i.jatuh_tempo IS NULL OR i.jatuh_tempo >= hari.ini
             THEN i.total - i.dibayar ELSE 0 END)     AS belum_jatuh_tempo,
    SUM(CASE WHEN i.jatuh_tempo < hari.ini
              AND hari.ini - i.jatuh_tempo BETWEEN 1 AND 30
             THEN i.total - i.dibayar ELSE 0 END)     AS umur_1_30,
    SUM(CASE WHEN i.jatuh_tempo < hari.ini
              AND hari.ini - i.jatuh_tempo BETWEEN 31 AND 60
             THEN i.total - i.dibayar ELSE 0 END)     AS umur_31_60,
    SUM(CASE WHEN i.jatuh_tempo < hari.ini
              AND hari.ini - i.jatuh_tempo > 60
             THEN i.total - i.dibayar ELSE 0 END)     AS umur_60_plus
  FROM invoices i CROSS JOIN hari
  WHERE i.status = 1
    AND i.status_tagihan = 'terkirim'
    AND i.total > i.dibayar
  GROUP BY i.customer_id
  ORDER BY SUM(i.total - i.dibayar) DESC;
$function$;

CREATE OR REPLACE FUNCTION transport.tambah_karyawan(
  p_nama          TEXT,
  p_tanggal_lahir DATE DEFAULT NULL,
  p_alamat        TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID, nama TEXT, tanggal_lahir DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya super administrator yang boleh menambah karyawan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(coalesce(p_nama, '')) = '' THEN
    RAISE EXCEPTION 'Nama karyawan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_lahir IS NOT NULL AND p_tanggal_lahir > (now() AT TIME ZONE 'Asia/Jakarta')::date THEN
    RAISE EXCEPTION 'Tanggal lahir tidak boleh di masa depan.' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
  INSERT INTO hr.karyawan AS k (nama, tanggal_lahir, alamat)
  VALUES (btrim(p_nama), p_tanggal_lahir, NULLIF(btrim(coalesce(p_alamat, '')), ''))
  RETURNING k.id, k.nama, k.tanggal_lahir;
END;
$$;

NOTIFY pgrst, 'reload schema';
