-- ============================================================================
-- Migration 20261001000016: sambungkan job lama ke item penawarannya
--
-- Job yang dibuat sebelum aturan "job per item penawaran" punya quotation_id
-- tetapi quotation_item_id kosong, sehingga item deal-nya terlihat belum
-- dibuatkan job/proyek (mis. JOB-2026-017 di 0021/SK/MAS/IX/2026).
--
-- Perbaikan data: job aktif (status = 1) ber-penawaran tanpa item disambungkan
-- ke item DEAL di penawaran yang sama dengan rute (dari → tujuan) yang sama
-- persis dengan asal → tujuan job (tanpa beda huruf besar/kecil & spasi tepi).
-- Bila beberapa item cocok (rute kembar), dipilih urutan terkecil. Penawaran
-- yang hanya punya SATU item deal disambungkan ke item itu walau rute beda.
-- Job yang tidak menemukan pasangan dibiarkan dan dilaporkan lewat NOTICE.
--
-- Perubahan tercatat di log_sistem atas nama superadmin aktif pertama
-- (sesi manual "Migrasi 20261001000016"); tanpa sesi, database menolak
-- perubahan data.
-- Aman dijalankan ulang (hanya menyentuh job yang item-nya masih kosong).
-- WAJIB: jalankan setelah 20261001000015.
-- ============================================================================

SET search_path = transport, extensions;

DO $$
DECLARE
  r          RECORD;
  v_item     UUID;
  v_karyawan UUID;
BEGIN
  -- Tidak ada job yang perlu disambungkan → selesai tanpa membuka sesi.
  IF NOT EXISTS (
    SELECT 1 FROM transport.jobs
     WHERE status = 1 AND quotation_id IS NOT NULL AND quotation_item_id IS NULL
  ) THEN
    RETURN;
  END IF;

  SELECT p.karyawan_id INTO v_karyawan FROM transport.profiles p
   WHERE 'superadmin' = ANY (p.roles) AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_karyawan IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat perubahan data.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_karyawan, 'Migrasi 20261001000016');

  FOR r IN
    SELECT j.id, j.job_number, j.quotation_id, j.asal, j.tujuan
      FROM transport.jobs j
     WHERE j.status = 1
       AND j.quotation_id IS NOT NULL
       AND j.quotation_item_id IS NULL
  LOOP
    -- 1. Rute sama persis, item deal, urutan terkecil.
    SELECT it.id INTO v_item
      FROM transport.quotation_items it
     WHERE it.quotation_id = r.quotation_id
       AND it.status = 1
       AND it.keputusan = 'deal'
       AND lower(btrim(it.dari)) = lower(btrim(r.asal))
       AND lower(btrim(it.tujuan)) = lower(btrim(r.tujuan))
     ORDER BY it.urutan
     LIMIT 1;

    -- 2. Tidak ada rute yang cocok: pakai item deal satu-satunya, bila memang satu.
    IF v_item IS NULL THEN
      SELECT min(it.id::TEXT)::UUID INTO v_item
        FROM transport.quotation_items it
       WHERE it.quotation_id = r.quotation_id AND it.status = 1 AND it.keputusan = 'deal'
      HAVING count(*) = 1;
    END IF;

    IF v_item IS NULL THEN
      RAISE NOTICE 'Job % tidak menemukan item deal yang cocok — dibiarkan.', r.job_number;
    ELSE
      UPDATE transport.jobs SET quotation_item_id = v_item WHERE id = r.id;
      RAISE NOTICE 'Job % disambungkan ke item penawaran %.', r.job_number, v_item;
    END IF;
  END LOOP;

  PERFORM transport.selesai_sesi_manual();
END;
$$;
