-- ============================================================================
-- Migration 20261001000001: master Kecamatan (wilayah administratif)
--
--   * hr.kecamatan — seluruh kecamatan di Indonesia beserta kab/kota &
--     provinsinya (data diisi migration 20261001000002). Dipakai item surat
--     penawaran untuk "Dari" & "Tujuan", supaya rute yang sama bisa dikenali
--     dan harga terakhirnya direkomendasikan.
--   * transport.daftar_kecamatan() — seluruh kecamatan aktif sebagai satu
--     array JSON. Schema hr tidak dibuka lewat Data API, jadi aplikasi
--     membacanya lewat fungsi ini (pola sama dengan daftar_karyawan). Satu
--     nilai JSON, bukan SETOF, supaya tidak terpotong batas baris PostgREST.
--
-- kab_kota disimpan ringkas tanpa awalan "Kabupaten" / "Kota" / "Kota
-- Administrasi" (mis. "Pekanbaru", "Jakarta Pusat", "Pelalawan") untuk label
-- "Kemayoran - Jakarta Pusat". Nama resminya tetap di kab_kota_resmi, untuk
-- membedakan Kota & Kabupaten bernama sama (mis. Kota Bogor / Kabupaten Bogor).
--
-- Kunci = kode wilayah Kemendagri (mis. '14.71.01'), bukan UUID: kode resmi
-- stabil dan memudahkan pembaruan data wilayah berikutnya (upsert per kode).
--
-- Data referensi — tidak diubah lewat aplikasi, jadi hanya hak baca untuk
-- staf yang login; tidak dipasang trigger log sistem (impor ribuan baris
-- tidak perlu tercatat satu per satu).
--
-- AMAN UNTUK KODE LAMA: hanya menambah tabel & fungsi baru.
-- ============================================================================

SET search_path = transport, extensions;

CREATE SCHEMA IF NOT EXISTS hr;

CREATE TABLE IF NOT EXISTS hr.kecamatan (
  kode        TEXT PRIMARY KEY CONSTRAINT kecamatan_kode_check CHECK (kode ~ '^\d{2}\.\d{2}\.\d{2}$'),
  nama        TEXT NOT NULL CONSTRAINT kecamatan_nama_check CHECK (btrim(nama) <> ''),
  kab_kota    TEXT NOT NULL,       -- ringkas, mis. "Pekanbaru"
  kab_kota_resmi TEXT,             -- resmi, mis. "Kota Pekanbaru" (NOT NULL setelah data diisi, migration ...02)
  provinsi    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      SMALLINT NOT NULL DEFAULT 1 CONSTRAINT kecamatan_status_check CHECK (status IN (1, 2))
);
-- Tabel dari versi awal migration ini (sebelum ada kab_kota_resmi) sudah
-- terlanjur dibuat di sebagian database → tambahkan kolomnya bila belum ada.
ALTER TABLE hr.kecamatan ADD COLUMN IF NOT EXISTS kab_kota_resmi TEXT;

COMMENT ON TABLE hr.kecamatan IS
  'Kecamatan se-Indonesia (kode wilayah Kepmendagri). Data referensi untuk rute surat penawaran.';
COMMENT ON COLUMN hr.kecamatan.status IS '1 = aktif, 2 = dihapus (soft delete)';

DROP TRIGGER IF EXISTS trg_kecamatan_updated_at ON hr.kecamatan;
CREATE TRIGGER trg_kecamatan_updated_at BEFORE UPDATE ON hr.kecamatan
  FOR EACH ROW EXECUTE FUNCTION transport.set_updated_at();
DROP TRIGGER IF EXISTS trg_soft_delete ON hr.kecamatan;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON hr.kecamatan
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();

-- ── Akses: staf yang login hanya membaca ────────────────────────────────────
ALTER TABLE hr.kecamatan ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON hr.kecamatan TO authenticated;
GRANT ALL ON hr.kecamatan TO service_role;
REVOKE ALL ON hr.kecamatan FROM anon;
DROP POLICY IF EXISTS "staf_baca_kecamatan" ON hr.kecamatan;
CREATE POLICY "staf_baca_kecamatan" ON hr.kecamatan FOR SELECT TO authenticated
  USING (transport.is_active_admin());

-- ── Fungsi baca untuk aplikasi ──────────────────────────────────────────────
-- SECURITY INVOKER: RLS di atas tetap berlaku (hanya staf yang login).
CREATE OR REPLACE FUNCTION transport.daftar_kecamatan()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('kode', k.kode, 'nama', k.nama, 'kab_kota', k.kab_kota,
                         'kab_kota_resmi', k.kab_kota_resmi, 'provinsi', k.provinsi)
      ORDER BY k.kode
    ),
    '[]'::jsonb
  )
  FROM hr.kecamatan k
  WHERE k.status = 1;
$$;
REVOKE ALL ON FUNCTION transport.daftar_kecamatan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_kecamatan() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
