-- ============================================================================
-- Migration 20260926000002: unit diafkirkan menutup insiden & bisa dikembalikan
--
--   * afkirkan_unit(): unit → Diafkirkan. Semua insiden unit yang masih Open /
--     Dalam penanganan ikut ditutup jadi Selesai dengan tanda "diafkirkan"
--     (kolom ditutup_afkir), status sebelumnya disimpan di
--     status_sebelum_afkir.
--   * kembalikan_unit_dari_afkir(): unit Diafkirkan → Standby (salah klik).
--     Alasan wajib. Insiden yang ditutup karena afkir dibuka lagi ke Open /
--     Dalam penanganan sesuai pilihan (default: status sebelum afkir); status
--     unit lalu mengikuti insiden (Breakdown / Perbaikan) lewat trigger
--     incident_sync_status_unit.
--   * trg_incident_cek_perubahan: transisi Open/Dalam penanganan → Selesai
--     langsung dan Selesai → Open/Dalam penanganan hanya boleh di dalam dua
--     fungsi di atas (setting transaksi app.alur_afkir, tidak bisa diset lewat
--     jalankan_transaksi).
--
-- Tiap fungsi = satu transaksi: gagal di tengah → rollback semua. Log sistem
-- tercatat oleh trigger log_perubahan_data pada tabel units & incident_logs.
-- WAJIB: naikkan backend & frontend versi baru bersamaan.
-- Perubahan data: tidak ada (kolom baru default false / NULL).
-- ============================================================================

SET search_path = transport, extensions;

ALTER TABLE transport.incident_logs
  ADD COLUMN IF NOT EXISTS ditutup_afkir BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_sebelum_afkir transport.incident_status;

-- ── Transisi status insiden (versi 20260925000006 + alur afkir) ─────────────
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
     AND COALESCE(current_setting('app.alur_afkir', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Status insiden tidak bisa diubah dari % ke %. Alurnya: Open → Dalam penanganan → Selesai.',
      OLD.status_penanganan, NEW.status_penanganan USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Afkirkan unit ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.afkirkan_unit(p_unit_id uuid, p_alasan text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_unit   transport.units%ROWTYPE;
  v_jumlah INTEGER;
BEGIN
  IF NOT transport.is_active_admin() THEN
    RAISE EXCEPTION 'Butuh login admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_unit FROM transport.units WHERE id = p_unit_id AND status = 1 FOR UPDATE;
  IF v_unit.id IS NULL OR NOT transport.can_access_unit(p_unit_id) THEN
    RAISE EXCEPTION 'Unit tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_unit.status_operasional::text NOT IN ('standby', 'breakdown', 'perbaikan') THEN
    RAISE EXCEPTION 'Unit % berstatus % — tidak bisa diafkirkan.', v_unit.kode_unit, v_unit.status_operasional
      USING ERRCODE = 'check_violation';
  END IF;

  -- Unit dulu: trigger insiden tidak mengubah unit yang sudah Diafkirkan.
  -- Job yang belum selesai ditolak trigger units_cek_terjual.
  PERFORM set_config('app.status_note', COALESCE(NULLIF(btrim(COALESCE(p_alasan, '')), ''), 'Unit diafkirkan'), true);
  UPDATE transport.units SET status_operasional = 'diafkirkan', updated_at = now() WHERE id = p_unit_id;
  PERFORM set_config('app.status_note', '', true);

  PERFORM set_config('app.alur_afkir', 'on', true);
  UPDATE transport.incident_logs
     SET status_sebelum_afkir = status_penanganan,
         status_penanganan = 'resolved',
         ditutup_afkir = true
   WHERE unit_id = p_unit_id AND status = 1 AND status_penanganan <> 'resolved';
  GET DIAGNOSTICS v_jumlah = ROW_COUNT;
  PERFORM set_config('app.alur_afkir', '', true);

  RETURN v_jumlah;
END;
$function$;

-- ── Kembalikan unit dari Diafkirkan ─────────────────────────────────────────
-- p_insiden: [{"id": "<uuid>", "status": "open" | "in_progress"}, ...]
-- Insiden tutup-afkir yang tidak disebut dibuka ke status sebelum afkir.
CREATE OR REPLACE FUNCTION transport.kembalikan_unit_dari_afkir(
  p_unit_id uuid, p_alasan text, p_insiden jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_unit    transport.units%ROWTYPE;
  v_item    jsonb;
  v_inc     transport.incident_logs%ROWTYPE;
  v_target  TEXT;
BEGIN
  IF NOT transport.is_active_admin() THEN
    RAISE EXCEPTION 'Butuh login admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pengembalian dari Diafkirkan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_unit FROM transport.units WHERE id = p_unit_id AND status = 1 FOR UPDATE;
  IF v_unit.id IS NULL OR NOT transport.can_access_unit(p_unit_id) THEN
    RAISE EXCEPTION 'Unit tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_unit.status_operasional::text <> 'diafkirkan' THEN
    RAISE EXCEPTION 'Unit % tidak berstatus Diafkirkan.', v_unit.kode_unit USING ERRCODE = 'check_violation';
  END IF;

  -- Pilihan insiden harus milik unit ini & memang ditutup karena afkir.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_insiden, '[]'::jsonb)) LOOP
    IF v_item ->> 'status' IS NULL OR v_item ->> 'status' NOT IN ('open', 'in_progress') THEN
      RAISE EXCEPTION 'Status insiden harus Open atau Dalam penanganan.' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM transport.incident_logs i
       WHERE i.id = (v_item ->> 'id')::uuid AND i.unit_id = p_unit_id AND i.status = 1
         AND i.ditutup_afkir AND i.status_penanganan = 'resolved') THEN
      RAISE EXCEPTION 'Insiden % bukan insiden yang ditutup karena unit diafkirkan.', v_item ->> 'id'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  PERFORM set_config('app.status_note', 'Dikembalikan dari Diafkirkan: ' || btrim(p_alasan), true);
  UPDATE transport.units SET status_operasional = 'standby', updated_at = now() WHERE id = p_unit_id;
  PERFORM set_config('app.status_note', '', true);

  -- Buka lagi insidennya; trigger incident_sync_status_unit menyesuaikan
  -- unit (Open → Breakdown, Dalam penanganan → Perbaikan).
  PERFORM set_config('app.alur_afkir', 'on', true);
  FOR v_inc IN
    SELECT * FROM transport.incident_logs
     WHERE unit_id = p_unit_id AND status = 1 AND ditutup_afkir AND status_penanganan = 'resolved'
     ORDER BY tanggal
  LOOP
    SELECT e ->> 'status' INTO v_target
      FROM jsonb_array_elements(COALESCE(p_insiden, '[]'::jsonb)) e
     WHERE (e ->> 'id')::uuid = v_inc.id
     LIMIT 1;
    v_target := COALESCE(v_target, v_inc.status_sebelum_afkir::text, 'open');
    UPDATE transport.incident_logs
       SET status_penanganan = v_target::transport.incident_status,
           ditutup_afkir = false,
           status_sebelum_afkir = NULL
     WHERE id = v_inc.id;
  END LOOP;
  PERFORM set_config('app.alur_afkir', '', true);
END;
$function$;

REVOKE ALL ON FUNCTION transport.afkirkan_unit(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.afkirkan_unit(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION transport.kembalikan_unit_dari_afkir(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.kembalikan_unit_dari_afkir(UUID, TEXT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
