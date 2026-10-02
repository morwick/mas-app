-- ============================================================================
-- Migration 20261001000020: notifikasi ke admin saat pengajuan approval
--                           disetujui / ditolak
--
-- Saat status pengajuan approval berubah dari 'menunggu' menjadi 'disetujui'
-- atau 'ditolak' (keputusan AKHIR — bukan tiap level berjenjang), setiap
-- pengguna aktif yang punya role ADMIN menerima notifikasi (satu baris per
-- orang, recipient_id = id profil). Orang yang baru saja memutuskan tidak
-- dikirimi.
--
-- BATASAN: notifikasi admin yang punya recipient_id hanya terbaca oleh
-- penerimanya (policy admin_read_notifications diperbarui). Notifikasi lama
-- (recipient_id NULL) tetap untuk semua staf seperti sebelumnya.
--
-- Tautan: tambahan uang jalan → detail job; penjualan aset → Penjualan Unit;
-- penghapusan aset → Penghapusan Aset.
--
-- Tidak ada perubahan data. Aman dijalankan ulang.
-- WAJIB: jalankan setelah 20261001000019. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Notifikasi admin per penerima hanya terbaca penerimanya ──────────────
DROP POLICY IF EXISTS "admin_read_notifications" ON transport.notifications;
CREATE POLICY "admin_read_notifications" ON transport.notifications FOR SELECT
  USING (
    recipient_type = 'admin'
    AND transport.is_active_admin()
    AND (recipient_id IS NULL OR recipient_id = auth.uid())
    AND (job_id IS NULL OR transport.can_access_job(job_id))
  );

-- ── 2. Trigger: keputusan akhir pengajuan → notifikasi ke semua admin ───────
CREATE OR REPLACE FUNCTION transport.pengajuan_approval_notifikasi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_fitur   TEXT;
  v_pemutus TEXT;
  v_job_id  UUID;
  v_href    TEXT;
  v_kind    TEXT;
  v_title   TEXT;
  v_body    TEXT;
BEGIN
  -- Hanya keputusan akhir: menunggu → disetujui / ditolak.
  IF NEW.status <> 1
     OR OLD.status_approval <> 'menunggu'
     OR NEW.status_approval NOT IN ('disetujui', 'ditolak') THEN
    RETURN NEW;
  END IF;

  SELECT nama INTO v_fitur FROM transport.approval_fitur WHERE kode = NEW.fitur_kode;
  SELECT k.nama INTO v_pemutus FROM hr.karyawan k WHERE k.id = transport._karyawan_sesi();

  IF NEW.fitur_kode = 'tambahan_uang_jalan' THEN
    v_job_id := NULLIF(NEW.rincian ->> 'job_id', '')::UUID;
    v_href := CASE WHEN v_job_id IS NULL THEN '/dashboard' ELSE '/jobs/' || v_job_id END;
  ELSIF NEW.fitur_kode = 'penjualan_aset' THEN
    v_href := '/penjualan-unit';
  ELSE
    v_href := '/penghapusan-aset';
  END IF;

  IF NEW.status_approval = 'disetujui' THEN
    v_kind := 'approval_disetujui';
    v_title := COALESCE(v_fitur, 'Pengajuan') || ' disetujui';
    v_body := NEW.judul || COALESCE(' — disetujui ' || v_pemutus, '');
  ELSE
    v_kind := 'approval_ditolak';
    v_title := COALESCE(v_fitur, 'Pengajuan') || ' ditolak';
    v_body := NEW.judul || COALESCE(' — ditolak ' || v_pemutus, '')
              || COALESCE('. Alasan: ' || NEW.alasan_tolak, '');
  END IF;

  INSERT INTO transport.notifications (recipient_type, recipient_id, kind, title, body, href, job_id)
  SELECT 'admin', p.id, v_kind, v_title, v_body, v_href, v_job_id
    FROM transport.profiles p
   WHERE 'admin' = ANY (p.roles)
     AND p.is_active
     AND p.status = 1
     AND p.id IS DISTINCT FROM auth.uid();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.pengajuan_approval_notifikasi() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pengajuan_approval_notifikasi ON transport.pengajuan_approval;
CREATE TRIGGER trg_pengajuan_approval_notifikasi
  AFTER UPDATE OF status_approval ON transport.pengajuan_approval
  FOR EACH ROW EXECUTE FUNCTION transport.pengajuan_approval_notifikasi();
