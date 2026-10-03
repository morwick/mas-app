-- ============================================================================
-- Migration 20261003000003: proyek yang sudah ditagih tidak bisa ditambah job
--
-- BATASAN: job baru tidak bisa masuk proyek yang salah satu jobnya sudah ada
-- di tagihan aktif (invoices.status = 1 dan status_tagihan <> 'batal').
-- Tagihannya dibatalkan → proyek itu boleh ditambah job lagi.
--
-- Berlaku untuk semua jalur pembuatan job (form proyek, tambah job, gabung
-- proyek dari penawaran, ganti unit). Ganti unit hanya untuk job yang sedang
-- berjalan, sedangkan tagihan hanya untuk proyek yang semua jobnya selesai —
-- jadi alur itu tidak ikut tertahan.
--
-- Tidak ada perubahan data. Aman dijalankan ulang.
-- WAJIB: jalankan setelah 20261003000002.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.jobs_tolak_tambah_proyek_ditagih()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_invoice TEXT;
  v_proyek  TEXT;
BEGIN
  IF NEW.proyek_id IS NULL OR NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  SELECT i.invoice_number, p.nomor_proyek INTO v_invoice, v_proyek
    FROM transport.invoice_items it
    JOIN transport.invoices i ON i.id = it.invoice_id
    JOIN transport.jobs j     ON j.id = it.job_id
    JOIN transport.proyek p   ON p.id = j.proyek_id
   WHERE j.proyek_id = NEW.proyek_id
     AND j.status = 1 AND it.status = 1 AND i.status = 1
     AND i.status_tagihan <> 'batal'
   LIMIT 1;
  IF v_invoice IS NOT NULL THEN
    RAISE EXCEPTION 'Proyek % sudah masuk tagihan % — tidak bisa menambah job. Batalkan tagihannya dulu bila job perlu ditambah.',
      v_proyek, v_invoice
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.jobs_tolak_tambah_proyek_ditagih() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_jobs_tolak_tambah_proyek_ditagih ON transport.jobs;
CREATE TRIGGER trg_jobs_tolak_tambah_proyek_ditagih
  BEFORE INSERT ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_tolak_tambah_proyek_ditagih();

NOTIFY pgrst, 'reload schema';
