-- ============================================================================
-- Migration 20261001000023: riwayat approval satu tambahan uang jalan
--
-- Kartu uang jalan di detail job menampilkan daftar approver & catatan
-- persetujuan/penolakan untuk baris "Tambah uang jalan". daftar_pengajuan_
-- approval hanya untuk approver, jadi fungsi ini dibuat terpisah.
--
-- BATASAN: hanya staf aktif yang berhak mengakses job uang jalan itu
-- (can_access_job); selain itu tidak ada baris yang dikembalikan. Bila satu
-- tambahan pernah diajukan ulang, yang dikembalikan pengajuan terbaru.
--
-- Tidak ada perubahan data. Aman dijalankan ulang.
-- WAJIB: jalankan setelah 20261001000022. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.riwayat_approval_uang_jalan(p_uang_jalan_id UUID)
RETURNS TABLE (
  mode TEXT, status_approval TEXT, alasan_tolak TEXT, diajukan_oleh_nama TEXT, diajukan_at TIMESTAMPTZ,
  langkah JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT a.mode, a.status_approval, a.alasan_tolak, k.nama, a.diajukan_at,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'karyawan_id', l.karyawan_id, 'nama', lk.nama, 'urutan', l.urutan,
                     'keputusan', l.keputusan, 'catatan', l.catatan, 'diputuskan_at', l.diputuskan_at)
                     ORDER BY l.urutan, lk.nama)
                     FROM transport.pengajuan_approval_langkah l
                     JOIN hr.karyawan lk ON lk.id = l.karyawan_id
                    WHERE l.pengajuan_id = a.id AND l.status = 1), '[]'::jsonb)
    FROM transport.pengajuan_approval a
    JOIN transport.uang_jalan u ON u.id = a.ref_id
    LEFT JOIN hr.karyawan k ON k.id = a.diajukan_oleh
   WHERE a.fitur_kode = 'tambahan_uang_jalan'
     AND a.ref_id = p_uang_jalan_id
     AND a.status = 1
     AND transport.is_active_admin()
     AND transport.can_access_job(u.job_id)
   ORDER BY a.diajukan_at DESC
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION transport.riwayat_approval_uang_jalan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.riwayat_approval_uang_jalan(UUID) TO authenticated;
