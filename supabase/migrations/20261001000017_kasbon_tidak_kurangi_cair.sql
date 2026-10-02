-- ============================================================================
-- Migration 20261001000017: kasbon supir tidak mengurangi uang jalan cair
--
-- Sebelumnya cair bersih = pencairan − pengembalian − kasbon. Sekarang:
--   cair bersih = pencairan − pengembalian
-- BATASAN: kasbon supir (sisa uang jalan di supir lama saat ganti driver /
-- ganti unit) tetap tercatat di riwayat uang jalan & kasbon_driver, tetapi
-- TIDAK mengurangi uang jalan yang sudah diberikan: uangnya sudah keluar untuk
-- job ini, jadi sisa uang jalan tidak bertambah dan biaya job (laporan laba)
-- tetap menghitungnya. Pengembalian ke kas tetap mengurangi cair.
-- Pengaman ganti driver: dikembalikan + kasbon baru ≤ cair − kasbon terdahulu.
--
-- Tidak ada perubahan data (ringkasan selalu dihitung dari riwayat).
-- WAJIB: jalankan setelah 20261001000016. Naikkan backend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Efek ke sisa uang jalan (penjaga batas pencairan) ────────────────────
CREATE OR REPLACE FUNCTION transport._efek_uang_jalan_ke_sisa(
  p_status SMALLINT, p_jenis TEXT, p_jumlah NUMERIC, p_status_approval TEXT
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_status IS DISTINCT FROM 1 THEN 0
           WHEN p_jenis = 'tambahan' THEN
             CASE WHEN p_status_approval = 'disetujui' THEN COALESCE(p_jumlah, 0) ELSE 0 END
           WHEN p_jenis = 'pengembalian' THEN COALESCE(p_jumlah, 0)
           -- BATASAN: kasbon tidak mengubah sisa (uangnya tetap terpakai dari job).
           WHEN p_jenis = 'kasbon' THEN 0
           ELSE -COALESCE(p_jumlah, 0)
         END;
$$;

-- ── 2. Posisi uang jalan job ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.job_uang_jalan_posisi(p_job_id UUID)
RETURNS TABLE (uang_jalan BIGINT, cair BIGINT, sisa BIGINT, ada_bukti BOOLEAN, pending_request BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  WITH t AS (
    SELECT
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'tambahan' AND status_approval = 'disetujui'), 0) AS tambah,
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'pencairan'), 0)
        - COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'pengembalian'), 0) AS cair,
      bool_or(jenis = 'pencairan' AND bukti_transfer_path IS NOT NULL) AS ada_bukti
    FROM transport.uang_jalan WHERE job_id = p_job_id AND status = 1
  )
  SELECT
    (j.uang_jalan_awal + t.tambah)::BIGINT,
    t.cair::BIGINT,
    (j.uang_jalan_awal + t.tambah - t.cair)::BIGINT,
    COALESCE(t.ada_bukti, false),
    EXISTS (SELECT 1 FROM transport.uang_jalan_requests r
             WHERE r.job_id = p_job_id AND r.status = 1 AND r.status_pengajuan = 'diajukan')
  FROM transport.jobs j, t WHERE j.id = p_job_id AND j.status = 1;
$$;

-- ── 3. Catat pengembalian & kasbon saat penggantian ─────────────────────────
CREATE OR REPLACE FUNCTION transport._catat_pengembalian_kasbon(
  p_job          transport.jobs,
  p_penggantian  UUID,
  p_asal         TEXT,
  p_dikembalikan BIGINT,
  p_sumber_dana  UUID,
  p_kasbon       BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_cair   BIGINT;
  v_kasbon BIGINT;
  v_uj_id  UUID;
  v_hari   DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_driver TEXT;
BEGIN
  IF COALESCE(p_dikembalikan, 0) < 0 OR COALESCE(p_kasbon, 0) < 0 THEN
    RAISE EXCEPTION 'Uang jalan dikembalikan & kasbon tidak boleh minus.' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(p_dikembalikan, 0) = 0 AND COALESCE(p_kasbon, 0) = 0 THEN
    RETURN;
  END IF;
  SELECT cair INTO v_cair FROM transport.job_uang_jalan_posisi(p_job.id);
  -- Kasbon tidak lagi mengurangi cair, jadi kasbon yang sudah dicatat sebelumnya
  -- (penggantian terdahulu) dikurangkan di sini: uang itu sudah tidak di tangan supir.
  SELECT COALESCE(SUM(jumlah), 0) INTO v_kasbon
    FROM transport.uang_jalan WHERE job_id = p_job.id AND status = 1 AND jenis = 'kasbon';
  v_cair := COALESCE(v_cair, 0) - v_kasbon;
  IF COALESCE(p_dikembalikan, 0) + COALESCE(p_kasbon, 0) > v_cair THEN
    RAISE EXCEPTION 'Uang jalan dikembalikan + kasbon (Rp %) melebihi uang jalan yang sudah cair di job % (Rp %).',
      replace(to_char(COALESCE(p_dikembalikan, 0) + COALESCE(p_kasbon, 0), 'FM999,999,999,999'), ',', '.'),
      p_job.job_number, replace(to_char(v_cair, 'FM999,999,999,999'), ',', '.')
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT nama INTO v_driver FROM transport.drivers WHERE id = p_job.driver_id;

  PERFORM set_config('app.penggantian_job', 'on', true);
  IF COALESCE(p_dikembalikan, 0) > 0 THEN
    IF p_sumber_dana IS NULL THEN
      RAISE EXCEPTION 'Pilih kas yang menerima uang jalan yang dikembalikan.' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO transport.uang_jalan (job_id, jenis, tanggal, jumlah, sumber_dana_id, keperluan, catatan, created_by)
    VALUES (p_job.id, 'pengembalian', v_hari, p_dikembalikan, p_sumber_dana, 'Pengembalian supir',
            'Dikembalikan ' || COALESCE(v_driver, 'supir lama') || ' saat ' || replace(p_asal, '_', ' '), auth.uid());
  END IF;
  IF COALESCE(p_kasbon, 0) > 0 THEN
    INSERT INTO transport.uang_jalan (job_id, jenis, tanggal, jumlah, keperluan, catatan, created_by)
    VALUES (p_job.id, 'kasbon', v_hari, p_kasbon, 'Kasbon supir',
            'Kasbon ' || COALESCE(v_driver, 'supir lama') || ' saat ' || replace(p_asal, '_', ' '), auth.uid())
    RETURNING id INTO v_uj_id;
    INSERT INTO transport.kasbon_driver (driver_id, job_id, uang_jalan_id, penggantian_id, asal, jumlah, keterangan, created_by)
    VALUES (p_job.driver_id, p_job.id, v_uj_id, p_penggantian, p_asal, p_kasbon,
            'Sisa uang jalan ' || p_job.job_number || ' yang tidak dikembalikan', auth.uid());
  END IF;
  PERFORM set_config('app.penggantian_job', '', true);
END;
$$;
REVOKE ALL ON FUNCTION transport._catat_pengembalian_kasbon(transport.jobs, UUID, TEXT, BIGINT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;

-- ── 4. Laporan laba ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS transport.get_job_profitability(DATE, DATE);
CREATE OR REPLACE FUNCTION transport.get_job_profitability(p_start DATE DEFAULT NULL, p_end DATE DEFAULT NULL)
 RETURNS TABLE(job_id uuid, job_number text, customer_nama text, unit_kode text, etd timestamp with time zone,
               status transport.job_status, pendapatan bigint, uang_jalan bigint, biaya_insiden bigint, laba bigint,
               proyek_nomor text, kosongan boolean, diganti_oleh text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'transport', 'extensions'
AS $function$
  SELECT
    j.id,
    j.job_number,
    COALESCE(c.nama_perusahaan, 'Tanpa customer'),
    u.kode_unit,
    j.etd,
    j.status_job,
    COALESCE(inv.pendapatan, 0)      AS pendapatan,
    COALESCE(uj.bersih, 0)           AS uang_jalan,
    COALESCE(ins.biaya, 0)           AS biaya_insiden,
    COALESCE(inv.pendapatan, 0)
      - COALESCE(uj.bersih, 0)
      - COALESCE(ins.biaya, 0)       AS laba,
    p.nomor_proyek,
    p.customer_id IS NULL,
    pg.job_number
  FROM transport.jobs j
  JOIN transport.proyek p ON p.id = j.proyek_id
  LEFT JOIN transport.customers c ON c.id = p.customer_id
  JOIN transport.units u ON u.id = j.unit_id
  LEFT JOIN LATERAL (
    SELECT g.job_number FROM transport.jobs g
     WHERE g.menggantikan_job_id = j.id AND g.status = 1 LIMIT 1
  ) pg ON true
  LEFT JOIN LATERAL (
    SELECT SUM(ii.subtotal) AS pendapatan
    FROM transport.invoice_items ii
    JOIN transport.invoices i ON i.id = ii.invoice_id
    WHERE ii.job_id = j.id AND ii.status = 1 AND i.status = 1 AND i.status_tagihan <> 'batal'
  ) inv ON true
  LEFT JOIN LATERAL (
    -- Kasbon tidak mengurangi biaya uang jalan job (uangnya tetap terpakai).
    SELECT SUM(CASE WHEN x.jenis = 'pencairan' THEN x.jumlah ELSE -x.jumlah END) AS bersih
    FROM transport.uang_jalan x
    WHERE x.job_id = j.id AND x.status = 1 AND x.jenis IN ('pencairan', 'pengembalian')
  ) uj ON true
  LEFT JOIN LATERAL (
    SELECT SUM(COALESCE(n.biaya_repair, 0)) AS biaya
    FROM transport.incident_logs n
    WHERE n.job_id = j.id AND n.status = 1
  ) ins ON true
  WHERE j.status = 1
    AND (p_start IS NULL OR j.etd >= p_start::TIMESTAMPTZ)
    AND (p_end   IS NULL OR j.etd <  (p_end + 1)::TIMESTAMPTZ)
    AND j.status_job <> 'cancelled'
  ORDER BY j.etd DESC;
$function$;
