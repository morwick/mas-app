-- ============================================================================
-- Migration 20260930000002: master Bengkel luar & Mekanik internal
--
--   * transport.bengkel — bengkel / vendor luar untuk perbaikan.
--   * transport.mekanik — mekanik internal, dipilih dari data Karyawan
--     (pola sama dengan Driver: satu karyawan paling banyak satu mekanik).
--   * transport.karyawan_untuk_mekanik() — pilihan nama di form mekanik.
--
-- AMAN UNTUK KODE LAMA: hanya menambah tabel & fungsi baru. Fungsi dan
-- tabel hr.karyawan tidak diubah.
-- WAJIB: jalankan setelah 20260930000001.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Bengkel luar ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.bengkel (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama          TEXT NOT NULL CONSTRAINT bengkel_nama_check CHECK (btrim(nama) <> ''),
  alamat        TEXT,
  pic_nama      TEXT,
  no_hp         TEXT,
  spesialisasi  TEXT,
  catatan       TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES transport.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        SMALLINT NOT NULL DEFAULT 1 CONSTRAINT bengkel_status_check CHECK (status IN (1, 2))
);
CREATE UNIQUE INDEX IF NOT EXISTS bengkel_nama_unique
  ON transport.bengkel (lower(btrim(nama))) WHERE status = 1;

-- ── 2. Mekanik internal (dari Karyawan) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.mekanik (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Karyawan dihapus → data mekaniknya ikut terhapus (soft delete).
  karyawan_id  UUID NOT NULL REFERENCES hr.karyawan(id) ON DELETE CASCADE,
  no_hp        TEXT,
  keahlian     TEXT,
  catatan      TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       SMALLINT NOT NULL DEFAULT 1 CONSTRAINT mekanik_status_check CHECK (status IN (1, 2))
);
CREATE UNIQUE INDEX IF NOT EXISTS mekanik_karyawan_unique
  ON transport.mekanik (karyawan_id) WHERE status = 1;

-- Pilihan nama di form mekanik: semua karyawan aktif. `mekanik_id` terisi
-- bila karyawan itu sudah terdaftar sebagai mekanik.
CREATE OR REPLACE FUNCTION transport.karyawan_untuk_mekanik()
RETURNS TABLE (id UUID, nama TEXT, mekanik_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT k.id, k.nama,
         (SELECT m.id FROM transport.mekanik m WHERE m.karyawan_id = k.id AND m.status = 1 LIMIT 1)
    FROM hr.karyawan k
   WHERE transport.is_active_admin()
     AND k.status = 1
     AND k.is_active
   ORDER BY k.nama, k.id;
$$;
REVOKE ALL ON FUNCTION transport.karyawan_untuk_mekanik() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.karyawan_untuk_mekanik() TO authenticated, service_role;

-- Daftar mekanik beserta nama karyawannya (hr tidak dibuka di Data API).
CREATE OR REPLACE FUNCTION transport.daftar_mekanik(
  p_q      TEXT DEFAULT NULL,
  p_aktif  BOOLEAN DEFAULT NULL,
  p_limit  INTEGER DEFAULT NULL,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, karyawan_id UUID, nama TEXT, no_hp TEXT, keahlian TEXT, catatan TEXT,
  is_active BOOLEAN, karyawan_aktif BOOLEAN, total BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  WITH d AS (
    SELECT m.id, m.karyawan_id, k.nama, m.no_hp, m.keahlian, m.catatan, m.is_active,
           (k.is_active AND k.status = 1) AS karyawan_aktif
      FROM transport.mekanik m
      JOIN hr.karyawan k ON k.id = m.karyawan_id
     WHERE transport.is_active_admin()
       AND m.status = 1
       AND (p_aktif IS NULL OR m.is_active = p_aktif)
       AND (NULLIF(btrim(COALESCE(p_q, '')), '') IS NULL
            OR k.nama ILIKE '%' || btrim(p_q) || '%'
            OR COALESCE(m.no_hp, '') ILIKE '%' || btrim(p_q) || '%'
            OR COALESCE(m.keahlian, '') ILIKE '%' || btrim(p_q) || '%')
  )
  SELECT d.*, count(*) OVER () AS total
    FROM d
   ORDER BY d.nama, d.id
   LIMIT p_limit OFFSET GREATEST(p_offset, 0);
$$;
REVOKE ALL ON FUNCTION transport.daftar_mekanik(TEXT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_mekanik(TEXT, BOOLEAN, INTEGER, INTEGER) TO authenticated, service_role;

-- ── 3. updated_at, soft delete, log sistem, akses ──────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bengkel', 'mekanik'] LOOP
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

NOTIFY pgrst, 'reload schema';
