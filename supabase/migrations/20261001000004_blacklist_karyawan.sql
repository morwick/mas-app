-- ============================================================================
-- Migration 20261001000004: Blacklist karyawan + cabut sesi login otomatis
--
--   * hr.karyawan.is_blacklist / blacklist_alasan / blacklist_at /
--     blacklist_oleh — karyawan yang di-blacklist (sementara dikelola dari
--     menu master Karyawan, nanti pindah ke modul HR).
--   * transport.blacklist_karyawan(p_id, p_alasan) — superadmin saja, satu
--     transaksi:
--       - ditolak bila karyawan masih BERTUGAS: driver dengan job yang belum
--         selesai / dibatalkan, atau mekanik di perintah kerja yang belum
--         selesai / dibatalkan;
--       - karyawan → blacklist + nonaktif; data driver & mekaniknya →
--         nonaktif (tidak bisa dipilih untuk job / perintah kerja);
--       - sesi login web & mobile dicabut (lihat trigger di bawah);
--       - tercatat di log sistem (aksi 'Blacklist', beserta alasannya).
--   * transport.cabut_blacklist_karyawan(p_id, p_alasan) — superadmin saja.
--     Karyawan kembali aktif; driver / mekanik / akun pengguna TIDAK otomatis
--     aktif lagi (diaktifkan satu per satu di menunya). Log aksi
--     'Cabut Blacklist'.
--   * Trigger hr.karyawan: setiap kali karyawan berubah dari aktif menjadi
--     tidak aktif (nonaktif, blacklist, atau dihapus), semua sesi login web
--     (sesi_pengguna) & mobile (driver_sessions) miliknya langsung dicabut.
--     PIN driver tidak diubah — login ulang tetap ditolak karena driver_login
--     & mulai_sesi memeriksa karyawan_aktif().
--   * karyawan_aktif() kini juga mensyaratkan tidak di-blacklist.
--   * Karyawan yang di-blacklist tidak bisa diaktifkan lewat edit karyawan;
--     driver / mekaniknya tidak bisa diaktifkan; tidak bisa ditugaskan ke job
--     atau perintah kerja (trigger penugasan baru).
--
-- AMAN UNTUK KODE LAMA: kolom baru ber-default; fungsi lama tetap dengan
-- tanda tangan yang sama (daftar_karyawan diganti karena kolom hasilnya
-- bertambah). Data lama tidak diubah.
-- WAJIB: jalankan setelah 20260930000006 (aksi log 'Cetak Dokumen').
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Kolom blacklist ──────────────────────────────────────────────────────
ALTER TABLE hr.karyawan ADD COLUMN IF NOT EXISTS is_blacklist BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hr.karyawan ADD COLUMN IF NOT EXISTS blacklist_alasan TEXT;
ALTER TABLE hr.karyawan ADD COLUMN IF NOT EXISTS blacklist_at TIMESTAMPTZ;
ALTER TABLE hr.karyawan ADD COLUMN IF NOT EXISTS blacklist_oleh UUID REFERENCES hr.karyawan(id);
COMMENT ON COLUMN hr.karyawan.is_blacklist IS
  'Karyawan di-blacklist: nonaktif, tidak bisa login, tidak bisa ditugaskan. Dicabut lewat cabut_blacklist_karyawan().';
COMMENT ON COLUMN hr.karyawan.blacklist_oleh IS 'Karyawan (superadmin) yang mem-blacklist.';

ALTER TABLE hr.karyawan DROP CONSTRAINT IF EXISTS karyawan_blacklist_check;
ALTER TABLE hr.karyawan ADD CONSTRAINT karyawan_blacklist_check
  CHECK (NOT is_blacklist OR (NOT is_active AND btrim(COALESCE(blacklist_alasan, '')) <> ''));

-- ── 2. Aksi log baru ────────────────────────────────────────────────────────
ALTER TABLE transport.log_sistem DROP CONSTRAINT IF EXISTS log_sistem_aksi_check;
ALTER TABLE transport.log_sistem ADD CONSTRAINT log_sistem_aksi_check
  CHECK (aksi IN ('Login', 'Logout', 'Tambah Data', 'Update Data', 'Hapus Data', 'Cetak Dokumen',
                  'Blacklist', 'Cabut Blacklist'));

-- ── 3. karyawan_aktif: juga bukan blacklist ─────────────────────────────────
CREATE OR REPLACE FUNCTION transport.karyawan_aktif(p_karyawan_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT EXISTS (SELECT 1 FROM hr.karyawan k
                  WHERE k.id = p_karyawan_id AND k.is_active AND NOT k.is_blacklist AND k.status = 1);
$$;
REVOKE ALL ON FUNCTION transport.karyawan_aktif(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.karyawan_aktif(UUID) TO authenticated, service_role;

-- ── 4. Cabut sesi login saat karyawan tidak aktif lagi ──────────────────────
CREATE OR REPLACE FUNCTION transport.karyawan_cabut_sesi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF (OLD.is_active AND NOT OLD.is_blacklist AND OLD.status = 1)
     AND NOT (NEW.is_active AND NOT NEW.is_blacklist AND NEW.status = 1) THEN
    -- Web: role_aktif() mensyaratkan sesi berstatus 1 → akses data langsung
    -- tertutup, dan backend menolak token itu (401) sehingga pengguna keluar.
    UPDATE transport.sesi_pengguna
       SET status = 2, logout_at = now()
     WHERE karyawan_id = NEW.id AND status = 1;
    -- Mobile / portal driver: token dicabut → driver_me() menolak (401).
    UPDATE transport.driver_sessions s
       SET revoked_at = now(), status = 2
      FROM transport.drivers d
     WHERE s.driver_id = d.id AND d.karyawan_id = NEW.id
       AND s.status = 1 AND s.revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.karyawan_cabut_sesi() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_karyawan_cabut_sesi ON hr.karyawan;
CREATE TRIGGER trg_karyawan_cabut_sesi
  AFTER UPDATE OF is_active, is_blacklist, status ON hr.karyawan
  FOR EACH ROW EXECUTE FUNCTION transport.karyawan_cabut_sesi();

-- ── 5. Blacklist ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.blacklist_karyawan(p_id UUID, p_alasan TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_k       hr.karyawan%ROWTYPE;
  v_alasan  TEXT := NULLIF(btrim(COALESCE(p_alasan, '')), '');
  v_tugas   TEXT;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya super administrator yang boleh mem-blacklist karyawan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_alasan IS NULL THEN
    RAISE EXCEPTION 'Alasan blacklist wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_k FROM hr.karyawan WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_k.id IS NULL THEN
    RAISE EXCEPTION 'Karyawan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_k.is_blacklist THEN
    RAISE EXCEPTION 'Karyawan % sudah di-blacklist.', v_k.nama USING ERRCODE = 'check_violation';
  END IF;
  PERFORM transport._cek_karyawan_boleh_nonaktif(p_id, 'mem-blacklist');

  -- Hanya karyawan yang sedang tidak bertugas.
  SELECT string_agg(x, ', ') INTO v_tugas FROM (
    SELECT 'job ' || j.job_number AS x
      FROM transport.jobs j
      JOIN transport.drivers d ON d.id = j.driver_id
     WHERE d.karyawan_id = p_id AND d.status = 1
       AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
    UNION ALL
    SELECT 'perintah kerja ' || COALESCE(w.nomor, '(draft)')
      FROM transport.perintah_kerja_mekanik pm
      JOIN transport.mekanik m ON m.id = pm.mekanik_id
      JOIN transport.perintah_kerja w ON w.id = pm.perintah_kerja_id
     WHERE m.karyawan_id = p_id AND m.status = 1
       AND pm.status = 1 AND w.status = 1
       AND w.status_wo NOT IN ('selesai', 'dibatalkan')
  ) t;
  IF v_tugas IS NOT NULL THEN
    RAISE EXCEPTION '% masih bertugas (%). Blacklist hanya bisa dilakukan setelah tugasnya selesai atau dibatalkan.',
      v_k.nama, v_tugas USING ERRCODE = 'check_violation';
  END IF;

  UPDATE hr.karyawan
     SET is_blacklist = true,
         is_active = false,
         blacklist_alasan = v_alasan,
         blacklist_at = now(),
         blacklist_oleh = transport._karyawan_sesi()
   WHERE id = p_id;   -- trigger trg_karyawan_cabut_sesi mencabut sesi login

  UPDATE transport.drivers SET is_active = false WHERE karyawan_id = p_id AND status = 1 AND is_active;
  UPDATE transport.mekanik SET is_active = false WHERE karyawan_id = p_id AND status = 1 AND is_active;

  PERFORM transport._tulis_log('Blacklist', 'Blacklist karyawan ' || v_k.nama || '. Alasan: ' || v_alasan);
END;
$$;
REVOKE ALL ON FUNCTION transport.blacklist_karyawan(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.blacklist_karyawan(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION transport.cabut_blacklist_karyawan(p_id UUID, p_alasan TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_k      hr.karyawan%ROWTYPE;
  v_alasan TEXT := NULLIF(btrim(COALESCE(p_alasan, '')), '');
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya super administrator yang boleh mencabut blacklist karyawan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_k FROM hr.karyawan WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_k.id IS NULL THEN
    RAISE EXCEPTION 'Karyawan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_k.is_blacklist THEN
    RAISE EXCEPTION 'Karyawan % tidak sedang di-blacklist.', v_k.nama USING ERRCODE = 'check_violation';
  END IF;

  UPDATE hr.karyawan
     SET is_blacklist = false,
         is_active = true,
         blacklist_alasan = NULL,
         blacklist_at = NULL,
         blacklist_oleh = NULL
   WHERE id = p_id;

  PERFORM transport._tulis_log(
    'Cabut Blacklist',
    'Cabut blacklist karyawan ' || v_k.nama
      || ' (alasan blacklist: ' || COALESCE(v_k.blacklist_alasan, '-') || ')'
      || COALESCE('. Alasan dicabut: ' || v_alasan, '')
  );
END;
$$;
REVOKE ALL ON FUNCTION transport.cabut_blacklist_karyawan(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.cabut_blacklist_karyawan(UUID, TEXT) TO authenticated, service_role;

-- ── 6. Edit karyawan: yang di-blacklist tidak bisa diaktifkan ───────────────
-- Salinan simpan_karyawan (20260924000020) + penjagaan blacklist.
CREATE OR REPLACE FUNCTION transport.simpan_karyawan(
  p_id            UUID,     -- NULL = tambah
  p_nama          TEXT,
  p_tanggal_lahir DATE    DEFAULT NULL,
  p_alamat        TEXT    DEFAULT NULL,
  p_is_active     BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_id UUID;
  v_lama hr.karyawan%ROWTYPE;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya super administrator yang boleh mengelola karyawan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(COALESCE(p_nama, '')) = '' THEN
    RAISE EXCEPTION 'Nama karyawan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_lahir IS NOT NULL AND p_tanggal_lahir > (now() AT TIME ZONE 'Asia/Jakarta')::date THEN
    RAISE EXCEPTION 'Tanggal lahir tidak boleh di masa depan.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO hr.karyawan (nama, tanggal_lahir, alamat, is_active)
    VALUES (btrim(p_nama), p_tanggal_lahir, NULLIF(btrim(COALESCE(p_alamat, '')), ''), COALESCE(p_is_active, true))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  SELECT * INTO v_lama FROM hr.karyawan WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_lama.id IS NULL THEN
    RAISE EXCEPTION 'Karyawan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_lama.is_blacklist AND COALESCE(p_is_active, true) THEN
    RAISE EXCEPTION 'Karyawan % sedang di-blacklist. Cabut blacklist dulu untuk mengaktifkannya.', v_lama.nama
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_lama.is_active AND NOT COALESCE(p_is_active, true) THEN
    PERFORM transport._cek_karyawan_boleh_nonaktif(p_id, 'menonaktifkan');
  END IF;

  UPDATE hr.karyawan
     SET nama = btrim(p_nama),
         tanggal_lahir = p_tanggal_lahir,
         alamat = NULLIF(btrim(COALESCE(p_alamat, '')), ''),
         is_active = COALESCE(p_is_active, true)
   WHERE id = p_id;
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION transport.simpan_karyawan(UUID, TEXT, DATE, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.simpan_karyawan(UUID, TEXT, DATE, TEXT, BOOLEAN) TO authenticated, service_role;

-- ── 7. Daftar karyawan + info blacklist ─────────────────────────────────────
-- Kolom hasil bertambah → DROP dulu. p_aktif: NULL semua, true aktif,
-- false nonaktif (termasuk blacklist). p_blacklist: true = hanya blacklist.
DROP FUNCTION IF EXISTS transport.daftar_karyawan(TEXT, BOOLEAN, INT, INT);
CREATE OR REPLACE FUNCTION transport.daftar_karyawan(
  p_q         TEXT    DEFAULT NULL,
  p_aktif     BOOLEAN DEFAULT NULL,
  p_limit     INT     DEFAULT 10,
  p_offset    INT     DEFAULT 0,
  p_blacklist BOOLEAN DEFAULT NULL
)
RETURNS TABLE (
  id UUID, nama TEXT, tanggal_lahir DATE, alamat TEXT, is_active BOOLEAN,
  akun JSONB, driver JSONB, total BIGINT,
  is_blacklist BOOLEAN, blacklist_alasan TEXT, blacklist_at TIMESTAMPTZ, blacklist_oleh_nama TEXT,
  mekanik JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_q TEXT := NULLIF(btrim(COALESCE(p_q, '')), '');
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Hanya super administrator yang boleh melihat data karyawan.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT k.id, k.nama, k.tanggal_lahir, k.alamat, k.is_active,
         COALESCE(
           (SELECT jsonb_agg(jsonb_build_object('user_id', p.id, 'role', r, 'email', p.email) ORDER BY r)
              FROM transport.profiles p, unnest(p.roles) r
             WHERE p.karyawan_id = k.id AND p.status = 1),
           '[]'::jsonb),
         (SELECT jsonb_build_object('id', d.id, 'no_hp', d.no_hp)
            FROM transport.drivers d
           WHERE d.karyawan_id = k.id AND d.status = 1
           LIMIT 1),
         count(*) OVER (),
         k.is_blacklist, k.blacklist_alasan, k.blacklist_at,
         (SELECT o.nama FROM hr.karyawan o WHERE o.id = k.blacklist_oleh),
         (SELECT jsonb_build_object('id', m.id)
            FROM transport.mekanik m
           WHERE m.karyawan_id = k.id AND m.status = 1
           LIMIT 1)
    FROM hr.karyawan k
   WHERE k.status = 1
     AND (p_aktif IS NULL OR k.is_active = p_aktif)
     AND (p_blacklist IS NULL OR k.is_blacklist = p_blacklist)
     AND (v_q IS NULL OR k.nama ILIKE '%' || v_q || '%' OR k.alamat ILIKE '%' || v_q || '%')
   ORDER BY k.nama, k.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 5000)
   OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
REVOKE ALL ON FUNCTION transport.daftar_karyawan(TEXT, BOOLEAN, INT, INT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_karyawan(TEXT, BOOLEAN, INT, INT, BOOLEAN) TO authenticated, service_role;

-- ── 8. Info blacklist untuk halaman driver / mekanik (semua staf) ───────────
CREATE OR REPLACE FUNCTION transport.info_blacklist_karyawan(p_ids UUID[])
RETURNS TABLE (karyawan_id UUID, blacklist_alasan TEXT, blacklist_at TIMESTAMPTZ, blacklist_oleh_nama TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT k.id, k.blacklist_alasan, k.blacklist_at, o.nama
    FROM hr.karyawan k
    LEFT JOIN hr.karyawan o ON o.id = k.blacklist_oleh
   WHERE transport.is_active_admin()
     AND k.id = ANY (p_ids)
     AND k.is_blacklist
     AND k.status = 1;
$$;
REVOKE ALL ON FUNCTION transport.info_blacklist_karyawan(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.info_blacklist_karyawan(UUID[]) TO authenticated, service_role;

-- ── 9. Driver / mekanik milik karyawan blacklist tidak bisa diaktifkan ──────
CREATE OR REPLACE FUNCTION transport.cek_aktivasi_bukan_blacklist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_nama TEXT;
BEGIN
  IF NEW.is_active AND NEW.status = 1
     AND (TG_OP = 'INSERT' OR NOT OLD.is_active OR NEW.karyawan_id IS DISTINCT FROM OLD.karyawan_id) THEN
    SELECT k.nama INTO v_nama FROM hr.karyawan k WHERE k.id = NEW.karyawan_id AND k.is_blacklist;
    IF v_nama IS NOT NULL THEN
      RAISE EXCEPTION 'Karyawan % sedang di-blacklist — % tidak bisa diaktifkan.', v_nama,
        CASE TG_TABLE_NAME WHEN 'drivers' THEN 'driver' ELSE 'mekanik' END
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.cek_aktivasi_bukan_blacklist() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_drivers_bukan_blacklist ON transport.drivers;
CREATE TRIGGER trg_drivers_bukan_blacklist
  BEFORE INSERT OR UPDATE OF is_active, karyawan_id, status ON transport.drivers
  FOR EACH ROW EXECUTE FUNCTION transport.cek_aktivasi_bukan_blacklist();
DROP TRIGGER IF EXISTS trg_mekanik_bukan_blacklist ON transport.mekanik;
CREATE TRIGGER trg_mekanik_bukan_blacklist
  BEFORE INSERT OR UPDATE OF is_active, karyawan_id, status ON transport.mekanik
  FOR EACH ROW EXECUTE FUNCTION transport.cek_aktivasi_bukan_blacklist();

-- ── 10. Penugasan baru: driver / mekanik wajib aktif ────────────────────────
-- Hanya penugasan BARU (driver diganti / mekanik ditambahkan); job & perintah
-- kerja lama yang tidak mengubah orangnya tidak terpengaruh.
CREATE OR REPLACE FUNCTION transport.jobs_driver_wajib_aktif()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_d transport.drivers%ROWTYPE;
BEGIN
  IF NEW.status <> 1 OR NEW.status_job IN ('selesai', 'cancelled') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_d FROM transport.drivers d WHERE d.id = NEW.driver_id;
  IF v_d.id IS NULL OR v_d.status <> 1 OR NOT v_d.is_active OR NOT transport.karyawan_aktif(v_d.karyawan_id) THEN
    RAISE EXCEPTION 'Driver % tidak aktif atau di-blacklist — tidak bisa ditugaskan ke job.', COALESCE(v_d.nama, '')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.jobs_driver_wajib_aktif() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_jobs_driver_wajib_aktif ON transport.jobs;
CREATE TRIGGER trg_jobs_driver_wajib_aktif
  BEFORE INSERT OR UPDATE OF driver_id ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_driver_wajib_aktif();

CREATE OR REPLACE FUNCTION transport.perintah_kerja_mekanik_wajib_aktif()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_m    transport.mekanik%ROWTYPE;
  v_nama TEXT;
BEGIN
  IF NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.mekanik_id IS NOT DISTINCT FROM OLD.mekanik_id AND OLD.status = 1 THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_m FROM transport.mekanik m WHERE m.id = NEW.mekanik_id;
  IF v_m.id IS NULL OR v_m.status <> 1 OR NOT v_m.is_active OR NOT transport.karyawan_aktif(v_m.karyawan_id) THEN
    SELECT k.nama INTO v_nama FROM hr.karyawan k WHERE k.id = v_m.karyawan_id;
    RAISE EXCEPTION 'Mekanik % tidak aktif atau di-blacklist — tidak bisa ditugaskan ke perintah kerja.', COALESCE(v_nama, '')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.perintah_kerja_mekanik_wajib_aktif() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_perintah_kerja_mekanik_wajib_aktif ON transport.perintah_kerja_mekanik;
CREATE TRIGGER trg_perintah_kerja_mekanik_wajib_aktif
  BEFORE INSERT OR UPDATE OF mekanik_id, status ON transport.perintah_kerja_mekanik
  FOR EACH ROW EXECUTE FUNCTION transport.perintah_kerja_mekanik_wajib_aktif();

NOTIFY pgrst, 'reload schema';
