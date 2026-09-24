-- ============================================================================
-- Migration 20260924000016: Jenis Unit Trailer terhubung ke Jenis Unit
--
-- jenis_unit_trailer.jenis_unit_id → jenis_unit(id), WAJIB diisi.
-- Contoh: jenis unit trailer "Lowbed 3 as" → jenis unit "Lowbed".
--
-- Jenis unit trailer yang SUDAH TERDAFTAR dihubungkan ke jenis unit
-- "Tractor Head" (id 4cf7792f-b353-4f2c-8b49-bfb9a9eb7b4f), sesuai keputusan
-- pengguna. Kalau jenis unit itu tidak ada/nonaktif di database ini sementara
-- ada data yang perlu dihubungkan, migrasi berhenti dengan pesan jelas.
--
-- Akses operator ke Unit Trailer kini mengikuti scope Jenis Unit-nya (sama
-- seperti menu Unit). Superadmin tetap melihat semua.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TABLE transport.jenis_unit_trailer
  ADD COLUMN IF NOT EXISTS jenis_unit_id UUID REFERENCES transport.jenis_unit(id);

-- Data lama → jenis unit "Tractor Head".
DO $$
DECLARE
  v_tractor_head CONSTANT UUID := '4cf7792f-b353-4f2c-8b49-bfb9a9eb7b4f';
  v_perlu INT;
BEGIN
  SELECT count(*) INTO v_perlu FROM transport.jenis_unit_trailer WHERE jenis_unit_id IS NULL;
  IF v_perlu = 0 THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM transport.jenis_unit WHERE id = v_tractor_head AND status = 1) THEN
    RAISE EXCEPTION
      'Jenis unit % (Tractor Head) tidak ada atau sudah dihapus di database ini — % jenis unit trailer lama belum bisa dihubungkan.',
      v_tractor_head, v_perlu;
  END IF;
  UPDATE transport.jenis_unit_trailer
     SET jenis_unit_id = v_tractor_head
   WHERE jenis_unit_id IS NULL;
  RAISE NOTICE '% jenis unit trailer lama dihubungkan ke Tractor Head.', v_perlu;
END $$;

ALTER TABLE transport.jenis_unit_trailer ALTER COLUMN jenis_unit_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jenis_unit_trailer_jenis_unit
  ON transport.jenis_unit_trailer (jenis_unit_id) WHERE status = 1;

-- ── Akses mengikuti scope Jenis Unit ────────────────────────────────────────
DROP POLICY IF EXISTS "admin_read_jenis_unit_trailer" ON transport.jenis_unit_trailer;
CREATE POLICY "admin_read_jenis_unit_trailer"
  ON transport.jenis_unit_trailer FOR SELECT TO authenticated
  USING (transport.is_active_admin()
         AND (transport.is_superadmin()
              OR jenis_unit_id = ANY (COALESCE(transport.current_user_jenis_scope(), ARRAY[]::UUID[]))));

DROP POLICY IF EXISTS "admin_read_unit_trailer" ON transport.unit_trailer;
DROP POLICY IF EXISTS "user_read_unit_trailer_in_scope" ON transport.unit_trailer;
CREATE POLICY "user_read_unit_trailer_in_scope"
  ON transport.unit_trailer FOR SELECT TO authenticated
  USING (transport.is_active_admin()
         AND (transport.is_superadmin()
              OR EXISTS (
                SELECT 1 FROM transport.jenis_unit_trailer jt
                 WHERE jt.id = unit_trailer.jenis_unit_trailer_id
                   AND jt.jenis_unit_id = ANY (COALESCE(transport.current_user_jenis_scope(), ARRAY[]::UUID[])))));

NOTIFY pgrst, 'reload schema';
