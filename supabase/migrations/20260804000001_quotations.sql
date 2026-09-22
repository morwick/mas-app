-- ============================================================================
-- Migration 20260804000001: Modul Penawaran (Surat Penawaran)
--
-- Sebelum ini data komersial (tarif, PPN, harga sepakat, NPWP, termin) hanya
-- ditulis sebagai teks bebas ke jobs.catatan oleh order wizard. Akibatnya
-- angkanya tidak bisa di-query, direkap, atau dijadikan dokumen resmi.
--
-- Migration ini memindahkan data itu ke tabel sungguhan:
--   - quotations       : header surat penawaran (1 surat = 1 baris)
--   - quotation_items  : baris tabel rincian di dalam surat
--   - document_counters: sumber nomor urut dokumen, aman dari race condition
--   - customers.*      : kolom legalitas yang selama ini nyangkut di catatan
--
-- Format nomor mengikuti arsip berjalan PT Mitra Angkutan Sejati:
--   0017/SK/MAS/I/2026  →  urut 4 digit / SK / MAS / bulan romawi / tahun
-- Urutan di-reset tiap tahun dan khusus dokumen penawaran (dikonfirmasi user).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enum status penawaran
--
--   draft       → masih disusun admin, belum dikirim, nomor SUDAH terpakai
--   terkirim    → sudah dikirim ke customer, menunggu jawaban
--   deal        → customer setuju, siap diangkat jadi job
--   ditolak     → customer tidak setuju (alasan dicatat untuk follow-up)
--   kedaluwarsa → lewat berlaku_sampai tanpa jawaban
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE quotation_status AS ENUM (
    'draft', 'terkirim', 'deal', 'ditolak', 'kedaluwarsa'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- customers: kolom legalitas & billing
--
-- Sebelumnya field ini diketik ulang di tiap order lalu ditumpuk ke
-- jobs.catatan. Dipindah ke master customer supaya cukup diisi sekali.
-- ---------------------------------------------------------------------------
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS kota          TEXT,          -- untuk baris "Di ____" di surat
  ADD COLUMN IF NOT EXISTS npwp          TEXT,
  ADD COLUMN IF NOT EXISTS nib           TEXT,
  ADD COLUMN IF NOT EXISTS status_pkp    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS termin_hari   INTEGER,       -- NULL = cash / belum diatur
  ADD COLUMN IF NOT EXISTS pic_sapaan    TEXT,          -- 'Bapak' | 'Ibu'
  ADD COLUMN IF NOT EXISTS pic_nama      TEXT,
  ADD COLUMN IF NOT EXISTS pic_jabatan   TEXT,
  ADD COLUMN IF NOT EXISTS pic_no_hp     TEXT,
  ADD COLUMN IF NOT EXISTS pic_email     TEXT;

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_pic_sapaan_check;
ALTER TABLE customers ADD CONSTRAINT customers_pic_sapaan_check
  CHECK (pic_sapaan IS NULL OR pic_sapaan IN ('Bapak', 'Ibu'));

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_termin_check;
ALTER TABLE customers ADD CONSTRAINT customers_termin_check
  CHECK (termin_hari IS NULL OR termin_hari >= 0);

-- ---------------------------------------------------------------------------
-- document_counters: sumber tunggal nomor urut dokumen
--
-- gen_job_number() yang lama memakai MAX(...)+1 — dua insert bersamaan bisa
-- menghasilkan nomor kembar. Untuk dokumen resmi ke customer itu tidak boleh
-- terjadi, jadi di sini dipakai UPDATE ... RETURNING pada satu baris counter.
-- Baris itu terkunci selama transaksi, sehingga penomoran dijamin unik walau
-- dua admin menekan Simpan pada detik yang sama.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_counters (
  doc_type   TEXT    NOT NULL,
  tahun      INTEGER NOT NULL,
  last_seq   INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_type, tahun)
);

-- ---------------------------------------------------------------------------
-- to_roman: 1..12 → I..XII (bulan pada nomor surat)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION to_roman_month(p_month INTEGER)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT (ARRAY[
    'I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'
  ])[p_month];
$$;

-- ---------------------------------------------------------------------------
-- next_quotation_number: ambil nomor berikutnya secara atomik
--
-- Mengembalikan nomor lengkap + komponennya, supaya seq & tahun ikut disimpan
-- di baris quotations (memudahkan sortir dan audit urutan tanpa parsing teks).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_quotation_number()
RETURNS TABLE (nomor TEXT, seq INTEGER, tahun INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tahun INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_bulan INTEGER := EXTRACT(MONTH FROM now())::INTEGER;
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
$$;

-- ---------------------------------------------------------------------------
-- quotations: header surat penawaran
--
-- Beberapa data customer di-snapshot (kota, sapaan, nama PIC) karena surat
-- yang sudah dikirim tidak boleh ikut berubah kalau master customer di-edit
-- belakangan. Nilai uang disimpan BIGINT rupiah penuh — tanpa pecahan sen,
-- sehingga tidak ada galat pembulatan floating point pada total.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number   TEXT NOT NULL UNIQUE,
  seq_no         INTEGER NOT NULL,
  seq_tahun      INTEGER NOT NULL,

  customer_id    UUID NOT NULL REFERENCES customers(id),
  customer_nama  TEXT NOT NULL,           -- snapshot nama saat surat dibuat
  customer_kota  TEXT,                    -- snapshot, untuk baris "Di ____"
  pic_sapaan     TEXT,
  pic_nama       TEXT,

  kota_terbit    TEXT NOT NULL DEFAULT 'Pekanbaru',
  tanggal        DATE NOT NULL DEFAULT CURRENT_DATE,
  berlaku_sampai DATE,
  perihal        TEXT NOT NULL DEFAULT 'Surat Penawaran Pengangkutan Alat',
  objek          TEXT,                    -- "Excavator ZX60C" di kalimat pembuka
  lampiran       TEXT,                    -- isi baris "Lamp.", biasanya "-"

  ppn_aktif      BOOLEAN NOT NULL DEFAULT true,
  ppn_persen     NUMERIC(5,2) NOT NULL DEFAULT 11,
  subtotal       BIGINT NOT NULL DEFAULT 0,
  ppn_nominal    BIGINT NOT NULL DEFAULT 0,
  total          BIGINT NOT NULL DEFAULT 0,

  status         quotation_status NOT NULL DEFAULT 'draft',
  ttd_nama       TEXT,
  ttd_jabatan    TEXT DEFAULT 'Admin',
  catatan        TEXT,                    -- catatan internal, tidak ikut dicetak
  alasan_ditolak TEXT,

  sent_at        TIMESTAMPTZ,
  decided_at     TIMESTAMPTZ,

  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_pic_sapaan_check;
ALTER TABLE quotations ADD CONSTRAINT quotations_pic_sapaan_check
  CHECK (pic_sapaan IS NULL OR pic_sapaan IN ('Bapak', 'Ibu'));

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_ppn_persen_check;
ALTER TABLE quotations ADD CONSTRAINT quotations_ppn_persen_check
  CHECK (ppn_persen >= 0 AND ppn_persen <= 100);

CREATE INDEX IF NOT EXISTS idx_quotations_status     ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_customer   ON quotations(customer_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_tanggal    ON quotations(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_seq        ON quotations(seq_tahun DESC, seq_no DESC);

-- ---------------------------------------------------------------------------
-- quotation_items: baris rincian di tabel surat
--
-- Satu surat bisa memuat banyak rute/unit — template Word yang dipakai sekarang
-- memang sudah bernomor 1, 2, 3, dst.
--
-- subtotal sengaja GENERATED: jumlah baris tidak mungkin melenceng dari
-- qty x harga_satuan, berapa pun jalur penulisannya.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotation_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  urutan        INTEGER NOT NULL DEFAULT 1,
  dari          TEXT NOT NULL,
  tujuan        TEXT NOT NULL,
  qty           INTEGER NOT NULL DEFAULT 1,
  satuan        TEXT NOT NULL DEFAULT 'Unit',
  nama_alat     TEXT,
  harga_satuan  BIGINT NOT NULL DEFAULT 0,
  subtotal      BIGINT GENERATED ALWAYS AS (qty * harga_satuan) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quotation_items DROP CONSTRAINT IF EXISTS quotation_items_qty_check;
ALTER TABLE quotation_items ADD CONSTRAINT quotation_items_qty_check
  CHECK (qty > 0);

ALTER TABLE quotation_items DROP CONSTRAINT IF EXISTS quotation_items_harga_check;
ALTER TABLE quotation_items ADD CONSTRAINT quotation_items_harga_check
  CHECK (harga_satuan >= 0);

CREATE INDEX IF NOT EXISTS idx_quotation_items_parent
  ON quotation_items(quotation_id, urutan);

-- ---------------------------------------------------------------------------
-- jobs.quotation_id: jejak job berasal dari penawaran mana
--
-- Nullable karena job lama (dan job darurat tanpa penawaran) tetap sah.
-- Nanti dipakai modul invoice untuk menarik harga tanpa ketik ulang.
-- ---------------------------------------------------------------------------
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES quotations(id);

CREATE INDEX IF NOT EXISTS idx_jobs_quotation ON jobs(quotation_id)
  WHERE quotation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Trigger: hitung ulang subtotal / PPN / total dari baris item
--
-- Total tidak pernah dipercayakan ke client. Setiap perubahan item memicu
-- perhitungan ulang di database, jadi angka yang tercetak di surat dijamin
-- sama dengan jumlah barisnya.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_quotation_totals(p_quotation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal BIGINT;
  v_ppn_aktif BOOLEAN;
  v_ppn_persen NUMERIC(5,2);
  v_ppn BIGINT;
BEGIN
  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM quotation_items WHERE quotation_id = p_quotation_id;

  SELECT ppn_aktif, ppn_persen INTO v_ppn_aktif, v_ppn_persen
  FROM quotations WHERE id = p_quotation_id;

  IF v_ppn_aktif THEN
    v_ppn := ROUND(v_subtotal * v_ppn_persen / 100.0);
  ELSE
    v_ppn := 0;
  END IF;

  UPDATE quotations
     SET subtotal    = v_subtotal,
         ppn_nominal = v_ppn,
         total       = v_subtotal + v_ppn,
         updated_at  = now()
   WHERE id = p_quotation_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_recalc_quotation_from_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_quotation_totals(OLD.quotation_id);
    RETURN OLD;
  END IF;
  PERFORM recalc_quotation_totals(NEW.quotation_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_items_recalc ON quotation_items;
CREATE TRIGGER trg_quotation_items_recalc
  AFTER INSERT OR UPDATE OR DELETE ON quotation_items
  FOR EACH ROW
  EXECUTE FUNCTION trg_recalc_quotation_from_item();

-- Perubahan setelan PPN di header juga harus memicu hitung ulang.
CREATE OR REPLACE FUNCTION trg_recalc_quotation_on_ppn_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ppn_aktif IS DISTINCT FROM OLD.ppn_aktif
     OR NEW.ppn_persen IS DISTINCT FROM OLD.ppn_persen THEN
    PERFORM recalc_quotation_totals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotations_ppn_recalc ON quotations;
CREATE TRIGGER trg_quotations_ppn_recalc
  AFTER UPDATE OF ppn_aktif, ppn_persen ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION trg_recalc_quotation_on_ppn_change();

-- updated_at
DROP TRIGGER IF EXISTS trg_quotations_updated_at ON quotations;
CREATE TRIGGER trg_quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Penawaran belum terikat unit mana pun saat dibuat, jadi scope per jenis_unit
-- (yang dipakai units/jobs) tidak bisa diterapkan di sini. Aturannya:
--   - semua admin aktif boleh baca & tulis penawaran
--   - hanya owner yang boleh menghapus, supaya nomor surat tidak hilang
--     dari arsip tanpa sepengetahuan pemilik
-- ---------------------------------------------------------------------------
ALTER TABLE quotations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_quotations" ON quotations;
CREATE POLICY "admin_read_quotations"
  ON quotations FOR SELECT USING (is_active_admin());

DROP POLICY IF EXISTS "admin_insert_quotations" ON quotations;
CREATE POLICY "admin_insert_quotations"
  ON quotations FOR INSERT WITH CHECK (is_active_admin());

DROP POLICY IF EXISTS "admin_update_quotations" ON quotations;
CREATE POLICY "admin_update_quotations"
  ON quotations FOR UPDATE
  USING (is_active_admin()) WITH CHECK (is_active_admin());

DROP POLICY IF EXISTS "owner_delete_quotations" ON quotations;
CREATE POLICY "owner_delete_quotations"
  ON quotations FOR DELETE USING (is_owner());

DROP POLICY IF EXISTS "admin_all_quotation_items" ON quotation_items;
CREATE POLICY "admin_all_quotation_items"
  ON quotation_items FOR ALL
  USING (is_active_admin()) WITH CHECK (is_active_admin());

-- Counter hanya boleh disentuh lewat next_quotation_number() (SECURITY DEFINER).
-- Tidak ada policy untuk peran biasa = tidak ada akses langsung.
DROP POLICY IF EXISTS "owner_read_counters" ON document_counters;
CREATE POLICY "owner_read_counters"
  ON document_counters FOR SELECT USING (is_owner());

-- ---------------------------------------------------------------------------
-- Seed counter agar penomoran menyambung arsip berjalan.
--
-- Surat terakhir yang tercatat manual: 0017/SK/MAS/I/2026. Tanpa baris ini
-- penawaran pertama dari sistem akan lahir sebagai 0001 dan bertabrakan
-- dengan arsip Word yang sudah ada.
-- ---------------------------------------------------------------------------
INSERT INTO document_counters (doc_type, tahun, last_seq)
VALUES ('quotation', 2026, 17)
ON CONFLICT (doc_type, tahun) DO NOTHING;
