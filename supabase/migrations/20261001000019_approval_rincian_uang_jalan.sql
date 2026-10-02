-- ============================================================================
-- Migration 20261001000019: rincian approval tambahan uang jalan — angka terkini
--
-- Rincian pengajuan disimpan sebagai salinan saat diajukan, sehingga "uang
-- jalan awal" tidak menunjukkan tambahan yang sudah disetujui sebelumnya
-- (mis. awal 5 jt + tambahan 3 jt disetujui → pengajuan berikutnya tetap
-- terlihat 5 jt). daftar_pengajuan_approval kini melengkapi rincian fitur
-- tambahan_uang_jalan dengan:
--   uang_jalan_awal    = uang jalan awal job (terkini)
--   tambahan_disetujui = tambahan job itu yang diajukan sebelum pengajuan ini
--                        dan sudah disetujui
-- "Total uang jalan untuk job ini" (ditampilkan frontend) = keduanya dijumlah.
--
-- Tidak ada perubahan data. Aman dijalankan ulang.
-- WAJIB: jalankan setelah 20261001000018.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.daftar_pengajuan_approval(
  p_fitur          TEXT,
  p_hanya_giliran  BOOLEAN DEFAULT false,
  p_status         TEXT DEFAULT NULL,
  p_q              TEXT DEFAULT NULL,
  p_tahun          INTEGER DEFAULT NULL,
  p_bulan          INTEGER DEFAULT NULL,
  p_limit          INTEGER DEFAULT 10,
  p_offset         INTEGER DEFAULT 0,
  -- Diisi = hanya pengajuan ini (halaman detail).
  p_id             UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, fitur_kode TEXT, ref_id UUID, judul TEXT, rincian JSONB, nilai BIGINT, mode TEXT,
  status_approval TEXT, diajukan_oleh_nama TEXT, diajukan_at TIMESTAMPTZ, diputuskan_at TIMESTAMPTZ,
  alasan_tolak TEXT, giliran_saya BOOLEAN, langkah JSONB, total BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_saya UUID := transport._karyawan_sesi();
  v_q    TEXT := NULLIF(btrim(COALESCE(p_q, '')), '');
BEGIN
  IF transport.role_aktif() IS NULL THEN
    RAISE EXCEPTION 'Butuh login.' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT a.id, a.fitur_kode, a.ref_id, a.judul,
         -- Tambahan uang jalan: rincian (salinan saat diajukan) dilengkapi angka
         -- terkini — uang jalan awal job & tambahan job itu yang diajukan SEBELUM
         -- pengajuan ini dan sudah disetujui. Total uang jalan job = keduanya.
         CASE WHEN a.fitur_kode = 'tambahan_uang_jalan' THEN
           a.rincian || COALESCE((
             SELECT jsonb_build_object(
                      'uang_jalan_awal', j.uang_jalan_awal,
                      'tambahan_disetujui', COALESCE((
                        SELECT SUM(x.jumlah) FROM transport.uang_jalan x
                         WHERE x.job_id = u.job_id AND x.status = 1 AND x.jenis = 'tambahan'
                           AND x.status_approval = 'disetujui' AND x.id <> u.id
                           AND x.created_at < u.created_at), 0))
               FROM transport.uang_jalan u
               JOIN transport.jobs j ON j.id = u.job_id
              WHERE u.id = a.ref_id), '{}'::jsonb)
         ELSE a.rincian END,
         a.nilai, a.mode, a.status_approval,
         k.nama, a.diajukan_at, a.diputuskan_at, a.alasan_tolak,
         transport._giliran_saya(a.id, v_saya),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'karyawan_id', l.karyawan_id, 'nama', lk.nama, 'urutan', l.urutan,
                     'keputusan', l.keputusan, 'catatan', l.catatan, 'diputuskan_at', l.diputuskan_at)
                     ORDER BY l.urutan, lk.nama)
                     FROM transport.pengajuan_approval_langkah l
                     JOIN hr.karyawan lk ON lk.id = l.karyawan_id
                    WHERE l.pengajuan_id = a.id AND l.status = 1), '[]'::jsonb),
         count(*) OVER ()
    FROM transport.pengajuan_approval a
    LEFT JOIN hr.karyawan k ON k.id = a.diajukan_oleh
   WHERE a.fitur_kode = p_fitur AND a.status = 1
     AND (p_id IS NULL OR a.id = p_id)
     -- BATASAN: pengajuan hanya tampil di daftar approver yang tercatat di
     -- pengajuan itu. Mode berjenjang: baru tampil setelah SEMUA level di bawah
     -- level-nya setuju (mis. L1 Linda, L2 Riski → Riski baru melihatnya setelah
     -- Linda setuju; bila Linda menolak, tidak pernah tampil di daftar Riski).
     AND EXISTS (
       SELECT 1 FROM transport.pengajuan_approval_langkah s
        WHERE s.pengajuan_id = a.id AND s.karyawan_id = v_saya AND s.status = 1
          AND (a.mode <> 'berjenjang' OR NOT EXISTS (
                SELECT 1 FROM transport.pengajuan_approval_langkah b
                 WHERE b.pengajuan_id = a.id AND b.status = 1
                   AND b.urutan < s.urutan AND b.keputusan <> 'setuju')))
     AND (NOT COALESCE(p_hanya_giliran, false) OR transport._giliran_saya(a.id, v_saya))
     AND (p_status IS NULL OR a.status_approval = p_status)
     AND (p_tahun IS NULL OR extract(year FROM a.diajukan_at AT TIME ZONE 'Asia/Jakarta') = p_tahun)
     AND (p_bulan IS NULL OR extract(month FROM a.diajukan_at AT TIME ZONE 'Asia/Jakarta') = p_bulan)
     AND (v_q IS NULL OR a.judul ILIKE '%' || v_q || '%' OR k.nama ILIKE '%' || v_q || '%')
   ORDER BY (a.status_approval = 'menunggu') DESC, a.diajukan_at DESC, a.id
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 5000)
   OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
REVOKE ALL ON FUNCTION transport.daftar_pengajuan_approval(TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_pengajuan_approval(TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, UUID) TO authenticated;
