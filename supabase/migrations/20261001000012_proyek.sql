-- ============================================================================
-- Migration 20261001000012: Proyek — induk dari Job
--
-- Model akhir
--   * transport.proyek — ringkas: id, nomor_proyek, customer_id, pic_nama,
--     pic_no_hp, created_by (pengguna), created_at (+ status soft delete,
--     wajib untuk semua tabel aplikasi).
--   * transport.jobs   — kolom baru `proyek_id` (WAJIB). Customer, PIC
--     lapangan, dan No HP PIC DIPINDAH ke proyek: kolom jobs.customer_id,
--     jobs.pic_nama, jobs.pic_no_hp dihapus supaya tidak dobel.
--
-- Nomor proyek otomatis: 001/PRJ/MAS/X/2026 — urut/kode/MAS/bulan romawi/tahun.
-- Nomor urut di-RESET setiap awal bulan (counter per bulan di
-- document_counters, doc_type 'proyek-MM'). Nomor tidak dipakai ulang.
--
-- BATASAN (dijaga di database; backend & form ikut menjaga — lihat
-- backend/app/modules/proyek & frontend/src/features/proyek):
--   1. Setiap job wajib terhubung ke proyek (jobs.proyek_id NOT NULL).
--   2. Proyek aktif wajib punya minimal 1 job aktif — dicek di akhir transaksi
--      (constraint trigger DEFERRED), jadi proyek baru harus disimpan
--      bersama job pertamanya dalam SATU transaksi.
--   3. Job tidak bisa dipindah ke proyek lain setelah dibuat.
--   4. Customer proyek BOLEH kosong (unit jalan kosongan). Customer proyek
--      tidak bisa diganti bila salah satu jobnya sudah masuk tagihan aktif
--      (data customer tagihan sudah di-snapshot).
--   5. Nomor proyek dibuat sistem — tidak bisa diisi / diubah manual.
--   6. Satu proyek hanya boleh masuk SATU tagihan (invoice) yang tidak batal;
--      satu tagihan boleh berisi banyak proyek.
--   7. Proyek tidak bisa dihapus selama masih punya job aktif.
--   (PIC & No HP wajib bila customer diisi — dijaga backend & form.)
--
-- DATA LAMA: setiap job lama dibuatkan 1 proyek sendiri berisi customer, PIC,
-- dan No HP PIC job itu (nomor mengikuti bulan job dibuat, urut waktu dibuat).
-- Job terhapus (status 2) mendapat proyek berstatus 2. Bila satu proyek
-- berisi beberapa job dengan PIC berbeda (hanya mungkin bila versi awal
-- migrasi ini sudah dijalankan), PIC job pertama dipakai proyek dan PIC job
-- lain disalin ke catatan job-nya, jadi tidak ada data yang hilang.
-- Semua perubahan tercatat di log sistem atas nama superadmin aktif pertama.
--
-- AMAN DIJALANKAN ULANG, dan aman di database yang sudah menjalankan versi
-- awal file ini (kolom nama_proyek/catatan/is_historis/seq_* ikut dibuang).
-- WAJIB: jalankan setelah 20261001000011. Naikkan backend, frontend, dan
-- aplikasi mobile tidak perlu diubah (API tetap mengirim customer & PIC job).
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Tabel proyek ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.proyek (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor_proyek  TEXT NOT NULL,
  -- Kosong = proyek tanpa customer (unit jalan kosongan).
  customer_id   UUID REFERENCES transport.customers(id),
  pic_nama      TEXT,
  pic_no_hp     TEXT,
  -- Author: pengguna yang membuat proyek.
  created_by    UUID REFERENCES transport.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        SMALLINT NOT NULL DEFAULT 1 CONSTRAINT proyek_status_check CHECK (status IN (1, 2))
);
COMMENT ON TABLE transport.proyek IS 'Proyek: induk dari job (customer & PIC lapangan). 1 proyek = minimal 1 job; maksimal 1 tagihan.';

-- Penyesuaian bila versi awal file ini sudah pernah dijalankan.
ALTER TABLE transport.proyek ADD COLUMN IF NOT EXISTS pic_nama TEXT;
ALTER TABLE transport.proyek ADD COLUMN IF NOT EXISTS pic_no_hp TEXT;
ALTER TABLE transport.proyek ALTER COLUMN customer_id DROP NOT NULL;
DROP TRIGGER IF EXISTS trg_proyek_isi_nomor ON transport.proyek;
DROP TRIGGER IF EXISTS trg_proyek_updated_at ON transport.proyek;
DROP INDEX IF EXISTS transport.idx_proyek_periode;

CREATE UNIQUE INDEX IF NOT EXISTS proyek_nomor_unique ON transport.proyek (nomor_proyek) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_proyek_customer ON transport.proyek (customer_id, created_at DESC) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_proyek_created ON transport.proyek (created_at DESC) WHERE status = 1;

ALTER TABLE transport.jobs
  ADD COLUMN IF NOT EXISTS proyek_id UUID REFERENCES transport.proyek(id);
CREATE INDEX IF NOT EXISTS idx_jobs_proyek ON transport.jobs (proyek_id);
DROP TRIGGER IF EXISTS trg_jobs_cek_proyek ON transport.jobs;

-- ── 2. Penomoran (reset tiap bulan) ─────────────────────────────────────────
-- Counter per bulan memakai document_counters (PK doc_type + tahun) dengan
-- doc_type 'proyek-01' … 'proyek-12'. UPDATE … RETURNING mengunci baris
-- counter, jadi dua admin yang menyimpan bersamaan tetap dapat nomor berbeda.
CREATE OR REPLACE FUNCTION transport.next_nomor_proyek(p_waktu TIMESTAMPTZ)
RETURNS TABLE (nomor TEXT, seq INTEGER, bulan INTEGER, tahun INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
-- Kolom keluaran `tahun` bernama sama dengan kolom document_counters.
#variable_conflict use_column
DECLARE
  v_tanggal DATE := (COALESCE(p_waktu, now()) AT TIME ZONE 'Asia/Jakarta')::date;
  v_tahun   INTEGER := EXTRACT(YEAR FROM v_tanggal)::INTEGER;
  v_bulan   INTEGER := EXTRACT(MONTH FROM v_tanggal)::INTEGER;
  v_seq     INTEGER;
BEGIN
  INSERT INTO transport.document_counters (doc_type, tahun, last_seq)
  VALUES ('proyek-' || LPAD(v_bulan::TEXT, 2, '0'), v_tahun, 1)
  ON CONFLICT (doc_type, tahun) DO UPDATE
    SET last_seq = transport.document_counters.last_seq + 1, updated_at = now()
  RETURNING transport.document_counters.last_seq INTO v_seq;

  RETURN QUERY SELECT
    -- 3 digit (001); bulan dengan ≥1000 proyek tetap tampil utuh (LPAD memotong).
    CASE WHEN v_seq < 1000 THEN LPAD(v_seq::TEXT, 3, '0') ELSE v_seq::TEXT END
      || '/PRJ/MAS/' || transport.to_roman_month(v_bulan) || '/' || v_tahun::TEXT,
    v_seq, v_bulan, v_tahun;
END;
$$;
REVOKE ALL ON FUNCTION transport.next_nomor_proyek(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- BATASAN 5: nomor selalu dari sistem. Waktu dibuat dikunci ke now() supaya
-- bulan pada nomor tidak bisa diakali — kecuali saat migrasi data lama
-- (setting `app.proyek_historis`, tidak bisa dipasang lewat API:
-- jalankan_transaksi hanya menerima app.status_note).
-- BATASAN 4: customer tidak bisa diganti bila proyek sudah masuk tagihan aktif.
CREATE OR REPLACE FUNCTION transport.proyek_isi_nomor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_invoice TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(current_setting('app.proyek_historis', true), '') <> 'on' THEN
      NEW.created_at := now();
    END IF;
    SELECT n.nomor INTO NEW.nomor_proyek FROM transport.next_nomor_proyek(NEW.created_at) n;
    RETURN NEW;
  END IF;

  IF NEW.nomor_proyek IS DISTINCT FROM OLD.nomor_proyek OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Nomor & tanggal proyek dibuat sistem dan tidak bisa diubah.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    SELECT i.invoice_number INTO v_invoice
      FROM transport.invoice_items it
      JOIN transport.invoices i ON i.id = it.invoice_id
      JOIN transport.jobs j ON j.id = it.job_id
     WHERE j.proyek_id = OLD.id AND it.status = 1 AND i.status = 1 AND i.status_tagihan <> 'batal'
     LIMIT 1;
    IF v_invoice IS NOT NULL THEN
      RAISE EXCEPTION 'Customer proyek % tidak bisa diganti karena sudah masuk tagihan %.', OLD.nomor_proyek, v_invoice
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.proyek_isi_nomor() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_proyek_isi_nomor
  BEFORE INSERT OR UPDATE OF nomor_proyek, created_at, customer_id ON transport.proyek
  FOR EACH ROW EXECUTE FUNCTION transport.proyek_isi_nomor();

-- ── 3. Penjaga relasi job → proyek ──────────────────────────────────────────
-- BATASAN 1 & 3: job aktif wajib punya proyek (aktif saat job dibuat), dan
-- proyek_id tidak bisa diganti setelah terisi.
CREATE OR REPLACE FUNCTION transport.jobs_cek_proyek()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_proyek transport.proyek%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.proyek_id IS NOT NULL
     AND NEW.proyek_id IS DISTINCT FROM OLD.proyek_id THEN
    RAISE EXCEPTION 'Job % tidak bisa dipindah ke proyek lain.', OLD.job_number USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.proyek_id IS NULL THEN
    -- Kolom NOT NULL menolak job tanpa proyek; pesan ini untuk kejelasan.
    RAISE EXCEPTION 'Job wajib terhubung ke proyek.' USING ERRCODE = 'not_null_violation';
  END IF;
  SELECT * INTO v_proyek FROM transport.proyek WHERE id = NEW.proyek_id;
  IF v_proyek.id IS NULL THEN
    RAISE EXCEPTION 'Proyek tidak ditemukan.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status = 1 AND v_proyek.status <> 1 THEN
    RAISE EXCEPTION 'Proyek % sudah dihapus — job tidak bisa ditambahkan.', v_proyek.nomor_proyek
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.jobs_cek_proyek() FROM PUBLIC, anon, authenticated;
-- Trigger dipasang SETELAH data lama terisi (bagian 7).

-- BATASAN 2: proyek aktif minimal punya 1 job aktif. DEFERRED = dicek saat
-- COMMIT, sehingga "simpan proyek lalu job-jobnya" dalam satu transaksi lolos,
-- sedangkan proyek tanpa job (atau job terakhir yang dihapus tanpa menghapus
-- proyeknya) membatalkan seluruh transaksi.
CREATE OR REPLACE FUNCTION transport.proyek_cek_punya_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_proyek_id UUID;
  v_nomor     TEXT;
BEGIN
  -- Dipicu dari dua tabel: baris proyek itu sendiri, atau job yang dihapus.
  IF TG_TABLE_NAME = 'proyek' THEN
    v_proyek_id := NEW.id;
  ELSE
    v_proyek_id := OLD.proyek_id;
  END IF;
  IF v_proyek_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT nomor_proyek INTO v_nomor FROM transport.proyek WHERE id = v_proyek_id AND status = 1;
  IF v_nomor IS NULL THEN
    RETURN NULL;  -- proyek sudah dihapus: tidak perlu job
  END IF;
  IF NOT EXISTS (SELECT 1 FROM transport.jobs WHERE proyek_id = v_proyek_id AND status = 1) THEN
    RAISE EXCEPTION 'Proyek % wajib memiliki minimal 1 job.', v_nomor USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION transport.proyek_cek_punya_job() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_proyek_wajib_punya_job ON transport.proyek;
CREATE CONSTRAINT TRIGGER trg_proyek_wajib_punya_job
  AFTER INSERT OR UPDATE OF status ON transport.proyek
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.status = 1)
  EXECUTE FUNCTION transport.proyek_cek_punya_job();

DROP TRIGGER IF EXISTS trg_jobs_proyek_tetap_punya_job ON transport.jobs;
CREATE CONSTRAINT TRIGGER trg_jobs_proyek_tetap_punya_job
  AFTER UPDATE OF status ON transport.jobs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.proyek_cek_punya_job();

-- ── 4. Satu proyek = satu tagihan ───────────────────────────────────────────
-- BATASAN 6: semua job satu proyek yang ditagihkan harus berada di tagihan
-- yang sama (tagihan batal / terhapus tidak dihitung). Satu tagihan boleh
-- berisi job dari banyak proyek. Backend & form tagihan ikut menjaga.
CREATE OR REPLACE FUNCTION transport._cek_proyek_satu_tagihan(p_job_id UUID, p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_proyek_id UUID;
  v_proyek    TEXT;
  v_nomor     TEXT;
BEGIN
  SELECT j.proyek_id, p.nomor_proyek INTO v_proyek_id, v_proyek
    FROM transport.jobs j JOIN transport.proyek p ON p.id = j.proyek_id
   WHERE j.id = p_job_id;
  IF v_proyek_id IS NULL THEN
    RETURN;
  END IF;
  -- Kunci per proyek: dua tagihan yang disimpan bersamaan tidak bisa sama-sama lolos.
  PERFORM pg_advisory_xact_lock(hashtext('tagihan-proyek:' || v_proyek_id::text));

  SELECT i.invoice_number INTO v_nomor
    FROM transport.invoice_items it
    JOIN transport.invoices i ON i.id = it.invoice_id
    JOIN transport.jobs j ON j.id = it.job_id
   WHERE j.proyek_id = v_proyek_id
     AND it.status = 1
     AND it.invoice_id <> p_invoice_id
     AND i.status = 1
     AND i.status_tagihan <> 'batal'
   LIMIT 1;
  IF v_nomor IS NOT NULL THEN
    RAISE EXCEPTION 'Proyek % sudah ditagihkan di tagihan %. Satu proyek hanya boleh masuk satu tagihan — tambahkan job ini ke tagihan % tersebut.',
      v_proyek, v_nomor, v_nomor USING ERRCODE = 'unique_violation';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION transport._cek_proyek_satu_tagihan(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION transport.invoice_item_cek_proyek()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_inv transport.invoices%ROWTYPE;
BEGIN
  IF NEW.job_id IS NULL OR NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.job_id IS NOT DISTINCT FROM OLD.job_id AND OLD.status = 1 THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_inv FROM transport.invoices WHERE id = NEW.invoice_id;
  IF v_inv.id IS NULL OR v_inv.status <> 1 OR v_inv.status_tagihan = 'batal' THEN
    RETURN NEW;
  END IF;
  PERFORM transport._cek_proyek_satu_tagihan(NEW.job_id, NEW.invoice_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.invoice_item_cek_proyek() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_invoice_item_cek_proyek ON transport.invoice_items;
CREATE TRIGGER trg_invoice_item_cek_proyek
  BEFORE INSERT OR UPDATE OF job_id, status ON transport.invoice_items
  FOR EACH ROW EXECUTE FUNCTION transport.invoice_item_cek_proyek();

-- Tagihan batal / terhapus yang dipulihkan: ditolak bila salah satu proyeknya
-- sudah masuk tagihan lain.
CREATE OR REPLACE FUNCTION transport.invoice_cek_proyek_saat_pulih()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NOT (
       (OLD.status_tagihan = 'batal' AND NEW.status_tagihan <> 'batal' AND NEW.status = 1)
    OR (OLD.status = 2 AND NEW.status = 1 AND NEW.status_tagihan <> 'batal')
  ) THEN
    RETURN NEW;
  END IF;
  FOR r IN SELECT job_id FROM transport.invoice_items
            WHERE invoice_id = NEW.id AND status = 1 AND job_id IS NOT NULL LOOP
    PERFORM transport._cek_proyek_satu_tagihan(r.job_id, NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.invoice_cek_proyek_saat_pulih() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_invoice_cek_proyek_saat_pulih ON transport.invoices;
CREATE TRIGGER trg_invoice_cek_proyek_saat_pulih
  BEFORE UPDATE OF status_tagihan, status ON transport.invoices
  FOR EACH ROW EXECUTE FUNCTION transport.invoice_cek_proyek_saat_pulih();

-- ── 5. Soft delete, log & akses ─────────────────────────────────────────────
-- Hapus = UPDATE status = 2 (pola 20260924000007).
DROP TRIGGER IF EXISTS trg_soft_delete ON transport.proyek;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.proyek
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
-- BATASAN 7: proyek yang masih punya job aktif ditolak dihapus (FK NO ACTION).
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.proyek;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.proyek
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.proyek;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.proyek
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();

DROP TRIGGER IF EXISTS trg_log_sistem ON transport.proyek;
CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.proyek
  FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data();

-- Staf aktif: baca & tulis (finance ditolak di backend, sama seperti job).
-- Driver: proyek dari job miliknya (PIC lapangan tampil di portal driver).
-- Publik (link tracking): proyek dari job yang token-nya cocok & masih aktif.
ALTER TABLE transport.proyek ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON transport.proyek TO authenticated;
GRANT ALL ON transport.proyek TO service_role;
REVOKE ALL ON transport.proyek FROM anon;
GRANT SELECT ON transport.proyek TO anon;
DROP POLICY IF EXISTS "staf_baca_proyek" ON transport.proyek;
CREATE POLICY "staf_baca_proyek" ON transport.proyek FOR SELECT TO authenticated
  USING (transport.is_active_admin());
DROP POLICY IF EXISTS "staf_tambah_proyek" ON transport.proyek;
CREATE POLICY "staf_tambah_proyek" ON transport.proyek FOR INSERT TO authenticated
  WITH CHECK (transport.is_active_admin());
DROP POLICY IF EXISTS "staf_ubah_proyek" ON transport.proyek;
CREATE POLICY "staf_ubah_proyek" ON transport.proyek FOR UPDATE TO authenticated
  USING (transport.is_active_admin()) WITH CHECK (transport.is_active_admin());
DROP POLICY IF EXISTS "driver_baca_proyek_job_sendiri" ON transport.proyek;
-- Tanpa `TO authenticated`: portal driver memakai role anon + header token
-- driver (current_driver_id), sama seperti policy driver_read_own_jobs.
CREATE POLICY "driver_baca_proyek_job_sendiri" ON transport.proyek FOR SELECT
  USING (proyek.status = 1 AND EXISTS (
    SELECT 1 FROM transport.jobs j
     WHERE j.proyek_id = proyek.id AND j.driver_id = transport.current_driver_id() AND j.status = 1
  ));
DROP POLICY IF EXISTS "public_read_proyek_via_jobs" ON transport.proyek;
CREATE POLICY "public_read_proyek_via_jobs" ON transport.proyek FOR SELECT
  USING (
    auth.uid() IS NULL AND proyek.status = 1 AND EXISTS (
      SELECT 1 FROM transport.jobs j
      WHERE j.proyek_id = proyek.id
        AND transport.current_share_token() IS NOT NULL
        AND j.share_token = transport.current_share_token()
        AND transport.tracking_publik_aktif(j.status_job, j.unloading_selesai_at)
        AND j.status = 1
    )
  );

-- Customer kini dibaca lewat proyek (kolom jobs.customer_id dihapus di bawah).
DROP POLICY IF EXISTS "public_read_customers_via_jobs" ON transport.customers;
CREATE POLICY "public_read_customers_via_jobs"
  ON transport.customers FOR SELECT
  USING (
    auth.uid() IS NULL AND customers.status = 1 AND EXISTS (
      SELECT 1 FROM transport.jobs j
      JOIN transport.proyek p ON p.id = j.proyek_id
      WHERE p.customer_id = customers.id
        AND transport.current_share_token() IS NOT NULL
        AND j.share_token = transport.current_share_token()
        AND transport.tracking_publik_aktif(j.status_job, j.unloading_selesai_at)
        AND j.status = 1
    )
  );
DROP POLICY IF EXISTS "driver_read_customers_of_own_jobs" ON transport.customers;
CREATE POLICY "driver_read_customers_of_own_jobs"
  ON transport.customers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM transport.jobs j
    JOIN transport.proyek p ON p.id = j.proyek_id
    WHERE p.customer_id = customers.id
      AND j.driver_id = transport.current_driver_id()
  ));

-- Label log sistem (disalin dari 20261001000009 + baris proyek).
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
    WHEN 'transport.job_ganti_unit'      THEN 'Ganti Truk Job'
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
    -- Baru (20261001000012)
    WHEN 'transport.proyek'                   THEN 'Proyek '                || COALESCE(p_baris ->> 'nomor_proyek', '')
  END;
$$;

-- ── 6. Data lama ────────────────────────────────────────────────────────────
-- Hanya berjalan selama kolom lama jobs.customer_id masih ada (sebelum
-- dihapus di bagian 7) — menjalankan ulang file ini tidak mengubah apa pun.
DO $$
DECLARE
  v_admin UUID;
  v_id    UUID;
  v_ada   BOOLEAN;
  r       RECORD;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'transport' AND table_name = 'jobs' AND column_name = 'customer_id')
    INTO v_ada;
  IF NOT v_ada THEN
    RETURN;
  END IF;
  SELECT p.karyawan_id INTO v_admin FROM transport.profiles p
   WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat pemindahan data job ke proyek.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_admin, 'Migrasi 20261001000012 (proyek)');
  -- Nomor & waktu proyek data lama mengikuti waktu job dibuat (lihat proyek_isi_nomor).
  PERFORM set_config('app.proyek_historis', 'on', true);

  -- Hanya proyek_id / catatan yang diisi: updated_at job lama dipertahankan
  -- dan tidak ada notifikasi / sinkron status unit yang ikut terpicu. Log
  -- sistem tetap mencatat setiap perubahan.
  ALTER TABLE transport.jobs DISABLE TRIGGER trg_jobs_updated_at;
  ALTER TABLE transport.jobs DISABLE TRIGGER trg_jobs_emit_notifications;
  ALTER TABLE transport.jobs DISABLE TRIGGER trg_sync_unit_status;

  -- a. Job tanpa proyek → 1 proyek per job (urut waktu dibuat → nomor urut
  --    per bulan mengikuti urutan job aslinya). Kolom lama dibaca lewat
  --    EXECUTE karena tidak ada lagi saat file ini dijalankan ulang.
  FOR r IN EXECUTE
    'SELECT j.id, j.customer_id, j.pic_nama, j.pic_no_hp, j.created_by, j.created_at, j.status
       FROM transport.jobs j
      WHERE j.proyek_id IS NULL
      ORDER BY j.created_at, j.job_number' LOOP
    INSERT INTO transport.proyek (customer_id, pic_nama, pic_no_hp, created_by, created_at, status)
    VALUES (r.customer_id, NULLIF(btrim(r.pic_nama), ''), NULLIF(btrim(r.pic_no_hp), ''),
            r.created_by, r.created_at, r.status)
    RETURNING id INTO v_id;
    UPDATE transport.jobs SET proyek_id = v_id WHERE id = r.id;
  END LOOP;

  -- b. Proyek dari versi awal migrasi ini (belum punya PIC) → PIC job pertamanya.
  EXECUTE
    'UPDATE transport.proyek p
        SET pic_nama = NULLIF(btrim(j.pic_nama), ''''), pic_no_hp = NULLIF(btrim(j.pic_no_hp), '''')
       FROM (SELECT DISTINCT ON (proyek_id) proyek_id, pic_nama, pic_no_hp
               FROM transport.jobs ORDER BY proyek_id, created_at, job_number) j
      WHERE j.proyek_id = p.id AND p.pic_nama IS NULL AND p.pic_no_hp IS NULL';

  -- c. Job yang PIC-nya berbeda dari PIC proyek → PIC-nya disalin ke catatan
  --    job supaya tidak hilang saat kolomnya dihapus.
  EXECUTE
    'UPDATE transport.jobs j
        SET catatan = concat_ws(E''\n'', NULLIF(btrim(j.catatan), ''''),
              ''PIC lapangan job ini (sebelum dipindah ke proyek): ''
              || COALESCE(NULLIF(btrim(j.pic_nama), ''''), ''-'') || '' / ''
              || COALESCE(NULLIF(btrim(j.pic_no_hp), ''''), ''-''))
       FROM transport.proyek p
      WHERE p.id = j.proyek_id
        AND (COALESCE(NULLIF(btrim(j.pic_nama), ''''), '''') IS DISTINCT FROM COALESCE(p.pic_nama, '''')
          OR COALESCE(NULLIF(btrim(j.pic_no_hp), ''''), '''') IS DISTINCT FROM COALESCE(p.pic_no_hp, ''''))';

  ALTER TABLE transport.jobs ENABLE TRIGGER trg_jobs_updated_at;
  ALTER TABLE transport.jobs ENABLE TRIGGER trg_jobs_emit_notifications;
  ALTER TABLE transport.jobs ENABLE TRIGGER trg_sync_unit_status;
  PERFORM set_config('app.proyek_historis', '', true);
  PERFORM transport.selesai_sesi_manual();
END $$;

-- ── 7. Kunci struktur akhir ─────────────────────────────────────────────────
-- Jalankan sekarang pemeriksaan "proyek minimal 1 job" yang tertunda dari
-- bagian 6; ALTER TABLE ditolak selama masih ada pemeriksaan tertunda.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE transport.jobs ALTER COLUMN proyek_id SET NOT NULL;

CREATE TRIGGER trg_jobs_cek_proyek
  BEFORE INSERT OR UPDATE OF proyek_id ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_cek_proyek();

-- Laporan laba per job: customer kini dari proyek (boleh kosong).
-- Dilewati bila versi lebih baru (20261001000014, kolom `kosongan`) sudah
-- terpasang — supaya file ini tetap aman dijalankan ulang sesudahnya.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'transport' AND p.proname = 'get_job_profitability'
                AND 'kosongan' = ANY (p.proargnames)) THEN
    RETURN;
  END IF;
  EXECUTE $ddl$CREATE OR REPLACE FUNCTION transport.get_job_profitability(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS TABLE(job_id uuid, job_number text, customer_nama text, unit_kode text, etd timestamp with time zone, status transport.job_status, pendapatan bigint, uang_jalan bigint, biaya_insiden bigint, laba bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'transport', 'extensions'
AS $function$
  -- Kolom keluaran `status` = status job (nama keluaran dipertahankan untuk API).
  SELECT
    j.id,
    j.job_number,
    COALESCE(c.nama_perusahaan, 'Tanpa customer'),
    u.kode_unit,
    j.etd,
    j.status_job,
    COALESCE(inv.pendapatan, 0)      AS pendapatan,
    COALESCE(uj.dicairkan, 0)        AS uang_jalan,
    COALESCE(ins.biaya, 0)           AS biaya_insiden,
    COALESCE(inv.pendapatan, 0)
      - COALESCE(uj.dicairkan, 0)
      - COALESCE(ins.biaya, 0)       AS laba
  FROM transport.jobs j
  JOIN transport.proyek p ON p.id = j.proyek_id
  LEFT JOIN transport.customers c ON c.id = p.customer_id
  JOIN transport.units u ON u.id = j.unit_id
  LEFT JOIN LATERAL (
    SELECT SUM(ii.subtotal) AS pendapatan
    FROM transport.invoice_items ii
    JOIN transport.invoices i ON i.id = ii.invoice_id
    WHERE ii.job_id = j.id AND ii.status = 1 AND i.status = 1 AND i.status_tagihan <> 'batal'
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT SUM(x.jumlah) AS dicairkan
    FROM transport.uang_jalan x
    WHERE x.job_id = j.id AND x.status = 1 AND x.jenis = 'pencairan'
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
$function$$ddl$;
END $do$;

-- Customer, PIC, dan No HP PIC sekarang hanya di proyek.
ALTER TABLE transport.jobs DROP COLUMN IF EXISTS customer_id;
ALTER TABLE transport.jobs DROP COLUMN IF EXISTS pic_nama;
ALTER TABLE transport.jobs DROP COLUMN IF EXISTS pic_no_hp;
-- Kolom versi awal file ini yang tidak dipakai lagi (tabel proyek dibuat ringkas).
ALTER TABLE transport.proyek DROP COLUMN IF EXISTS nama_proyek;
ALTER TABLE transport.proyek DROP COLUMN IF EXISTS catatan;
ALTER TABLE transport.proyek DROP COLUMN IF EXISTS is_historis;
ALTER TABLE transport.proyek DROP COLUMN IF EXISTS seq_no;
ALTER TABLE transport.proyek DROP COLUMN IF EXISTS seq_bulan;
ALTER TABLE transport.proyek DROP COLUMN IF EXISTS seq_tahun;
ALTER TABLE transport.proyek DROP COLUMN IF EXISTS updated_at;

-- ── 8. Daftar proyek (Tab Proyek) ───────────────────────────────────────────
-- Paging LIMIT/OFFSET + total lewat count(*) OVER (). SECURITY INVOKER: RLS
-- job tetap berlaku (operator hanya menghitung job unit yang boleh dilihat).
--   p_customer_id  : filter customer; p_tanpa_customer = true → hanya proyek
--                    tanpa customer (kosongan).
--   p_bulan/p_tahun: bulan & tahun proyek dibuat (WIB) — sama dengan nomornya.
--   p_status_tagih : 'belum' / 'sudah' masuk tagihan aktif; NULL = semua.
--   p_limit        : -1 = semua (dibatasi 5000 baris, sama seperti paging lain).
DROP FUNCTION IF EXISTS transport.daftar_proyek(TEXT, UUID, INTEGER, INTEGER, TEXT, INTEGER, INTEGER);
-- Dilewati bila versi lebih baru (20261001000014, kolom `unit_kode`) sudah
-- terpasang — supaya file ini tetap aman dijalankan ulang sesudahnya.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'transport' AND p.proname = 'daftar_proyek'
                AND 'unit_kode' = ANY (p.proargnames)) THEN
    RETURN;
  END IF;
  EXECUTE $ddl$CREATE OR REPLACE FUNCTION transport.daftar_proyek(
  p_q              TEXT    DEFAULT NULL,
  p_customer_id    UUID    DEFAULT NULL,
  p_tanpa_customer BOOLEAN DEFAULT false,
  p_bulan          INTEGER DEFAULT NULL,
  p_tahun          INTEGER DEFAULT NULL,
  p_status_tagih   TEXT    DEFAULT NULL,
  p_limit          INTEGER DEFAULT 10,
  p_offset         INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                 UUID,
  nomor_proyek       TEXT,
  customer_id        UUID,
  customer_nama      TEXT,
  pic_nama           TEXT,
  pic_no_hp          TEXT,
  created_by_nama    TEXT,
  created_at         TIMESTAMPTZ,
  jumlah_job         INTEGER,
  jumlah_job_selesai INTEGER,
  jumlah_job_batal   INTEGER,
  invoice_id         UUID,
  invoice_number     TEXT,
  total              BIGINT
)
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  WITH tagihan AS (
    -- Tagihan aktif (tidak batal) per proyek — maksimal satu (BATASAN 6).
    SELECT DISTINCT ON (j.proyek_id) j.proyek_id, i.id AS invoice_id, i.invoice_number
      FROM transport.invoice_items it
      JOIN transport.invoices i ON i.id = it.invoice_id
      JOIN transport.jobs j ON j.id = it.job_id
     WHERE it.status = 1 AND i.status = 1 AND i.status_tagihan <> 'batal' AND j.status = 1
     ORDER BY j.proyek_id, i.created_at
  ),
  hitung AS (
    SELECT j.proyek_id,
           count(*)::INTEGER AS jumlah_job,
           count(*) FILTER (WHERE j.status_job = 'selesai')::INTEGER AS jumlah_job_selesai,
           count(*) FILTER (WHERE j.status_job = 'cancelled')::INTEGER AS jumlah_job_batal
      FROM transport.jobs j
     WHERE j.status = 1
     GROUP BY j.proyek_id
  ),
  kata AS (
    SELECT NULLIF(btrim(COALESCE(p_q, '')), '') AS q
  )
  SELECT p.id, p.nomor_proyek, p.customer_id, c.nama_perusahaan, p.pic_nama, p.pic_no_hp,
         pr.nama, p.created_at,
         COALESCE(h.jumlah_job, 0), COALESCE(h.jumlah_job_selesai, 0), COALESCE(h.jumlah_job_batal, 0),
         t.invoice_id, t.invoice_number,
         count(*) OVER ()
    FROM transport.proyek p
    LEFT JOIN transport.customers c ON c.id = p.customer_id
    LEFT JOIN transport.profiles pr ON pr.id = p.created_by
    LEFT JOIN hitung h ON h.proyek_id = p.id
    LEFT JOIN tagihan t ON t.proyek_id = p.id
    CROSS JOIN kata
   WHERE p.status = 1
     AND (p_customer_id IS NULL OR p.customer_id = p_customer_id)
     AND (NOT COALESCE(p_tanpa_customer, false) OR p.customer_id IS NULL)
     AND (p_bulan IS NULL OR EXTRACT(MONTH FROM p.created_at AT TIME ZONE 'Asia/Jakarta') = p_bulan)
     AND (p_tahun IS NULL OR EXTRACT(YEAR FROM p.created_at AT TIME ZONE 'Asia/Jakarta') = p_tahun)
     AND (p_status_tagih IS NULL
          OR (p_status_tagih = 'sudah' AND t.invoice_id IS NOT NULL)
          OR (p_status_tagih = 'belum' AND t.invoice_id IS NULL))
     AND (kata.q IS NULL
          OR p.nomor_proyek ILIKE '%' || kata.q || '%'
          OR c.nama_perusahaan ILIKE '%' || kata.q || '%'
          OR p.pic_nama ILIKE '%' || kata.q || '%'
          OR EXISTS (SELECT 1 FROM transport.jobs j
                      WHERE j.proyek_id = p.id AND j.status = 1
                        AND j.job_number ILIKE '%' || kata.q || '%'))
   ORDER BY p.created_at DESC, p.nomor_proyek DESC
   LIMIT CASE WHEN p_limit IS NULL OR p_limit < 0 THEN 5000 ELSE LEAST(p_limit, 5000) END
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$$ddl$;
  EXECUTE $ddl$REVOKE ALL ON FUNCTION transport.daftar_proyek(TEXT, UUID, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon$ddl$;
  EXECUTE $ddl$GRANT EXECUTE ON FUNCTION transport.daftar_proyek(TEXT, UUID, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) TO authenticated, service_role$ddl$;
END $do$;

NOTIFY pgrst, 'reload schema';
