-- ============================================================================
-- Migration 20261003000009: master Jenis Biaya + Biaya Lain per job
--
--   * transport.jenis_biaya — master jenis biaya (tol, parkir, bongkar muat…),
--                             menu Master Data → Jenis Biaya.
--   * transport.biaya_lain  — biaya lain per job (jenis, nominal, catatan,
--                             pembuat). Murni biaya perusahaan: tidak masuk
--                             tagihan customer.
--   * get_laba_tahunan      — kolom biaya_lainnya = biaya lain job (bulan
--                             sama dengan uang jalan: proyek ditagih → bulan
--                             tagihan; kosongan → bulan bongkar).
--   * get_laba_insiden      — DIHAPUS: atas permintaan user, biaya repair tidak
--                             lagi dihitung di Laba tahunan (diganti biaya
--                             lainnya).
--
-- BATASAN:
--   * nama jenis biaya unik (tanpa beda huruf besar/kecil & spasi tepi) di
--     antara jenis biaya aktif; jenis biaya yang masih dipakai biaya lain
--     aktif tidak bisa dihapus (soft_delete_propagate);
--   * nominal biaya lain > 0;
--   * biaya lain hanya bisa ditambah / diubah / dihapus selama job BELUM
--     masuk tagihan yang tidak batal (sama dengan uang jalan) — dijaga
--     trigger trg_biaya_lain_cek_tagihan, backend & UI juga memeriksa.
--
-- AMAN UNTUK KODE LAMA: menambah tabel, trigger, salinan `_log_label` dengan
-- dua baris tambahan, kolom baru get_laba_tahunan, dan menghapus fungsi
-- get_laba_insiden (hanya dipakai laporan Laba tahunan versi sebelumnya).
-- Tidak ada perubahan data.
-- WAJIB: jalankan setelah 20261003000008. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Tabel ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.jenis_biaya (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        TEXT NOT NULL CONSTRAINT jenis_biaya_nama_check CHECK (btrim(nama) <> ''),
  created_by  UUID REFERENCES transport.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      SMALLINT NOT NULL DEFAULT 1 CONSTRAINT jenis_biaya_status_check CHECK (status IN (1, 2))
);
COMMENT ON TABLE transport.jenis_biaya IS 'Master jenis biaya lain job. Dirujuk biaya_lain.jenis_biaya_id.';
COMMENT ON COLUMN transport.jenis_biaya.status IS '1 = aktif, 2 = dihapus (soft delete)';
-- BATASAN: nama jenis biaya aktif tidak boleh kembar.
CREATE UNIQUE INDEX IF NOT EXISTS jenis_biaya_nama_unique
  ON transport.jenis_biaya (lower(btrim(nama))) WHERE status = 1;

CREATE TABLE IF NOT EXISTS transport.biaya_lain (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES transport.jobs(id) ON DELETE CASCADE,
  -- Tanpa ON DELETE: jenis biaya yang masih dipakai tidak bisa dihapus.
  jenis_biaya_id  UUID NOT NULL REFERENCES transport.jenis_biaya(id),
  nominal         BIGINT NOT NULL CONSTRAINT biaya_lain_nominal_check CHECK (nominal > 0),
  catatan         TEXT,
  created_by      UUID REFERENCES transport.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          SMALLINT NOT NULL DEFAULT 1 CONSTRAINT biaya_lain_status_check CHECK (status IN (1, 2))
);
COMMENT ON TABLE transport.biaya_lain IS 'Biaya lain per job (murni biaya perusahaan, tidak ditagihkan).';
COMMENT ON COLUMN transport.biaya_lain.status IS '1 = aktif, 2 = dihapus (soft delete)';
CREATE INDEX IF NOT EXISTS idx_biaya_lain_job ON transport.biaya_lain (job_id) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_biaya_lain_jenis ON transport.biaya_lain (jenis_biaya_id) WHERE status = 1;

-- ── 2. BATASAN: terkunci setelah job masuk tagihan ──────────────────────────
CREATE OR REPLACE FUNCTION transport.biaya_lain_cek_tagihan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
DECLARE
  v_job     UUID;
  v_nomor   TEXT;
BEGIN
  -- Job lama (saat dipindah / dihapus) dan job baru sama-sama diperiksa.
  FOREACH v_job IN ARRAY ARRAY[NEW.job_id] || CASE WHEN TG_OP = 'UPDATE' THEN ARRAY[OLD.job_id] ELSE ARRAY[]::UUID[] END
  LOOP
    SELECT i.invoice_number INTO v_nomor
      FROM transport.invoice_items ii
      JOIN transport.invoices i ON i.id = ii.invoice_id
     WHERE ii.job_id = v_job AND ii.status = 1
       AND i.status = 1 AND i.status_tagihan <> 'batal'
     LIMIT 1;
    IF v_nomor IS NOT NULL THEN
      RAISE EXCEPTION 'Job sudah ditagihkan (%) — biaya lain tidak bisa ditambah, diubah, atau dihapus lagi.', v_nomor
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_biaya_lain_cek_tagihan ON transport.biaya_lain;
CREATE TRIGGER trg_biaya_lain_cek_tagihan
  BEFORE INSERT OR UPDATE ON transport.biaya_lain
  FOR EACH ROW EXECUTE FUNCTION transport.biaya_lain_cek_tagihan();

-- ── 3. updated_at, soft delete, log sistem (pola sama dengan tabel lain) ────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['jenis_biaya', 'biaya_lain'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON transport.%I', 'trg_' || t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON transport.%I
                      FOR EACH ROW EXECUTE FUNCTION transport.set_updated_at()', 'trg_' || t || '_updated_at', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete ON transport.%I', t);
    EXECUTE format('CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.%I
                      FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.%I', t);
    EXECUTE format('CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.%I
                      FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
                      EXECUTE FUNCTION transport.soft_delete_propagate()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.%I', t);
    EXECUTE format('CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.%I
                      FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
                      EXECUTE FUNCTION transport.soft_delete_propagate()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_log_sistem ON transport.%I', t);
    EXECUTE format('CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.%I
                      FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data()', t);
  END LOOP;
END;
$$;

-- ── 4. Akses ────────────────────────────────────────────────────────────────
-- Jenis biaya: staf aktif membaca & menulis (backend membatasi tulis ke
-- superadmin/admin, sama dengan master Jenis Unit).
ALTER TABLE transport.jenis_biaya ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON transport.jenis_biaya TO authenticated;
GRANT ALL ON transport.jenis_biaya TO service_role;
REVOKE ALL ON transport.jenis_biaya FROM anon;
DROP POLICY IF EXISTS "staf_baca_jenis_biaya" ON transport.jenis_biaya;
CREATE POLICY "staf_baca_jenis_biaya" ON transport.jenis_biaya FOR SELECT TO authenticated
  USING (transport.is_active_admin());
DROP POLICY IF EXISTS "staf_tambah_jenis_biaya" ON transport.jenis_biaya;
CREATE POLICY "staf_tambah_jenis_biaya" ON transport.jenis_biaya FOR INSERT TO authenticated
  WITH CHECK (transport.is_active_admin());
DROP POLICY IF EXISTS "staf_ubah_jenis_biaya" ON transport.jenis_biaya;
CREATE POLICY "staf_ubah_jenis_biaya" ON transport.jenis_biaya FOR UPDATE TO authenticated
  USING (transport.is_active_admin()) WITH CHECK (transport.is_active_admin());

-- Biaya lain: sama dengan uang jalan — staf aktif dalam cakupan job-nya.
ALTER TABLE transport.biaya_lain ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON transport.biaya_lain TO authenticated;
GRANT ALL ON transport.biaya_lain TO service_role;
REVOKE ALL ON transport.biaya_lain FROM anon;
DROP POLICY IF EXISTS "staf_baca_biaya_lain" ON transport.biaya_lain;
CREATE POLICY "staf_baca_biaya_lain" ON transport.biaya_lain FOR SELECT TO authenticated
  USING (transport.is_active_admin() AND transport.can_access_job(job_id));
DROP POLICY IF EXISTS "staf_tambah_biaya_lain" ON transport.biaya_lain;
CREATE POLICY "staf_tambah_biaya_lain" ON transport.biaya_lain FOR INSERT TO authenticated
  WITH CHECK (transport.is_active_admin() AND transport.can_access_job(job_id));
DROP POLICY IF EXISTS "staf_ubah_biaya_lain" ON transport.biaya_lain;
CREATE POLICY "staf_ubah_biaya_lain" ON transport.biaya_lain FOR UPDATE TO authenticated
  USING (transport.is_active_admin() AND transport.can_access_job(job_id))
  WITH CHECK (transport.is_active_admin() AND transport.can_access_job(job_id));

-- ── 5. Label log sistem: salinan definisi terkini (20261003000001) + 2 baris ─
CREATE OR REPLACE FUNCTION transport._log_label(p_tabel TEXT, p_baris JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = transport, extensions
AS $$
  SELECT CASE p_tabel
    WHEN 'transport.customers'           THEN 'Customer '             || COALESCE(p_baris ->> 'nama_perusahaan', '')
    WHEN 'transport.drivers'             THEN 'Driver '               || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.units'               THEN 'Unit '                 || COALESCE(p_baris ->> 'kode_unit', '')
    WHEN 'transport.unit_trailer'        THEN 'Unit Trailer '         || COALESCE(p_baris ->> 'kode_trailer', '')
    WHEN 'transport.jenis_unit_trailer'  THEN 'Jenis Unit Trailer '   || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.jenis_unit'          THEN 'Jenis Unit '           || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.jobs'                THEN 'Job '                  || COALESCE(p_baris ->> 'job_number', '')
    WHEN 'transport.job_ganti_unit'      THEN 'Penggantian Job ('     || replace(COALESCE(p_baris ->> 'jenis', 'ganti_truk'), '_', ' ') || ')'
    WHEN 'transport.job_photos'          THEN 'Foto Job '             || COALESCE(p_baris ->> 'stage', '') || COALESCE(' ' || (p_baris ->> 'slot'), '')
    WHEN 'transport.incident_logs'       THEN 'Insiden '              || COALESCE(p_baris ->> 'tipe', '')
    WHEN 'transport.incident_photos'     THEN 'Foto Insiden'
    WHEN 'transport.service_records'     THEN 'Servis Unit '          || COALESCE(p_baris ->> 'jenis', '')
    WHEN 'transport.quotations'          THEN 'Penawaran '            || COALESCE(p_baris ->> 'quote_number', '')
    WHEN 'transport.invoices'            THEN 'Tagihan '              || COALESCE(p_baris ->> 'invoice_number', '')
    WHEN 'transport.invoice_payments'    THEN 'Pembayaran Tagihan Rp ' || COALESCE(p_baris ->> 'jumlah', '')
    WHEN 'transport.uang_jalan'          THEN 'Uang Jalan '           || COALESCE(p_baris ->> 'jenis', '') || ' Rp ' || COALESCE(p_baris ->> 'jumlah', '')
    WHEN 'transport.uang_jalan_requests' THEN 'Pengajuan Uang Jalan Rp ' || COALESCE(p_baris ->> 'nominal', '')
    WHEN 'transport.sumber_dana'         THEN 'Sumber Dana '          || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.profiles'            THEN 'Pengguna '             || COALESCE(p_baris ->> 'email', '')
    WHEN 'transport.penjualan_unit'      THEN 'Penjualan '            || COALESCE(p_baris ->> 'nama_pembeli', '')
    WHEN 'transport.penghapusan_aset'    THEN 'Penghapusan '          || COALESCE(p_baris ->> 'jenis_aset', '')
    WHEN 'hr.karyawan'                   THEN 'Karyawan '             || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.asuransi'                 THEN 'Asuransi '              || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.asuransi_pic'             THEN 'PIC Asuransi '          || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.asuransi_bengkel_rekanan' THEN 'Bengkel Rekanan '       || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.polis_asuransi'           THEN 'Polis Asuransi '        || COALESCE(p_baris ->> 'nomor_polis', '')
    WHEN 'transport.bengkel'                  THEN 'Bengkel '               || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.mekanik'                  THEN 'Mekanik'
    WHEN 'transport.perintah_kerja'           THEN 'Perintah Kerja '        || COALESCE(p_baris ->> 'nomor', '')
    WHEN 'transport.perintah_kerja_mekanik'   THEN 'Mekanik Perintah Kerja'
    WHEN 'transport.perintah_kerja_jasa'      THEN 'Jasa Perintah Kerja '   || COALESCE(p_baris ->> 'uraian', '')
    WHEN 'transport.perintah_kerja_sparepart' THEN 'Sparepart Perintah Kerja ' || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.perintah_kerja_biaya_lain' THEN 'Biaya Lain Perintah Kerja ' || COALESCE(p_baris ->> 'uraian', '')
    WHEN 'transport.perintah_kerja_foto'      THEN 'Foto Perintah Kerja'
    WHEN 'transport.klaim_asuransi'           THEN 'Klaim Asuransi '        || COALESCE(p_baris ->> 'nomor_klaim', '')
    WHEN 'transport.approval_fitur'           THEN 'Mode Approval '         || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.approver'                 THEN 'Approver '              || COALESCE(p_baris ->> 'fitur_kode', '')
    WHEN 'transport.proyek'                   THEN 'Proyek '                || COALESCE(p_baris ->> 'nomor_proyek', '')
    WHEN 'transport.kasbon_driver'            THEN 'Kasbon Supir Rp '       || COALESCE(p_baris ->> 'jumlah', '')
    WHEN 'transport.sales'                    THEN 'Sales '                 || COALESCE(p_baris ->> 'nama', '')
    -- Baru (20261003000009)
    WHEN 'transport.jenis_biaya'              THEN 'Jenis Biaya '           || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.biaya_lain'               THEN 'Biaya Lain Job Rp '     || COALESCE(p_baris ->> 'nominal', '')
  END;
$$;

-- ── 6. Laba tahunan: biaya lainnya = biaya lain job; repair tidak dihitung ──
DROP FUNCTION IF EXISTS transport.get_laba_insiden(INT);

DROP FUNCTION IF EXISTS transport.get_laba_tahunan(INT);
CREATE OR REPLACE FUNCTION transport.get_laba_tahunan(p_tahun INT)
RETURNS TABLE(
  bulan                    INT,
  jumlah_tagihan           INT,
  jumlah_proyek            INT,
  omset                    BIGINT,
  dibayar                  BIGINT,
  uang_jalan               BIGINT,
  biaya_lainnya            BIGINT,
  jumlah_kosongan          INT,
  uang_jalan_kosongan      BIGINT,
  biaya_lainnya_kosongan   BIGINT
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
           SUM(COALESCE(uj.bersih, 0)) FILTER (WHERE pb.kosongan)           AS uang_jalan_kosongan,
           SUM(COALESCE(bl.nominal, 0)) FILTER (WHERE NOT pb.kosongan)      AS biaya_lainnya,
           SUM(COALESCE(bl.nominal, 0)) FILTER (WHERE pb.kosongan)          AS biaya_lainnya_kosongan
      FROM transport._laba_proyek_bulan(p_tahun) pb
      LEFT JOIN transport.jobs j
        ON j.proyek_id = pb.proyek_id AND j.status = 1 AND j.status_job <> 'cancelled'
      LEFT JOIN LATERAL (
        -- Kasbon tidak mengurangi biaya uang jalan (sama dengan get_job_profitability).
        SELECT SUM(CASE WHEN x.jenis = 'pencairan' THEN x.jumlah ELSE -x.jumlah END) AS bersih
          FROM transport.uang_jalan x
         WHERE x.job_id = j.id AND x.status = 1 AND x.jenis IN ('pencairan', 'pengembalian')
      ) uj ON true
      LEFT JOIN LATERAL (
        SELECT SUM(b.nominal) AS nominal
          FROM transport.biaya_lain b
         WHERE b.job_id = j.id AND b.status = 1
      ) bl ON true
     GROUP BY pb.bulan
  )
  SELECT
    b.bulan,
    COALESCE(o.jumlah, 0),
    COALESCE(c.jumlah_proyek, 0),
    COALESCE(o.omset, 0)::BIGINT,
    COALESCE(o.dibayar, 0)::BIGINT,
    COALESCE(c.uang_jalan, 0)::BIGINT,
    COALESCE(c.biaya_lainnya, 0)::BIGINT,
    COALESCE(c.jumlah_kosongan, 0),
    COALESCE(c.uang_jalan_kosongan, 0)::BIGINT,
    COALESCE(c.biaya_lainnya_kosongan, 0)::BIGINT
  FROM bln b
  LEFT JOIN omset o ON o.bulan = b.bulan
  LEFT JOIN biaya c ON c.bulan = b.bulan
  ORDER BY b.bulan;
$$;
REVOKE ALL ON FUNCTION transport.get_laba_tahunan(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.get_laba_tahunan(INT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
