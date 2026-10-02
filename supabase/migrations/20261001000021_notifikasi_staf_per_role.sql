-- ============================================================================
-- Migration 20261001000021: penerima notifikasi staf per role
--
-- Notifikasi kejadian untuk staf sebelumnya dikirim ke SEMUA staf
-- (recipient_id NULL). Kini dikirim per orang (recipient_id = id profil)
-- berdasarkan role yang DIMILIKI pengguna (kolom roles, bukan role aktif):
--
--   job_diterima          (driver menerima job)  → admin + operator berwenang
--   job_menunggu_validasi (driver selesai)       → admin
--   uang_jalan_diajukan   (pengajuan driver)     → admin
--   job_divalidasi        (BARU: admin menyetujui validasi; yang dikembalikan
--                          tidak dihitung)       → superadmin + finance +
--                                                  operator berwenang
-- "Operator berwenang" = punya role operator dan jenis unit job ada di
-- wewenangnya (profiles.allowed_jenis_unit_ids).
-- Pelaku (pengguna yang sedang login) tidak dikirimi notifikasinya sendiri.
--
-- BATASAN: notifikasi ber-penerima hanya terbaca penerimanya; penerimanya
-- sudah dipilih saat dikirim, jadi tidak lagi disaring hak akses job (mis.
-- finance tanpa wewenang jenis unit tetap menerima "Job divalidasi").
-- Notifikasi lama tanpa penerima tetap seperti sebelumnya.
--
-- Tidak ada perubahan data. Aman dijalankan ulang.
-- WAJIB: jalankan setelah 20261001000020. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Aturan baca ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_read_notifications" ON transport.notifications;
CREATE POLICY "admin_read_notifications" ON transport.notifications FOR SELECT
  USING (
    recipient_type = 'admin'
    AND transport.is_active_admin()
    AND (
      recipient_id = auth.uid()
      OR (recipient_id IS NULL AND (job_id IS NULL OR transport.can_access_job(job_id)))
    )
  );

-- ── 2. Kirim notifikasi ke staf per role ────────────────────────────────────
-- p_roles: role yang menerima (dicocokkan dengan roles yang dimiliki).
-- p_operator_berwenang: tambah operator yang berwenang atas jenis unit job.
CREATE OR REPLACE FUNCTION transport._notifikasi_staf(
  p_kind               TEXT,
  p_title              TEXT,
  p_body               TEXT,
  p_href               TEXT,
  p_job_id             UUID,
  p_roles              TEXT[],
  p_operator_berwenang BOOLEAN
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  INSERT INTO transport.notifications (recipient_type, recipient_id, kind, title, body, href, job_id)
  SELECT 'admin', p.id, p_kind, p_title, p_body, p_href, p_job_id
    FROM transport.profiles p
   WHERE p.is_active
     AND p.status = 1
     AND p.id IS DISTINCT FROM auth.uid()
     AND (
       p.roles && COALESCE(p_roles, ARRAY[]::TEXT[])
       OR (p_operator_berwenang AND 'operator' = ANY (p.roles) AND EXISTS (
             SELECT 1 FROM transport.jobs j
               JOIN transport.units u ON u.id = j.unit_id
              WHERE j.id = p_job_id
                AND u.jenis_unit_id = ANY (COALESCE(p.allowed_jenis_unit_ids, ARRAY[]::UUID[]))))
     );
$$;
REVOKE ALL ON FUNCTION transport._notifikasi_staf(TEXT, TEXT, TEXT, TEXT, UUID, TEXT[], BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ── 3. Kejadian job (salinan 20260928000001 + penerima per role) ────────────
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
    -- Admin + operator yang berwenang atas jenis unit job ini.
    PERFORM transport._notifikasi_staf('job_diterima', 'Driver menerima job',
      NEW.job_number || ' diterima ' || (SELECT nama FROM drivers WHERE id = NEW.driver_id),
      '/jobs/' || NEW.id, NEW.id,
      ARRAY['admin'], true);
  END IF;

  IF OLD.status_job IS DISTINCT FROM NEW.status_job THEN
    IF NEW.status_job = 'menunggu_validasi' THEN
      -- Hanya admin (yang memvalidasi).
      PERFORM transport._notifikasi_staf('job_menunggu_validasi', 'Job menunggu validasi',
        NEW.job_number || ' — ' || (SELECT nama FROM drivers WHERE id = NEW.driver_id) || ' sudah menyelesaikan orderan',
        '/jobs/' || NEW.id, NEW.id,
        ARRAY['admin'], false);
    ELSIF NEW.status_job = 'selesai' AND NEW.validated_at IS NOT NULL THEN
      PERFORM notify_driver(NEW.driver_id, 'job_divalidasi', 'Job divalidasi admin',
        NEW.job_number || ' selesai. Anda kembali Stand By.', '/driver/jobs/' || NEW.id, NEW.id);
      -- Job disetujui admin (bukan dikembalikan): superadmin, finance, dan operator
      -- yang berwenang atas jenis unit job ini.
      PERFORM transport._notifikasi_staf('job_divalidasi', 'Job divalidasi',
        NEW.job_number || ' — ' || NEW.asal || ' → ' || NEW.tujuan || ' sudah divalidasi admin',
        '/jobs/' || NEW.id, NEW.id, ARRAY['superadmin', 'finance'], true);
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

-- ── 4. Pengajuan uang jalan driver (salinan 20260924000007 + penerima admin) ─
CREATE OR REPLACE FUNCTION transport.uj_requests_emit_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = NEW.job_id AND status = 1;
  IF v_job.id IS NULL OR NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- Hanya admin.
    PERFORM transport._notifikasi_staf('uang_jalan_diajukan', 'Pengajuan uang jalan',
      v_job.job_number || ' — ' || (SELECT nama FROM drivers WHERE id = NEW.driver_id)
        || ' mengajukan Rp ' || to_char(NEW.nominal, 'FM999G999G999'),
      '/jobs/' || v_job.id, v_job.id, ARRAY['admin'], false);
  ELSIF NEW.status_pengajuan = 'ditolak' AND OLD.status_pengajuan <> 'ditolak' THEN
    PERFORM notify_driver(NEW.driver_id, 'uang_jalan_ditolak', 'Pengajuan uang jalan ditolak',
      v_job.job_number || COALESCE(': ' || NEW.alasan_tolak, ''), '/driver/jobs/' || v_job.id, v_job.id);
  END IF;
  RETURN NEW;
END;
$function$;
