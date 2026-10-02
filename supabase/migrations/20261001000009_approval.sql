-- ============================================================================
-- Migration 20261001000009: Approval — master approver & mesin pengajuan
--
-- Tabel
--   * transport.approval_fitur  — fitur yang butuh approval + mode-nya:
--       salah_satu : cukup 1 approver menyetujui;
--       semua      : semua approver harus menyetujui (urutan bebas);
--       berjenjang : per level (approver.urutan) — level berikutnya baru bisa
--                    memutuskan setelah SEMUA approver di level sebelumnya setuju.
--     Di semua mode: SATU penolakan = pengajuan langsung ditolak.
--   * transport.approver        — karyawan approver per fitur (+ urutan/level).
--   * transport.pengajuan_approval         — satu pengajuan per data yang diajukan.
--   * transport.pengajuan_approval_langkah — snapshot approver saat diajukan
--                                            beserta keputusannya.
--
-- Fungsi (dipanggil fitur lain di 20261001000010 & oleh backend)
--   * _ajukan_approval / _perbarui_approval / _batalkan_approval — internal.
--   * putuskan_approval(id, setuju, catatan) — dipanggil approver.
--   * menu_approval_saya() / daftar_pengajuan_approval(...) — untuk menu Approval.
--
-- BATASAN utama
--   * Fitur tanpa approver aktif tidak bisa diajukan.
--   * Pengaju tidak ikut menjadi approver pengajuannya sendiri (dikeluarkan
--     dari snapshot); bila tidak ada approver lain, pengajuan ditolak dibuat.
--   * Approver hanya karyawan aktif yang punya akun pengguna web aktif.
--   * Susunan approver di-snapshot saat diajukan: perubahan master approver
--     sesudahnya tidak mengubah pengajuan yang sedang berjalan.
--   * Pengajuan yang diubah pengajunya selama menunggu → semua keputusan
--     "setuju" yang sudah ada direset (approver menilai data yang baru).
--
-- AMAN UNTUK KODE LAMA: hanya menambah tabel & fungsi.
-- WAJIB: jalankan setelah 20261001000008.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Master ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.approval_fitur (
  kode        TEXT PRIMARY KEY,
  nama        TEXT NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'salah_satu'
              CONSTRAINT approval_fitur_mode_check CHECK (mode IN ('salah_satu', 'semua', 'berjenjang')),
  urutan      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      SMALLINT NOT NULL DEFAULT 1 CONSTRAINT approval_fitur_status_check CHECK (status IN (1, 2))
);
COMMENT ON TABLE transport.approval_fitur IS 'Fitur yang pengajuannya butuh approval, beserta mode approval-nya.';

INSERT INTO transport.approval_fitur (kode, nama, urutan) VALUES
  ('tambahan_uang_jalan', 'Tambahan Uang Jalan', 1),
  ('penghapusan_aset', 'Penghapusan Unit & Unit Trailer', 2),
  ('penjualan_aset', 'Penjualan Unit & Unit Trailer', 3)
ON CONFLICT (kode) DO NOTHING;

CREATE TABLE IF NOT EXISTS transport.approver (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fitur_kode   TEXT NOT NULL REFERENCES transport.approval_fitur(kode),
  karyawan_id  UUID NOT NULL REFERENCES hr.karyawan(id),
  -- Level untuk mode berjenjang (1 = diputuskan pertama). Mode lain mengabaikannya.
  urutan       INTEGER NOT NULL DEFAULT 1 CONSTRAINT approver_urutan_check CHECK (urutan BETWEEN 1 AND 20),
  created_by   UUID REFERENCES transport.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       SMALLINT NOT NULL DEFAULT 1 CONSTRAINT approver_status_check CHECK (status IN (1, 2))
);
COMMENT ON TABLE transport.approver IS 'Karyawan yang menjadi approver sebuah fitur.';
CREATE UNIQUE INDEX IF NOT EXISTS approver_fitur_karyawan_unique
  ON transport.approver (fitur_kode, karyawan_id) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_approver_karyawan ON transport.approver (karyawan_id) WHERE status = 1;

-- BATASAN: approver harus karyawan aktif yang punya akun pengguna web aktif —
-- approval dilakukan di web.
CREATE OR REPLACE FUNCTION transport.approver_cek_karyawan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_nama TEXT;
BEGIN
  IF NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  SELECT k.nama INTO v_nama FROM hr.karyawan k WHERE k.id = NEW.karyawan_id AND k.status = 1;
  IF v_nama IS NULL THEN
    RAISE EXCEPTION 'Karyawan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT transport.karyawan_aktif(NEW.karyawan_id) THEN
    RAISE EXCEPTION 'Karyawan % tidak aktif — tidak bisa menjadi approver.', v_nama USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM transport.profiles p
                  WHERE p.karyawan_id = NEW.karyawan_id AND p.is_active AND p.status = 1) THEN
    RAISE EXCEPTION 'Karyawan % belum punya akun pengguna web aktif — buatkan akunnya dulu di menu Pengguna.', v_nama
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.approver_cek_karyawan() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_approver_cek_karyawan ON transport.approver;
CREATE TRIGGER trg_approver_cek_karyawan
  BEFORE INSERT OR UPDATE OF karyawan_id, status ON transport.approver
  FOR EACH ROW EXECUTE FUNCTION transport.approver_cek_karyawan();

-- ── 2. Pengajuan ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.pengajuan_approval (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fitur_kode       TEXT NOT NULL REFERENCES transport.approval_fitur(kode),
  -- id data yang diajukan (uang_jalan / penghapusan_aset / penjualan_unit).
  ref_id           UUID NOT NULL,
  -- Ringkasan untuk daftar Approval: approver tidak selalu berhak membuka
  -- menu fitur aslinya, jadi isinya disalin ke sini.
  judul            TEXT NOT NULL,
  rincian          JSONB NOT NULL DEFAULT '{}'::jsonb,
  nilai            BIGINT,
  mode             TEXT NOT NULL,
  status_approval  TEXT NOT NULL DEFAULT 'menunggu'
                   CONSTRAINT pengajuan_approval_status_check
                   CHECK (status_approval IN ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  diajukan_oleh    UUID REFERENCES hr.karyawan(id),
  diajukan_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  diputuskan_at    TIMESTAMPTZ,
  alasan_tolak     TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           SMALLINT NOT NULL DEFAULT 1 CONSTRAINT pengajuan_approval_status_aktif_check CHECK (status IN (1, 2))
);
-- Satu data hanya boleh punya satu pengajuan yang sedang menunggu.
CREATE UNIQUE INDEX IF NOT EXISTS pengajuan_approval_menunggu_unique
  ON transport.pengajuan_approval (fitur_kode, ref_id) WHERE status = 1 AND status_approval = 'menunggu';
CREATE INDEX IF NOT EXISTS idx_pengajuan_approval_fitur
  ON transport.pengajuan_approval (fitur_kode, diajukan_at DESC) WHERE status = 1;

CREATE TABLE IF NOT EXISTS transport.pengajuan_approval_langkah (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pengajuan_id  UUID NOT NULL REFERENCES transport.pengajuan_approval(id) ON DELETE CASCADE,
  karyawan_id   UUID NOT NULL REFERENCES hr.karyawan(id),
  urutan        INTEGER NOT NULL DEFAULT 1,
  -- dilewati = tidak perlu memutuskan lagi (pengajuan sudah final).
  keputusan     TEXT NOT NULL DEFAULT 'menunggu'
                CONSTRAINT pengajuan_approval_langkah_keputusan_check
                CHECK (keputusan IN ('menunggu', 'setuju', 'tolak', 'dilewati')),
  catatan       TEXT,
  diputuskan_at TIMESTAMPTZ,
  status        SMALLINT NOT NULL DEFAULT 1 CONSTRAINT pengajuan_approval_langkah_status_check CHECK (status IN (1, 2))
);
CREATE INDEX IF NOT EXISTS idx_pengajuan_langkah_pengajuan ON transport.pengajuan_approval_langkah (pengajuan_id);
CREATE INDEX IF NOT EXISTS idx_pengajuan_langkah_karyawan
  ON transport.pengajuan_approval_langkah (karyawan_id) WHERE keputusan = 'menunggu';

-- ── 3. updated_at, soft delete, log & akses ─────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['approval_fitur', 'approver', 'pengajuan_approval'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON transport.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON transport.%1$I
                      FOR EACH ROW EXECUTE FUNCTION transport.set_updated_at()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['approval_fitur', 'approver', 'pengajuan_approval', 'pengajuan_approval_langkah'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete ON transport.%I', t);
    EXECUTE format('CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.%I
                      FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead()', t);
    EXECUTE format('ALTER TABLE transport.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT ON transport.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON transport.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON transport.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS "staf_baca_%1$s" ON transport.%1$I', t);
    EXECUTE format('CREATE POLICY "staf_baca_%1$s" ON transport.%1$I FOR SELECT TO authenticated
                      USING (transport.is_active_admin())', t);
  END LOOP;
  -- Master diubah langsung oleh superadmin (tercatat di log sistem). Tabel
  -- pengajuan hanya diubah lewat fungsi di bawah (SECURITY DEFINER).
  FOREACH t IN ARRAY ARRAY['approval_fitur', 'approver'] LOOP
    EXECUTE format('GRANT INSERT, UPDATE ON transport.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS "superadmin_tulis_%1$s" ON transport.%1$I', t);
    EXECUTE format('CREATE POLICY "superadmin_tulis_%1$s" ON transport.%1$I FOR ALL TO authenticated
                      USING (transport.is_superadmin()) WITH CHECK (transport.is_superadmin())', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_log_sistem ON transport.%I', t);
    EXECUTE format('CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.%I
                      FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data()', t);
  END LOOP;
END;
$$;

-- Aksi log baru untuk keputusan approval.
ALTER TABLE transport.log_sistem DROP CONSTRAINT IF EXISTS log_sistem_aksi_check;
ALTER TABLE transport.log_sistem ADD CONSTRAINT log_sistem_aksi_check
  CHECK (aksi IN ('Login', 'Logout', 'Tambah Data', 'Update Data', 'Hapus Data', 'Cetak Dokumen',
                  'Blacklist', 'Cabut Blacklist', 'Approval'));

-- ── 4. Mesin pengajuan ──────────────────────────────────────────────────────

-- Buat pengajuan untuk satu data. Dipanggil fitur yang butuh approval di
-- dalam transaksi penyimpanan datanya, jadi gagal di sini = data ikut batal.
CREATE OR REPLACE FUNCTION transport._ajukan_approval(
  p_fitur TEXT, p_ref_id UUID, p_judul TEXT, p_rincian JSONB, p_nilai BIGINT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_fitur   transport.approval_fitur%ROWTYPE;
  v_pengaju UUID := transport._karyawan_sesi();
  v_id      UUID;
  v_jumlah  INTEGER;
BEGIN
  SELECT * INTO v_fitur FROM transport.approval_fitur WHERE kode = p_fitur AND status = 1;
  IF v_fitur.kode IS NULL THEN
    RAISE EXCEPTION 'Fitur approval % tidak dikenal.', p_fitur USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO transport.pengajuan_approval (fitur_kode, ref_id, judul, rincian, nilai, mode, diajukan_oleh)
  VALUES (p_fitur, p_ref_id, p_judul, COALESCE(p_rincian, '{}'::jsonb), p_nilai, v_fitur.mode, v_pengaju)
  RETURNING id INTO v_id;

  -- Snapshot approver yang bisa bertindak: aktif, punya akun web aktif, dan
  -- BUKAN pengaju sendiri (BATASAN: tidak boleh menyetujui pengajuan sendiri).
  INSERT INTO transport.pengajuan_approval_langkah (pengajuan_id, karyawan_id, urutan)
  SELECT v_id, a.karyawan_id, a.urutan
    FROM transport.approver a
   WHERE a.fitur_kode = p_fitur AND a.status = 1
     AND a.karyawan_id IS DISTINCT FROM v_pengaju
     AND transport.karyawan_aktif(a.karyawan_id)
     AND EXISTS (SELECT 1 FROM transport.profiles p
                  WHERE p.karyawan_id = a.karyawan_id AND p.is_active AND p.status = 1);
  GET DIAGNOSTICS v_jumlah = ROW_COUNT;

  -- BATASAN: fitur tanpa approver tidak bisa diajukan.
  IF v_jumlah = 0 THEN
    IF EXISTS (SELECT 1 FROM transport.approver a WHERE a.fitur_kode = p_fitur AND a.status = 1
                AND a.karyawan_id = v_pengaju) THEN
      RAISE EXCEPTION 'Belum ada approver lain untuk % — Anda tidak bisa menyetujui pengajuan sendiri. Tambahkan approver di menu Master → Approver.',
        v_fitur.nama USING ERRCODE = 'check_violation';
    END IF;
    RAISE EXCEPTION 'Belum ada approver untuk %. Atur dulu di menu Master → Approver.', v_fitur.nama
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION transport._ajukan_approval(TEXT, UUID, TEXT, JSONB, BIGINT) FROM PUBLIC, anon, authenticated;

-- Data yang masih menunggu diubah pengajunya: perbarui ringkasan dan reset
-- keputusan "setuju" — approver harus menilai ulang data yang baru.
CREATE OR REPLACE FUNCTION transport._perbarui_approval(
  p_fitur TEXT, p_ref_id UUID, p_judul TEXT, p_rincian JSONB, p_nilai BIGINT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM transport.pengajuan_approval
   WHERE fitur_kode = p_fitur AND ref_id = p_ref_id AND status = 1 AND status_approval = 'menunggu'
   FOR UPDATE;
  IF v_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE transport.pengajuan_approval
     SET judul = p_judul, rincian = COALESCE(p_rincian, '{}'::jsonb), nilai = p_nilai
   WHERE id = v_id;
  UPDATE transport.pengajuan_approval_langkah
     SET keputusan = 'menunggu', catatan = NULL, diputuskan_at = NULL
   WHERE pengajuan_id = v_id AND keputusan = 'setuju';
END;
$$;
REVOKE ALL ON FUNCTION transport._perbarui_approval(TEXT, UUID, TEXT, JSONB, BIGINT) FROM PUBLIC, anon, authenticated;

-- Data dibatalkan / dihapus pengajunya selama menunggu.
CREATE OR REPLACE FUNCTION transport._batalkan_approval(p_fitur TEXT, p_ref_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM transport.pengajuan_approval
   WHERE fitur_kode = p_fitur AND ref_id = p_ref_id AND status = 1 AND status_approval = 'menunggu'
   FOR UPDATE;
  IF v_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE transport.pengajuan_approval
     SET status_approval = 'dibatalkan', diputuskan_at = now()
   WHERE id = v_id;
  UPDATE transport.pengajuan_approval_langkah
     SET keputusan = 'dilewati'
   WHERE pengajuan_id = v_id AND keputusan = 'menunggu';
END;
$$;
REVOKE ALL ON FUNCTION transport._batalkan_approval(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- Status approval sebuah data ('menunggu' / 'disetujui' / ...), NULL bila belum pernah diajukan.
CREATE OR REPLACE FUNCTION transport._status_approval(p_fitur TEXT, p_ref_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT status_approval FROM transport.pengajuan_approval
   WHERE fitur_kode = p_fitur AND ref_id = p_ref_id AND status = 1
   ORDER BY diajukan_at DESC LIMIT 1;
$$;

-- Penerapan hasil ke data aslinya. Didefinisikan ulang di 20261001000010
-- (per fitur); versi ini hanya kerangka supaya putuskan_approval bisa dibuat.
CREATE OR REPLACE FUNCTION transport._terapkan_hasil_approval(p_fitur TEXT, p_ref_id UUID, p_hasil TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  RAISE EXCEPTION 'Penerapan approval untuk fitur % belum tersedia.', p_fitur USING ERRCODE = 'P0002';
END;
$$;
REVOKE ALL ON FUNCTION transport._terapkan_hasil_approval(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Keputusan seorang approver.
CREATE OR REPLACE FUNCTION transport.putuskan_approval(p_pengajuan_id UUID, p_setuju BOOLEAN, p_catatan TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_saya     UUID := transport._karyawan_sesi();
  v_aju      transport.pengajuan_approval%ROWTYPE;
  v_langkah  transport.pengajuan_approval_langkah%ROWTYPE;
  v_level    INTEGER;
  v_catatan  TEXT := NULLIF(btrim(COALESCE(p_catatan, '')), '');
  v_hasil    TEXT;
  v_nama_fitur TEXT;
BEGIN
  IF v_saya IS NULL THEN
    RAISE EXCEPTION 'Butuh login.' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_aju FROM transport.pengajuan_approval WHERE id = p_pengajuan_id AND status = 1 FOR UPDATE;
  IF v_aju.id IS NULL THEN
    RAISE EXCEPTION 'Pengajuan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  -- BATASAN: hanya pengajuan yang masih menunggu yang bisa diputuskan.
  IF v_aju.status_approval <> 'menunggu' THEN
    RAISE EXCEPTION 'Pengajuan ini sudah %.', v_aju.status_approval USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_langkah FROM transport.pengajuan_approval_langkah
   WHERE pengajuan_id = v_aju.id AND karyawan_id = v_saya AND keputusan = 'menunggu'
   FOR UPDATE;
  -- BATASAN: hanya approver yang tercatat di pengajuan ini dan belum memutuskan.
  IF v_langkah.id IS NULL THEN
    RAISE EXCEPTION 'Anda bukan approver pengajuan ini, atau sudah memberi keputusan.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- BATASAN berjenjang: hanya level terendah yang masih menunggu yang boleh memutuskan.
  IF v_aju.mode = 'berjenjang' THEN
    SELECT min(urutan) INTO v_level FROM transport.pengajuan_approval_langkah
     WHERE pengajuan_id = v_aju.id AND keputusan = 'menunggu';
    IF v_langkah.urutan > v_level THEN
      RAISE EXCEPTION 'Belum giliran Anda — menunggu keputusan approver level %.', v_level
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- BATASAN: menolak wajib disertai alasan.
  IF NOT p_setuju AND v_catatan IS NULL THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE transport.pengajuan_approval_langkah
     SET keputusan = CASE WHEN p_setuju THEN 'setuju' ELSE 'tolak' END,
         catatan = v_catatan, diputuskan_at = now()
   WHERE id = v_langkah.id;

  -- Hasil akhir: satu tolak = ditolak (semua mode); salah_satu = cukup satu
  -- setuju; semua / berjenjang = tidak ada lagi langkah yang menunggu.
  IF NOT p_setuju THEN
    v_hasil := 'ditolak';
  ELSIF v_aju.mode = 'salah_satu'
     OR NOT EXISTS (SELECT 1 FROM transport.pengajuan_approval_langkah
                     WHERE pengajuan_id = v_aju.id AND keputusan = 'menunggu') THEN
    v_hasil := 'disetujui';
  END IF;

  IF v_hasil IS NOT NULL THEN
    UPDATE transport.pengajuan_approval
       SET status_approval = v_hasil, diputuskan_at = now(),
           alasan_tolak = CASE WHEN v_hasil = 'ditolak' THEN v_catatan END
     WHERE id = v_aju.id;
    UPDATE transport.pengajuan_approval_langkah
       SET keputusan = 'dilewati'
     WHERE pengajuan_id = v_aju.id AND keputusan = 'menunggu';
    PERFORM transport._terapkan_hasil_approval(v_aju.fitur_kode, v_aju.ref_id, v_hasil);
  END IF;

  SELECT nama INTO v_nama_fitur FROM transport.approval_fitur WHERE kode = v_aju.fitur_kode;
  PERFORM transport._tulis_log(
    'Approval',
    CASE WHEN p_setuju THEN 'Setujui' ELSE 'Tolak' END || ' pengajuan ' || v_nama_fitur || ': ' || v_aju.judul
      || COALESCE('. Catatan: ' || v_catatan, '')
      || CASE WHEN v_hasil IS NOT NULL THEN ' → ' || v_hasil ELSE ' (menunggu approver lain)' END
  );
  RETURN COALESCE(v_hasil, 'menunggu');
END;
$$;
REVOKE ALL ON FUNCTION transport.putuskan_approval(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.putuskan_approval(UUID, BOOLEAN, TEXT) TO authenticated;

-- Apakah karyawan sesi ini sedang mendapat giliran memutuskan pengajuan itu.
CREATE OR REPLACE FUNCTION transport._giliran_saya(p_pengajuan_id UUID, p_saya UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM transport.pengajuan_approval a
      JOIN transport.pengajuan_approval_langkah l ON l.pengajuan_id = a.id
     WHERE a.id = p_pengajuan_id AND a.status = 1 AND a.status_approval = 'menunggu'
       AND l.karyawan_id = p_saya AND l.keputusan = 'menunggu'
       AND (a.mode <> 'berjenjang'
            OR l.urutan = (SELECT min(x.urutan) FROM transport.pengajuan_approval_langkah x
                            WHERE x.pengajuan_id = a.id AND x.keputusan = 'menunggu'))
  );
$$;
REVOKE ALL ON FUNCTION transport._giliran_saya(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ── 5. Menu & daftar untuk approver ─────────────────────────────────────────
-- Fitur yang dipegang karyawan sesi ini (approver aktif, atau masih punya
-- langkah di pengajuan yang berjalan) + jumlah yang menunggu gilirannya.
CREATE OR REPLACE FUNCTION transport.menu_approval_saya()
RETURNS TABLE (kode TEXT, nama TEXT, menunggu_saya BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  WITH saya AS (SELECT transport._karyawan_sesi() AS id)
  SELECT f.kode, f.nama,
         (SELECT count(*) FROM transport.pengajuan_approval a, saya
           WHERE a.fitur_kode = f.kode AND transport._giliran_saya(a.id, saya.id))
    FROM transport.approval_fitur f, saya
   WHERE f.status = 1
     AND transport.role_aktif() IS NOT NULL
     AND (EXISTS (SELECT 1 FROM transport.approver ap
                   WHERE ap.fitur_kode = f.kode AND ap.karyawan_id = saya.id AND ap.status = 1)
          OR EXISTS (SELECT 1 FROM transport.pengajuan_approval a
                       JOIN transport.pengajuan_approval_langkah l ON l.pengajuan_id = a.id
                      WHERE a.fitur_kode = f.kode AND a.status = 1 AND l.karyawan_id = saya.id))
   ORDER BY f.urutan;
$$;
REVOKE ALL ON FUNCTION transport.menu_approval_saya() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.menu_approval_saya() TO authenticated;

-- Daftar pengajuan satu fitur, paging LIMIT/OFFSET.
--   p_hanya_giliran: hanya yang menunggu keputusan saya.
--   Akses: approver fitur itu (atau yang tercatat di pengajuannya) & superadmin.
CREATE OR REPLACE FUNCTION transport.daftar_pengajuan_approval(
  p_fitur          TEXT,
  p_hanya_giliran  BOOLEAN DEFAULT false,
  p_status         TEXT DEFAULT NULL,
  p_q              TEXT DEFAULT NULL,
  p_tahun          INTEGER DEFAULT NULL,
  p_bulan          INTEGER DEFAULT NULL,
  p_limit          INTEGER DEFAULT 10,
  p_offset         INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, fitur_kode TEXT, ref_id UUID, judul TEXT, rincian JSONB, nilai BIGINT, mode TEXT,
  status_approval TEXT, diajukan_oleh_nama TEXT, diajukan_at TIMESTAMPTZ, diputuskan_at TIMESTAMPTZ,
  alasan_tolak TEXT, giliran_saya BOOLEAN, langkah JSONB, total BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_saya UUID := transport._karyawan_sesi();
  v_q    TEXT := NULLIF(btrim(COALESCE(p_q, '')), '');
  v_semua BOOLEAN;
BEGIN
  IF transport.role_aktif() IS NULL THEN
    RAISE EXCEPTION 'Butuh login.' USING ERRCODE = '28000';
  END IF;
  -- BATASAN: daftar lengkap hanya untuk superadmin & approver aktif fitur ini;
  -- karyawan lain hanya melihat pengajuan yang mencatat dirinya sebagai approver.
  v_semua := transport.is_superadmin() OR EXISTS (
    SELECT 1 FROM transport.approver ap WHERE ap.fitur_kode = p_fitur AND ap.karyawan_id = v_saya AND ap.status = 1);

  RETURN QUERY
  SELECT a.id, a.fitur_kode, a.ref_id, a.judul, a.rincian, a.nilai, a.mode, a.status_approval,
         k.nama, a.diajukan_at, a.diputuskan_at, a.alasan_tolak,
         transport._giliran_saya(a.id, v_saya),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'karyawan_id', l.karyawan_id, 'nama', lk.nama, 'urutan', l.urutan,
                     'keputusan', l.keputusan, 'catatan', l.catatan, 'diputuskan_at', l.diputuskan_at)
                     ORDER BY l.urutan, lk.nama)
                     FROM transport.pengajuan_approval_langkah l
                     JOIN hr.karyawan lk ON lk.id = l.karyawan_id
                    WHERE l.pengajuan_id = a.id AND l.status = 1), '[]'::jsonb),
         count(*) OVER ()
    FROM transport.pengajuan_approval a
    LEFT JOIN hr.karyawan k ON k.id = a.diajukan_oleh
   WHERE a.fitur_kode = p_fitur AND a.status = 1
     AND (v_semua OR EXISTS (SELECT 1 FROM transport.pengajuan_approval_langkah l
                              WHERE l.pengajuan_id = a.id AND l.karyawan_id = v_saya))
     AND (NOT COALESCE(p_hanya_giliran, false) OR transport._giliran_saya(a.id, v_saya))
     AND (p_status IS NULL OR a.status_approval = p_status)
     AND (p_tahun IS NULL OR extract(year FROM a.diajukan_at AT TIME ZONE 'Asia/Jakarta') = p_tahun)
     AND (p_bulan IS NULL OR extract(month FROM a.diajukan_at AT TIME ZONE 'Asia/Jakarta') = p_bulan)
     AND (v_q IS NULL OR a.judul ILIKE '%' || v_q || '%' OR k.nama ILIKE '%' || v_q || '%')
   ORDER BY (a.status_approval = 'menunggu') DESC, a.diajukan_at DESC, a.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 5000)
   OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
REVOKE ALL ON FUNCTION transport.daftar_pengajuan_approval(TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_pengajuan_approval(TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;

-- Daftar approver (master), paging LIMIT/OFFSET. hr.karyawan tidak dibuka di
-- Data API, jadi nama karyawan diambil lewat fungsi ini.
CREATE OR REPLACE FUNCTION transport.daftar_approver(
  p_fitur  TEXT DEFAULT NULL,
  p_q      TEXT DEFAULT NULL,
  p_limit  INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, fitur_kode TEXT, fitur_nama TEXT, mode TEXT, karyawan_id UUID, karyawan_nama TEXT,
  urutan INTEGER, karyawan_aktif BOOLEAN, total BIGINT
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
    RAISE EXCEPTION 'Hanya super administrator yang boleh mengelola approver.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT a.id, f.kode, f.nama, f.mode, a.karyawan_id, k.nama, a.urutan,
         transport.karyawan_aktif(a.karyawan_id), count(*) OVER ()
    FROM transport.approver a
    JOIN transport.approval_fitur f ON f.kode = a.fitur_kode
    JOIN hr.karyawan k ON k.id = a.karyawan_id
   WHERE a.status = 1
     AND (p_fitur IS NULL OR a.fitur_kode = p_fitur)
     AND (v_q IS NULL OR k.nama ILIKE '%' || v_q || '%' OR f.nama ILIKE '%' || v_q || '%')
   ORDER BY f.urutan, a.urutan, k.nama, a.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 5000)
   OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
REVOKE ALL ON FUNCTION transport.daftar_approver(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_approver(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- Pilihan karyawan untuk dijadikan approver: aktif & punya akun web aktif.
CREATE OR REPLACE FUNCTION transport.karyawan_calon_approver()
RETURNS TABLE (id UUID, nama TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT k.id, k.nama
    FROM hr.karyawan k
   WHERE transport.is_superadmin()
     AND transport.karyawan_aktif(k.id)
     AND EXISTS (SELECT 1 FROM transport.profiles p WHERE p.karyawan_id = k.id AND p.is_active AND p.status = 1)
   ORDER BY k.nama;
$$;
REVOKE ALL ON FUNCTION transport.karyawan_calon_approver() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.karyawan_calon_approver() TO authenticated;

-- ── 6. Label log sistem: salinan 20260930000001 + baris baru ────────────────
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
    -- Baru (20261001000009)
    WHEN 'transport.approval_fitur'           THEN 'Mode Approval '         || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.approver'                 THEN 'Approver '              || COALESCE(p_baris ->> 'fitur_kode', '')
  END;
$$;

NOTIFY pgrst, 'reload schema';
