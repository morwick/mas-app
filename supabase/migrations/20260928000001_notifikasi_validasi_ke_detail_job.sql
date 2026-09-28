-- ============================================================================
-- Migration 20260928000001: notifikasi "Job menunggu validasi" → detail job
--
-- Tautan notifikasi sebelumnya '/jobs/<id>/validasi' — halaman itu tidak ada
-- di web sehingga admin mendarat di 404. Panel validasi (Approve / Kembalikan)
-- sudah tampil di halaman detail job '/jobs/<id>' selama status job
-- 'menunggu_validasi', jadi tautannya diarahkan ke sana.
--
-- Hanya fungsi trigger yang diganti (isi lain sama persis dengan versi di
-- 20260924000007_soft_delete.sql). Notifikasi lama yang terlanjur tersimpan
-- dengan tautan '/validasi' ditangani frontend (route pengalih ke detail job),
-- jadi tidak ada UPDATE data di sini.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.jobs_emit_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_driver(NEW.driver_id, 'job_baru', 'Job baru untuk Anda',
      NEW.job_number || ' — ' || NEW.asal || ' → ' || NEW.tujuan,
      '/driver/jobs/' || NEW.id, NEW.id);
    RETURN NEW;
  END IF;

  -- Job yang di-soft delete tidak memicu notifikasi apa pun.
  IF NEW.status <> 1 THEN
    RETURN NEW;
  END IF;

  IF OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL THEN
    PERFORM notify_admin('job_diterima', 'Driver menerima job',
      NEW.job_number || ' diterima ' || (SELECT nama FROM drivers WHERE id = NEW.driver_id),
      '/jobs/' || NEW.id, NEW.id);
  END IF;

  IF OLD.status_job IS DISTINCT FROM NEW.status_job THEN
    IF NEW.status_job = 'menunggu_validasi' THEN
      PERFORM notify_admin('job_menunggu_validasi', 'Job menunggu validasi',
        NEW.job_number || ' — ' || (SELECT nama FROM drivers WHERE id = NEW.driver_id) || ' sudah menyelesaikan orderan',
        '/jobs/' || NEW.id, NEW.id);
    ELSIF NEW.status_job = 'selesai' AND NEW.validated_at IS NOT NULL THEN
      PERFORM notify_driver(NEW.driver_id, 'job_divalidasi', 'Job divalidasi admin',
        NEW.job_number || ' selesai. Anda kembali Stand By.', '/driver/jobs/' || NEW.id, NEW.id);
    ELSIF OLD.status_job = 'menunggu_validasi' AND NEW.validation_note IS NOT NULL THEN
      PERFORM notify_driver(NEW.driver_id, 'job_dikembalikan', 'Job dikembalikan admin',
        NEW.job_number || ': ' || NEW.validation_note, '/driver/jobs/' || NEW.id, NEW.id);
    ELSIF NEW.status_job = 'cancelled' THEN
      PERFORM notify_driver(NEW.driver_id, 'job_dibatalkan', 'Job dibatalkan',
        NEW.job_number || COALESCE(': ' || NEW.cancelled_reason, ''), '/driver/dashboard', NEW.id);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.driver_id <> NEW.driver_id AND NEW.status_job NOT IN ('selesai', 'cancelled') THEN
    PERFORM notify_driver(NEW.driver_id, 'job_baru', 'Job baru untuk Anda',
      NEW.job_number || ' — ' || NEW.asal || ' → ' || NEW.tujuan, '/driver/jobs/' || NEW.id, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
