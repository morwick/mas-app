-- ============================================================================
-- Migration 20261003000008: laba tahunan ikut menghitung proyek kosongan
--
-- Proyek kosongan (tanpa customer) tidak pernah ditagih, tapi uang jalan dan
-- biaya repair-nya tetap cost perusahaan dan wajib mengurangi profit.
--
-- BATASAN: proyek kosongan jatuh di bulan TANGGAL BONGKAR (WIB) — bongkar
-- terakhir di antara job-nya — bukan tanggal muat/ETD. Muat 30 September,
-- bongkar 1 Oktober → dihitung Oktober. Proyek kosongan baru dihitung bila
-- semua job aktifnya (selain cancelled) sudah bongkar (jobs.bongkar_at terisi;
-- job lama yang diganti unit ikut terisi saat insiden — migration
-- 20261003000004).
--
-- Perubahan:
--   1. Fungsi bantu transport._laba_proyek_bulan(p_tahun): proyek yang masuk
--      laporan beserta bulannya — proyek ditagih (bulan tanggal tagihan) dan
--      proyek kosongan (bulan bongkar). Dipakai kedua fungsi di bawah supaya
--      aturan bulannya hanya di satu tempat.
--   2. get_laba_tahunan: kolom baru jumlah_kosongan & uang_jalan_kosongan
--      (uang_jalan tetap hanya proyek ditagih).
--   3. get_laba_insiden: kolom baru kosongan (insiden proyek kosongan).
--
-- Perubahan data: tidak ada.
-- WAJIB: jalankan setelah 20261003000007. Naikkan backend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Proyek per bulan laporan ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS transport._laba_proyek_bulan(INT);
CREATE OR REPLACE FUNCTION transport._laba_proyek_bulan(p_tahun INT)
RETURNS TABLE(bulan INT, proyek_id UUID, kosongan BOOLEAN)
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  -- Proyek ditagih: bulan tanggal tagihan (tidak batal; draft ikut). Satu
  -- proyek hanya satu tagihan tidak batal, jadi DISTINCT cukup.
  SELECT DISTINCT EXTRACT(MONTH FROM i.tanggal)::INT, j.proyek_id, false
    FROM transport.invoices i
    JOIN transport.invoice_items ii ON ii.invoice_id = i.id AND ii.status = 1
    JOIN transport.jobs j ON j.id = ii.job_id
   WHERE i.status = 1
     AND i.status_tagihan <> 'batal'
     AND i.tanggal >= make_date(p_tahun, 1, 1)
     AND i.tanggal <  make_date(p_tahun + 1, 1, 1)
  UNION ALL
  -- Proyek kosongan: bulan bongkar terakhir (WIB), setelah semua job bongkar.
  SELECT EXTRACT(MONTH FROM k.bongkar_terakhir)::INT, k.proyek_id, true
    FROM (
      SELECT p.id AS proyek_id,
             MAX(j.bongkar_at AT TIME ZONE 'Asia/Jakarta') AS bongkar_terakhir
        FROM transport.proyek p
        JOIN transport.jobs j
          ON j.proyek_id = p.id AND j.status = 1 AND j.status_job <> 'cancelled'
       WHERE p.status = 1 AND p.customer_id IS NULL
       GROUP BY p.id
      HAVING BOOL_AND(j.bongkar_at IS NOT NULL)
    ) k
   WHERE k.bongkar_terakhir >= make_date(p_tahun, 1, 1)
     AND k.bongkar_terakhir <  make_date(p_tahun + 1, 1, 1);
$$;
REVOKE ALL ON FUNCTION transport._laba_proyek_bulan(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport._laba_proyek_bulan(INT) TO authenticated, service_role;

-- ── 2. Omset, pembayaran, dan uang jalan per bulan ──────────────────────────
DROP FUNCTION IF EXISTS transport.get_laba_tahunan(INT);
CREATE OR REPLACE FUNCTION transport.get_laba_tahunan(p_tahun INT)
RETURNS TABLE(
  bulan                INT,
  jumlah_tagihan       INT,
  jumlah_proyek        INT,
  omset                BIGINT,
  dibayar              BIGINT,
  uang_jalan           BIGINT,
  jumlah_kosongan      INT,
  uang_jalan_kosongan  BIGINT
)
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  WITH bln AS (
    SELECT generate_series(1, 12) AS bulan
  ),
  omset AS (
    SELECT EXTRACT(MONTH FROM i.tanggal)::INT AS bulan,
           COUNT(*)::INT    AS jumlah,
           SUM(i.subtotal)  AS omset,
           -- Pembayaran mengacu ke total (termasuk PPN); ambil porsi DPP-nya.
           ROUND(SUM(COALESCE(i.dibayar * i.subtotal::NUMERIC / NULLIF(i.total, 0), 0))) AS dibayar
      FROM transport.invoices i
     WHERE i.status = 1
       AND i.status_tagihan <> 'batal'
       AND i.tanggal >= make_date(p_tahun, 1, 1)
       AND i.tanggal <  make_date(p_tahun + 1, 1, 1)
     GROUP BY 1
  ),
  biaya AS (
    SELECT pb.bulan,
           COUNT(DISTINCT pb.proyek_id) FILTER (WHERE NOT pb.kosongan)::INT AS jumlah_proyek,
           COUNT(DISTINCT pb.proyek_id) FILTER (WHERE pb.kosongan)::INT     AS jumlah_kosongan,
           SUM(COALESCE(uj.bersih, 0)) FILTER (WHERE NOT pb.kosongan)       AS uang_jalan,
           SUM(COALESCE(uj.bersih, 0)) FILTER (WHERE pb.kosongan)           AS uang_jalan_kosongan
      FROM transport._laba_proyek_bulan(p_tahun) pb
      LEFT JOIN transport.jobs j
        ON j.proyek_id = pb.proyek_id AND j.status = 1 AND j.status_job <> 'cancelled'
      LEFT JOIN LATERAL (
        -- Kasbon tidak mengurangi biaya uang jalan (sama dengan get_job_profitability).
        SELECT SUM(CASE WHEN x.jenis = 'pencairan' THEN x.jumlah ELSE -x.jumlah END) AS bersih
          FROM transport.uang_jalan x
         WHERE x.job_id = j.id AND x.status = 1 AND x.jenis IN ('pencairan', 'pengembalian')
      ) uj ON true
     GROUP BY pb.bulan
  )
  SELECT
    b.bulan,
    COALESCE(o.jumlah, 0),
    COALESCE(c.jumlah_proyek, 0),
    COALESCE(o.omset, 0)::BIGINT,
    COALESCE(o.dibayar, 0)::BIGINT,
    COALESCE(c.uang_jalan, 0)::BIGINT,
    COALESCE(c.jumlah_kosongan, 0),
    COALESCE(c.uang_jalan_kosongan, 0)::BIGINT
  FROM bln b
  LEFT JOIN omset o ON o.bulan = b.bulan
  LEFT JOIN biaya c ON c.bulan = b.bulan
  ORDER BY b.bulan;
$$;
REVOKE ALL ON FUNCTION transport.get_laba_tahunan(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.get_laba_tahunan(INT) TO authenticated, service_role;

-- ── 3. Insiden: proyek ditagih, kosongan, dan selesai belum ditagih ─────────
DROP FUNCTION IF EXISTS transport.get_laba_insiden(INT);
CREATE OR REPLACE FUNCTION transport.get_laba_insiden(p_tahun INT)
RETURNS TABLE(
  bulan            INT,
  proyek_id        UUID,
  kosongan         BOOLEAN,
  biaya_repair     NUMERIC,
  pelaksana        TEXT,
  status_klaim     TEXT,
  nilai_diajukan   NUMERIC,
  nilai_disetujui  NUMERIC,
  own_risk         NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  WITH proyek_belum_ditagih AS (
    -- Selesai tapi belum ditagih (bulan NULL) — sama dengan get_proyek_profitability.
    SELECT NULL::INT AS bulan, p.id AS proyek_id, false AS kosongan
      FROM transport.proyek p
     WHERE p.status = 1
       AND p.customer_id IS NOT NULL
       -- Punya job aktif dan semuanya selesai (job yang diganti dianggap selesai).
       AND EXISTS (SELECT 1 FROM transport.jobs j
                    WHERE j.proyek_id = p.id AND j.status = 1 AND j.status_job <> 'cancelled')
       AND NOT EXISTS (
         SELECT 1 FROM transport.jobs j
          WHERE j.proyek_id = p.id AND j.status = 1 AND j.status_job NOT IN ('cancelled', 'selesai')
            AND NOT EXISTS (SELECT 1 FROM transport.jobs g
                             WHERE g.menggantikan_job_id = j.id AND g.status = 1)
       )
       AND NOT EXISTS (
         SELECT 1
           FROM transport.invoice_items ii
           JOIN transport.jobs j ON j.id = ii.job_id
           JOIN transport.invoices i ON i.id = ii.invoice_id
          WHERE j.proyek_id = p.id AND ii.status = 1
            AND i.status = 1 AND i.status_tagihan <> 'batal'
       )
  ),
  sasaran AS (
    SELECT pb.bulan, pb.proyek_id, pb.kosongan FROM transport._laba_proyek_bulan(p_tahun) pb
    UNION ALL
    SELECT * FROM proyek_belum_ditagih
  )
  SELECT
    s.bulan,
    s.proyek_id,
    s.kosongan,
    COALESCE(n.biaya_repair, 0),
    wo.pelaksana,
    k.status_klaim,
    k.nilai_diajukan,
    k.nilai_disetujui,
    k.own_risk
  FROM sasaran s
  JOIN transport.jobs j
    ON j.proyek_id = s.proyek_id AND j.status = 1 AND j.status_job <> 'cancelled'
  JOIN transport.incident_logs n ON n.job_id = j.id AND n.status = 1
  LEFT JOIN LATERAL (
    -- WO terakhir insiden ini (biaya_repair insiden diisi dari WO yang selesai).
    SELECT w.id, w.pelaksana
      FROM transport.perintah_kerja w
     WHERE w.incident_id = n.id AND w.status = 1 AND w.status_wo <> 'dibatalkan'
     ORDER BY w.tanggal_selesai DESC NULLS LAST, w.created_at DESC
     LIMIT 1
  ) wo ON true
  LEFT JOIN transport.klaim_asuransi k
    ON k.perintah_kerja_id = wo.id AND k.status = 1
  WHERE COALESCE(n.biaya_repair, 0) > 0;
$$;
REVOKE ALL ON FUNCTION transport.get_laba_insiden(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.get_laba_insiden(INT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
