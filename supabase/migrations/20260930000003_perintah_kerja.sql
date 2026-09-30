-- ============================================================================
-- Migration 20260930000003: Perintah Kerja Perbaikan (work order) + klaim asuransi
--
--   * transport.perintah_kerja            — satu perbaikan satu unit ATAU trailer.
--     Nomor otomatis 0001/WO/MAS/<bulan romawi>/<tahun> (next_nomor_dokumen).
--     Pelaksana: 'internal' (mekanik), 'bengkel' (bengkel luar), 'asuransi'.
--   * transport.perintah_kerja_mekanik    — mekanik yang bertugas.
--   * transport.perintah_kerja_jasa       — rincian pekerjaan / jasa.
--   * transport.perintah_kerja_sparepart  — sparepart (teks bebas; sistem stok
--     belum punya API).
--   * transport.perintah_kerja_biaya_lain — derek, transport, dll.
--   * transport.perintah_kerja_foto       — foto sebelum/sesudah, nota, dokumen klaim.
--   * transport.klaim_asuransi            — klaim untuk WO berpelaksana asuransi.
--
-- Status aset mengikuti WO: WO dikerjakan / menunggu sparepart / menunggu
-- asuransi → aset 'perbaikan'. WO selesai / dibatalkan → aset kembali seperti
-- aturan insiden (breakdown / perbaikan bila masih ada insiden, selain itu
-- bertugas / standby). WO dari insiden: WO jalan → insiden 'in_progress';
-- WO selesai → insiden 'resolved' dengan biaya_repair = total WO.
--
-- AMAN UNTUK KODE LAMA: tabel & fungsi baru, ditambah SATU fungsi lama yang
-- diperluas (incident_sync_status_unit): bila masih ada WO aktif, insiden yang
-- diselesaikan tidak mengembalikan aset ke standby. Selama belum ada WO
-- (kode lama tidak pernah membuatnya) perilakunya sama persis.
-- WAJIB: jalankan setelah 20260930000002.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Tabel utama ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.perintah_kerja (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor               TEXT,
  tanggal             DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Jakarta')::date),
  unit_id             UUID REFERENCES transport.units(id),
  unit_trailer_id     UUID REFERENCES transport.unit_trailer(id),
  incident_id         UUID REFERENCES transport.incident_logs(id) ON DELETE SET NULL,
  sumber              TEXT NOT NULL DEFAULT 'lainnya'
                      CONSTRAINT perintah_kerja_sumber_check
                      CHECK (sumber IN ('servis_berkala', 'insiden', 'keluhan_driver', 'inspeksi', 'lainnya')),
  jenis               TEXT NOT NULL DEFAULT 'lainnya'
                      CONSTRAINT perintah_kerja_jenis_check
                      CHECK (jenis IN ('rutin', 'oli', 'ban', 'mesin', 'kelistrikan', 'rem', 'body', 'lainnya')),
  prioritas           TEXT NOT NULL DEFAULT 'normal'
                      CONSTRAINT perintah_kerja_prioritas_check CHECK (prioritas IN ('rendah', 'normal', 'tinggi')),
  keluhan             TEXT,
  diagnosa            TEXT,
  pelaksana           TEXT NOT NULL DEFAULT 'internal'
                      CONSTRAINT perintah_kerja_pelaksana_check CHECK (pelaksana IN ('internal', 'bengkel', 'asuransi')),
  bengkel_id          UUID REFERENCES transport.bengkel(id),
  polis_id            UUID REFERENCES transport.polis_asuransi(id),
  bengkel_rekanan_id  UUID REFERENCES transport.asuransi_bengkel_rekanan(id) ON DELETE SET NULL,
  no_nota             TEXT,
  jadwal_mulai        DATE,
  estimasi_selesai    DATE,
  tanggal_selesai     DATE,
  odometer_km         NUMERIC(12, 2) CONSTRAINT perintah_kerja_odometer_check CHECK (odometer_km IS NULL OR odometer_km >= 0),
  status_wo           TEXT NOT NULL DEFAULT 'draft'
                      CONSTRAINT perintah_kerja_status_wo_check CHECK (status_wo IN (
                        'draft', 'dijadwalkan', 'dikerjakan', 'menunggu_sparepart',
                        'menunggu_asuransi', 'selesai', 'dibatalkan')),
  alasan_batal        TEXT,
  total_jasa          NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_sparepart     NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_lain          NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_biaya         NUMERIC(15, 2) NOT NULL DEFAULT 0,
  catatan             TEXT,
  created_by          UUID REFERENCES transport.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  status              SMALLINT NOT NULL DEFAULT 1 CONSTRAINT perintah_kerja_status_check CHECK (status IN (1, 2)),
  CONSTRAINT perintah_kerja_aset_check CHECK (num_nonnulls(unit_id, unit_trailer_id) = 1),
  CONSTRAINT perintah_kerja_bengkel_check CHECK (pelaksana <> 'bengkel' OR bengkel_id IS NOT NULL),
  CONSTRAINT perintah_kerja_asuransi_check CHECK (pelaksana <> 'asuransi' OR polis_id IS NOT NULL),
  CONSTRAINT perintah_kerja_batal_check CHECK (status_wo <> 'dibatalkan' OR btrim(COALESCE(alasan_batal, '')) <> ''),
  CONSTRAINT perintah_kerja_total_check CHECK (
    total_jasa >= 0 AND total_sparepart >= 0 AND total_lain >= 0 AND total_biaya >= 0)
);
COMMENT ON TABLE transport.perintah_kerja IS
  'Perintah kerja perbaikan (WO). Status aset mengikuti WO aktif (dikerjakan / menunggu …).';
CREATE UNIQUE INDEX IF NOT EXISTS perintah_kerja_nomor_unique
  ON transport.perintah_kerja (nomor) WHERE status = 1 AND nomor IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perintah_kerja_unit
  ON transport.perintah_kerja (unit_id, tanggal DESC) WHERE status = 1 AND unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perintah_kerja_trailer
  ON transport.perintah_kerja (unit_trailer_id, tanggal DESC) WHERE status = 1 AND unit_trailer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perintah_kerja_tanggal
  ON transport.perintah_kerja (tanggal DESC, created_at DESC) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_perintah_kerja_incident
  ON transport.perintah_kerja (incident_id) WHERE status = 1 AND incident_id IS NOT NULL;

-- ── 2. Tabel rincian ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.perintah_kerja_mekanik (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perintah_kerja_id    UUID NOT NULL REFERENCES transport.perintah_kerja(id) ON DELETE CASCADE,
  -- Mekanik yang sudah pernah bertugas tidak bisa dihapus (nonaktifkan saja).
  mekanik_id           UUID NOT NULL REFERENCES transport.mekanik(id),
  is_penanggung_jawab  BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  status               SMALLINT NOT NULL DEFAULT 1 CONSTRAINT perintah_kerja_mekanik_status_check CHECK (status IN (1, 2))
);
CREATE UNIQUE INDEX IF NOT EXISTS perintah_kerja_mekanik_unique
  ON transport.perintah_kerja_mekanik (perintah_kerja_id, mekanik_id) WHERE status = 1;
CREATE UNIQUE INDEX IF NOT EXISTS perintah_kerja_mekanik_pj_unique
  ON transport.perintah_kerja_mekanik (perintah_kerja_id) WHERE status = 1 AND is_penanggung_jawab;

CREATE TABLE IF NOT EXISTS transport.perintah_kerja_jasa (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perintah_kerja_id  UUID NOT NULL REFERENCES transport.perintah_kerja(id) ON DELETE CASCADE,
  uraian             TEXT NOT NULL CONSTRAINT perintah_kerja_jasa_uraian_check CHECK (btrim(uraian) <> ''),
  mekanik_id         UUID REFERENCES transport.mekanik(id),
  jam_kerja          NUMERIC(8, 2) CONSTRAINT perintah_kerja_jasa_jam_check CHECK (jam_kerja IS NULL OR jam_kerja >= 0),
  biaya              NUMERIC(15, 2) NOT NULL DEFAULT 0 CONSTRAINT perintah_kerja_jasa_biaya_check CHECK (biaya >= 0),
  urutan             INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  status             SMALLINT NOT NULL DEFAULT 1 CONSTRAINT perintah_kerja_jasa_status_check CHECK (status IN (1, 2))
);

CREATE TABLE IF NOT EXISTS transport.perintah_kerja_sparepart (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perintah_kerja_id  UUID NOT NULL REFERENCES transport.perintah_kerja(id) ON DELETE CASCADE,
  kode               TEXT,
  nama               TEXT NOT NULL CONSTRAINT perintah_kerja_sparepart_nama_check CHECK (btrim(nama) <> ''),
  qty                NUMERIC(12, 2) NOT NULL CONSTRAINT perintah_kerja_sparepart_qty_check CHECK (qty > 0),
  satuan             TEXT,
  harga_satuan       NUMERIC(15, 2) NOT NULL DEFAULT 0 CONSTRAINT perintah_kerja_sparepart_harga_check CHECK (harga_satuan >= 0),
  keterangan         TEXT,
  urutan             INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  status             SMALLINT NOT NULL DEFAULT 1 CONSTRAINT perintah_kerja_sparepart_status_check CHECK (status IN (1, 2))
);

CREATE TABLE IF NOT EXISTS transport.perintah_kerja_biaya_lain (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perintah_kerja_id  UUID NOT NULL REFERENCES transport.perintah_kerja(id) ON DELETE CASCADE,
  uraian             TEXT NOT NULL CONSTRAINT perintah_kerja_biaya_lain_uraian_check CHECK (btrim(uraian) <> ''),
  biaya              NUMERIC(15, 2) NOT NULL DEFAULT 0 CONSTRAINT perintah_kerja_biaya_lain_biaya_check CHECK (biaya >= 0),
  urutan             INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  status             SMALLINT NOT NULL DEFAULT 1 CONSTRAINT perintah_kerja_biaya_lain_status_check CHECK (status IN (1, 2))
);

CREATE TABLE IF NOT EXISTS transport.perintah_kerja_foto (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perintah_kerja_id  UUID NOT NULL REFERENCES transport.perintah_kerja(id) ON DELETE CASCADE,
  jenis              TEXT NOT NULL DEFAULT 'dokumen'
                     CONSTRAINT perintah_kerja_foto_jenis_check CHECK (jenis IN ('sebelum', 'sesudah', 'dokumen', 'klaim')),
  file_path          TEXT NOT NULL,
  nama_file          TEXT,
  content_type       TEXT,
  file_size          INTEGER,
  uploaded_by        UUID REFERENCES transport.profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  status             SMALLINT NOT NULL DEFAULT 1 CONSTRAINT perintah_kerja_foto_status_check CHECK (status IN (1, 2))
);

CREATE TABLE IF NOT EXISTS transport.klaim_asuransi (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perintah_kerja_id  UUID NOT NULL REFERENCES transport.perintah_kerja(id) ON DELETE CASCADE,
  polis_id           UUID NOT NULL REFERENCES transport.polis_asuransi(id),
  pic_id             UUID REFERENCES transport.asuransi_pic(id) ON DELETE SET NULL,
  nomor_klaim        TEXT,
  tanggal_pengajuan  DATE,
  status_klaim       TEXT NOT NULL DEFAULT 'diajukan'
                     CONSTRAINT klaim_asuransi_status_klaim_check
                     CHECK (status_klaim IN ('diajukan', 'survei', 'disetujui', 'ditolak', 'dibayar')),
  nilai_diajukan     NUMERIC(15, 2) CONSTRAINT klaim_asuransi_diajukan_check CHECK (nilai_diajukan IS NULL OR nilai_diajukan >= 0),
  nilai_disetujui    NUMERIC(15, 2) CONSTRAINT klaim_asuransi_disetujui_check CHECK (nilai_disetujui IS NULL OR nilai_disetujui >= 0),
  own_risk           NUMERIC(15, 2) CONSTRAINT klaim_asuransi_own_risk_check CHECK (own_risk IS NULL OR own_risk >= 0),
  catatan            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  status             SMALLINT NOT NULL DEFAULT 1 CONSTRAINT klaim_asuransi_status_check CHECK (status IN (1, 2))
);
CREATE UNIQUE INDEX IF NOT EXISTS klaim_asuransi_wo_unique
  ON transport.klaim_asuransi (perintah_kerja_id) WHERE status = 1;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['perintah_kerja_jasa', 'perintah_kerja_sparepart', 'perintah_kerja_biaya_lain',
                           'perintah_kerja_foto', 'perintah_kerja_mekanik', 'klaim_asuransi'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%1$s_wo ON transport.%1$I (perintah_kerja_id) WHERE status = 1', t);
  END LOOP;
END;
$$;

-- ── 3. Nomor otomatis & validasi WO ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.perintah_kerja_sebelum_simpan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_kode   TEXT;
  v_status TEXT;
  v_polis  transport.polis_asuransi%ROWTYPE;
  v_ins    transport.incident_logs%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.nomor IS NULL THEN
      NEW.nomor := transport.next_nomor_dokumen('perintah_kerja', 'WO', NEW.tanggal);
    END IF;
    -- Aset yang sudah keluar armada tidak bisa diberi perintah kerja.
    IF NEW.unit_id IS NOT NULL THEN
      SELECT u.kode_unit, u.status_operasional::text INTO v_kode, v_status
        FROM transport.units u WHERE u.id = NEW.unit_id;
    ELSE
      SELECT t.kode_trailer, t.status_trailer INTO v_kode, v_status
        FROM transport.unit_trailer t WHERE t.id = NEW.unit_trailer_id;
    END IF;
    IF v_status IN ('terjual', 'diafkirkan') THEN
      RAISE EXCEPTION 'Aset % sudah % — tidak bisa dibuatkan perintah kerja.', v_kode, v_status
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF OLD.status = 1 AND NEW.status = 2 AND OLD.status_wo NOT IN ('draft', 'dijadwalkan', 'dibatalkan') THEN
      RAISE EXCEPTION 'Perintah kerja yang sudah berjalan atau selesai tidak bisa dihapus — batalkan saja.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status_wo = 'selesai' AND NEW.status_wo IS DISTINCT FROM 'selesai' THEN
      RAISE EXCEPTION 'Perintah kerja yang sudah selesai tidak bisa diubah statusnya.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status_wo = 'dibatalkan' AND NEW.status_wo IS DISTINCT FROM 'dibatalkan' THEN
      RAISE EXCEPTION 'Perintah kerja yang sudah dibatalkan tidak bisa diaktifkan lagi.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Pelaksana asuransi: polis milik aset ini dan berlaku pada tanggal WO.
  IF NEW.pelaksana = 'asuransi' THEN
    SELECT * INTO v_polis FROM transport.polis_asuransi p WHERE p.id = NEW.polis_id AND p.status = 1;
    IF v_polis.id IS NULL
       OR v_polis.unit_id IS DISTINCT FROM NEW.unit_id
       OR v_polis.unit_trailer_id IS DISTINCT FROM NEW.unit_trailer_id THEN
      RAISE EXCEPTION 'Polis asuransi tidak ditemukan untuk aset ini.' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.tanggal NOT BETWEEN v_polis.mulai AND v_polis.berakhir THEN
      RAISE EXCEPTION 'Polis % tidak berlaku pada tanggal perintah kerja (berlaku % s/d %).',
        v_polis.nomor_polis, v_polis.mulai, v_polis.berakhir USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Insiden yang ditautkan harus milik aset yang sama.
  IF NEW.incident_id IS NOT NULL THEN
    SELECT * INTO v_ins FROM transport.incident_logs i WHERE i.id = NEW.incident_id AND i.status = 1;
    IF v_ins.id IS NULL
       OR v_ins.unit_id IS DISTINCT FROM NEW.unit_id
       OR v_ins.unit_trailer_id IS DISTINCT FROM NEW.unit_trailer_id THEN
      RAISE EXCEPTION 'Insiden tidak ditemukan untuk aset ini.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status_wo = 'selesai' AND NEW.tanggal_selesai IS NULL THEN
    NEW.tanggal_selesai := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_perintah_kerja_sebelum_simpan ON transport.perintah_kerja;
CREATE TRIGGER trg_perintah_kerja_sebelum_simpan BEFORE INSERT OR UPDATE ON transport.perintah_kerja
  FOR EACH ROW EXECUTE FUNCTION transport.perintah_kerja_sebelum_simpan();

-- ── 4. Status aset & insiden mengikuti WO ───────────────────────────────────
CREATE OR REPLACE FUNCTION transport._wo_aktif(p_status_wo TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status_wo IN ('dikerjakan', 'menunggu_sparepart', 'menunggu_asuransi');
$$;

CREATE OR REPLACE FUNCTION transport.perintah_kerja_sinkron_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_trailer    BOOLEAN := NEW.unit_id IS NULL;
  v_aktif_baru BOOLEAN := NEW.status = 1 AND transport._wo_aktif(NEW.status_wo);
  v_aktif_lama BOOLEAN := TG_OP = 'UPDATE' AND OLD.status = 1 AND transport._wo_aktif(OLD.status_wo);
  v_ada_wo     BOOLEAN;
  v_ada_proses BOOLEAN;
  v_ada_open   BOOLEAN;
  v_target     TEXT;
  v_boleh_dari TEXT[];
  v_note       TEXT;
  v_note_lama  TEXT;
  v_ins_status TEXT;
  v_pelaksana  TEXT;
BEGIN
  -- Insiden yang ditautkan ikut bergerak (alurnya tetap maju satu langkah).
  IF NEW.incident_id IS NOT NULL AND NEW.status = 1 THEN
    SELECT i.status_penanganan::text INTO v_ins_status
      FROM transport.incident_logs i WHERE i.id = NEW.incident_id AND i.status = 1;
    IF v_aktif_baru AND v_ins_status = 'open' THEN
      UPDATE transport.incident_logs SET status_penanganan = 'in_progress'
       WHERE id = NEW.incident_id AND status = 1 AND status_penanganan = 'open';
    ELSIF NEW.status_wo = 'selesai' AND (TG_OP = 'INSERT' OR OLD.status_wo <> 'selesai')
          AND v_ins_status IN ('open', 'in_progress') THEN
      v_pelaksana := CASE NEW.pelaksana
        WHEN 'bengkel' THEN (SELECT b.nama FROM transport.bengkel b WHERE b.id = NEW.bengkel_id)
        WHEN 'asuransi' THEN (SELECT 'Asuransi ' || a.nama FROM transport.polis_asuransi p
                                JOIN transport.asuransi a ON a.id = p.asuransi_id WHERE p.id = NEW.polis_id)
        ELSE 'Mekanik internal' END;
      IF v_ins_status = 'open' THEN
        UPDATE transport.incident_logs SET status_penanganan = 'in_progress'
         WHERE id = NEW.incident_id AND status = 1 AND status_penanganan = 'open';
      END IF;
      UPDATE transport.incident_logs
         SET status_penanganan = 'resolved',
             resolved_at = now(),
             biaya_repair = NEW.total_biaya,
             vendor_repair = COALESCE(vendor_repair, v_pelaksana)
       WHERE id = NEW.incident_id AND status = 1 AND status_penanganan = 'in_progress';
    END IF;
  END IF;

  -- Hanya saat WO masuk / keluar dari keadaan "sedang dikerjakan".
  IF v_aktif_baru = v_aktif_lama THEN
    RETURN NULL;
  END IF;

  IF v_aktif_baru THEN
    v_target := 'perbaikan';
    v_boleh_dari := ARRAY['standby', 'bertugas', 'breakdown'];
    v_note := 'Perintah kerja ' || COALESCE(NEW.nomor, '') || ' dikerjakan';
  ELSE
    SELECT EXISTS (
             SELECT 1 FROM transport.perintah_kerja w
              WHERE w.status = 1 AND w.id <> NEW.id AND transport._wo_aktif(w.status_wo)
                AND CASE WHEN v_trailer THEN w.unit_trailer_id = NEW.unit_trailer_id ELSE w.unit_id = NEW.unit_id END)
      INTO v_ada_wo;
    IF v_ada_wo THEN
      RETURN NULL;  -- masih ada WO lain yang dikerjakan: tetap perbaikan
    END IF;
    SELECT COALESCE(bool_or(i.status_penanganan = 'in_progress'), false),
           COALESCE(bool_or(i.status_penanganan = 'open'), false)
      INTO v_ada_proses, v_ada_open
      FROM transport.incident_logs i
     WHERE i.status = 1 AND i.status_penanganan <> 'resolved'
       AND CASE WHEN v_trailer THEN i.unit_trailer_id = NEW.unit_trailer_id ELSE i.unit_id = NEW.unit_id END;
    IF v_ada_proses THEN
      RETURN NULL;  -- insiden masih dalam penanganan: tetap perbaikan
    ELSIF v_ada_open THEN
      v_target := 'breakdown';
    ELSE
      v_target := CASE WHEN EXISTS (
                    SELECT 1 FROM transport.jobs j
                     WHERE j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
                       AND CASE WHEN v_trailer THEN j.unit_trailer_id = NEW.unit_trailer_id
                                ELSE j.unit_id = NEW.unit_id END)
                  THEN 'bertugas' ELSE 'standby' END;
    END IF;
    v_boleh_dari := ARRAY['perbaikan'];
    v_note := 'Perintah kerja ' || COALESCE(NEW.nomor, '') ||
              CASE WHEN NEW.status_wo = 'selesai' THEN ' selesai'
                   WHEN NEW.status_wo = 'dibatalkan' THEN ' dibatalkan'
                   WHEN NEW.status <> 1 THEN ' dihapus'
                   ELSE ' ditunda' END;
  END IF;

  v_note_lama := current_setting('app.status_note', true);
  PERFORM set_config('app.status_note', v_note, true);
  IF v_trailer THEN
    UPDATE transport.unit_trailer
       SET status_trailer = v_target, updated_at = now()
     WHERE id = NEW.unit_trailer_id AND status = 1 AND status_trailer = ANY (v_boleh_dari);
  ELSE
    UPDATE transport.units
       SET status_operasional = v_target::transport.unit_status, updated_at = now()
     WHERE id = NEW.unit_id AND status = 1 AND status_operasional::text = ANY (v_boleh_dari);
  END IF;
  PERFORM set_config('app.status_note', COALESCE(v_note_lama, ''), true);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_perintah_kerja_sinkron_status ON transport.perintah_kerja;
CREATE TRIGGER trg_perintah_kerja_sinkron_status AFTER INSERT OR UPDATE ON transport.perintah_kerja
  FOR EACH ROW EXECUTE FUNCTION transport.perintah_kerja_sinkron_status();

-- Insiden: salinan definisi terkini (20260926000006) + satu pengecekan baru —
-- insiden terakhir diselesaikan tapi aset masih punya WO yang dikerjakan →
-- aset tetap 'perbaikan'. Tanpa WO aktif perilakunya sama persis.
CREATE OR REPLACE FUNCTION transport.incident_sync_status_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_trailer    BOOLEAN := NEW.unit_id IS NULL;
  v_ada_proses BOOLEAN;
  v_ada_open   BOOLEAN;
  v_target     TEXT;
  v_boleh_dari TEXT[];
  v_note       TEXT;
  v_note_lama  TEXT;
BEGIN
  SELECT COALESCE(bool_or(i.status_penanganan = 'in_progress'), false),
         COALESCE(bool_or(i.status_penanganan = 'open'), false)
    INTO v_ada_proses, v_ada_open
    FROM transport.incident_logs i
   WHERE i.status = 1 AND i.status_penanganan <> 'resolved'
     AND CASE WHEN v_trailer THEN i.unit_trailer_id = NEW.unit_trailer_id ELSE i.unit_id = NEW.unit_id END;

  IF v_ada_proses THEN
    v_target := 'perbaikan';
    v_boleh_dari := ARRAY['standby', 'bertugas', 'breakdown'];
    v_note := 'Insiden dalam penanganan';
  ELSIF v_ada_open THEN
    v_target := 'breakdown';
    v_boleh_dari := ARRAY['standby', 'bertugas', 'perbaikan'];
    v_note := 'Insiden ' || NEW.tipe::text || ' dicatat';
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 1 AND OLD.status_penanganan <> 'resolved'
        AND (NEW.status <> 1 OR NEW.status_penanganan = 'resolved') THEN
    -- Insiden terakhir yang belum selesai baru saja diselesaikan / dihapus.
    -- (Baru) Masih ada perintah kerja yang dikerjakan → aset tetap perbaikan.
    IF EXISTS (
      SELECT 1 FROM transport.perintah_kerja w
       WHERE w.status = 1 AND transport._wo_aktif(w.status_wo)
         AND CASE WHEN v_trailer THEN w.unit_trailer_id = NEW.unit_trailer_id ELSE w.unit_id = NEW.unit_id END
    ) THEN
      RETURN NULL;
    END IF;
    v_target := CASE WHEN EXISTS (
                  SELECT 1 FROM transport.jobs j
                   WHERE j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
                     AND CASE WHEN v_trailer THEN j.unit_trailer_id = NEW.unit_trailer_id
                              ELSE j.unit_id = NEW.unit_id END)
                THEN 'bertugas' ELSE 'standby' END;
    v_boleh_dari := ARRAY['breakdown', 'perbaikan'];
    v_note := CASE WHEN NEW.status <> 1 THEN 'Insiden dihapus' ELSE 'Perbaikan insiden selesai' END;
  ELSE
    RETURN NULL;
  END IF;

  -- Alasan ikut tercatat di riwayat status aset.
  v_note_lama := current_setting('app.status_note', true);
  PERFORM set_config('app.status_note', v_note, true);
  IF v_trailer THEN
    UPDATE transport.unit_trailer
       SET status_trailer = v_target, updated_at = now()
     WHERE id = NEW.unit_trailer_id AND status = 1
       AND status_trailer = ANY (v_boleh_dari);
  ELSE
    UPDATE transport.units
       SET status_operasional = v_target::transport.unit_status, updated_at = now()
     WHERE id = NEW.unit_id AND status = 1
       AND status_operasional::text = ANY (v_boleh_dari);
  END IF;
  PERFORM set_config('app.status_note', COALESCE(v_note_lama, ''), true);

  RETURN NULL;
END;
$$;

-- ── 5. updated_at, soft delete, log sistem, akses ──────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['perintah_kerja', 'perintah_kerja_mekanik', 'perintah_kerja_jasa',
                           'perintah_kerja_sparepart', 'perintah_kerja_biaya_lain', 'perintah_kerja_foto',
                           'klaim_asuransi'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON transport.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON transport.%1$I
                      FOR EACH ROW EXECUTE FUNCTION transport.set_updated_at()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete ON transport.%I', t);
    EXECUTE format('CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.%I
                      FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.%I', t);
    EXECUTE format('CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.%I
                      FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
                      EXECUTE FUNCTION transport.soft_delete_propagate()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.%I', t);
    EXECUTE format('CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.%I
                      FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
                      EXECUTE FUNCTION transport.soft_delete_propagate()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_log_sistem ON transport.%I', t);
    EXECUTE format('CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.%I
                      FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data()', t);

    EXECUTE format('ALTER TABLE transport.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON transport.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON transport.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON transport.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS "staf_baca_%1$s" ON transport.%1$I', t);
    EXECUTE format('CREATE POLICY "staf_baca_%1$s" ON transport.%1$I FOR SELECT TO authenticated
                      USING (transport.is_active_admin())', t);
    EXECUTE format('DROP POLICY IF EXISTS "pengelola_tambah_%1$s" ON transport.%1$I', t);
    EXECUTE format('CREATE POLICY "pengelola_tambah_%1$s" ON transport.%1$I FOR INSERT TO authenticated
                      WITH CHECK (transport.is_superadmin() OR transport.is_admin())', t);
    EXECUTE format('DROP POLICY IF EXISTS "pengelola_ubah_%1$s" ON transport.%1$I', t);
    EXECUTE format('CREATE POLICY "pengelola_ubah_%1$s" ON transport.%1$I FOR UPDATE TO authenticated
                      USING (transport.is_superadmin() OR transport.is_admin())
                      WITH CHECK (transport.is_superadmin() OR transport.is_admin())', t);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
