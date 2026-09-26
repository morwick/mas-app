-- ============================================================================
-- Migration 20260926000009: rapikan data lama agar sesuai aturan terbaru
--
-- Aturan yang dijaga sejak migration 000006–000008, tapi mungkin dilanggar
-- data yang dibuat sebelumnya. Setiap langkah hanya menyentuh baris yang
-- melanggar, jadi aman dijalankan ulang (baris yang sudah rapi dilewati):
--
--   1. Status Bertugas ↔ job berjalan (unit & unit trailer):
--      Bertugas tanpa job berjalan → Standby; Standby dengan job berjalan →
--      Bertugas.
--   2. Insiden yang masih terbuka pada aset Terjual / Diafkirkan ditutup
--      "Selesai (terjual)" / "Selesai (diafkirkan)".
--   3. Aset Breakdown / Perbaikan tanpa insiden aktif (mis. dari ganti truk
--      versi lama atau ubah status manual) → dibuatkan insiden DUMMY tipe
--      kerusakan: Open untuk Breakdown, Dalam penanganan untuk Perbaikan.
--   4. Aset Terjual tanpa catatan penjualan → catatan penjualan DUMMY
--      (pembeli "Data lama (belum dicatat)", harga Rp 1) — lengkapi lewat
--      menu Penjualan Unit & Unit Trailer (batalkan lalu catat ulang).
--   5. Aset Diafkirkan tanpa catatan penghapusan → catatan penghapusan DUMMY.
--   6. Unit Terjual / Diafkirkan tidak punya driver default.
--   7. Catatan penjualan lama tanpa status_aset_sebelum → 'standby'.
--
-- Data dummy ditandai teks "[DUMMY migrasi 000009]" supaya mudah dicari.
-- Semua perubahan tercatat di log sistem atas nama superadmin aktif pertama
-- (sesi manual "Migrasi 20260926000009"). Di akhir, jumlah per langkah
-- ditampilkan lewat NOTICE, plus job berjalan yang wajib trailer tapi belum
-- punya (tidak diubah — isi trailernya lewat Edit job).
-- WAJIB: jalankan setelah 20260926000008.
-- ============================================================================

SET search_path = transport, extensions;

DO $$
DECLARE
  c_dummy   CONSTANT TEXT := '[DUMMY migrasi 000009]';
  v_karyawan UUID;
  v_profil   UUID;
  v_n        INTEGER;
  v_ringkas  TEXT := '';
  r          RECORD;
BEGIN
  SELECT p.karyawan_id, p.id INTO v_karyawan, v_profil FROM transport.profiles p
   WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_karyawan IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat perapian data.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_karyawan, 'Migrasi 20260926000009');

  -- ── 1. Bertugas ↔ job berjalan ────────────────────────────────────────────
  PERFORM set_config('app.status_note', 'Perapian data: tidak ada job berjalan', true);
  UPDATE transport.units u SET status_operasional = 'standby', updated_at = now()
   WHERE u.status = 1 AND u.status_operasional = 'bertugas'
     AND NOT EXISTS (SELECT 1 FROM transport.jobs j
                      WHERE j.unit_id = u.id AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_ringkas := v_ringkas || format(E'\n  unit Bertugas → Standby: %s', v_n);

  PERFORM set_config('app.status_note', 'Perapian data: dipakai job berjalan', true);
  UPDATE transport.units u SET status_operasional = 'bertugas', updated_at = now()
   WHERE u.status = 1 AND u.status_operasional = 'standby'
     AND EXISTS (SELECT 1 FROM transport.jobs j
                  WHERE j.unit_id = u.id AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_ringkas := v_ringkas || format(E'\n  unit Standby → Bertugas: %s', v_n);
  PERFORM set_config('app.status_note', '', true);

  -- Trailer: fungsi sinkron yang sama dengan trigger job (000006).
  PERFORM transport._sinkron_status_trailer_job(t.id)
     FROM transport.unit_trailer t
    WHERE t.status = 1 AND t.status_trailer IN ('standby', 'bertugas');

  -- ── 2. Insiden terbuka pada aset Terjual / Diafkirkan ─────────────────────
  PERFORM set_config('app.alur_tutup_insiden', 'on', true);
  UPDATE transport.incident_logs i
     SET status_sebelum_ditutup = i.status_penanganan,
         status_penanganan = 'resolved',
         ditutup_karena = COALESCE(u.status_operasional::text, t.status_trailer)
    FROM transport.incident_logs x
    LEFT JOIN transport.units u ON u.id = x.unit_id
    LEFT JOIN transport.unit_trailer t ON t.id = x.unit_trailer_id
   WHERE i.id = x.id AND i.status = 1 AND i.status_penanganan <> 'resolved'
     AND COALESCE(u.status_operasional::text, t.status_trailer) IN ('terjual', 'diafkirkan');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('app.alur_tutup_insiden', '', true);
  v_ringkas := v_ringkas || format(E'\n  insiden aset terjual/diafkirkan ditutup: %s', v_n);

  -- ── 3. Breakdown / Perbaikan tanpa insiden aktif → insiden dummy ─────────
  v_n := 0;
  FOR r IN
    SELECT 'unit'::text AS jenis, u.id, u.kode_unit AS kode, u.status_operasional::text AS st,
           (SELECT max(h.changed_at) FROM transport.unit_status_history h
             WHERE h.unit_id = u.id AND h.status_new = u.status_operasional) AS sejak
      FROM transport.units u
     WHERE u.status = 1 AND u.status_operasional IN ('breakdown', 'perbaikan')
       AND NOT EXISTS (SELECT 1 FROM transport.incident_logs i
                        WHERE i.unit_id = u.id AND i.status = 1 AND i.status_penanganan <> 'resolved')
    UNION ALL
    SELECT 'unit_trailer', t.id, t.kode_trailer, t.status_trailer,
           (SELECT max(h.changed_at) FROM transport.unit_trailer_status_history h
             WHERE h.unit_trailer_id = t.id AND h.status_new = t.status_trailer AND h.status = 1)
      FROM transport.unit_trailer t
     WHERE t.status = 1 AND t.status_trailer IN ('breakdown', 'perbaikan')
       AND NOT EXISTS (SELECT 1 FROM transport.incident_logs i
                        WHERE i.unit_trailer_id = t.id AND i.status = 1 AND i.status_penanganan <> 'resolved')
  LOOP
    INSERT INTO transport.incident_logs (
      unit_id, unit_trailer_id, tipe, tanggal, deskripsi, status_penanganan, created_by)
    VALUES (
      CASE WHEN r.jenis = 'unit' THEN r.id END,
      CASE WHEN r.jenis = 'unit_trailer' THEN r.id END,
      'kerusakan',
      COALESCE(r.sejak, now()),
      c_dummy || ' ' || r.kode || ' berstatus ' || initcap(r.st)
        || ' tanpa catatan insiden (data lama). Lengkapi detailnya atau selesaikan insiden ini.',
      CASE WHEN r.st = 'perbaikan' THEN 'in_progress' ELSE 'open' END::transport.incident_status,
      v_profil);
    v_n := v_n + 1;
  END LOOP;
  v_ringkas := v_ringkas || format(E'\n  insiden dummy untuk Breakdown/Perbaikan: %s', v_n);

  -- ── 4. Terjual tanpa catatan penjualan → penjualan dummy ─────────────────
  INSERT INTO transport.penjualan_unit (
    jenis_aset, unit_id, nama_pembeli, harga_jual, tanggal_jual, catatan, status_aset_sebelum, created_by)
  SELECT 'unit', u.id, 'Data lama (belum dicatat)', 1,
         COALESCE((SELECT max(h.changed_at) FROM transport.unit_status_history h
                    WHERE h.unit_id = u.id AND h.status_new = 'terjual'), now())::date,
         c_dummy || ' Lengkapi pembeli & harga: batalkan catatan ini lalu catat ulang.', 'standby', v_profil
    FROM transport.units u
   WHERE u.status = 1 AND u.status_operasional = 'terjual'
     AND NOT EXISTS (SELECT 1 FROM transport.penjualan_unit p WHERE p.unit_id = u.id AND p.status = 1);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_ringkas := v_ringkas || format(E'\n  penjualan dummy (unit): %s', v_n);

  INSERT INTO transport.penjualan_unit (
    jenis_aset, unit_trailer_id, nama_pembeli, harga_jual, tanggal_jual, catatan, status_aset_sebelum, created_by)
  SELECT 'unit_trailer', t.id, 'Data lama (belum dicatat)', 1,
         COALESCE((SELECT max(h.changed_at) FROM transport.unit_trailer_status_history h
                    WHERE h.unit_trailer_id = t.id AND h.status_new = 'terjual' AND h.status = 1), t.updated_at)::date,
         c_dummy || ' Lengkapi pembeli & harga: batalkan catatan ini lalu catat ulang.', 'standby', v_profil
    FROM transport.unit_trailer t
   WHERE t.status = 1 AND t.status_trailer = 'terjual'
     AND NOT EXISTS (SELECT 1 FROM transport.penjualan_unit p WHERE p.unit_trailer_id = t.id AND p.status = 1);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_ringkas := v_ringkas || format(E'\n  penjualan dummy (unit trailer): %s', v_n);

  -- ── 5. Diafkirkan tanpa catatan penghapusan → penghapusan dummy ──────────
  INSERT INTO transport.penghapusan_aset (
    jenis_aset, unit_id, tanggal_hapus, alasan, catatan, created_by)
  SELECT 'unit', u.id,
         COALESCE((SELECT max(h.changed_at) FROM transport.unit_status_history h
                    WHERE h.unit_id = u.id AND h.status_new = 'diafkirkan'), now())::date,
         'Data lama: diafkirkan sebelum ada menu Penghapusan', c_dummy || ' Lengkapi alasan & bukti bila perlu.', v_profil
    FROM transport.units u
   WHERE u.status = 1 AND u.status_operasional = 'diafkirkan'
     AND NOT EXISTS (SELECT 1 FROM transport.penghapusan_aset p WHERE p.unit_id = u.id AND p.status = 1);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_ringkas := v_ringkas || format(E'\n  penghapusan dummy (unit): %s', v_n);

  INSERT INTO transport.penghapusan_aset (
    jenis_aset, unit_trailer_id, tanggal_hapus, alasan, catatan, created_by)
  SELECT 'unit_trailer', t.id,
         COALESCE((SELECT max(h.changed_at) FROM transport.unit_trailer_status_history h
                    WHERE h.unit_trailer_id = t.id AND h.status_new = 'diafkirkan' AND h.status = 1), t.updated_at)::date,
         'Data lama: diafkirkan sebelum ada menu Penghapusan', c_dummy || ' Lengkapi alasan & bukti bila perlu.', v_profil
    FROM transport.unit_trailer t
   WHERE t.status = 1 AND t.status_trailer = 'diafkirkan'
     AND NOT EXISTS (SELECT 1 FROM transport.penghapusan_aset p WHERE p.unit_trailer_id = t.id AND p.status = 1);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_ringkas := v_ringkas || format(E'\n  penghapusan dummy (unit trailer): %s', v_n);

  -- ── 6. Driver default pada unit Terjual / Diafkirkan ──────────────────────
  UPDATE transport.units SET default_driver_id = NULL, updated_at = now()
   WHERE status = 1 AND status_operasional IN ('terjual', 'diafkirkan') AND default_driver_id IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_ringkas := v_ringkas || format(E'\n  driver default dilepas dari unit terjual/diafkirkan: %s', v_n);

  -- ── 7. Penjualan lama tanpa status_aset_sebelum ──────────────────────────
  UPDATE transport.penjualan_unit SET status_aset_sebelum = 'standby', updated_at = now()
   WHERE status_aset_sebelum IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_ringkas := v_ringkas || format(E'\n  penjualan lama diberi status_aset_sebelum: %s', v_n);

  PERFORM transport.selesai_sesi_manual();

  -- ── Laporan: job berjalan yang wajib trailer tapi belum punya ────────────
  SELECT count(*) INTO v_n
    FROM transport.jobs j
    JOIN transport.units u ON u.id = j.unit_id
   WHERE j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled') AND j.unit_trailer_id IS NULL
     AND EXISTS (SELECT 1 FROM transport.jenis_unit_trailer jt
                  WHERE jt.jenis_unit_id = u.jenis_unit_id AND jt.status = 1);
  v_ringkas := v_ringkas || format(E'\n  (dicek saja) job berjalan wajib trailer tapi belum diisi: %s', v_n);

  RAISE NOTICE 'Perapian data lama selesai:%', v_ringkas;
END $$;

-- ── Pemeriksaan (jalankan terpisah, hanya membaca) ──────────────────────────
-- Data dummy yang perlu dilengkapi:
--   SELECT 'insiden' AS jenis, id::text, deskripsi AS info FROM transport.incident_logs
--    WHERE status = 1 AND deskripsi LIKE '[DUMMY migrasi 000009]%'
--   UNION ALL
--   SELECT 'penjualan', id::text, catatan FROM transport.penjualan_unit
--    WHERE status = 1 AND catatan LIKE '[DUMMY migrasi 000009]%'
--   UNION ALL
--   SELECT 'penghapusan', id::text, catatan FROM transport.penghapusan_aset
--    WHERE status = 1 AND catatan LIKE '[DUMMY migrasi 000009]%';
--
-- Job berjalan yang wajib trailer tapi belum diisi:
--   SELECT j.job_number, u.kode_unit FROM transport.jobs j JOIN transport.units u ON u.id = j.unit_id
--    WHERE j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled') AND j.unit_trailer_id IS NULL
--      AND EXISTS (SELECT 1 FROM transport.jenis_unit_trailer jt
--                   WHERE jt.jenis_unit_id = u.jenis_unit_id AND jt.status = 1);
