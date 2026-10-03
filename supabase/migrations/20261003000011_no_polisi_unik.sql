-- ============================================================================
-- Migration 20261003000011: no polisi unit tidak boleh duplikat
--
-- BATASAN: no polisi unik di antara unit yang belum dihapus (status = 1),
-- termasuk unit nonaktif / terjual / diafkirkan. Dibandingkan tanpa spasi &
-- tanpa beda huruf besar/kecil: "B 1234 XY" = "b1234xy".
-- Backend (UnitService._pastikan_no_polisi_unik) memeriksa lebih dulu dengan
-- pesan yang jelas; index ini penjaga terakhir.
--
-- AMAN UNTUK DATA LAMA: bila sudah ada no polisi kembar, index TIDAK dibuat
-- dan daftar no polisi kembar ditampilkan lewat NOTICE — rapikan datanya lalu
-- jalankan ulang file ini. Tidak ada perubahan data.
-- WAJIB: jalankan setelah 20261003000010. Aman dijalankan ulang.
-- ============================================================================

SET search_path = transport, extensions;

DO $$
DECLARE
  v_kembar TEXT;
BEGIN
  SELECT string_agg(format('%s (%s)', k.no_polisi, k.kode_unit), '; ')
    INTO v_kembar
    FROM (
      SELECT upper(regexp_replace(u.no_polisi, '\s', '', 'g')) AS kunci,
             string_agg(u.no_polisi, ' / ' ORDER BY u.kode_unit) AS no_polisi,
             string_agg(u.kode_unit, ', ' ORDER BY u.kode_unit)  AS kode_unit
        FROM transport.units u
       WHERE u.status = 1
       GROUP BY 1
      HAVING COUNT(*) > 1
    ) k;

  IF v_kembar IS NOT NULL THEN
    RAISE NOTICE 'Index no polisi unik BELUM dibuat — ada no polisi kembar: %. Rapikan lalu jalankan ulang migration ini.', v_kembar;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS units_no_polisi_unique
      ON transport.units (upper(regexp_replace(no_polisi, '\s', '', 'g')))
      WHERE status = 1;
    RAISE NOTICE 'Index no polisi unik dibuat.';
  END IF;
END;
$$;
