-- ============================================================================
-- Migration 20260926000013: satu job hanya boleh ditagihkan satu kali
--
-- Dijaga di database (bukan cuma form / backend):
--   * Rincian tagihan (invoice_items) dengan job yang sudah ada di rincian
--     aktif lain — di tagihan lain yang tidak dibatalkan, atau di tagihan
--     yang sama (baris ganda) — ditolak dengan pesan yang menyebut nomor
--     job & tagihannya.
--   * Tagihan yang dibatalkan tidak menghalangi job ditagih ulang. Sebaliknya,
--     tagihan batal / terhapus yang dipulihkan ditolak bila salah satu jobnya
--     sudah ditagihkan di tagihan lain.
--   * pg_advisory_xact_lock per job: dua admin yang menyimpan bersamaan tidak
--     bisa sama-sama lolos.
-- Edit tagihan menghapus (soft delete) lalu menyisipkan ulang rinciannya
-- dalam satu transaksi — baris lama berstatus 2 sehingga tidak dianggap ganda.
-- Perubahan data: tidak ada. Data lama yang sudah ganda dilaporkan lewat
-- NOTICE (tidak diubah).
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport._cek_job_belum_ditagih(p_job_id UUID, p_invoice_id UUID, p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_job     TEXT;
  v_nomor   TEXT;
  v_invoice UUID;
BEGIN
  -- Kunci per job: pemeriksaan & penyimpanan jadi berurutan.
  PERFORM pg_advisory_xact_lock(hashtext('tagihan-job:' || p_job_id::text));

  SELECT it.invoice_id, i.invoice_number INTO v_invoice, v_nomor
    FROM transport.invoice_items it
    JOIN transport.invoices i ON i.id = it.invoice_id
   WHERE it.job_id = p_job_id
     AND it.status = 1
     AND it.id <> p_item_id
     AND i.status = 1
     AND i.status_tagihan <> 'batal'
   ORDER BY (it.invoice_id = p_invoice_id) DESC
   LIMIT 1;
  IF v_invoice IS NULL THEN
    RETURN;
  END IF;

  SELECT job_number INTO v_job FROM transport.jobs WHERE id = p_job_id;
  IF v_invoice = p_invoice_id THEN
    RAISE EXCEPTION 'Job % dipilih lebih dari sekali di tagihan ini — satu job hanya boleh satu baris.',
      COALESCE(v_job, '') USING ERRCODE = 'unique_violation';
  END IF;
  RAISE EXCEPTION 'Job % sudah ditagihkan di tagihan %. Satu job hanya boleh ditagihkan satu kali.',
    COALESCE(v_job, ''), COALESCE(v_nomor, '') USING ERRCODE = 'unique_violation';
END;
$$;
REVOKE ALL ON FUNCTION transport._cek_job_belum_ditagih(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ── Rincian tagihan ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.invoice_item_cek_job_unik()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_inv transport.invoices%ROWTYPE;
BEGIN
  IF NEW.job_id IS NULL OR NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.job_id IS NOT DISTINCT FROM OLD.job_id AND OLD.status = 1 THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_inv FROM transport.invoices WHERE id = NEW.invoice_id;
  -- Rincian tagihan batal / terhapus tidak menahan apa pun.
  IF v_inv.id IS NULL OR v_inv.status <> 1 OR v_inv.status_tagihan = 'batal' THEN
    RETURN NEW;
  END IF;
  PERFORM transport._cek_job_belum_ditagih(NEW.job_id, NEW.invoice_id, NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_invoice_item_cek_job_unik ON transport.invoice_items;
CREATE TRIGGER trg_invoice_item_cek_job_unik
  BEFORE INSERT OR UPDATE OF job_id, status ON transport.invoice_items
  FOR EACH ROW EXECUTE FUNCTION transport.invoice_item_cek_job_unik();

-- ── Tagihan dipulihkan dari batal / terhapus ───────────────────────────────
CREATE OR REPLACE FUNCTION transport.invoice_cek_job_unik_saat_pulih()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NOT (
       (OLD.status_tagihan = 'batal' AND NEW.status_tagihan <> 'batal' AND NEW.status = 1)
    OR (OLD.status = 2 AND NEW.status = 1 AND NEW.status_tagihan <> 'batal')
  ) THEN
    RETURN NEW;
  END IF;
  FOR r IN SELECT id, job_id FROM transport.invoice_items
            WHERE invoice_id = NEW.id AND status = 1 AND job_id IS NOT NULL LOOP
    PERFORM transport._cek_job_belum_ditagih(r.job_id, NEW.id, r.id);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_invoice_cek_job_unik_saat_pulih ON transport.invoices;
CREATE TRIGGER trg_invoice_cek_job_unik_saat_pulih
  BEFORE UPDATE OF status_tagihan, status ON transport.invoices
  FOR EACH ROW EXECUTE FUNCTION transport.invoice_cek_job_unik_saat_pulih();

-- ── Laporan data lama yang sudah ganda (tidak diubah) ───────────────────────
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM (
    SELECT it.job_id
      FROM transport.invoice_items it
      JOIN transport.invoices i ON i.id = it.invoice_id
     WHERE it.status = 1 AND it.job_id IS NOT NULL AND i.status = 1 AND i.status_tagihan <> 'batal'
     GROUP BY it.job_id
    HAVING count(*) > 1
  ) ganda;
  RAISE NOTICE 'Job yang sudah tertagih lebih dari sekali (data lama): %', v_n;
END $$;
