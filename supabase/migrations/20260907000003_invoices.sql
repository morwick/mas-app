-- ============================================================================
-- Migration 20260907000003: Modul Invoice & Piutang
--
-- Rantai dokumen berhenti separuh jalan sebelum ini:
--   Penawaran → Job → Uang jalan keluar → ✗
--
-- Harga sepakat sudah tersimpan di quotations, termin dan status PKP sudah di
-- customers, biaya sudah di uang_jalan. Yang belum ada justru sisi uang masuk:
-- penagihan, pembayaran, dan daftar siapa yang belum bayar.
--
-- Model di sini:
--   invoices          → satu tagihan = satu baris (header + total)
--   invoice_items     → baris rincian, boleh menunjuk ke job asalnya
--   invoice_payments  → tiap kali uang benar-benar masuk
--
-- Sisa tagihan TIDAK disimpan, selalu dihitung dari total dikurangi jumlah
-- pembayaran — mengikuti keputusan yang sama seperti sisa pagu uang jalan.
-- Angka yang disimpan bisa melenceng dari kejadiannya; angka yang dihitung
-- tidak bisa.
--
-- Status lunas juga diturunkan, bukan diketik. Satu-satunya cara sebuah
-- invoice menjadi lunas adalah karena pembayarannya menutup totalnya.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Status invoice
--
--   draft    → masih disusun, nomor SUDAH terpakai (sama seperti penawaran)
--   terkirim → sudah ditagihkan ke customer, menunggu pembayaran
--   lunas    → pembayaran menutup total (diisi trigger, bukan admin)
--   batal    → dibatalkan; nomornya tetap ada di arsip
--
-- "Jatuh tempo" sengaja bukan status: itu keadaan yang berubah sendiri seiring
-- tanggal, bukan keputusan yang pernah diambil seseorang. Menyimpannya sebagai
-- status berarti harus ada yang menjalankan pembaruan tiap hari.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft', 'terkirim', 'lunas', 'batal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- next_invoice_number
--
-- Mengikuti pola arsip yang sudah berjalan untuk surat penawaran, dengan kode
-- dokumen INV: 0001/INV/MAS/I/2026. Counter-nya terpisah dari penawaran dan
-- ikut di-reset tiap tahun.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS TABLE (nomor TEXT, seq INTEGER, tahun INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tahun INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_bulan INTEGER := EXTRACT(MONTH FROM now())::INTEGER;
  v_seq   INTEGER;
BEGIN
  INSERT INTO document_counters (doc_type, tahun, last_seq)
  VALUES ('invoice', v_tahun, 1)
  ON CONFLICT (doc_type, tahun) DO UPDATE
    SET last_seq   = document_counters.last_seq + 1,
        updated_at = now()
  RETURNING document_counters.last_seq INTO v_seq;

  RETURN QUERY SELECT
    LPAD(v_seq::TEXT, 4, '0') || '/INV/MAS/' || to_roman_month(v_bulan) || '/' || v_tahun::TEXT,
    v_seq,
    v_tahun;
END;
$$;

-- ---------------------------------------------------------------------------
-- invoices
--
-- Data customer di-snapshot (nama, alamat, NPWP, PIC, termin) karena tagihan
-- yang sudah dikirim adalah dokumen: isinya tidak boleh ikut berubah kalau
-- master customer di-edit setahun kemudian. Ini alasan yang sama seperti pada
-- quotations, dan di sini taruhannya lebih besar karena menyangkut pajak.
--
-- Nilai uang BIGINT rupiah penuh — tanpa pecahan sen, jadi tidak ada galat
-- pembulatan floating point pada total maupun sisa tagihan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   TEXT NOT NULL UNIQUE,
  seq_no           INTEGER NOT NULL,
  seq_tahun        INTEGER NOT NULL,

  customer_id      UUID NOT NULL REFERENCES customers(id),
  customer_nama    TEXT NOT NULL,
  customer_alamat  TEXT,
  customer_npwp    TEXT,
  pic_sapaan       TEXT,
  pic_nama         TEXT,

  /** Penawaran asal, bila tagihan ini lahir dari penawaran yang sudah deal. */
  quotation_id     UUID REFERENCES quotations(id),

  kota_terbit      TEXT NOT NULL DEFAULT 'Pekanbaru',
  tanggal          DATE NOT NULL DEFAULT CURRENT_DATE,
  /** Termin di-snapshot dari customer saat invoice dibuat. */
  termin_hari      INTEGER,
  /** Diturunkan dari tanggal + termin_hari, tapi boleh disetel manual. */
  jatuh_tempo      DATE,

  ppn_aktif        BOOLEAN NOT NULL DEFAULT true,
  ppn_persen       NUMERIC(5,2) NOT NULL DEFAULT 11,
  subtotal         BIGINT NOT NULL DEFAULT 0,
  ppn_nominal      BIGINT NOT NULL DEFAULT 0,
  total            BIGINT NOT NULL DEFAULT 0,
  /** Jumlah pembayaran yang sudah masuk. Diisi trigger dari invoice_payments. */
  dibayar          BIGINT NOT NULL DEFAULT 0,

  status           invoice_status NOT NULL DEFAULT 'draft',
  ttd_nama         TEXT,
  ttd_jabatan      TEXT DEFAULT 'Admin',
  /** Rekening tujuan yang tercetak di tagihan. */
  bank_nama        TEXT,
  bank_rekening    TEXT,
  bank_atas_nama   TEXT,
  catatan          TEXT,
  alasan_batal     TEXT,

  sent_at          TIMESTAMPTZ,
  lunas_at         TIMESTAMPTZ,

  created_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_pic_sapaan_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_pic_sapaan_check
  CHECK (pic_sapaan IS NULL OR pic_sapaan IN ('Bapak', 'Ibu'));

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_ppn_persen_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_ppn_persen_check
  CHECK (ppn_persen >= 0 AND ppn_persen <= 100);

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_termin_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_termin_check
  CHECK (termin_hari IS NULL OR termin_hari >= 0);

CREATE INDEX IF NOT EXISTS idx_invoices_status    ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer  ON invoices(customer_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_tanggal   ON invoices(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_seq       ON invoices(seq_tahun DESC, seq_no DESC);
-- Daftar piutang: tagihan terkirim yang belum lunas, diurut jatuh tempo.
CREATE INDEX IF NOT EXISTS idx_invoices_piutang
  ON invoices(jatuh_tempo) WHERE status = 'terkirim';

-- ---------------------------------------------------------------------------
-- invoice_items
--
-- job_id opsional: satu tagihan biasanya menagih beberapa job sekaligus
-- (rekap bulanan), tapi tagihan uang muka atau biaya tambahan tidak menunjuk
-- job mana pun. Menjadikannya wajib akan memaksa admin mengarang job palsu.
--
-- subtotal GENERATED, sama seperti quotation_items: jumlah baris tidak mungkin
-- melenceng dari qty x harga_satuan lewat jalur penulisan mana pun.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  urutan        INTEGER NOT NULL DEFAULT 1,
  job_id        UUID REFERENCES jobs(id),
  deskripsi     TEXT NOT NULL,
  dari          TEXT,
  tujuan        TEXT,
  qty           INTEGER NOT NULL DEFAULT 1,
  satuan        TEXT NOT NULL DEFAULT 'Unit',
  harga_satuan  BIGINT NOT NULL DEFAULT 0,
  subtotal      BIGINT GENERATED ALWAYS AS (qty * harga_satuan) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_qty_check;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_qty_check CHECK (qty > 0);

ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_harga_check;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_harga_check
  CHECK (harga_satuan >= 0);

CREATE INDEX IF NOT EXISTS idx_invoice_items_parent ON invoice_items(invoice_id, urutan);
CREATE INDEX IF NOT EXISTS idx_invoice_items_job    ON invoice_items(job_id)
  WHERE job_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- invoice_payments
--
-- Pembayaran dicatat sebagai kejadian, bukan sebagai kolom "sudah dibayar" di
-- invoice. Customer dengan termin sering mencicil, dan yang perlu diketahui
-- bukan cuma "sudah lunas belum" melainkan kapan masuknya, berapa, dan lewat
-- rekening mana — itu yang dicocokkan saat rekonsiliasi bank.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tanggal       DATE NOT NULL DEFAULT CURRENT_DATE,
  jumlah        BIGINT NOT NULL,
  /** Rekening/kas penerima — memakai master yang sama dengan uang jalan. */
  sumber_dana_id UUID REFERENCES sumber_dana(id),
  metode        TEXT NOT NULL DEFAULT 'transfer',
  referensi     TEXT,
  catatan       TEXT,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_jumlah_check;
ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_jumlah_check
  CHECK (jumlah > 0);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_parent
  ON invoice_payments(invoice_id, tanggal DESC);

-- ---------------------------------------------------------------------------
-- Hitung ulang total invoice dari baris item
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_invoice_totals(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal   BIGINT;
  v_ppn_aktif  BOOLEAN;
  v_ppn_persen NUMERIC(5,2);
  v_ppn        BIGINT;
BEGIN
  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = p_invoice_id;

  SELECT ppn_aktif, ppn_persen INTO v_ppn_aktif, v_ppn_persen
  FROM invoices WHERE id = p_invoice_id;

  IF v_ppn_aktif THEN
    v_ppn := ROUND(v_subtotal * v_ppn_persen / 100.0);
  ELSE
    v_ppn := 0;
  END IF;

  UPDATE invoices
     SET subtotal    = v_subtotal,
         ppn_nominal = v_ppn,
         total       = v_subtotal + v_ppn,
         updated_at  = now()
   WHERE id = p_invoice_id;

  -- Total berubah bisa mengubah status lunas (misal item ditambah setelah
  -- pembayaran masuk), jadi status dihitung ulang di sini juga.
  PERFORM recalc_invoice_payment_state(p_invoice_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Hitung ulang jumlah dibayar & status lunas
--
-- Status lunas tidak pernah diketik admin. Kalau boleh diketik, ada dua sumber
-- kebenaran untuk pertanyaan "sudah dibayar belum" dan cepat atau lambat
-- keduanya berbeda.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_invoice_payment_state(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dibayar BIGINT;
  v_inv     invoices%ROWTYPE;
BEGIN
  SELECT COALESCE(SUM(jumlah), 0) INTO v_dibayar
  FROM invoice_payments WHERE invoice_id = p_invoice_id;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN RETURN; END IF;

  -- Invoice batal tidak ikut berubah status walau ada pembayaran nyasar —
  -- itu justru harus terlihat sebagai kejanggalan, bukan disembunyikan.
  IF v_inv.status = 'batal' THEN
    UPDATE invoices SET dibayar = v_dibayar, updated_at = now()
     WHERE id = p_invoice_id;
    RETURN;
  END IF;

  IF v_inv.total > 0 AND v_dibayar >= v_inv.total THEN
    UPDATE invoices
       SET dibayar    = v_dibayar,
           status     = 'lunas',
           lunas_at   = COALESCE(v_inv.lunas_at, now()),
           updated_at = now()
     WHERE id = p_invoice_id;
  ELSE
    UPDATE invoices
       SET dibayar    = v_dibayar,
           -- Turun lagi dari lunas kalau pembayaran dihapus/dikoreksi.
           status     = CASE
                          WHEN v_inv.status = 'lunas' THEN 'terkirim'::invoice_status
                          ELSE v_inv.status
                        END,
           lunas_at   = CASE WHEN v_inv.status = 'lunas' THEN NULL ELSE v_inv.lunas_at END,
           updated_at = now()
     WHERE id = p_invoice_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION trg_recalc_invoice_from_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_invoice_totals(OLD.invoice_id);
    RETURN OLD;
  END IF;
  PERFORM recalc_invoice_totals(NEW.invoice_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_items_recalc ON invoice_items;
CREATE TRIGGER trg_invoice_items_recalc
  AFTER INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_invoice_from_item();

CREATE OR REPLACE FUNCTION trg_recalc_invoice_from_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_invoice_payment_state(OLD.invoice_id);
    RETURN OLD;
  END IF;
  PERFORM recalc_invoice_payment_state(NEW.invoice_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_payments_recalc ON invoice_payments;
CREATE TRIGGER trg_invoice_payments_recalc
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_invoice_from_payment();

CREATE OR REPLACE FUNCTION trg_recalc_invoice_on_ppn_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ppn_aktif IS DISTINCT FROM OLD.ppn_aktif
     OR NEW.ppn_persen IS DISTINCT FROM OLD.ppn_persen THEN
    PERFORM recalc_invoice_totals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_ppn_recalc ON invoices;
CREATE TRIGGER trg_invoices_ppn_recalc
  AFTER UPDATE OF ppn_aktif, ppn_persen ON invoices
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_invoice_on_ppn_change();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Ringkasan piutang per customer
--
-- Dihitung di database supaya halaman piutang tidak perlu menarik seluruh
-- invoice lalu menjumlah di aplikasi. Umur piutang memakai kelompok yang lazim
-- dipakai di laporan aging: belum jatuh tempo, 1-30, 31-60, di atas 60 hari.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_piutang_summary()
RETURNS TABLE (
  customer_id     UUID,
  customer_nama   TEXT,
  jumlah_invoice  INTEGER,
  total_tagihan   BIGINT,
  total_dibayar   BIGINT,
  sisa            BIGINT,
  belum_jatuh_tempo BIGINT,
  umur_1_30       BIGINT,
  umur_31_60      BIGINT,
  umur_60_plus    BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    i.customer_id,
    MAX(i.customer_nama)                              AS customer_nama,
    COUNT(*)::INTEGER                                 AS jumlah_invoice,
    SUM(i.total)                                      AS total_tagihan,
    SUM(i.dibayar)                                    AS total_dibayar,
    SUM(i.total - i.dibayar)                          AS sisa,
    SUM(CASE WHEN i.jatuh_tempo IS NULL OR i.jatuh_tempo >= CURRENT_DATE
             THEN i.total - i.dibayar ELSE 0 END)     AS belum_jatuh_tempo,
    SUM(CASE WHEN i.jatuh_tempo < CURRENT_DATE
              AND CURRENT_DATE - i.jatuh_tempo BETWEEN 1 AND 30
             THEN i.total - i.dibayar ELSE 0 END)     AS umur_1_30,
    SUM(CASE WHEN i.jatuh_tempo < CURRENT_DATE
              AND CURRENT_DATE - i.jatuh_tempo BETWEEN 31 AND 60
             THEN i.total - i.dibayar ELSE 0 END)     AS umur_31_60,
    SUM(CASE WHEN i.jatuh_tempo < CURRENT_DATE
              AND CURRENT_DATE - i.jatuh_tempo > 60
             THEN i.total - i.dibayar ELSE 0 END)     AS umur_60_plus
  FROM invoices i
  WHERE i.status = 'terkirim'
    AND i.total > i.dibayar
  GROUP BY i.customer_id
  ORDER BY SUM(i.total - i.dibayar) DESC;
$$;

-- ---------------------------------------------------------------------------
-- Laba per job
--
-- Pendapatan dan biaya sudah tercatat sejak modul penawaran dan uang jalan,
-- tapi belum pernah dipertemukan. Yang menghalangi cuma satu: tidak ada
-- pendapatan per job sebelum invoice ada.
--
-- Pendapatan job = nilai baris invoice yang menunjuk job itu, tanpa PPN
-- (PPN bukan pendapatan perusahaan, itu titipan negara).
-- Biaya job     = pencairan uang jalan + biaya perbaikan insiden pada job itu.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_job_profitability(
  p_start DATE DEFAULT NULL,
  p_end   DATE DEFAULT NULL
)
RETURNS TABLE (
  job_id          UUID,
  job_number      TEXT,
  customer_nama   TEXT,
  unit_kode       TEXT,
  etd             TIMESTAMPTZ,
  status          job_status,
  pendapatan      BIGINT,
  uang_jalan      BIGINT,
  biaya_insiden   BIGINT,
  laba            BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    j.id,
    j.job_number,
    c.nama_perusahaan,
    u.kode_unit,
    j.etd,
    j.status,
    COALESCE(inv.pendapatan, 0)      AS pendapatan,
    COALESCE(uj.dicairkan, 0)        AS uang_jalan,
    COALESCE(ins.biaya, 0)           AS biaya_insiden,
    COALESCE(inv.pendapatan, 0)
      - COALESCE(uj.dicairkan, 0)
      - COALESCE(ins.biaya, 0)       AS laba
  FROM jobs j
  JOIN customers c ON c.id = j.customer_id
  JOIN units u     ON u.id = j.unit_id
  LEFT JOIN LATERAL (
    SELECT SUM(ii.subtotal) AS pendapatan
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE ii.job_id = j.id AND i.status <> 'batal'
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT SUM(x.jumlah) AS dicairkan
    FROM uang_jalan x
    WHERE x.job_id = j.id AND x.jenis = 'pencairan'
  ) uj ON true
  LEFT JOIN LATERAL (
    SELECT SUM(COALESCE(n.biaya_repair, 0)) AS biaya
    FROM incident_logs n
    WHERE n.job_id = j.id
  ) ins ON true
  WHERE (p_start IS NULL OR j.etd >= p_start::TIMESTAMPTZ)
    AND (p_end   IS NULL OR j.etd <  (p_end + 1)::TIMESTAMPTZ)
    AND j.status <> 'cancelled'
  ORDER BY j.etd DESC;
$$;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Sama seperti penawaran: invoice tidak terikat unit mana pun, jadi scope per
-- jenis_unit tidak berlaku. Semua admin aktif boleh baca-tulis; hanya owner
-- yang boleh menghapus, supaya nomor tagihan tidak lenyap dari arsip.
-- ---------------------------------------------------------------------------
ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_invoices" ON invoices;
CREATE POLICY "admin_read_invoices"
  ON invoices FOR SELECT USING (is_active_admin());

DROP POLICY IF EXISTS "admin_insert_invoices" ON invoices;
CREATE POLICY "admin_insert_invoices"
  ON invoices FOR INSERT WITH CHECK (is_active_admin());

DROP POLICY IF EXISTS "admin_update_invoices" ON invoices;
CREATE POLICY "admin_update_invoices"
  ON invoices FOR UPDATE
  USING (is_active_admin()) WITH CHECK (is_active_admin());

DROP POLICY IF EXISTS "owner_delete_invoices" ON invoices;
CREATE POLICY "owner_delete_invoices"
  ON invoices FOR DELETE USING (is_owner());

DROP POLICY IF EXISTS "admin_all_invoice_items" ON invoice_items;
CREATE POLICY "admin_all_invoice_items"
  ON invoice_items FOR ALL
  USING (is_active_admin()) WITH CHECK (is_active_admin());

DROP POLICY IF EXISTS "admin_all_invoice_payments" ON invoice_payments;
CREATE POLICY "admin_all_invoice_payments"
  ON invoice_payments FOR ALL
  USING (is_active_admin()) WITH CHECK (is_active_admin());

GRANT EXECUTE ON FUNCTION next_invoice_number()                   TO authenticated;
GRANT EXECUTE ON FUNCTION get_piutang_summary()                   TO authenticated;
GRANT EXECUTE ON FUNCTION get_job_profitability(DATE, DATE)       TO authenticated;
