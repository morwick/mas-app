-- ============================================================================
-- Migration 20260924000015: status unit trailer hanya Standby / Perbaikan
--
-- Pilihan "terpakai" dihapus. Trailer yang terlanjur berstatus "terpakai"
-- dikembalikan ke "standby" supaya tetap lolos aturan baru.
-- ============================================================================

SET search_path = transport, extensions;

UPDATE transport.unit_trailer
   SET status_trailer = 'standby'
 WHERE status_trailer NOT IN ('standby', 'perbaikan');

ALTER TABLE transport.unit_trailer DROP CONSTRAINT IF EXISTS unit_trailer_status_trailer_check;
ALTER TABLE transport.unit_trailer
  ADD CONSTRAINT unit_trailer_status_trailer_check
  CHECK (status_trailer IN ('standby', 'perbaikan'));

COMMENT ON COLUMN transport.unit_trailer.status_trailer IS 'Kondisi trailer: standby / perbaikan';

NOTIFY pgrst, 'reload schema';
