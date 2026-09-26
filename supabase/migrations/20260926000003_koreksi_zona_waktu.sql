-- ============================================================================
-- Migration 20260926000003: koreksi jam yang tersimpan bergeser 7 jam
--
-- Sampai perbaikan frontend 26 Sep 2026, form mengirim jam dari input
-- datetime-local tanpa zona waktu, dan server menganggapnya UTC (aplikasi
-- lama di Vercel juga begitu). Akibatnya jam yang diketik 10:00 WIB tersimpan
-- 10:00 UTC = 17:00 WIB. Kolom yang terdampak:
--   * transport.jobs.etd, transport.jobs.eta (ETA hitungan otomatis juga,
--     karena dihitung dari ETD yang sudah bergeser)
--   * transport.incident_logs.tanggal
-- Semua baris yang ada saat migrasi ini dijalankan dimundurkan 7 jam.
--
-- URUTAN WAJIB: jalankan migrasi ini SEBELUM frontend versi baru naik.
-- Data yang diinput lewat frontend baru sudah benar dan tidak boleh ikut
-- dikoreksi.
--
-- Aman dijalankan ulang: ditandai lewat komentar kolom jobs.etd; bila tanda
-- sudah ada, migrasi tidak melakukan apa-apa.
--
-- Catatan: job / insiden yang sempat DIEDIT lewat form (dan jamnya ikut
-- tersimpan ulang) bergeser 7 jam lagi di setiap penyimpanan, jadi setelah
-- migrasi ini masih lebih lambat 7 jam × jumlah edit. Periksa dengan query
-- di bagian bawah file ini dan betulkan manual lewat form edit (frontend baru).
-- Setiap baris yang dikoreksi tercatat di log sistem sebagai Update Data atas
-- nama superadmin aktif pertama (sesi manual "Migrasi 20260926000003").
-- ============================================================================

SET search_path = transport, extensions;

DO $$
DECLARE
  c_tanda CONSTANT TEXT := 'koreksi-zona-waktu-20260926';
  v_jobs  INTEGER;
  v_ins   INTEGER;
  v_admin UUID;
BEGIN
  IF COALESCE(col_description('transport.jobs'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'transport.jobs'::regclass AND attname = 'etd')), '')
     LIKE '%' || c_tanda || '%' THEN
    RAISE NOTICE 'Koreksi zona waktu sudah pernah dijalankan — dilewati.';
    RETURN;
  END IF;

  -- Log sistem wajib punya pelaku: dicatat atas nama superadmin aktif pertama.
  SELECT p.karyawan_id INTO v_admin FROM transport.profiles p
   WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat koreksi zona waktu.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_admin, 'Migrasi 20260926000003');

  UPDATE transport.jobs
     SET etd = etd - INTERVAL '7 hours',
         eta = eta - INTERVAL '7 hours'
   WHERE etd IS NOT NULL OR eta IS NOT NULL;
  GET DIAGNOSTICS v_jobs = ROW_COUNT;

  -- Hanya jam yang berubah: status unit jangan ikut dihitung ulang trigger
  -- insiden (unit lama yang sengaja dibiarkan Perbaikan tetap Perbaikan).
  -- Dalam transaksi yang sama, jadi gagal di tengah → trigger aktif lagi.
  ALTER TABLE transport.incident_logs DISABLE TRIGGER trg_incident_sync_status_unit;
  UPDATE transport.incident_logs
     SET tanggal = tanggal - INTERVAL '7 hours';
  GET DIAGNOSTICS v_ins = ROW_COUNT;
  ALTER TABLE transport.incident_logs ENABLE TRIGGER trg_incident_sync_status_unit;

  EXECUTE format('COMMENT ON COLUMN transport.jobs.etd IS %L',
    'Jam pickup (UTC). ' || c_tanda || ': jam lama dimundurkan 7 jam.');
  PERFORM transport.selesai_sesi_manual();

  RAISE NOTICE 'Koreksi zona waktu: % job, % insiden.', v_jobs, v_ins;
END;
$$;

-- ── Pemeriksaan manual (jalankan terpisah, hanya membaca) ───────────────────
-- Job & insiden yang pernah diubah setelah dibuat — cocokkan jamnya (WIB)
-- dengan jam sebenarnya, lalu betulkan lewat form edit bila masih bergeser.
--
-- SELECT j.job_number, j.etd AT TIME ZONE 'Asia/Jakarta' AS etd_wib,
--        j.eta AT TIME ZONE 'Asia/Jakarta' AS eta_wib,
--        (SELECT count(*) FROM transport.log_sistem l
--          WHERE l.aksi = 'Update Data'
--            AND l.ip_address IS DISTINCT FROM 'Migrasi 20260926000003'
--            AND l.keterangan LIKE '%(ID ' || j.id || ')%') AS jumlah_update
--   FROM transport.jobs j
--  WHERE j.status = 1
--  ORDER BY jumlah_update DESC, j.etd DESC;
--
-- SELECT u.kode_unit, i.tanggal AT TIME ZONE 'Asia/Jakarta' AS tanggal_wib,
--        i.deskripsi, i.created_at AT TIME ZONE 'Asia/Jakarta' AS dicatat_wib
--   FROM transport.incident_logs i JOIN transport.units u ON u.id = i.unit_id
--  WHERE i.status = 1
--  ORDER BY i.tanggal DESC;
