-- ============================================================================
-- Migration 20261001000010: Approval untuk Tambahan Uang Jalan, Penghapusan &
--                           Penjualan Unit / Unit Trailer
--
-- Ketiga fitur kini lewat pengajuan approval (mesin di 20261001000009):
--
-- 1. Tambahan uang jalan (uang_jalan jenis 'tambahan', dicatat admin di detail
--    job). Tersimpan dengan status_approval 'menunggu' dan BELUM menambah uang
--    jalan job; baru dihitung setelah disetujui.
--      BATASAN: selama menunggu masih bisa diubah / dihapus pengajunya (keputusan
--      yang sudah ada direset / pengajuan dibatalkan). Setelah disetujui /
--      ditolak, nominal & isinya terkunci; status_approval hanya boleh diubah
--      oleh mesin approval.
-- 2. Penghapusan aset & 3. Penjualan aset. Catatan tersimpan 'menunggu';
--    status aset BARU berubah (Diafkirkan / Terjual) dan insidennya ditutup
--    setelah disetujui — syarat aset diperiksa ulang saat itu.
--      BATASAN selama menunggu: aset dikunci — tidak bisa ditugaskan ke job
--      baru dan tidak bisa diajukan dijual / dihapus lagi. Pengaju masih bisa
--      mengubah atau membatalkan catatannya. Ditolak = catatan tetap ada
--      sebagai riwayat, aset tidak berubah.
--
-- Data lama: semua baris yang sudah ada dianggap 'disetujui' (tidak diubah).
-- WAJIB: jalankan setelah 20261001000009. Backend & frontend naik bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 0. Kolom status approval ────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['uang_jalan', 'penghapusan_aset', 'penjualan_unit'] LOOP
    EXECUTE format('ALTER TABLE transport.%I ADD COLUMN IF NOT EXISTS status_approval TEXT NOT NULL DEFAULT ''disetujui''', t);
    EXECUTE format('ALTER TABLE transport.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_status_approval_check');
    EXECUTE format('ALTER TABLE transport.%I ADD CONSTRAINT %I CHECK (status_approval IN (''menunggu'', ''disetujui'', ''ditolak''))',
                   t, t || '_status_approval_check');
  END LOOP;
END;
$$;

-- BATASAN: status_approval hanya diubah oleh mesin approval (flag transaksi
-- app.approval_mesin), bukan lewat edit biasa.
CREATE OR REPLACE FUNCTION transport._cek_status_approval_dari_mesin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.status_approval IS DISTINCT FROM OLD.status_approval
     AND COALESCE(current_setting('app.approval_mesin', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Status approval hanya bisa diubah lewat keputusan approver.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['uang_jalan', 'penghapusan_aset', 'penjualan_unit'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_status_approval ON transport.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_status_approval BEFORE UPDATE OF status_approval ON transport.%1$I
                      FOR EACH ROW EXECUTE FUNCTION transport._cek_status_approval_dari_mesin()', t);
  END LOOP;
END;
$$;

-- ── 1. Tambahan uang jalan ──────────────────────────────────────────────────

-- Pengaruh satu baris terhadap sisa: tambahan hanya dihitung setelah disetujui.
DROP FUNCTION IF EXISTS transport._efek_uang_jalan_ke_sisa(SMALLINT, TEXT, NUMERIC);
CREATE OR REPLACE FUNCTION transport._efek_uang_jalan_ke_sisa(
  p_status SMALLINT, p_jenis TEXT, p_jumlah NUMERIC, p_status_approval TEXT
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_status IS DISTINCT FROM 1 THEN 0
           WHEN p_jenis = 'tambahan' THEN
             CASE WHEN p_status_approval = 'disetujui' THEN COALESCE(p_jumlah, 0) ELSE 0 END
           ELSE -COALESCE(p_jumlah, 0)
         END;
$$;

CREATE OR REPLACE FUNCTION transport.uang_jalan_cek_tidak_melebihi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_efek_baru NUMERIC := transport._efek_uang_jalan_ke_sisa(NEW.status, NEW.jenis::text, NEW.jumlah, NEW.status_approval);
  v_efek_lama NUMERIC := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_efek_lama := transport._efek_uang_jalan_ke_sisa(OLD.status, OLD.jenis::text, OLD.jumlah, OLD.status_approval);
    IF OLD.job_id IS DISTINCT FROM NEW.job_id THEN
      -- Pindah job: job lama kehilangan efek baris ini, job baru mendapatkannya.
      PERFORM transport._cek_uang_jalan_tidak_melebihi(OLD.job_id, -v_efek_lama);
      v_efek_lama := 0;
    END IF;
  END IF;
  PERFORM transport._cek_uang_jalan_tidak_melebihi(NEW.job_id, v_efek_baru - v_efek_lama);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_uang_jalan_cek_tidak_melebihi ON transport.uang_jalan;
CREATE TRIGGER trg_uang_jalan_cek_tidak_melebihi
  AFTER INSERT OR UPDATE OF jumlah, jenis, status, job_id, status_approval ON transport.uang_jalan
  FOR EACH ROW EXECUTE FUNCTION transport.uang_jalan_cek_tidak_melebihi();

-- Posisi uang jalan: tambahan yang belum disetujui tidak dihitung.
CREATE OR REPLACE FUNCTION transport.job_uang_jalan_posisi(p_job_id UUID)
RETURNS TABLE (uang_jalan BIGINT, cair BIGINT, sisa BIGINT, ada_bukti BOOLEAN, pending_request BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  WITH t AS (
    SELECT
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'tambahan' AND status_approval = 'disetujui'), 0) AS tambah,
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'pencairan'), 0) AS cair,
      bool_or(jenis = 'pencairan' AND bukti_transfer_path IS NOT NULL) AS ada_bukti
    FROM transport.uang_jalan WHERE job_id = p_job_id AND status = 1
  )
  SELECT
    (j.uang_jalan_awal + t.tambah)::BIGINT,
    t.cair::BIGINT,
    (j.uang_jalan_awal + t.tambah - t.cair)::BIGINT,
    COALESCE(t.ada_bukti, false),
    EXISTS (SELECT 1 FROM transport.uang_jalan_requests r
             WHERE r.job_id = p_job_id AND r.status = 1 AND r.status_pengajuan = 'diajukan')
  FROM transport.jobs j, t WHERE j.id = p_job_id AND j.status = 1;
$$;

-- Ringkasan untuk daftar Approval.
CREATE OR REPLACE FUNCTION transport._rincian_tambahan_uang_jalan(p_row transport.uang_jalan)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT jsonb_build_object(
           'job_id', j.id, 'job_number', j.job_number, 'tanggal', p_row.tanggal,
           'keperluan', p_row.keperluan, 'catatan', p_row.catatan,
           'uang_jalan_awal', j.uang_jalan_awal, 'driver', d.nama,
           'rute', COALESCE(j.asal, '') || ' → ' || COALESCE(j.tujuan, ''))
    FROM transport.jobs j
    LEFT JOIN transport.drivers d ON d.id = j.driver_id
   WHERE j.id = p_row.job_id;
$$;

CREATE OR REPLACE FUNCTION transport._judul_tambahan_uang_jalan(p_row transport.uang_jalan)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT 'Tambahan uang jalan ' || COALESCE(j.job_number, '') || COALESCE(' · ' || p_row.keperluan, '')
    FROM transport.jobs j WHERE j.id = p_row.job_id;
$$;

CREATE OR REPLACE FUNCTION transport.uang_jalan_tambahan_approval_sebelum()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Tambahan baru selalu menunggu approval; pencairan tidak butuh approval.
    NEW.status_approval := CASE WHEN NEW.jenis = 'tambahan' THEN 'menunggu' ELSE 'disetujui' END;
    RETURN NEW;
  END IF;
  -- BATASAN: jenis transaksi tidak bisa diganti dari / ke tambahan setelah dicatat.
  IF NEW.jenis IS DISTINCT FROM OLD.jenis AND 'tambahan' IN (NEW.jenis::text, OLD.jenis::text) THEN
    RAISE EXCEPTION 'Jenis tambahan uang jalan tidak bisa diganti — hapus lalu catat ulang.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- BATASAN: tambahan yang sudah disetujui / ditolak terkunci isinya.
  IF OLD.jenis = 'tambahan' AND OLD.status_approval <> 'menunggu' AND NEW.status = 1
     AND (NEW.jumlah, NEW.tanggal, NEW.job_id, NEW.keperluan, NEW.catatan)
         IS DISTINCT FROM (OLD.jumlah, OLD.tanggal, OLD.job_id, OLD.keperluan, OLD.catatan) THEN
    RAISE EXCEPTION 'Tambahan uang jalan yang sudah % tidak bisa diubah.', OLD.status_approval
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_uang_jalan_tambahan_approval_sebelum ON transport.uang_jalan;
CREATE TRIGGER trg_uang_jalan_tambahan_approval_sebelum
  BEFORE INSERT OR UPDATE ON transport.uang_jalan
  FOR EACH ROW EXECUTE FUNCTION transport.uang_jalan_tambahan_approval_sebelum();

CREATE OR REPLACE FUNCTION transport.uang_jalan_tambahan_approval_sesudah()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.jenis <> 'tambahan' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM transport._ajukan_approval('tambahan_uang_jalan', NEW.id,
      transport._judul_tambahan_uang_jalan(NEW), transport._rincian_tambahan_uang_jalan(NEW), NEW.jumlah);
  ELSIF NEW.status_approval = 'menunggu' THEN
    IF NEW.status <> 1 THEN
      PERFORM transport._batalkan_approval('tambahan_uang_jalan', NEW.id);   -- dihapus selama menunggu
    ELSIF (NEW.jumlah, NEW.tanggal, NEW.job_id, NEW.keperluan, NEW.catatan)
          IS DISTINCT FROM (OLD.jumlah, OLD.tanggal, OLD.job_id, OLD.keperluan, OLD.catatan) THEN
      PERFORM transport._perbarui_approval('tambahan_uang_jalan', NEW.id,
        transport._judul_tambahan_uang_jalan(NEW), transport._rincian_tambahan_uang_jalan(NEW), NEW.jumlah);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION transport.uang_jalan_tambahan_approval_sesudah() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_uang_jalan_tambahan_approval_sesudah ON transport.uang_jalan;
CREATE TRIGGER trg_uang_jalan_tambahan_approval_sesudah
  AFTER INSERT OR UPDATE ON transport.uang_jalan
  FOR EACH ROW EXECUTE FUNCTION transport.uang_jalan_tambahan_approval_sesudah();

-- ── 2. Aset: kunci selama ada pengajuan penjualan / penghapusan ─────────────

-- Label pengajuan yang masih menunggu untuk sebuah aset, NULL bila tidak ada.
CREATE OR REPLACE FUNCTION transport._pengajuan_aset_menunggu(p_jenis_aset TEXT, p_asset_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT COALESCE(
    (SELECT 'penjualan ' || COALESCE(p.nomor_surat, '') FROM transport.penjualan_unit p
      WHERE p.status = 1 AND p.status_approval = 'menunggu'
        AND (CASE WHEN p_jenis_aset = 'unit' THEN p.unit_id ELSE p.unit_trailer_id END) = p_asset_id
      LIMIT 1),
    (SELECT 'penghapusan ' || COALESCE(h.nomor_berita_acara, '') FROM transport.penghapusan_aset h
      WHERE h.status = 1 AND h.status_approval = 'menunggu'
        AND (CASE WHEN p_jenis_aset = 'unit' THEN h.unit_id ELSE h.unit_trailer_id END) = p_asset_id
      LIMIT 1));
$$;
REVOKE ALL ON FUNCTION transport._pengajuan_aset_menunggu(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- BATASAN: aset yang sedang diajukan dijual / dihapus tidak bisa ditugaskan ke job baru.
CREATE OR REPLACE FUNCTION transport.jobs_cek_aset_menunggu_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_ket TEXT;
BEGIN
  IF NEW.status <> 1 OR NEW.status_job IN ('selesai', 'cancelled') THEN
    RETURN NEW;
  END IF;
  IF NEW.unit_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.unit_id IS DISTINCT FROM OLD.unit_id) THEN
    v_ket := transport._pengajuan_aset_menunggu('unit', NEW.unit_id);
    IF v_ket IS NOT NULL THEN
      RAISE EXCEPTION 'Unit ini sedang diajukan % dan menunggu approval — tidak bisa dipakai untuk job.', v_ket
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.unit_trailer_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.unit_trailer_id IS DISTINCT FROM OLD.unit_trailer_id) THEN
    v_ket := transport._pengajuan_aset_menunggu('unit_trailer', NEW.unit_trailer_id);
    IF v_ket IS NOT NULL THEN
      RAISE EXCEPTION 'Unit trailer ini sedang diajukan % dan menunggu approval — tidak bisa dipakai untuk job.', v_ket
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.jobs_cek_aset_menunggu_approval() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_jobs_cek_aset_menunggu_approval ON transport.jobs;
CREATE TRIGGER trg_jobs_cek_aset_menunggu_approval
  BEFORE INSERT OR UPDATE OF unit_id, unit_trailer_id ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_cek_aset_menunggu_approval();

-- Kode & status aset, dikunci FOR UPDATE.
CREATE OR REPLACE FUNCTION transport._aset_kunci(p_jenis_aset TEXT, p_asset_id UUID, OUT kode TEXT, OUT status_aset TEXT, OUT job_aktif TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF p_jenis_aset = 'unit' THEN
    SELECT u.kode_unit, u.status_operasional::text INTO kode, status_aset
      FROM transport.units u WHERE u.id = p_asset_id AND u.status = 1 FOR UPDATE;
    SELECT j.job_number INTO job_aktif FROM transport.jobs j
     WHERE j.unit_id = p_asset_id AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd LIMIT 1;
  ELSE
    SELECT t.kode_trailer, t.status_trailer INTO kode, status_aset
      FROM transport.unit_trailer t WHERE t.id = p_asset_id AND t.status = 1 FOR UPDATE;
    SELECT j.job_number INTO job_aktif FROM transport.jobs j
     WHERE j.unit_trailer_id = p_asset_id AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd LIMIT 1;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION transport._aset_kunci(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ── 3. Penjualan ────────────────────────────────────────────────────────────

-- Syarat aset boleh dijual — dipakai saat diajukan DAN saat disetujui.
CREATE OR REPLACE FUNCTION transport._cek_aset_boleh_dijual(p_jenis_aset TEXT, p_asset_id UUID, p_kecuali UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v     RECORD;
  v_lbl TEXT := CASE WHEN p_jenis_aset = 'unit' THEN 'unit' ELSE 'unit trailer' END;
  v_ket TEXT;
BEGIN
  SELECT * INTO v FROM transport._aset_kunci(p_jenis_aset, p_asset_id);
  IF v.kode IS NULL THEN
    RAISE EXCEPTION '% tidak ditemukan.', initcap(v_lbl) USING ERRCODE = 'P0002';
  END IF;
  IF v.status_aset IN ('bertugas', 'perbaikan', 'terjual') THEN
    RAISE EXCEPTION 'Tidak bisa menjual % % karena %.', v_lbl, v.kode,
      CASE v.status_aset WHEN 'bertugas' THEN v_lbl || ' sedang bertugas'
                         WHEN 'perbaikan' THEN v_lbl || ' sedang perbaikan'
                         ELSE v_lbl || ' sudah terjual' END
      USING ERRCODE = 'check_violation';
  END IF;
  IF v.job_aktif IS NOT NULL THEN
    RAISE EXCEPTION 'Tidak bisa menjual % % karena % sedang bertugas (job % belum selesai).', v_lbl, v.kode, v_lbl, v.job_aktif
      USING ERRCODE = 'check_violation';
  END IF;
  -- BATASAN: satu aset hanya boleh punya satu pengajuan penjualan / penghapusan yang menunggu.
  SELECT 'penjualan ' || COALESCE(p.nomor_surat, '') INTO v_ket FROM transport.penjualan_unit p
   WHERE p.status = 1 AND p.status_approval = 'menunggu' AND p.id IS DISTINCT FROM p_kecuali
     AND (CASE WHEN p_jenis_aset = 'unit' THEN p.unit_id ELSE p.unit_trailer_id END) = p_asset_id;
  v_ket := COALESCE(v_ket, (SELECT 'penghapusan ' || COALESCE(h.nomor_berita_acara, '') FROM transport.penghapusan_aset h
            WHERE h.status = 1 AND h.status_approval = 'menunggu'
              AND (CASE WHEN p_jenis_aset = 'unit' THEN h.unit_id ELSE h.unit_trailer_id END) = p_asset_id LIMIT 1));
  IF v_ket IS NOT NULL THEN
    RAISE EXCEPTION '% % masih menunggu approval %.', initcap(v_lbl), v.kode, v_ket USING ERRCODE = 'check_violation';
  END IF;
  RETURN v.status_aset;
END;
$$;
REVOKE ALL ON FUNCTION transport._cek_aset_boleh_dijual(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION transport._rincian_penjualan(p transport.penjualan_unit)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT jsonb_build_object(
    'jenis_aset', p.jenis_aset,
    'kode_aset', COALESCE((SELECT kode_unit FROM transport.units WHERE id = p.unit_id),
                          (SELECT kode_trailer FROM transport.unit_trailer WHERE id = p.unit_trailer_id)),
    'nama_pembeli', p.nama_pembeli, 'harga_jual', p.harga_jual, 'tanggal_jual', p.tanggal_jual,
    'nomor_surat', p.nomor_surat, 'catatan', p.catatan);
$$;

CREATE OR REPLACE FUNCTION transport._judul_penjualan(p transport.penjualan_unit)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT 'Jual ' || CASE WHEN p.jenis_aset = 'unit' THEN 'unit ' ELSE 'unit trailer ' END
         || COALESCE((SELECT kode_unit FROM transport.units WHERE id = p.unit_id),
                     (SELECT kode_trailer FROM transport.unit_trailer WHERE id = p.unit_trailer_id), '')
         || ' ke ' || p.nama_pembeli;
$$;

-- Salinan 20260926000012 + approval: tersimpan 'menunggu', efek ke aset ditunda.
CREATE OR REPLACE FUNCTION transport.catat_penjualan_unit(
  p_jenis_aset      TEXT,
  p_asset_id        UUID,
  p_nama_pembeli    TEXT,
  p_no_hp_pembeli   TEXT,
  p_email_pembeli   TEXT,
  p_harga_jual      BIGINT,
  p_tanggal_jual    DATE,
  p_catatan         TEXT DEFAULT NULL,
  p_penyerah_nama   TEXT DEFAULT NULL,
  p_penyerah_jabatan TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_id     UUID;
  v_status TEXT;
  v_row    transport.penjualan_unit%ROWTYPE;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_jenis_aset NOT IN ('unit', 'unit_trailer') THEN
    RAISE EXCEPTION 'Jenis aset tidak valid.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM transport._validasi_isian_penjualan(p_nama_pembeli, p_no_hp_pembeli, p_email_pembeli, p_harga_jual, p_tanggal_jual);
  v_status := transport._cek_aset_boleh_dijual(p_jenis_aset, p_asset_id);

  INSERT INTO transport.penjualan_unit (
    jenis_aset, unit_id, unit_trailer_id, nama_pembeli, no_hp_pembeli, email_pembeli,
    harga_jual, tanggal_jual, catatan, created_by, status_aset_sebelum, nomor_surat, nomor_bast,
    penyerah_nama, penyerah_jabatan, status_approval)
  VALUES (
    p_jenis_aset,
    CASE WHEN p_jenis_aset = 'unit' THEN p_asset_id END,
    CASE WHEN p_jenis_aset = 'unit_trailer' THEN p_asset_id END,
    btrim(p_nama_pembeli), NULLIF(btrim(COALESCE(p_no_hp_pembeli, '')), ''),
    NULLIF(lower(btrim(COALESCE(p_email_pembeli, ''))), ''),
    p_harga_jual, p_tanggal_jual, NULLIF(btrim(COALESCE(p_catatan, '')), ''), auth.uid(), v_status,
    transport.next_nomor_dokumen('surat_penjualan', 'SPJ', p_tanggal_jual),
    transport.next_nomor_dokumen('bast_penjualan', 'BAST', p_tanggal_jual),
    NULLIF(btrim(COALESCE(p_penyerah_nama, '')), ''), NULLIF(btrim(COALESCE(p_penyerah_jabatan, '')), ''),
    'menunggu')
  RETURNING * INTO v_row;
  v_id := v_row.id;

  -- Status aset berubah Terjual nanti, saat disetujui (_terapkan_penjualan).
  PERFORM transport._ajukan_approval('penjualan_aset', v_id, transport._judul_penjualan(v_row),
    transport._rincian_penjualan(v_row), p_harga_jual);
  RETURN v_id;
END;
$$;

-- Validasi isian penjualan (dipakai catat & ubah).
CREATE OR REPLACE FUNCTION transport._validasi_isian_penjualan(
  p_nama_pembeli TEXT, p_no_hp_pembeli TEXT, p_email_pembeli TEXT, p_harga_jual BIGINT, p_tanggal_jual DATE)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF btrim(COALESCE(p_nama_pembeli, '')) = '' THEN
    RAISE EXCEPTION 'Nama pembeli wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(btrim(COALESCE(p_no_hp_pembeli, '')), '') IS NOT NULL
     AND (btrim(p_no_hp_pembeli) !~ '^\+?[0-9 .()-]+$'
          OR length(regexp_replace(p_no_hp_pembeli, '[^0-9]', '', 'g')) NOT BETWEEN 8 AND 15) THEN
    RAISE EXCEPTION 'No HP pembeli tidak valid (8–15 digit).' USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(btrim(COALESCE(p_email_pembeli, '')), '') IS NOT NULL
     AND btrim(p_email_pembeli) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Email pembeli tidak valid.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_harga_jual IS NULL OR p_harga_jual <= 0 THEN
    RAISE EXCEPTION 'Harga jual wajib diisi & lebih dari 0.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_jual IS NULL THEN
    RAISE EXCEPTION 'Tanggal jual wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Disetujui: aset menjadi Terjual & insidennya ditutup (syarat diperiksa ulang).
CREATE OR REPLACE FUNCTION transport._terapkan_penjualan(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_row   transport.penjualan_unit%ROWTYPE;
  v_aset  UUID;
BEGIN
  SELECT * INTO v_row FROM transport.penjualan_unit WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Catatan penjualan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  v_aset := COALESCE(v_row.unit_id, v_row.unit_trailer_id);
  PERFORM transport._cek_aset_boleh_dijual(v_row.jenis_aset, v_aset, v_row.id);

  PERFORM set_config('app.status_note', 'Terjual ke ' || v_row.nama_pembeli, true);
  IF v_row.jenis_aset = 'unit' THEN
    UPDATE transport.units SET status_operasional = 'terjual', updated_at = now() WHERE id = v_aset;
  ELSE
    UPDATE transport.unit_trailer SET status_trailer = 'terjual', updated_at = now() WHERE id = v_aset;
  END IF;
  PERFORM set_config('app.status_note', '', true);
  PERFORM transport._tutup_insiden_aset(v_row.jenis_aset, v_aset, 'terjual');
END;
$$;
REVOKE ALL ON FUNCTION transport._terapkan_penjualan(UUID) FROM PUBLIC, anon, authenticated;

-- Salinan 20260926000012 + approval.
CREATE OR REPLACE FUNCTION transport.ubah_penjualan_unit(
  p_id               UUID,
  p_nama_pembeli     TEXT,
  p_no_hp_pembeli    TEXT,
  p_email_pembeli    TEXT,
  p_harga_jual       BIGINT,
  p_tanggal_jual     DATE,
  p_catatan          TEXT DEFAULT NULL,
  p_penyerah_nama    TEXT DEFAULT NULL,
  p_penyerah_jabatan TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_row transport.penjualan_unit%ROWTYPE;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM transport.penjualan_unit WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Catatan penjualan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  -- BATASAN: penjualan yang ditolak approver tidak bisa diedit (ajukan ulang).
  IF v_row.status_approval = 'ditolak' THEN
    RAISE EXCEPTION 'Penjualan % sudah ditolak approver — catat penjualan baru bila ingin mengajukan ulang.',
      COALESCE(v_row.nomor_surat, '') USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.bukti_path IS NOT NULL OR v_row.bukti_bast_path IS NOT NULL THEN
    RAISE EXCEPTION 'Penjualan % tidak bisa diedit karena surat / BAST bertanda tangan sudah diunggah.',
      COALESCE(v_row.nomor_surat, '') USING ERRCODE = 'check_violation';
  END IF;
  PERFORM transport._validasi_isian_penjualan(p_nama_pembeli, p_no_hp_pembeli, p_email_pembeli, p_harga_jual, p_tanggal_jual);

  UPDATE transport.penjualan_unit
     SET nama_pembeli = btrim(p_nama_pembeli),
         no_hp_pembeli = NULLIF(btrim(COALESCE(p_no_hp_pembeli, '')), ''),
         email_pembeli = NULLIF(lower(btrim(COALESCE(p_email_pembeli, ''))), ''),
         harga_jual = p_harga_jual,
         tanggal_jual = p_tanggal_jual,
         catatan = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
         penyerah_nama = NULLIF(btrim(COALESCE(p_penyerah_nama, '')), ''),
         penyerah_jabatan = NULLIF(btrim(COALESCE(p_penyerah_jabatan, '')), ''),
         updated_at = now()
   WHERE id = p_id
  RETURNING * INTO v_row;

  -- Masih menunggu: approver menilai ulang data yang baru.
  IF v_row.status_approval = 'menunggu' THEN
    PERFORM transport._perbarui_approval('penjualan_aset', p_id, transport._judul_penjualan(v_row),
      transport._rincian_penjualan(v_row), v_row.harga_jual);
  END IF;
END;
$$;

-- Salinan 20260926000012 + approval: yang belum disetujui cukup dibatalkan
-- (aset memang belum berubah).
CREATE OR REPLACE FUNCTION transport.batalkan_penjualan_unit(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_row     transport.penjualan_unit%ROWTYPE;
  v_aset    UUID;
  v_kembali TEXT;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM transport.penjualan_unit WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Catatan penjualan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status_approval <> 'disetujui' THEN
    UPDATE transport.penjualan_unit SET status = 2, updated_at = now() WHERE id = p_id;
    PERFORM transport._batalkan_approval('penjualan_aset', p_id);
    RETURN;
  END IF;

  IF v_row.bukti_path IS NOT NULL OR v_row.bukti_bast_path IS NOT NULL THEN
    RAISE EXCEPTION 'Penjualan % tidak bisa dibatalkan karena surat / BAST bertanda tangan sudah diunggah.',
      COALESCE(v_row.nomor_surat, '') USING ERRCODE = 'check_violation';
  END IF;

  UPDATE transport.penjualan_unit SET status = 2, updated_at = now() WHERE id = p_id;

  -- Aset Diafkirkan yang dijual kembali ke Diafkirkan; lainnya ke Standby
  -- (lalu mengikuti insiden yang dibuka lagi di bawah).
  v_kembali := CASE WHEN v_row.status_aset_sebelum = 'diafkirkan' THEN 'diafkirkan' ELSE 'standby' END;
  PERFORM set_config('app.status_note', 'Penjualan dibatalkan', true);
  IF v_row.jenis_aset = 'unit' THEN
    v_aset := v_row.unit_id;
    UPDATE transport.units SET status_operasional = v_kembali::transport.unit_status, updated_at = now()
     WHERE id = v_aset AND status_operasional = 'terjual';
  ELSE
    v_aset := v_row.unit_trailer_id;
    UPDATE transport.unit_trailer SET status_trailer = v_kembali, updated_at = now()
     WHERE id = v_aset AND status_trailer = 'terjual';
  END IF;
  PERFORM set_config('app.status_note', '', true);
  PERFORM transport._buka_insiden_aset(v_row.jenis_aset, v_aset, 'terjual', '[]'::jsonb);
END;
$$;

-- ── 4. Penghapusan ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION transport._cek_aset_boleh_dihapus(p_jenis_aset TEXT, p_asset_id UUID, p_kecuali UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v     RECORD;
  v_lbl TEXT := CASE WHEN p_jenis_aset = 'unit' THEN 'unit' ELSE 'unit trailer' END;
  v_ket TEXT;
BEGIN
  SELECT * INTO v FROM transport._aset_kunci(p_jenis_aset, p_asset_id);
  IF v.kode IS NULL THEN
    RAISE EXCEPTION '% tidak ditemukan.', initcap(v_lbl) USING ERRCODE = 'P0002';
  END IF;
  IF v.status_aset IN ('terjual', 'diafkirkan') THEN
    RAISE EXCEPTION 'Tidak bisa menghapus % % karena % sudah %.', v_lbl, v.kode, v_lbl, v.status_aset
      USING ERRCODE = 'check_violation';
  END IF;
  IF v.status_aset = 'bertugas' OR v.job_aktif IS NOT NULL THEN
    RAISE EXCEPTION 'Tidak bisa menghapus % % karena % sedang bertugas%. Selesaikan atau batalkan job-nya dulu.',
      v_lbl, v.kode, v_lbl, COALESCE(' (job ' || v.job_aktif || ' belum selesai)', '')
      USING ERRCODE = 'check_violation';
  END IF;
  -- BATASAN: satu aset hanya boleh punya satu pengajuan penjualan / penghapusan yang menunggu.
  SELECT 'penghapusan ' || COALESCE(h.nomor_berita_acara, '') INTO v_ket FROM transport.penghapusan_aset h
   WHERE h.status = 1 AND h.status_approval = 'menunggu' AND h.id IS DISTINCT FROM p_kecuali
     AND (CASE WHEN p_jenis_aset = 'unit' THEN h.unit_id ELSE h.unit_trailer_id END) = p_asset_id;
  v_ket := COALESCE(v_ket, (SELECT 'penjualan ' || COALESCE(p.nomor_surat, '') FROM transport.penjualan_unit p
            WHERE p.status = 1 AND p.status_approval = 'menunggu'
              AND (CASE WHEN p_jenis_aset = 'unit' THEN p.unit_id ELSE p.unit_trailer_id END) = p_asset_id LIMIT 1));
  IF v_ket IS NOT NULL THEN
    RAISE EXCEPTION '% % masih menunggu approval %.', initcap(v_lbl), v.kode, v_ket USING ERRCODE = 'check_violation';
  END IF;
  RETURN v.status_aset;
END;
$$;
REVOKE ALL ON FUNCTION transport._cek_aset_boleh_dihapus(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION transport._rincian_penghapusan(h transport.penghapusan_aset)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT jsonb_build_object(
    'jenis_aset', h.jenis_aset,
    'kode_aset', COALESCE((SELECT kode_unit FROM transport.units WHERE id = h.unit_id),
                          (SELECT kode_trailer FROM transport.unit_trailer WHERE id = h.unit_trailer_id)),
    'tanggal_hapus', h.tanggal_hapus, 'alasan', h.alasan, 'catatan', h.catatan,
    'nomor_berita_acara', h.nomor_berita_acara, 'status_aset_sebelum', h.status_aset_sebelum);
$$;

CREATE OR REPLACE FUNCTION transport._judul_penghapusan(h transport.penghapusan_aset)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT 'Hapus ' || CASE WHEN h.jenis_aset = 'unit' THEN 'unit ' ELSE 'unit trailer ' END
         || COALESCE((SELECT kode_unit FROM transport.units WHERE id = h.unit_id),
                     (SELECT kode_trailer FROM transport.unit_trailer WHERE id = h.unit_trailer_id), '')
         || ' · ' || h.alasan;
$$;

-- Salinan 20260926000011 + approval: tersimpan 'menunggu', efek ke aset ditunda.
CREATE OR REPLACE FUNCTION transport.catat_penghapusan_aset(
  p_jenis_aset    TEXT,
  p_asset_id      UUID,
  p_tanggal_hapus DATE,
  p_alasan        TEXT,
  p_catatan       TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_status TEXT;
  v_row    transport.penghapusan_aset%ROWTYPE;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_jenis_aset NOT IN ('unit', 'unit_trailer') THEN
    RAISE EXCEPTION 'Jenis aset tidak valid.' USING ERRCODE = 'check_violation';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan penghapusan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_hapus IS NULL THEN
    RAISE EXCEPTION 'Tanggal penghapusan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  v_status := transport._cek_aset_boleh_dihapus(p_jenis_aset, p_asset_id);

  INSERT INTO transport.penghapusan_aset (
    jenis_aset, unit_id, unit_trailer_id, tanggal_hapus, alasan, catatan, status_aset_sebelum, created_by,
    nomor_berita_acara, status_approval)
  VALUES (
    p_jenis_aset,
    CASE WHEN p_jenis_aset = 'unit' THEN p_asset_id END,
    CASE WHEN p_jenis_aset = 'unit_trailer' THEN p_asset_id END,
    p_tanggal_hapus, btrim(p_alasan), NULLIF(btrim(COALESCE(p_catatan, '')), ''), v_status, auth.uid(),
    transport.next_nomor_dokumen('berita_acara_penghapusan', 'BAP', p_tanggal_hapus), 'menunggu')
  RETURNING * INTO v_row;

  -- Status aset berubah Diafkirkan nanti, saat disetujui (_terapkan_penghapusan).
  PERFORM transport._ajukan_approval('penghapusan_aset', v_row.id, transport._judul_penghapusan(v_row),
    transport._rincian_penghapusan(v_row), NULL);
  RETURN v_row.id;
END;
$$;

CREATE OR REPLACE FUNCTION transport._terapkan_penghapusan(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_row  transport.penghapusan_aset%ROWTYPE;
  v_aset UUID;
BEGIN
  SELECT * INTO v_row FROM transport.penghapusan_aset WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Catatan penghapusan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  v_aset := COALESCE(v_row.unit_id, v_row.unit_trailer_id);
  PERFORM transport._cek_aset_boleh_dihapus(v_row.jenis_aset, v_aset, v_row.id);

  PERFORM set_config('app.status_note', 'Dihapus: ' || v_row.alasan, true);
  IF v_row.jenis_aset = 'unit' THEN
    UPDATE transport.units SET status_operasional = 'diafkirkan', updated_at = now() WHERE id = v_aset;
  ELSE
    UPDATE transport.unit_trailer SET status_trailer = 'diafkirkan', updated_at = now() WHERE id = v_aset;
  END IF;
  PERFORM set_config('app.status_note', '', true);
  PERFORM transport._tutup_insiden_aset(v_row.jenis_aset, v_aset, 'diafkirkan');
END;
$$;
REVOKE ALL ON FUNCTION transport._terapkan_penghapusan(UUID) FROM PUBLIC, anon, authenticated;

-- Salinan 20260926000012 + approval.
CREATE OR REPLACE FUNCTION transport.ubah_penghapusan_aset(
  p_id UUID, p_tanggal_hapus DATE, p_alasan TEXT, p_catatan TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_row transport.penghapusan_aset%ROWTYPE;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM transport.penghapusan_aset WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Catatan penghapusan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  -- BATASAN: penghapusan yang ditolak approver tidak bisa diedit (ajukan ulang).
  IF v_row.status_approval = 'ditolak' THEN
    RAISE EXCEPTION 'Penghapusan % sudah ditolak approver — catat penghapusan baru bila ingin mengajukan ulang.',
      COALESCE(v_row.nomor_berita_acara, '') USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.bukti_path IS NOT NULL THEN
    RAISE EXCEPTION 'Penghapusan % tidak bisa diedit karena berita acara bertanda tangan sudah diunggah.',
      COALESCE(v_row.nomor_berita_acara, '') USING ERRCODE = 'check_violation';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan penghapusan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_hapus IS NULL THEN
    RAISE EXCEPTION 'Tanggal penghapusan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE transport.penghapusan_aset
     SET tanggal_hapus = p_tanggal_hapus,
         alasan = btrim(p_alasan),
         catatan = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
         updated_at = now()
   WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.status_approval = 'menunggu' THEN
    PERFORM transport._perbarui_approval('penghapusan_aset', p_id, transport._judul_penghapusan(v_row),
      transport._rincian_penghapusan(v_row), NULL);
  END IF;
END;
$$;

-- Salinan 20260926000012 + approval: yang belum disetujui cukup dibatalkan.
CREATE OR REPLACE FUNCTION transport.batalkan_penghapusan_aset(
  p_id UUID, p_alasan TEXT, p_insiden JSONB DEFAULT '[]'::jsonb)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_row    transport.penghapusan_aset%ROWTYPE;
  v_aset   UUID;
  v_kode   TEXT;
  v_status TEXT;
  v_label  TEXT;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_row FROM transport.penghapusan_aset WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Catatan penghapusan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status_approval <> 'disetujui' THEN
    UPDATE transport.penghapusan_aset
       SET status = 2, alasan_batal = btrim(p_alasan), updated_at = now()
     WHERE id = p_id;
    PERFORM transport._batalkan_approval('penghapusan_aset', p_id);
    RETURN;
  END IF;

  IF v_row.bukti_path IS NOT NULL THEN
    RAISE EXCEPTION 'Penghapusan % tidak bisa dibatalkan karena berita acara bertanda tangan sudah diunggah.',
      COALESCE(v_row.nomor_berita_acara, '') USING ERRCODE = 'check_violation';
  END IF;

  v_label := CASE WHEN v_row.jenis_aset = 'unit' THEN 'unit' ELSE 'unit trailer' END;
  IF v_row.jenis_aset = 'unit' THEN
    v_aset := v_row.unit_id;
    SELECT kode_unit, status_operasional::text INTO v_kode, v_status
      FROM transport.units WHERE id = v_aset FOR UPDATE;
  ELSE
    v_aset := v_row.unit_trailer_id;
    SELECT kode_trailer, status_trailer INTO v_kode, v_status
      FROM transport.unit_trailer WHERE id = v_aset FOR UPDATE;
  END IF;
  -- Aset yang sudah dijual setelah dihapus: batalkan penjualannya dulu.
  IF v_status IS DISTINCT FROM 'diafkirkan' THEN
    RAISE EXCEPTION 'Penghapusan % % tidak bisa dibatalkan karena statusnya kini %.', v_label, v_kode, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE transport.penghapusan_aset
     SET status = 2, alasan_batal = btrim(p_alasan), updated_at = now()
   WHERE id = p_id;

  PERFORM set_config('app.status_note', 'Penghapusan dibatalkan: ' || btrim(p_alasan), true);
  IF v_row.jenis_aset = 'unit' THEN
    UPDATE transport.units SET status_operasional = 'standby', updated_at = now() WHERE id = v_aset;
  ELSE
    UPDATE transport.unit_trailer SET status_trailer = 'standby', updated_at = now() WHERE id = v_aset;
  END IF;
  PERFORM set_config('app.status_note', '', true);
  PERFORM transport._buka_insiden_aset(v_row.jenis_aset, v_aset, 'diafkirkan', p_insiden);
END;
$$;

-- ── 5. Penerapan hasil approval per fitur ───────────────────────────────────
CREATE OR REPLACE FUNCTION transport._terapkan_hasil_approval(p_fitur TEXT, p_ref_id UUID, p_hasil TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  -- Izinkan perubahan status_approval (lihat _cek_status_approval_dari_mesin).
  PERFORM set_config('app.approval_mesin', 'on', true);
  CASE p_fitur
    WHEN 'tambahan_uang_jalan' THEN
      UPDATE transport.uang_jalan SET status_approval = p_hasil WHERE id = p_ref_id;
    WHEN 'penjualan_aset' THEN
      UPDATE transport.penjualan_unit SET status_approval = p_hasil, updated_at = now() WHERE id = p_ref_id;
      IF p_hasil = 'disetujui' THEN
        PERFORM transport._terapkan_penjualan(p_ref_id);
      END IF;
    WHEN 'penghapusan_aset' THEN
      UPDATE transport.penghapusan_aset SET status_approval = p_hasil, updated_at = now() WHERE id = p_ref_id;
      IF p_hasil = 'disetujui' THEN
        PERFORM transport._terapkan_penghapusan(p_ref_id);
      END IF;
    ELSE
      RAISE EXCEPTION 'Penerapan approval untuk fitur % belum tersedia.', p_fitur USING ERRCODE = 'P0002';
  END CASE;
  PERFORM set_config('app.approval_mesin', '', true);
END;
$$;
REVOKE ALL ON FUNCTION transport._terapkan_hasil_approval(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
