-- ============================================================================
-- Migration 20260907000002: Masa berlaku dokumen unit & SIM driver
--
-- Sampai sekarang tidak ada tempat untuk menyimpan kapan STNK, KIR, atau pajak
-- kendaraan habis. Itu bukan urusan administrasi: KIR mati berarti unit bisa
-- ditahan di jembatan timbang dan job batal di tengah jalan — persis kelas
-- risiko yang sama dengan servis lewat jadwal, yang sudah punya pengingat.
--
-- Nomornya juga disimpan, bukan cuma tanggal, supaya admin bisa mencocokkan
-- dengan berkas fisik tanpa membuka lemari.
--
-- Tanggal saja, tanpa jam: masa berlaku dokumen berakhir pada tanggal, dan
-- menyimpannya sebagai timestamptz akan membuat batasnya bergeser mengikuti
-- zona waktu.
-- ============================================================================

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS stnk_nomor           TEXT,
  ADD COLUMN IF NOT EXISTS stnk_berlaku_sampai  DATE,
  ADD COLUMN IF NOT EXISTS kir_nomor            TEXT,
  ADD COLUMN IF NOT EXISTS kir_berlaku_sampai   DATE,
  ADD COLUMN IF NOT EXISTS pajak_berlaku_sampai DATE;

COMMENT ON COLUMN units.stnk_berlaku_sampai IS
  'Tanggal habis berlaku STNK. NULL = belum dicatat.';
COMMENT ON COLUMN units.kir_berlaku_sampai IS
  'Tanggal habis berlaku KIR (uji berkala).';
COMMENT ON COLUMN units.pajak_berlaku_sampai IS
  'Jatuh tempo pajak tahunan kendaraan.';

-- Driver: no_sim sudah ada, tapi tanpa masa berlakunya nomor itu tidak
-- memberi tahu apa pun tentang layak jalan atau tidak.
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS sim_berlaku_sampai DATE;

COMMENT ON COLUMN drivers.sim_berlaku_sampai IS
  'Tanggal habis berlaku SIM. NULL = belum dicatat.';

-- Index parsial untuk pencarian "yang akan habis" — baris tanpa tanggal
-- (mayoritas data lama) tidak ikut memberati index.
CREATE INDEX IF NOT EXISTS idx_units_stnk_expiry
  ON units(stnk_berlaku_sampai) WHERE stnk_berlaku_sampai IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_units_kir_expiry
  ON units(kir_berlaku_sampai) WHERE kir_berlaku_sampai IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_units_pajak_expiry
  ON units(pajak_berlaku_sampai) WHERE pajak_berlaku_sampai IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drivers_sim_expiry
  ON drivers(sim_berlaku_sampai) WHERE sim_berlaku_sampai IS NOT NULL;
