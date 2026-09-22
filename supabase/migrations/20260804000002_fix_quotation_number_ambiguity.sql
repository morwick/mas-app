-- ============================================================================
-- Migration 20260804000002: Perbaiki ambiguitas kolom di next_quotation_number
--
-- Gejala saat fungsi dipanggil:
--   ERROR 42702: column reference "tahun" is ambiguous
--   "It could refer to either a PL/pgSQL variable or a table column."
--
-- Sebab: fungsi ini RETURNS TABLE (..., tahun INTEGER), sehingga `tahun` jadi
-- parameter OUT sekaligus nama kolom di document_counters. Pada klausa
--   ON CONFLICT (doc_type, tahun)
-- PL/pgSQL tidak bisa memutuskan mana yang dimaksud, lalu menolak.
--
-- Perbaikan: direktif #variable_conflict use_column — pada referensi yang
-- ambigu, kolom tabel yang menang. Semua variabel lokal di fungsi ini sudah
-- berawalan v_ dan setiap RETURNING sudah dikualifikasi nama tabelnya, jadi
-- satu-satunya referensi yang terdampak memang `tahun` di ON CONFLICT — yang
-- justru harus menunjuk kolom.
--
-- Nama kolom hasil (nomor, seq, tahun) sengaja dipertahankan supaya kode
-- aplikasi yang membacanya tidak perlu ikut berubah.
--
-- Aman dijalankan berulang: hanya mengganti isi fungsi, tidak menyentuh data
-- maupun nilai counter yang sedang berjalan.
-- ============================================================================

CREATE OR REPLACE FUNCTION next_quotation_number()
RETURNS TABLE (nomor TEXT, seq INTEGER, tahun INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_tahun INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_bulan INTEGER := EXTRACT(MONTH FROM now())::INTEGER;
  v_seq   INTEGER;
BEGIN
  INSERT INTO document_counters (doc_type, tahun, last_seq)
  VALUES ('quotation', v_tahun, 1)
  ON CONFLICT (doc_type, tahun) DO UPDATE
    SET last_seq   = document_counters.last_seq + 1,
        updated_at = now()
  RETURNING document_counters.last_seq INTO v_seq;

  RETURN QUERY SELECT
    LPAD(v_seq::TEXT, 4, '0') || '/SK/MAS/' || to_roman_month(v_bulan) || '/' || v_tahun::TEXT,
    v_seq,
    v_tahun;
END;
$$;
