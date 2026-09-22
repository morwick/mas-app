-- ============================================================================
-- Migration 20260805000001: Uang jalan per job
--
-- Menggantikan cara pencatatan di Excel, di mana satu job memuat cicilan uang
-- jalan sebagai penjumlahan yang diketik menumpuk dalam satu sel
-- (=6202500+863500+4602500+...) sementara tanggal dan keperluannya disimpan
-- sebagai komentar sel. Angka dan keterangannya dicocokkan berdasarkan urutan
-- secara manual, jadi tidak bisa dijumlah, dicari, atau diperiksa mesin.
--
-- Model di sini:
--   jobs.uang_jalan_pagu      → borongan awal yang disepakati ("BOR")
--   uang_jalan (pencairan)    → tiap kali uang benar-benar keluar ("TRM")
--   uang_jalan (penambahan)   → kesepakatan baru yang menaikkan pagu
--
-- Sisa pagu TIDAK disimpan. Selalu dihitung dari riwayat, supaya angkanya
-- tidak bisa melenceng dari kejadiannya.
--
-- Pencairan dan penambahan sengaja dibedakan. Kalau keduanya dicatat sama
-- rata sebagai "uang keluar", sisa pagu bisa jadi minus dan tidak ketahuan
-- mana job yang cuma dicicil dan mana yang pagunya benar-benar membengkak.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- sumber_dana — kas/rekening tempat uang jalan dikeluarkan
--
-- Di Excel ini diwakili lima kolom tetap (Q..U). Judulnya berpola
-- [bank] + [pemegang]: "BRI RIKA" = rekening BRI yang dipegang Rika.
-- kolom_excel menyimpan huruf kolomnya supaya ekspor nanti bisa menjumlahkan
-- pencairan per sumber ke kolom yang tepat — dengan begitu satu job boleh
-- dicicil berapa kali pun tanpa merusak format lama.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sumber_dana (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        TEXT NOT NULL UNIQUE,
  bank        TEXT,
  pemegang    TEXT,
  kolom_excel TEXT,
  urutan      INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_sumber_dana_updated_at ON sumber_dana;
CREATE TRIGGER trg_sumber_dana_updated_at
  BEFORE UPDATE ON sumber_dana
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed sesuai lima kolom di laporan Excel yang berjalan sekarang.
-- Dua kolom terakhir (S dan T) sepanjang Agustus 2026 bernilai nol — tetap
-- didaftarkan supaya kolomnya ada saat ekspor, tapi ditandai tidak aktif
-- supaya tidak memenuhi pilihan admin.
INSERT INTO sumber_dana (nama, bank, pemegang, kolom_excel, urutan, is_active) VALUES
  ('BRI Rika',        'BRI',     'Rika', 'U', 1, true),
  ('BRI',             'BRI',     NULL,   'R', 2, true),
  ('OA',              NULL,      'OA',   'Q', 3, true),
  ('BRI (kolom S)',   'BRI',     NULL,   'S', 4, false),
  ('Mandiri DJ',      'Mandiri', 'DJ',   'T', 5, false)
ON CONFLICT (nama) DO NOTHING;

-- ---------------------------------------------------------------------------
-- jobs.uang_jalan_pagu — borongan awal
--
-- Supir borongan: tidak ada pertanggungjawaban nota. Irit jadi haknya, boros
-- ditanggung sendiri. Jadi yang perlu dicatat cuma pagu dan pencairannya,
-- bukan realisasi biaya per pos.
-- ---------------------------------------------------------------------------
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS uang_jalan_pagu BIGINT NOT NULL DEFAULT 0;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_uang_jalan_pagu_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_uang_jalan_pagu_check
  CHECK (uang_jalan_pagu >= 0);

-- ---------------------------------------------------------------------------
-- uang_jalan
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE uang_jalan_jenis AS ENUM ('pencairan', 'penambahan_pagu');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS uang_jalan (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  jenis          uang_jalan_jenis NOT NULL DEFAULT 'pencairan',
  tanggal        DATE NOT NULL DEFAULT CURRENT_DATE,
  jumlah         BIGINT NOT NULL,
  sumber_dana_id UUID REFERENCES sumber_dana(id),
  -- Keperluan diketik bebas mengikuti kebiasaan yang sudah jalan di komentar
  -- sel Excel: "Solar Ketengan", "Dex", "Pot Hutang", atau dikosongkan.
  keperluan      TEXT,
  catatan        TEXT,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE uang_jalan DROP CONSTRAINT IF EXISTS uang_jalan_jumlah_check;
ALTER TABLE uang_jalan ADD CONSTRAINT uang_jalan_jumlah_check
  CHECK (jumlah > 0);

-- Pencairan wajib menyebut dari kas mana uangnya keluar — tanpa itu ekspor
-- ke Excel tidak tahu harus masuk kolom yang mana. Penambahan pagu justru
-- tidak boleh punya sumber: itu kesepakatan menaikkan plafon, bukan uang
-- yang berpindah.
ALTER TABLE uang_jalan DROP CONSTRAINT IF EXISTS uang_jalan_sumber_check;
ALTER TABLE uang_jalan ADD CONSTRAINT uang_jalan_sumber_check
  CHECK (
    (jenis = 'pencairan'       AND sumber_dana_id IS NOT NULL) OR
    (jenis = 'penambahan_pagu' AND sumber_dana_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_uang_jalan_job
  ON uang_jalan(job_id, tanggal, created_at);
CREATE INDEX IF NOT EXISTS idx_uang_jalan_sumber
  ON uang_jalan(sumber_dana_id)
  WHERE sumber_dana_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uang_jalan_tanggal
  ON uang_jalan(tanggal DESC);

DROP TRIGGER IF EXISTS trg_uang_jalan_updated_at ON uang_jalan;
CREATE TRIGGER trg_uang_jalan_updated_at
  BEFORE UPDATE ON uang_jalan
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- can_access_job — helper scope, SECURITY DEFINER
--
-- Sama alasannya dengan can_access_unit di migration 20260601000002: kalau
-- policy uang_jalan meng-inline SELECT ke jobs, RLS jobs ikut jalan dan bisa
-- balik membaca tabel ini → recursion. Helper ini melewati RLS sehingga
-- lookup-nya tidak masuk lagi ke rantai policy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION can_access_job(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = p_job_id
      AND (is_owner() OR can_access_unit(j.unit_id))
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE sumber_dana ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_sumber_dana" ON sumber_dana;
CREATE POLICY "admin_read_sumber_dana"
  ON sumber_dana FOR SELECT
  USING (is_active_admin());

-- Daftar kas hanya boleh diubah owner. Operator memilih dari daftar,
-- tidak menambah rekening baru.
DROP POLICY IF EXISTS "owner_write_sumber_dana" ON sumber_dana;
CREATE POLICY "owner_write_sumber_dana"
  ON sumber_dana FOR ALL
  USING (is_active_admin() AND is_owner())
  WITH CHECK (is_active_admin() AND is_owner());

ALTER TABLE uang_jalan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_all_uang_jalan_in_scope" ON uang_jalan;
CREATE POLICY "user_all_uang_jalan_in_scope"
  ON uang_jalan FOR ALL
  USING (is_active_admin() AND can_access_job(job_id))
  WITH CHECK (is_active_admin() AND can_access_job(job_id));
