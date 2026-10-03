-- ============================================================================
-- Migration 20261003000013: piutang ikut menghitung tagihan draft
--
-- BATASAN: piutang = tagihan aktif yang belum lunas dengan status 'draft' atau
-- 'terkirim' (sebelumnya hanya 'terkirim'). Tagihan batal & lunas tidak
-- dihitung. Umur piutang tetap dari jatuh tempo (WIB).
--
-- Perubahan data: tidak ada. Hanya isi fungsi get_piutang_summary (tanda
-- tangan & kolom keluaran tidak berubah — aman untuk backend lama).
-- WAJIB: jalankan setelah 20261003000012.
-- ============================================================================

SET search_path = transport, extensions;

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
  FROM transport.invoices i CROSS JOIN hari
  WHERE i.status = 1
    -- BATASAN: draft ikut dihitung sebagai piutang (permintaan user 2026-10-03).
    AND i.status_tagihan IN ('draft', 'terkirim')
    AND i.total > i.dibayar
  GROUP BY i.customer_id
  ORDER BY SUM(i.total - i.dibayar) DESC;
$function$;

NOTIFY pgrst, 'reload schema';
