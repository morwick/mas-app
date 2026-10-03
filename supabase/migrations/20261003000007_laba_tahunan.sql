-- ============================================================================
-- Migration 20261003000007: laporan laba tahunan (rincian per bulan)
--
-- BATASAN: dasar laporan = TAGIHAN. Hanya pekerjaan yang sudah dibuatkan
-- tagihan yang dihitung, dan semuanya (omset + biaya job-nya) jatuh di bulan
-- TANGGAL TAGIHAN — job jalan Desember yang ditagih Januari masuk Januari.
--   * Tagihan dihitung bila aktif (status = 1) dan tidak batal — draft ikut.
--   * Semua angka di luar PPN (PPN titipan pajak, bukan pendapatan).
--   * Biaya dihitung per PROYEK (tagihan ditulis per proyek dan satu proyek
--     hanya satu tagihan), jadi job lama yang unitnya diganti ikut dihitung
--     biayanya. Job cancelled tidak dihitung (sama dengan laporan laba).
--   * Proyek kosongan tidak pernah ditagih → tidak masuk.
--
-- Fungsi baru:
--   1. transport.get_laba_tahunan(p_tahun) — selalu 12 baris (Jan–Des):
--        omset      = subtotal tagihan;
--        dibayar    = porsi DPP dari pembayaran (dibayar × subtotal ÷ total);
--        uang_jalan = pencairan − pengembalian (kasbon tidak mengurangi,
--                     sama dengan get_job_profitability).
--   2. transport.get_laba_insiden(p_tahun) — satu baris per insiden yang
--      terhubung ke job proyek, beserta pelaksana WO & klaim asuransinya.
--      Porsi perusahaan dihitung di backend (hitung_tanggungan) supaya aturan
--      tanggungan asuransi hanya ada di satu tempat.
--        bulan terisi = proyek ditagih di tahun itu (bulan tagihan);
--        bulan NULL   = proyek SELESAI tapi BELUM DITAGIH (semua job selesai
--                       atau sudah diganti, punya customer, tanpa tagihan
--                       yang tidak batal — sama dengan get_proyek_profitability).
--
-- Fungsi SECURITY INVOKER: RLS tabel tetap berlaku.
-- Perubahan data: tidak ada.
-- WAJIB: jalankan setelah 20261003000006.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Omset, pembayaran, dan uang jalan per bulan ──────────────────────────
DROP FUNCTION IF EXISTS transport.get_laba_tahunan(INT);
CREATE OR REPLACE FUNCTION transport.get_laba_tahunan(p_tahun INT)
RETURNS TABLE(
  bulan           INT,
  jumlah_tagihan  INT,
  jumlah_proyek   INT,
  omset           BIGINT,
  dibayar         BIGINT,
  uang_jalan      BIGINT
)
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  WITH bln AS (
    SELECT generate_series(1, 12) AS bulan
  ),
  tagihan AS (
    SELECT i.id, EXTRACT(MONTH FROM i.tanggal)::INT AS bulan, i.subtotal, i.total, i.dibayar
      FROM transport.invoices i
     WHERE i.status = 1
       AND i.status_tagihan <> 'batal'
       AND i.tanggal >= make_date(p_tahun, 1, 1)
       AND i.tanggal <  make_date(p_tahun + 1, 1, 1)
  ),
  omset AS (
    SELECT t.bulan,
           COUNT(*)::INT    AS jumlah,
           SUM(t.subtotal)  AS omset,
           -- Pembayaran mengacu ke total (termasuk PPN); ambil porsi DPP-nya.
           ROUND(SUM(COALESCE(t.dibayar * t.subtotal::NUMERIC / NULLIF(t.total, 0), 0))) AS dibayar
      FROM tagihan t
     GROUP BY t.bulan
  ),
  -- Proyek yang ditagih per bulan. DISTINCT: satu proyek = banyak baris job.
  proyek_bulan AS (
    SELECT DISTINCT t.bulan, j.proyek_id
      FROM tagihan t
      JOIN transport.invoice_items ii ON ii.invoice_id = t.id AND ii.status = 1
      JOIN transport.jobs j ON j.id = ii.job_id
  ),
  biaya AS (
    SELECT pb.bulan,
           COUNT(DISTINCT pb.proyek_id)::INT AS jumlah_proyek,
           SUM(COALESCE(uj.bersih, 0))       AS uang_jalan
      FROM proyek_bulan pb
      LEFT JOIN transport.jobs j
        ON j.proyek_id = pb.proyek_id AND j.status = 1 AND j.status_job <> 'cancelled'
      LEFT JOIN LATERAL (
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
    COALESCE(c.uang_jalan, 0)::BIGINT
  FROM bln b
  LEFT JOIN omset o ON o.bulan = b.bulan
  LEFT JOIN biaya c ON c.bulan = b.bulan
  ORDER BY b.bulan;
$$;
REVOKE ALL ON FUNCTION transport.get_laba_tahunan(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.get_laba_tahunan(INT) TO authenticated, service_role;

-- ── 2. Insiden (biaya repair) proyek ditagih & proyek selesai belum ditagih ─
DROP FUNCTION IF EXISTS transport.get_laba_insiden(INT);
CREATE OR REPLACE FUNCTION transport.get_laba_insiden(p_tahun INT)
RETURNS TABLE(
  bulan            INT,
  proyek_id        UUID,
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
  WITH proyek_ditagih AS (
    -- Satu proyek hanya satu tagihan tidak batal, jadi DISTINCT cukup.
    SELECT DISTINCT EXTRACT(MONTH FROM i.tanggal)::INT AS bulan, j.proyek_id
      FROM transport.invoices i
      JOIN transport.invoice_items ii ON ii.invoice_id = i.id AND ii.status = 1
      JOIN transport.jobs j ON j.id = ii.job_id
     WHERE i.status = 1
       AND i.status_tagihan <> 'batal'
       AND i.tanggal >= make_date(p_tahun, 1, 1)
       AND i.tanggal <  make_date(p_tahun + 1, 1, 1)
  ),
  proyek_belum_ditagih AS (
    SELECT NULL::INT AS bulan, p.id AS proyek_id
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
    SELECT * FROM proyek_ditagih
    UNION ALL
    SELECT * FROM proyek_belum_ditagih
  )
  SELECT
    s.bulan,
    s.proyek_id,
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
