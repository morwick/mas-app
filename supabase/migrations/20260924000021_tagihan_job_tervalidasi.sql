-- ============================================================================
-- Migration 20260924000021: hanya job yang sudah divalidasi admin yang bisa ditagihkan
--
-- Job "selesai" = sudah divalidasi admin (validate_job mengisi validated_at).
-- Form tagihan hanya menawarkan job itu; trigger ini menjaganya juga di
-- database, supaya job yang belum divalidasi tidak bisa masuk tagihan lewat
-- jalan lain (API langsung, SQL Editor).
--
-- Hanya memeriksa baris yang job-nya BARU dipasang/diganti — rincian lama yang
-- sudah ada tidak ikut diperiksa ulang.
-- Perubahan data: tidak ada.
-- ============================================================================

CREATE OR REPLACE FUNCTION transport.invoice_item_cek_job_tervalidasi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_job transport.jobs%ROWTYPE;
BEGIN
  IF NEW.job_id IS NULL OR NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.job_id IS NOT DISTINCT FROM OLD.job_id AND OLD.status = 1 THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_job FROM transport.jobs WHERE id = NEW.job_id AND status = 1;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job untuk rincian tagihan tidak ditemukan.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_job.status_job <> 'selesai' OR v_job.validated_at IS NULL THEN
    RAISE EXCEPTION 'Job % belum divalidasi admin — hanya job yang sudah divalidasi yang bisa ditagihkan.',
      v_job.job_number USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_item_cek_job_tervalidasi ON transport.invoice_items;
CREATE TRIGGER trg_invoice_item_cek_job_tervalidasi
  BEFORE INSERT OR UPDATE OF job_id, status ON transport.invoice_items
  FOR EACH ROW EXECUTE FUNCTION transport.invoice_item_cek_job_tervalidasi();
