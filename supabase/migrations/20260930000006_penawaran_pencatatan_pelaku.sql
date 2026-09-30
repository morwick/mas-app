-- ============================================================================
-- Migration 20260930000006: Pencatatan pelaku di surat penawaran
--
--   * transport.quotation_items.diputuskan_oleh (karyawan_id) — siapa yang
--     memberi keputusan item (deal / tolak / revisi harga / alasan). Diisi
--     trigger dari sesi login setiap kali keputusan item berubah, jadi yang
--     tersimpan selalu karyawan TERAKHIR yang mengubahnya. Kembali "menunggu"
--     (mis. penawaran dibuka kembali) → NULL, sama seperti diputuskan_at.
--   * transport.quotations.berlaku_diatur_oleh / berlaku_diatur_at — siapa &
--     kapan terakhir mengisi / mengubah "Berlaku sampai" (buat, edit, atau
--     cetak surat revisi). Diisi trigger.
--   * transport.quotations.revisi_dibuat_oleh / revisi_dibuat_at — siapa &
--     kapan surat versi revisi dibuat (tanggal_revisi disimpan). Diisi trigger;
--     kosong lagi bila surat revisi dibatalkan (penawaran dibuka kembali).
--   * transport.catat_cetak_penawaran(p_quotation_id, p_versi) — setiap cetak
--     surat penawaran (versi asli / revisi) tercatat di log sistem dengan aksi
--     baru 'Cetak Dokumen' (karyawan, waktu, IP dari sesi login).
--   * transport.nama_karyawan(p_ids) — nama karyawan untuk ditampilkan
--     ("Diputuskan oleh …"), hanya untuk staf yang login.
--   * transport._karyawan_sesi() — karyawan pelaku dari sesi login (atau
--     identitas manual SQL Editor), aturan sama dengan _tulis_log().
--
-- AMAN UNTUK KODE LAMA: kolom baru (boleh NULL), trigger yang hanya mengisi
-- kolom baru itu, dan satu nilai aksi log baru. Baris lama tidak diubah
-- (pelaku lama tidak diketahui → tetap NULL).
-- WAJIB: jalankan setelah 20260930000005.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Kolom pelaku ─────────────────────────────────────────────────────────
ALTER TABLE transport.quotation_items
  ADD COLUMN IF NOT EXISTS diputuskan_oleh UUID REFERENCES hr.karyawan(id);
COMMENT ON COLUMN transport.quotation_items.diputuskan_oleh IS
  'Karyawan terakhir yang memberi / mengubah keputusan item (deal, tolak, revisi harga).';

ALTER TABLE transport.quotations
  ADD COLUMN IF NOT EXISTS berlaku_diatur_oleh UUID REFERENCES hr.karyawan(id);
ALTER TABLE transport.quotations
  ADD COLUMN IF NOT EXISTS berlaku_diatur_at TIMESTAMPTZ;
ALTER TABLE transport.quotations
  ADD COLUMN IF NOT EXISTS revisi_dibuat_oleh UUID REFERENCES hr.karyawan(id);
ALTER TABLE transport.quotations
  ADD COLUMN IF NOT EXISTS revisi_dibuat_at TIMESTAMPTZ;
COMMENT ON COLUMN transport.quotations.revisi_dibuat_oleh IS
  'Karyawan yang membuat surat versi revisi (menyimpan tanggal_revisi).';
COMMENT ON COLUMN transport.quotations.berlaku_diatur_oleh IS
  'Karyawan terakhir yang mengisi / mengubah berlaku_sampai (buat, edit, atau cetak surat revisi).';

-- ── 2. Karyawan pelaku dari sesi ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport._karyawan_sesi()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_sesi     UUID;
  v_karyawan UUID;
  v_pelaku   UUID := NULLIF(current_setting('app.log_pelaku_id', true), '')::uuid;
BEGIN
  IF v_pelaku IS NOT NULL THEN
    SELECT p.karyawan_id INTO v_karyawan FROM transport.profiles p WHERE p.id = v_pelaku AND p.status = 1;
    RETURN v_karyawan;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    BEGIN
      v_sesi := NULLIF(auth.jwt() ->> 'session_id', '')::uuid;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
    SELECT s.karyawan_id INTO v_karyawan
      FROM transport.sesi_pengguna s
     WHERE s.auth_session_id = v_sesi AND s.user_id = auth.uid() AND s.status = 1;
    RETURN v_karyawan;
  END IF;
  RETURN NULLIF(current_setting('app.manual_karyawan', true), '')::uuid;
END;
$$;
REVOKE ALL ON FUNCTION transport._karyawan_sesi() FROM PUBLIC, anon, authenticated;

-- ── 3. Trigger: keputusan item ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.quotation_item_catat_pemutus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.keputusan IS DISTINCT FROM OLD.keputusan
     OR NEW.harga_revisi IS DISTINCT FROM OLD.harga_revisi
     OR NEW.alasan_ditolak IS DISTINCT FROM OLD.alasan_ditolak THEN
    NEW.diputuskan_oleh := CASE WHEN NEW.keputusan = 'menunggu' THEN NULL ELSE transport._karyawan_sesi() END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_quotation_item_catat_pemutus ON transport.quotation_items;
CREATE TRIGGER trg_quotation_item_catat_pemutus
  BEFORE UPDATE ON transport.quotation_items
  FOR EACH ROW EXECUTE FUNCTION transport.quotation_item_catat_pemutus();

-- ── 4. Trigger: berlaku sampai & pembuat surat revisi ───────────────────────
CREATE OR REPLACE FUNCTION transport.quotation_catat_pengatur_berlaku()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.berlaku_sampai IS DISTINCT FROM OLD.berlaku_sampai THEN
    NEW.berlaku_diatur_oleh := transport._karyawan_sesi();
    NEW.berlaku_diatur_at := now();
  END IF;
  -- Pembuat surat versi revisi.
  IF (TG_OP = 'INSERT' AND NEW.tanggal_revisi IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.tanggal_revisi IS DISTINCT FROM OLD.tanggal_revisi) THEN
    IF NEW.tanggal_revisi IS NULL THEN
      NEW.revisi_dibuat_oleh := NULL;
      NEW.revisi_dibuat_at := NULL;
    ELSE
      NEW.revisi_dibuat_oleh := transport._karyawan_sesi();
      NEW.revisi_dibuat_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_quotation_catat_pengatur_berlaku ON transport.quotations;
CREATE TRIGGER trg_quotation_catat_pengatur_berlaku
  BEFORE INSERT OR UPDATE ON transport.quotations
  FOR EACH ROW EXECUTE FUNCTION transport.quotation_catat_pengatur_berlaku();

-- ── 5. Log cetak ────────────────────────────────────────────────────────────
ALTER TABLE transport.log_sistem DROP CONSTRAINT IF EXISTS log_sistem_aksi_check;
ALTER TABLE transport.log_sistem ADD CONSTRAINT log_sistem_aksi_check
  CHECK (aksi IN ('Login', 'Logout', 'Tambah Data', 'Update Data', 'Hapus Data', 'Cetak Dokumen'));

CREATE OR REPLACE FUNCTION transport.catat_cetak_penawaran(p_quotation_id UUID, p_versi TEXT DEFAULT 'asli')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_nomor TEXT;
BEGIN
  IF transport.role_aktif() IS NULL THEN
    RAISE EXCEPTION 'Butuh login' USING ERRCODE = '28000';
  END IF;
  IF p_versi NOT IN ('asli', 'revisi') THEN
    RAISE EXCEPTION 'Versi surat % tidak dikenal', p_versi USING ERRCODE = '22023';
  END IF;
  SELECT q.quote_number INTO v_nomor FROM transport.quotations q WHERE q.id = p_quotation_id AND q.status = 1;
  IF v_nomor IS NULL THEN
    RAISE EXCEPTION 'Penawaran tidak ditemukan' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM transport._tulis_log(
    'Cetak Dokumen',
    'Cetak surat penawaran ' || v_nomor || CASE WHEN p_versi = 'revisi' THEN ' (versi revisi)' ELSE '' END
  );
END;
$$;
REVOKE ALL ON FUNCTION transport.catat_cetak_penawaran(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.catat_cetak_penawaran(UUID, TEXT) TO authenticated;

-- ── 6. Nama karyawan untuk tampilan ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.nama_karyawan(p_ids UUID[])
RETURNS TABLE (id UUID, nama TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT k.id, k.nama
    FROM hr.karyawan k
   WHERE k.id = ANY (p_ids) AND transport.role_aktif() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION transport.nama_karyawan(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.nama_karyawan(UUID[]) TO authenticated;
