-- ============================================================================
-- Migration 20260930000001: master Asuransi + polis asuransi per unit / trailer
--
--   * transport.asuransi                 — perusahaan asuransi
--   * transport.asuransi_pic             — PIC yang bisa dihubungi (bisa banyak,
--                                          tepat satu PIC utama)
--   * transport.asuransi_bengkel_rekanan — bengkel rekanan asuransi (opsional)
--   * transport.polis_asuransi           — polis yang melindungi satu unit ATAU
--                                          satu unit trailer; periode polis satu
--                                          aset tidak boleh bentrok.
--
-- AMAN UNTUK KODE LAMA: hanya menambah tabel & fungsi baru (plus salinan
-- `_log_label` dengan baris tambahan). Tidak ada kolom / tabel lama yang
-- diubah, dan tidak ada data yang dipindah.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Asuransi ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.asuransi (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        TEXT NOT NULL CONSTRAINT asuransi_nama_check CHECK (btrim(nama) <> ''),
  alamat      TEXT,
  telepon     TEXT,
  email       TEXT,
  catatan     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES transport.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      SMALLINT NOT NULL DEFAULT 1 CONSTRAINT asuransi_status_check CHECK (status IN (1, 2))
);
COMMENT ON COLUMN transport.asuransi.status IS '1 = aktif, 2 = dihapus (soft delete)';
CREATE UNIQUE INDEX IF NOT EXISTS asuransi_nama_unique
  ON transport.asuransi (lower(btrim(nama))) WHERE status = 1;

CREATE TABLE IF NOT EXISTS transport.asuransi_pic (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asuransi_id  UUID NOT NULL REFERENCES transport.asuransi(id) ON DELETE CASCADE,
  sapaan       TEXT CONSTRAINT asuransi_pic_sapaan_check CHECK (sapaan IS NULL OR sapaan IN ('Bapak', 'Ibu')),
  nama         TEXT NOT NULL CONSTRAINT asuransi_pic_nama_check CHECK (btrim(nama) <> ''),
  jabatan      TEXT,
  no_hp        TEXT NOT NULL CONSTRAINT asuransi_pic_no_hp_check CHECK (btrim(no_hp) <> ''),
  email        TEXT,
  is_utama     BOOLEAN NOT NULL DEFAULT false,
  urutan       INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       SMALLINT NOT NULL DEFAULT 1 CONSTRAINT asuransi_pic_status_check CHECK (status IN (1, 2))
);
CREATE INDEX IF NOT EXISTS idx_asuransi_pic_asuransi ON transport.asuransi_pic (asuransi_id) WHERE status = 1;
-- Paling banyak satu PIC utama per asuransi (minimal satu dijaga backend).
CREATE UNIQUE INDEX IF NOT EXISTS asuransi_pic_utama_unique
  ON transport.asuransi_pic (asuransi_id) WHERE status = 1 AND is_utama;

CREATE TABLE IF NOT EXISTS transport.asuransi_bengkel_rekanan (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asuransi_id  UUID NOT NULL REFERENCES transport.asuransi(id) ON DELETE CASCADE,
  nama         TEXT NOT NULL CONSTRAINT asuransi_bengkel_rekanan_nama_check CHECK (btrim(nama) <> ''),
  alamat       TEXT,
  kontak       TEXT,
  urutan       INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       SMALLINT NOT NULL DEFAULT 1 CONSTRAINT asuransi_bengkel_rekanan_status_check CHECK (status IN (1, 2))
);
CREATE INDEX IF NOT EXISTS idx_asuransi_bengkel_rekanan_asuransi
  ON transport.asuransi_bengkel_rekanan (asuransi_id) WHERE status = 1;

-- ── 2. Polis asuransi (link unit / unit trailer ↔ asuransi) ─────────────────
CREATE TABLE IF NOT EXISTS transport.polis_asuransi (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Asuransi yang sudah dipakai polis tidak bisa dihapus (nonaktifkan saja).
  asuransi_id          UUID NOT NULL REFERENCES transport.asuransi(id),
  -- Aset dihapus (hanya bila tanpa riwayat) → polisnya ikut terhapus.
  unit_id              UUID REFERENCES transport.units(id) ON DELETE CASCADE,
  unit_trailer_id      UUID REFERENCES transport.unit_trailer(id) ON DELETE CASCADE,
  nomor_polis          TEXT NOT NULL CONSTRAINT polis_asuransi_nomor_check CHECK (btrim(nomor_polis) <> ''),
  jenis_pertanggungan  TEXT NOT NULL DEFAULT 'all_risk'
                       CONSTRAINT polis_asuransi_jenis_check CHECK (jenis_pertanggungan IN ('all_risk', 'tlo', 'lainnya')),
  mulai                DATE NOT NULL,
  berakhir             DATE NOT NULL,
  nilai_pertanggungan  NUMERIC(15, 2) CONSTRAINT polis_asuransi_nilai_check CHECK (nilai_pertanggungan IS NULL OR nilai_pertanggungan >= 0),
  own_risk             NUMERIC(15, 2) CONSTRAINT polis_asuransi_own_risk_check CHECK (own_risk IS NULL OR own_risk >= 0),
  premi                NUMERIC(15, 2) CONSTRAINT polis_asuransi_premi_check CHECK (premi IS NULL OR premi >= 0),
  polis_path           TEXT,
  polis_uploaded_at    TIMESTAMPTZ,
  catatan              TEXT,
  created_by           UUID REFERENCES transport.profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  status               SMALLINT NOT NULL DEFAULT 1 CONSTRAINT polis_asuransi_status_check CHECK (status IN (1, 2)),
  CONSTRAINT polis_asuransi_periode_check CHECK (berakhir >= mulai),
  CONSTRAINT polis_asuransi_aset_check CHECK (num_nonnulls(unit_id, unit_trailer_id) = 1)
);
COMMENT ON TABLE transport.polis_asuransi IS
  'Polis asuransi satu unit ATAU satu unit trailer. Periode polis aktif satu aset tidak boleh bentrok.';
CREATE INDEX IF NOT EXISTS idx_polis_asuransi_unit
  ON transport.polis_asuransi (unit_id, berakhir DESC) WHERE status = 1 AND unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_polis_asuransi_trailer
  ON transport.polis_asuransi (unit_trailer_id, berakhir DESC) WHERE status = 1 AND unit_trailer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_polis_asuransi_asuransi
  ON transport.polis_asuransi (asuransi_id) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_polis_asuransi_berakhir
  ON transport.polis_asuransi (berakhir) WHERE status = 1;

-- Periode polis satu aset tidak boleh bentrok dengan polis aktif lain.
CREATE OR REPLACE FUNCTION transport.polis_asuransi_cek_bentrok()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_nomor TEXT;
BEGIN
  IF NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  SELECT p.nomor_polis INTO v_nomor
    FROM transport.polis_asuransi p
   WHERE p.status = 1
     AND p.id <> NEW.id
     AND (CASE WHEN NEW.unit_id IS NOT NULL THEN p.unit_id = NEW.unit_id
               ELSE p.unit_trailer_id = NEW.unit_trailer_id END)
     AND daterange(p.mulai, p.berakhir, '[]') && daterange(NEW.mulai, NEW.berakhir, '[]')
   LIMIT 1;
  IF v_nomor IS NOT NULL THEN
    RAISE EXCEPTION 'Periode polis bentrok dengan polis % yang masih berlaku di rentang tanggal yang sama.', v_nomor
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_polis_asuransi_cek_bentrok ON transport.polis_asuransi;
CREATE TRIGGER trg_polis_asuransi_cek_bentrok
  BEFORE INSERT OR UPDATE OF unit_id, unit_trailer_id, mulai, berakhir, status ON transport.polis_asuransi
  FOR EACH ROW EXECUTE FUNCTION transport.polis_asuransi_cek_bentrok();

-- ── 3. updated_at, soft delete, log sistem (pola sama dengan tabel lain) ────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['asuransi', 'asuransi_pic', 'asuransi_bengkel_rekanan', 'polis_asuransi'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON transport.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON transport.%1$I
                      FOR EACH ROW EXECUTE FUNCTION transport.set_updated_at()', t);
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

-- ── 4. Akses: semua role yang login boleh membaca; superadmin & admin menulis
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['asuransi', 'asuransi_pic', 'asuransi_bengkel_rekanan', 'polis_asuransi'] LOOP
    EXECUTE format('ALTER TABLE transport.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON transport.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON transport.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON transport.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS "staf_baca_%1$s" ON transport.%1$I', t);
    EXECUTE format('CREATE POLICY "staf_baca_%1$s" ON transport.%1$I FOR SELECT TO authenticated
                      USING (transport.is_active_admin())', t);
    EXECUTE format('DROP POLICY IF EXISTS "pengelola_tambah_%1$s" ON transport.%1$I', t);
    EXECUTE format('CREATE POLICY "pengelola_tambah_%1$s" ON transport.%1$I FOR INSERT TO authenticated
                      WITH CHECK (transport.is_superadmin() OR transport.is_admin())', t);
    EXECUTE format('DROP POLICY IF EXISTS "pengelola_ubah_%1$s" ON transport.%1$I', t);
    EXECUTE format('CREATE POLICY "pengelola_ubah_%1$s" ON transport.%1$I FOR UPDATE TO authenticated
                      USING (transport.is_superadmin() OR transport.is_admin())
                      WITH CHECK (transport.is_superadmin() OR transport.is_admin())', t);
  END LOOP;
END;
$$;

-- ── 5. Label log sistem: salinan definisi terkini (20260926000008) + baris baru
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
    -- Baru (20260930000001–3)
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
  END;
$$;

NOTIFY pgrst, 'reload schema';
