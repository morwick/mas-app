-- ============================================================================
-- Migration 20260926000006: unit trailer diperlakukan sama dengan unit
--
-- Unit trailer tetap aset sendiri yang dipasang per job, tapi kini punya:
--   * status yang sama dengan unit: standby / bertugas / breakdown /
--     perbaikan / terjual / diafkirkan (kolom status_trailer, TEXT + CHECK);
--   * dokumen KIR (nomor, berlaku sampai) & SRUT — Surat Registrasi Uji Tipe
--     (nomor, tanggal) — semuanya opsional;
--   * riwayat status (tabel unit_trailer_status_history, diisi trigger;
--     alasan lewat app.status_note seperti unit);
--   * status otomatis dari job: dipakai job yang belum selesai → Bertugas,
--     tidak ada job berjalan lagi → Standby (hanya dari Standby / Bertugas);
--   * insiden langsung pada trailer (incident_logs.unit_trailer_id) dengan
--     alur yang sama: Open → Breakdown, Dalam penanganan → Perbaikan,
--     Selesai → Standby / Bertugas;
--   * afkir & kembali dari afkir yang sama dengan unit.
--
-- Insiden yang ditutup otomatis kini dicatat umum: kolom ditutup_karena
-- ('diafkirkan' / 'terjual') & status_sebelum_ditutup, menggantikan
-- ditutup_afkir & status_sebelum_afkir (migration 20260926000002).
-- afkirkan_unit / kembalikan_unit_dari_afkir diganti afkirkan_aset /
-- kembalikan_aset_dari_afkir (parameter jenis aset: 'unit' / 'unit_trailer').
--
-- Perubahan data (tercatat di log sistem atas nama superadmin aktif pertama):
--   * insiden yang dulu ditandai ditutup_afkir → ditutup_karena 'diafkirkan';
--   * trailer Standby yang sedang dipakai job berjalan → Bertugas.
-- WAJIB: jalankan setelah 20260926000005. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Kolom & status unit trailer ──────────────────────────────────────────
ALTER TABLE transport.unit_trailer
  ADD COLUMN IF NOT EXISTS kir_nomor TEXT,
  ADD COLUMN IF NOT EXISTS kir_berlaku_sampai DATE,
  ADD COLUMN IF NOT EXISTS srut_nomor TEXT,
  ADD COLUMN IF NOT EXISTS srut_tanggal DATE;
COMMENT ON COLUMN transport.unit_trailer.srut_nomor IS 'Nomor Surat Registrasi Uji Tipe (opsional)';

ALTER TABLE transport.unit_trailer DROP CONSTRAINT IF EXISTS unit_trailer_status_trailer_check;
ALTER TABLE transport.unit_trailer
  ADD CONSTRAINT unit_trailer_status_trailer_check
  CHECK (status_trailer IN ('standby', 'bertugas', 'breakdown', 'perbaikan', 'terjual', 'diafkirkan'));
COMMENT ON COLUMN transport.unit_trailer.status_trailer IS
  'Sama dengan status unit: standby / bertugas / breakdown / perbaikan / terjual / diafkirkan';

-- ── 2. Akses per scope (seperti can_access_unit) ────────────────────────────
CREATE OR REPLACE FUNCTION transport.can_access_unit_trailer(p_unit_trailer_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = transport
STABLE
AS $$
  SELECT
    transport.is_superadmin()
    OR transport.is_admin()
    OR EXISTS (
      SELECT 1
        FROM transport.unit_trailer t
        JOIN transport.jenis_unit_trailer jt ON jt.id = t.jenis_unit_trailer_id
       WHERE t.id = p_unit_trailer_id
         AND jt.jenis_unit_id = ANY (COALESCE(transport.current_user_jenis_scope(), ARRAY[]::UUID[]))
    );
$$;

-- ── 3. Riwayat status unit trailer ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.unit_trailer_status_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_trailer_id  UUID NOT NULL REFERENCES transport.unit_trailer(id),
  status_old       TEXT,
  status_new       TEXT NOT NULL,
  changed_by       UUID REFERENCES transport.profiles(id),
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason           TEXT,
  status           SMALLINT NOT NULL DEFAULT 1
                   CONSTRAINT unit_trailer_status_history_status_check CHECK (status IN (1, 2))
);
COMMENT ON COLUMN transport.unit_trailer_status_history.status IS '1 = aktif, 2 = dihapus (soft delete)';
CREATE INDEX IF NOT EXISTS idx_unit_trailer_history
  ON transport.unit_trailer_status_history (unit_trailer_id, changed_at DESC) WHERE status = 1;

ALTER TABLE transport.unit_trailer_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_unit_trailer_history" ON transport.unit_trailer_status_history;
CREATE POLICY "admin_read_unit_trailer_history"
  ON transport.unit_trailer_status_history FOR SELECT TO authenticated
  USING (transport.is_active_admin() AND transport.can_access_unit_trailer(unit_trailer_id));
GRANT SELECT ON transport.unit_trailer_status_history TO authenticated;
GRANT ALL ON transport.unit_trailer_status_history TO service_role;
REVOKE ALL ON transport.unit_trailer_status_history FROM anon;

CREATE OR REPLACE FUNCTION transport.log_unit_trailer_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.status_trailer IS DISTINCT FROM OLD.status_trailer THEN
    INSERT INTO transport.unit_trailer_status_history (unit_trailer_id, status_old, status_new, changed_by, reason)
    VALUES (NEW.id, OLD.status_trailer, NEW.status_trailer, auth.uid(),
            NULLIF(current_setting('app.status_note', true), ''));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_unit_trailer_status ON transport.unit_trailer;
CREATE TRIGGER trg_log_unit_trailer_status AFTER UPDATE OF status_trailer ON transport.unit_trailer
  FOR EACH ROW EXECUTE FUNCTION transport.log_unit_trailer_status_change();

-- ── 4. Guard: trailer terjual / diafkirkan tidak bisa dipakai job ───────────
CREATE OR REPLACE FUNCTION transport.jobs_cek_unit_trailer_terjual()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_kode   TEXT;
  v_status TEXT;
BEGIN
  IF NEW.unit_trailer_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.unit_trailer_id IS NOT DISTINCT FROM OLD.unit_trailer_id THEN
    RETURN NEW;
  END IF;
  SELECT ut.kode_trailer, ut.status_trailer INTO v_kode, v_status FROM transport.unit_trailer ut
   WHERE ut.id = NEW.unit_trailer_id AND ut.status_trailer IN ('terjual', 'diafkirkan');
  IF v_kode IS NOT NULL THEN
    RAISE EXCEPTION 'Unit trailer % sudah % — tidak bisa dipakai untuk job.', v_kode, v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Menjual / mengafkirkan trailer: tidak boleh ada job yang belum selesai.
CREATE OR REPLACE FUNCTION transport.unit_trailer_cek_terjual()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_job TEXT;
BEGIN
  IF NEW.status_trailer NOT IN ('terjual', 'diafkirkan') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status_trailer NOT IN ('terjual', 'diafkirkan') THEN
    SELECT j.job_number INTO v_job FROM transport.jobs j
     WHERE j.unit_trailer_id = NEW.id AND j.status = 1
       AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd LIMIT 1;
    IF v_job IS NOT NULL THEN
      RAISE EXCEPTION 'Unit trailer % tidak bisa diubah menjadi %: masih dipakai job % yang belum selesai.',
        NEW.kode_trailer, initcap(NEW.status_trailer), v_job USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 5. Status trailer mengikuti job ─────────────────────────────────────────
-- Hanya Standby ↔ Bertugas; trailer Breakdown / Perbaikan / Terjual /
-- Diafkirkan tidak disentuh (sama seperti unit).
CREATE OR REPLACE FUNCTION transport._sinkron_status_trailer_job(p_unit_trailer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_status    TEXT;
  v_job       TEXT;
  v_note_lama TEXT;
BEGIN
  IF p_unit_trailer_id IS NULL THEN
    RETURN;
  END IF;
  SELECT status_trailer INTO v_status FROM transport.unit_trailer WHERE id = p_unit_trailer_id AND status = 1;
  IF v_status IS NULL OR v_status NOT IN ('standby', 'bertugas') THEN
    RETURN;
  END IF;
  SELECT j.job_number INTO v_job FROM transport.jobs j
   WHERE j.unit_trailer_id = p_unit_trailer_id AND j.status = 1
     AND j.status_job NOT IN ('selesai', 'cancelled')
   ORDER BY j.etd LIMIT 1;

  v_note_lama := current_setting('app.status_note', true);
  IF v_job IS NOT NULL AND v_status = 'standby' THEN
    PERFORM set_config('app.status_note', 'Dipakai job ' || v_job, true);
    UPDATE transport.unit_trailer SET status_trailer = 'bertugas', updated_at = now() WHERE id = p_unit_trailer_id;
  ELSIF v_job IS NULL AND v_status = 'bertugas' THEN
    PERFORM set_config('app.status_note', 'Tidak ada job berjalan', true);
    UPDATE transport.unit_trailer SET status_trailer = 'standby', updated_at = now() WHERE id = p_unit_trailer_id;
  END IF;
  PERFORM set_config('app.status_note', COALESCE(v_note_lama, ''), true);
END;
$$;
REVOKE ALL ON FUNCTION transport._sinkron_status_trailer_job(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION transport.sync_unit_trailer_status_with_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  PERFORM transport._sinkron_status_trailer_job(NEW.unit_trailer_id);
  IF TG_OP = 'UPDATE' AND OLD.unit_trailer_id IS DISTINCT FROM NEW.unit_trailer_id THEN
    PERFORM transport._sinkron_status_trailer_job(OLD.unit_trailer_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_unit_trailer_status ON transport.jobs;
CREATE TRIGGER trg_sync_unit_trailer_status
  AFTER INSERT OR UPDATE OF status_job, unit_trailer_id, status ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.sync_unit_trailer_status_with_job();

-- ── 6. Insiden untuk unit atau unit trailer ─────────────────────────────────
ALTER TABLE transport.incident_logs ALTER COLUMN unit_id DROP NOT NULL;
ALTER TABLE transport.incident_logs
  ADD COLUMN IF NOT EXISTS unit_trailer_id UUID REFERENCES transport.unit_trailer(id);
ALTER TABLE transport.incident_logs DROP CONSTRAINT IF EXISTS incident_logs_aset_check;
ALTER TABLE transport.incident_logs
  ADD CONSTRAINT incident_logs_aset_check CHECK (num_nonnulls(unit_id, unit_trailer_id) = 1);
CREATE INDEX IF NOT EXISTS idx_incident_unit_trailer
  ON transport.incident_logs (unit_trailer_id, tanggal DESC) WHERE unit_trailer_id IS NOT NULL;

-- Penutupan otomatis: alasan umum (diafkirkan / terjual).
ALTER TABLE transport.incident_logs
  ADD COLUMN IF NOT EXISTS ditutup_karena TEXT;
ALTER TABLE transport.incident_logs DROP CONSTRAINT IF EXISTS incident_logs_ditutup_karena_check;
ALTER TABLE transport.incident_logs
  ADD CONSTRAINT incident_logs_ditutup_karena_check CHECK (ditutup_karena IN ('diafkirkan', 'terjual'));
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'transport' AND table_name = 'incident_logs'
                AND column_name = 'status_sebelum_afkir') THEN
    ALTER TABLE transport.incident_logs RENAME COLUMN status_sebelum_afkir TO status_sebelum_ditutup;
  END IF;
END $$;
ALTER TABLE transport.incident_logs
  ADD COLUMN IF NOT EXISTS status_sebelum_ditutup transport.incident_status;

-- ── 7. Transisi status insiden: pengecualian hanya di fungsi penutupan ──────
CREATE OR REPLACE FUNCTION transport.incident_cek_perubahan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.status = 2 AND OLD.status = 1 AND OLD.status_penanganan <> 'open' THEN
    RAISE EXCEPTION 'Insiden yang sudah dalam penanganan atau selesai tidak bisa dihapus.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status_penanganan IS DISTINCT FROM OLD.status_penanganan
     AND NOT (OLD.status_penanganan = 'open' AND NEW.status_penanganan = 'in_progress')
     AND NOT (OLD.status_penanganan = 'in_progress' AND NEW.status_penanganan = 'resolved')
     AND COALESCE(current_setting('app.alur_tutup_insiden', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Status insiden tidak bisa diubah dari % ke %. Alurnya: Open → Dalam penanganan → Selesai.',
      OLD.status_penanganan, NEW.status_penanganan USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 8. Insiden baru ditolak untuk aset terjual / diafkirkan ─────────────────
CREATE OR REPLACE FUNCTION transport.incident_cek_unit_armada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_kode   TEXT;
  v_status TEXT;
BEGIN
  IF NEW.unit_id IS NOT NULL THEN
    SELECT u.kode_unit, u.status_operasional::text INTO v_kode, v_status FROM transport.units u
     WHERE u.id = NEW.unit_id AND u.status_operasional::text IN ('terjual', 'diafkirkan');
    IF v_kode IS NOT NULL THEN
      RAISE EXCEPTION 'Unit % sudah % — tidak bisa ditambahkan insiden.', v_kode, v_status
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT t.kode_trailer, t.status_trailer INTO v_kode, v_status FROM transport.unit_trailer t
     WHERE t.id = NEW.unit_trailer_id AND t.status_trailer IN ('terjual', 'diafkirkan');
    IF v_kode IS NOT NULL THEN
      RAISE EXCEPTION 'Unit trailer % sudah % — tidak bisa ditambahkan insiden.', v_kode, v_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 9. Status aset mengikuti insiden (unit & unit trailer) ──────────────────
CREATE OR REPLACE FUNCTION transport.incident_sync_status_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_trailer    BOOLEAN := NEW.unit_id IS NULL;
  v_ada_proses BOOLEAN;
  v_ada_open   BOOLEAN;
  v_target     TEXT;
  v_boleh_dari TEXT[];
  v_note       TEXT;
  v_note_lama  TEXT;
BEGIN
  SELECT COALESCE(bool_or(i.status_penanganan = 'in_progress'), false),
         COALESCE(bool_or(i.status_penanganan = 'open'), false)
    INTO v_ada_proses, v_ada_open
    FROM transport.incident_logs i
   WHERE i.status = 1 AND i.status_penanganan <> 'resolved'
     AND CASE WHEN v_trailer THEN i.unit_trailer_id = NEW.unit_trailer_id ELSE i.unit_id = NEW.unit_id END;

  IF v_ada_proses THEN
    v_target := 'perbaikan';
    v_boleh_dari := ARRAY['standby', 'bertugas', 'breakdown'];
    v_note := 'Insiden dalam penanganan';
  ELSIF v_ada_open THEN
    v_target := 'breakdown';
    v_boleh_dari := ARRAY['standby', 'bertugas', 'perbaikan'];
    v_note := 'Insiden ' || NEW.tipe::text || ' dicatat';
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 1 AND OLD.status_penanganan <> 'resolved'
        AND (NEW.status <> 1 OR NEW.status_penanganan = 'resolved') THEN
    -- Insiden terakhir yang belum selesai baru saja diselesaikan / dihapus.
    v_target := CASE WHEN EXISTS (
                  SELECT 1 FROM transport.jobs j
                   WHERE j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
                     AND CASE WHEN v_trailer THEN j.unit_trailer_id = NEW.unit_trailer_id
                              ELSE j.unit_id = NEW.unit_id END)
                THEN 'bertugas' ELSE 'standby' END;
    v_boleh_dari := ARRAY['breakdown', 'perbaikan'];
    v_note := CASE WHEN NEW.status <> 1 THEN 'Insiden dihapus' ELSE 'Perbaikan insiden selesai' END;
  ELSE
    RETURN NULL;
  END IF;

  -- Alasan ikut tercatat di riwayat status aset.
  v_note_lama := current_setting('app.status_note', true);
  PERFORM set_config('app.status_note', v_note, true);
  IF v_trailer THEN
    UPDATE transport.unit_trailer
       SET status_trailer = v_target, updated_at = now()
     WHERE id = NEW.unit_trailer_id AND status = 1
       AND status_trailer = ANY (v_boleh_dari);
  ELSE
    UPDATE transport.units
       SET status_operasional = v_target::transport.unit_status, updated_at = now()
     WHERE id = NEW.unit_id AND status = 1
       AND status_operasional::text = ANY (v_boleh_dari);
  END IF;
  PERFORM set_config('app.status_note', COALESCE(v_note_lama, ''), true);

  RETURN NULL;
END;
$$;

-- ── 10. Tutup / buka lagi insiden aset (dipakai afkir & penjualan) ──────────
CREATE OR REPLACE FUNCTION transport._tutup_insiden_aset(p_jenis_aset TEXT, p_asset_id UUID, p_karena TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_jumlah INTEGER;
BEGIN
  PERFORM set_config('app.alur_tutup_insiden', 'on', true);
  UPDATE transport.incident_logs
     SET status_sebelum_ditutup = status_penanganan,
         status_penanganan = 'resolved',
         ditutup_karena = p_karena
   WHERE status = 1 AND status_penanganan <> 'resolved'
     AND CASE WHEN p_jenis_aset = 'unit' THEN unit_id = p_asset_id ELSE unit_trailer_id = p_asset_id END;
  GET DIAGNOSTICS v_jumlah = ROW_COUNT;
  PERFORM set_config('app.alur_tutup_insiden', '', true);
  RETURN v_jumlah;
END;
$$;
REVOKE ALL ON FUNCTION transport._tutup_insiden_aset(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- p_insiden: [{"id": "<uuid>", "status": "open" | "in_progress"}, ...].
-- Insiden yang tidak disebut dibuka ke status sebelum ditutup.
CREATE OR REPLACE FUNCTION transport._buka_insiden_aset(
  p_jenis_aset TEXT, p_asset_id UUID, p_karena TEXT, p_insiden JSONB DEFAULT '[]'::jsonb)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_item   JSONB;
  v_inc    transport.incident_logs%ROWTYPE;
  v_target TEXT;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_insiden, '[]'::jsonb)) LOOP
    IF v_item ->> 'status' IS NULL OR v_item ->> 'status' NOT IN ('open', 'in_progress') THEN
      RAISE EXCEPTION 'Status insiden harus Open atau Dalam penanganan.' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM transport.incident_logs i
       WHERE i.id = (v_item ->> 'id')::uuid AND i.status = 1
         AND i.ditutup_karena = p_karena AND i.status_penanganan = 'resolved'
         AND CASE WHEN p_jenis_aset = 'unit' THEN i.unit_id = p_asset_id ELSE i.unit_trailer_id = p_asset_id END) THEN
      RAISE EXCEPTION 'Insiden % bukan insiden yang ditutup karena aset %.', v_item ->> 'id', p_karena
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  PERFORM set_config('app.alur_tutup_insiden', 'on', true);
  FOR v_inc IN
    SELECT * FROM transport.incident_logs i
     WHERE i.status = 1 AND i.ditutup_karena = p_karena AND i.status_penanganan = 'resolved'
       AND CASE WHEN p_jenis_aset = 'unit' THEN i.unit_id = p_asset_id ELSE i.unit_trailer_id = p_asset_id END
     ORDER BY i.tanggal
  LOOP
    v_target := NULL;
    SELECT e ->> 'status' INTO v_target
      FROM jsonb_array_elements(COALESCE(p_insiden, '[]'::jsonb)) e
     WHERE (e ->> 'id')::uuid = v_inc.id
     LIMIT 1;
    v_target := COALESCE(v_target, v_inc.status_sebelum_ditutup::text, 'open');
    -- Trigger incident_sync_status_unit menyesuaikan status aset.
    UPDATE transport.incident_logs
       SET status_penanganan = v_target::transport.incident_status,
           ditutup_karena = NULL,
           status_sebelum_ditutup = NULL
     WHERE id = v_inc.id;
  END LOOP;
  PERFORM set_config('app.alur_tutup_insiden', '', true);
END;
$$;
REVOKE ALL ON FUNCTION transport._buka_insiden_aset(TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ── 11. Afkir & kembali dari afkir (unit / unit trailer) ────────────────────
DROP FUNCTION IF EXISTS transport.afkirkan_unit(UUID, TEXT);
DROP FUNCTION IF EXISTS transport.kembalikan_unit_dari_afkir(UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION transport.afkirkan_aset(p_jenis_aset TEXT, p_asset_id UUID, p_alasan TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_kode   TEXT;
  v_status TEXT;
  v_label  TEXT := CASE WHEN p_jenis_aset = 'unit' THEN 'Unit' ELSE 'Unit trailer' END;
BEGIN
  IF NOT transport.is_active_admin() THEN
    RAISE EXCEPTION 'Butuh login admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_jenis_aset NOT IN ('unit', 'unit_trailer') THEN
    RAISE EXCEPTION 'Jenis aset tidak valid.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_jenis_aset = 'unit' THEN
    SELECT kode_unit, status_operasional::text INTO v_kode, v_status
      FROM transport.units WHERE id = p_asset_id AND status = 1 FOR UPDATE;
    IF v_kode IS NULL OR NOT transport.can_access_unit(p_asset_id) THEN
      RAISE EXCEPTION 'Unit tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT kode_trailer, status_trailer INTO v_kode, v_status
      FROM transport.unit_trailer WHERE id = p_asset_id AND status = 1 FOR UPDATE;
    IF v_kode IS NULL OR NOT transport.can_access_unit_trailer(p_asset_id) THEN
      RAISE EXCEPTION 'Unit trailer tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  IF v_status NOT IN ('standby', 'breakdown', 'perbaikan') THEN
    RAISE EXCEPTION '% % berstatus % — tidak bisa diafkirkan.', v_label, v_kode, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Aset dulu: trigger insiden tidak mengubah aset yang sudah Diafkirkan.
  -- Job yang belum selesai ditolak trigger units_cek_terjual / unit_trailer_cek_terjual.
  PERFORM set_config('app.status_note', COALESCE(NULLIF(btrim(COALESCE(p_alasan, '')), ''), v_label || ' diafkirkan'), true);
  IF p_jenis_aset = 'unit' THEN
    UPDATE transport.units SET status_operasional = 'diafkirkan', updated_at = now() WHERE id = p_asset_id;
  ELSE
    UPDATE transport.unit_trailer SET status_trailer = 'diafkirkan', updated_at = now() WHERE id = p_asset_id;
  END IF;
  PERFORM set_config('app.status_note', '', true);

  RETURN transport._tutup_insiden_aset(p_jenis_aset, p_asset_id, 'diafkirkan');
END;
$$;

CREATE OR REPLACE FUNCTION transport.kembalikan_aset_dari_afkir(
  p_jenis_aset TEXT, p_asset_id UUID, p_alasan TEXT, p_insiden JSONB DEFAULT '[]'::jsonb)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_kode   TEXT;
  v_status TEXT;
  v_label  TEXT := CASE WHEN p_jenis_aset = 'unit' THEN 'Unit' ELSE 'Unit trailer' END;
BEGIN
  IF NOT transport.is_active_admin() THEN
    RAISE EXCEPTION 'Butuh login admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_jenis_aset NOT IN ('unit', 'unit_trailer') THEN
    RAISE EXCEPTION 'Jenis aset tidak valid.' USING ERRCODE = 'check_violation';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pengembalian dari Diafkirkan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_jenis_aset = 'unit' THEN
    SELECT kode_unit, status_operasional::text INTO v_kode, v_status
      FROM transport.units WHERE id = p_asset_id AND status = 1 FOR UPDATE;
    IF v_kode IS NULL OR NOT transport.can_access_unit(p_asset_id) THEN
      RAISE EXCEPTION 'Unit tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT kode_trailer, status_trailer INTO v_kode, v_status
      FROM transport.unit_trailer WHERE id = p_asset_id AND status = 1 FOR UPDATE;
    IF v_kode IS NULL OR NOT transport.can_access_unit_trailer(p_asset_id) THEN
      RAISE EXCEPTION 'Unit trailer tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  IF v_status <> 'diafkirkan' THEN
    RAISE EXCEPTION '% % tidak berstatus Diafkirkan.', v_label, v_kode USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.status_note', 'Dikembalikan dari Diafkirkan: ' || btrim(p_alasan), true);
  IF p_jenis_aset = 'unit' THEN
    UPDATE transport.units SET status_operasional = 'standby', updated_at = now() WHERE id = p_asset_id;
  ELSE
    UPDATE transport.unit_trailer SET status_trailer = 'standby', updated_at = now() WHERE id = p_asset_id;
  END IF;
  PERFORM set_config('app.status_note', '', true);

  -- Insiden yang ditutup karena afkir dibuka lagi; status aset lalu
  -- mengikuti insidennya (Open → Breakdown, Dalam penanganan → Perbaikan).
  PERFORM transport._buka_insiden_aset(p_jenis_aset, p_asset_id, 'diafkirkan', p_insiden);
END;
$$;

REVOKE ALL ON FUNCTION transport.afkirkan_aset(TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.afkirkan_aset(TEXT, UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION transport.kembalikan_aset_dari_afkir(TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.kembalikan_aset_dari_afkir(TEXT, UUID, TEXT, JSONB) TO authenticated;

-- ── 12. Perubahan data ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_admin     UUID;
  v_ada_afkir BOOLEAN;
  v_ada_job   BOOLEAN;
BEGIN
  v_ada_afkir := EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'transport' AND table_name = 'incident_logs'
                            AND column_name = 'ditutup_afkir');
  v_ada_job := EXISTS (
    SELECT 1 FROM transport.unit_trailer t
     WHERE t.status = 1 AND t.status_trailer = 'standby'
       AND EXISTS (SELECT 1 FROM transport.jobs j
                    WHERE j.unit_trailer_id = t.id AND j.status = 1
                      AND j.status_job NOT IN ('selesai', 'cancelled')));

  IF v_ada_afkir OR v_ada_job THEN
    SELECT p.karyawan_id INTO v_admin FROM transport.profiles p
     WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
     ORDER BY p.created_at LIMIT 1;
    IF v_admin IS NULL THEN
      RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat perubahan data.';
    END IF;
    PERFORM transport.mulai_sesi_manual(v_admin, 'Migrasi 20260926000006');

    IF v_ada_afkir THEN
      EXECUTE 'UPDATE transport.incident_logs SET ditutup_karena = ''diafkirkan''
                WHERE ditutup_afkir AND ditutup_karena IS NULL';
    END IF;
    IF v_ada_job THEN
      PERFORM transport._sinkron_status_trailer_job(t.id)
         FROM transport.unit_trailer t
        WHERE t.status = 1 AND t.status_trailer = 'standby';
    END IF;

    PERFORM transport.selesai_sesi_manual();
  END IF;
END $$;

ALTER TABLE transport.incident_logs DROP COLUMN IF EXISTS ditutup_afkir;

NOTIFY pgrst, 'reload schema';
