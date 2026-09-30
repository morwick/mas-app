-- ============================================================================
-- Migration 20260930000004: Selesaikan insiden tanpa perbaikan
--
--   * Insiden yang masih Open (aset Breakdown) bisa langsung ditutup Selesai
--     tanpa lewat "Dalam penanganan", mis. ternyata tidak perlu diperbaiki.
--     Ditandai ditutup_karena = 'tanpa_perbaikan' → tampil
--     "Selesai (tanpa perbaikan)".
--   * transport.selesaikan_insiden_tanpa_perbaikan(p_incident_id) — satu
--     transaksi. Status aset diatur trigger incident_sync_status_unit seperti
--     insiden selesai biasa: kembali Standby (Bertugas bila masih ada job
--     berjalan; tetap Breakdown / Perbaikan bila masih ada insiden lain yang
--     belum selesai atau WO yang dikerjakan). Tercatat di log sistem lewat
--     trigger log incident_logs.
--   * Ditolak bila insiden sudah punya perintah kerja yang belum
--     selesai / dibatalkan.
--
-- AMAN UNTUK KODE LAMA: nilai ditutup_karena baru + fungsi baru. Fungsi lama
-- incident_sync_status_unit hanya berubah di teks catatan riwayat status.
-- WAJIB: jalankan setelah 20260930000003.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Alasan penutupan baru ────────────────────────────────────────────────
ALTER TABLE transport.incident_logs DROP CONSTRAINT IF EXISTS incident_logs_ditutup_karena_check;
ALTER TABLE transport.incident_logs
  ADD CONSTRAINT incident_logs_ditutup_karena_check
  CHECK (ditutup_karena IN ('diafkirkan', 'terjual', 'tanpa_perbaikan'));

-- ── 2. Fungsi penutupan ─────────────────────────────────────────────────────
-- SECURITY INVOKER: hak ubah insiden tetap mengikuti RLS incident_logs, sama
-- seperti tombol "Selesaikan perbaikan".
CREATE OR REPLACE FUNCTION transport.selesaikan_insiden_tanpa_perbaikan(p_incident_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = transport, extensions
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT i.status_penanganan::text INTO v_status
    FROM transport.incident_logs i
   WHERE i.id = p_incident_id AND i.status = 1
     FOR UPDATE;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Insiden tidak ditemukan.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Hanya insiden berstatus Terbuka yang bisa diselesaikan tanpa perbaikan.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM transport.perintah_kerja w
     WHERE w.incident_id = p_incident_id AND w.status = 1
       AND w.status_wo NOT IN ('selesai', 'dibatalkan')
  ) THEN
    RAISE EXCEPTION 'Insiden ini sudah punya perintah kerja perbaikan. Batalkan perintah kerjanya dulu.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Open → Selesai melompati "Dalam penanganan": izinkan lewat alur penutupan.
  PERFORM set_config('app.alur_tutup_insiden', 'on', true);
  UPDATE transport.incident_logs
     SET status_sebelum_ditutup = status_penanganan,
         status_penanganan = 'resolved',
         ditutup_karena = 'tanpa_perbaikan'
   WHERE id = p_incident_id AND status = 1;
  PERFORM set_config('app.alur_tutup_insiden', '', true);
END;
$$;
REVOKE ALL ON FUNCTION transport.selesaikan_insiden_tanpa_perbaikan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.selesaikan_insiden_tanpa_perbaikan(UUID) TO authenticated;

-- ── 3. Catatan riwayat status aset ──────────────────────────────────────────
-- Salinan definisi terkini (20260930000003) + catatan "Insiden selesai tanpa
-- perbaikan". Logika status tidak berubah.
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
    -- (Baru) Masih ada perintah kerja yang dikerjakan → aset tetap perbaikan.
    IF EXISTS (
      SELECT 1 FROM transport.perintah_kerja w
       WHERE w.status = 1 AND transport._wo_aktif(w.status_wo)
         AND CASE WHEN v_trailer THEN w.unit_trailer_id = NEW.unit_trailer_id ELSE w.unit_id = NEW.unit_id END
    ) THEN
      RETURN NULL;
    END IF;
    v_target := CASE WHEN EXISTS (
                  SELECT 1 FROM transport.jobs j
                   WHERE j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
                     AND CASE WHEN v_trailer THEN j.unit_trailer_id = NEW.unit_trailer_id
                              ELSE j.unit_id = NEW.unit_id END)
                THEN 'bertugas' ELSE 'standby' END;
    v_boleh_dari := ARRAY['breakdown', 'perbaikan'];
    v_note := CASE
                WHEN NEW.status <> 1 THEN 'Insiden dihapus'
                -- (Baru) Diselesaikan tanpa perbaikan — catatan riwayat status berbeda.
                WHEN NEW.ditutup_karena = 'tanpa_perbaikan' THEN 'Insiden selesai tanpa perbaikan'
                ELSE 'Perbaikan insiden selesai' END;
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
