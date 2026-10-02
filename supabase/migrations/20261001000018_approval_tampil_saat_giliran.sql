-- ============================================================================
-- Migration 20261001000018: daftar approval hanya saat sudah sampai giliran
--
-- Sebelumnya approver fitur (dan superadmin) melihat SEMUA pengajuan fitur itu
-- di menu Approval, termasuk yang belum sampai level-nya.
--
-- BATASAN baru (daftar_pengajuan_approval): pengajuan hanya tampil di daftar
-- approver yang tercatat di pengajuan itu, dan untuk mode berjenjang baru
-- tampil setelah semua level di bawahnya setuju. Contoh L1 Linda, L2 Riski:
--   diajukan → hanya di daftar Linda; Linda setuju → muncul di daftar Riski;
--   Linda menolak → tidak pernah muncul di daftar Riski.
-- Mode "salah satu" / "semua": semua approver langsung melihatnya (giliran
-- bersamaan). Pengajuan yang sudah diputuskan tetap tampil di tab "Semua" bagi
-- approver yang pernah mendapat gilirannya.
--
-- Parameter baru p_id: ambil satu pengajuan (halaman detail approval) dengan
-- aturan tampil yang sama — dibuka lewat alamat langsung pun tetap dijaga.
--
-- Tidak ada perubahan data. Aman dijalankan ulang.
-- WAJIB: jalankan setelah 20261001000017.
-- ============================================================================

SET search_path = transport, extensions;

DROP FUNCTION IF EXISTS transport.daftar_pengajuan_approval(TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER);
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
  SELECT a.id, a.fitur_kode, a.ref_id, a.judul, a.rincian, a.nilai, a.mode, a.status_approval,
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
