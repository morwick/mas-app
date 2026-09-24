-- ============================================================================
-- Migration 20260924000008: transaksi untuk proses tulis multi-langkah
--
-- Backend memakai Supabase Data API (PostgREST). Setiap permintaan ke API itu
-- sudah SATU transaksi — BEGIN, lalu COMMIT kalau berhasil atau ROLLBACK
-- kalau gagal (termasuk semua trigger yang ikut jalan). Jadi tambah/ubah/
-- hapus satu langkah sudah aman.
--
-- Yang belum aman adalah proses beberapa langkah yang dikirim sebagai
-- permintaan terpisah, mis. simpan invoice lalu simpan item-itemnya: kalau
-- langkah kedua gagal, langkah pertama sudah terlanjur tersimpan.
--
-- jalankan_transaksi(p_langkah) menerima SEMUA langkah sekaligus dan
-- menjalankannya dalam satu transaksi:
--   BEGIN → langkah 1 → langkah 2 → … → COMMIT
--   satu langkah gagal (error, data tidak ditemukan, melanggar aturan)
--   → ROLLBACK semuanya, tidak ada yang tersimpan.
--
-- Fungsi ini SECURITY INVOKER: berjalan dengan hak akses pengguna yang login,
-- jadi RLS dan grant tabel tetap berlaku persis seperti query biasa.
--
-- Bentuk langkah (array JSON, dijalankan berurutan):
--   {"op": "nomor_dokumen", "jenis": "invoice" | "quotation"}
--       → hasil: {nomor, seq, tahun}
--   {"op": "setting", "nama": "app.status_note", "nilai": "..."}
--       → set_config lokal transaksi (dibaca trigger riwayat status)
--   {"op": "insert", "tabel": "invoice_items", "data": {...} | [{...}, ...]}
--       → hasil: baris-baris yang tersimpan
--   {"op": "update", "tabel": "invoices", "data": {...}, "filter": {...}}
--       → hanya baris aktif (status = 1); hasil: baris yang berubah
--   {"op": "hapus", "tabel": "invoice_items", "filter": {...}}
--       → soft delete (status = 2); hasil: baris yang terhapus
-- Opsi tiap langkah:
--   "wajib": true  → gagal (rollback) kalau tidak ada baris yang kena.
-- Rujukan ke hasil langkah sebelumnya: string "{{i.kolom}}" diganti nilai
-- kolom dari baris pertama hasil langkah ke-i (mulai 0), mis. item invoice
-- memakai "invoice_id": "{{1.id}}".
--
-- Nilai hasil: array JSON, satu elemen per langkah (array baris).
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport._tx_tabel(p_nama TEXT)
RETURNS regclass
LANGUAGE plpgsql
STABLE
SET search_path = transport, extensions
AS $$
DECLARE
  v_rel regclass;
BEGIN
  -- Hanya tabel aplikasi (schema transport atau hr) yang boleh disentuh.
  SELECT c.oid::regclass INTO v_rel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname IN ('transport', 'hr')
     AND (c.relname = p_nama OR n.nspname || '.' || c.relname = p_nama);
  IF v_rel IS NULL THEN
    RAISE EXCEPTION 'Tabel % tidak dikenal', p_nama USING ERRCODE = '42P01';
  END IF;
  RETURN v_rel;
END;
$$;

-- Ganti "{{i.kolom}}" di nilai string dengan hasil langkah sebelumnya.
CREATE OR REPLACE FUNCTION transport._tx_isi_rujukan(p_nilai JSONB, p_hasil JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = transport, extensions
AS $$
DECLARE
  v_m TEXT[];
  v_baris JSONB;
  v_out JSONB;
  k TEXT;
  v JSONB;
BEGIN
  CASE jsonb_typeof(p_nilai)
    WHEN 'object' THEN
      v_out := '{}'::jsonb;
      FOR k, v IN SELECT * FROM jsonb_each(p_nilai) LOOP
        v_out := v_out || jsonb_build_object(k, transport._tx_isi_rujukan(v, p_hasil));
      END LOOP;
      RETURN v_out;
    WHEN 'array' THEN
      SELECT COALESCE(jsonb_agg(transport._tx_isi_rujukan(e, p_hasil) ORDER BY i), '[]'::jsonb)
        INTO v_out
        FROM jsonb_array_elements(p_nilai) WITH ORDINALITY AS a(e, i);
      RETURN v_out;
    WHEN 'string' THEN
      v_m := regexp_match(p_nilai #>> '{}', '^\{\{(\d+)\.([a-z_]+)\}\}$');
      IF v_m IS NULL THEN
        RETURN p_nilai;
      END IF;
      v_baris := p_hasil -> v_m[1]::int -> 0;
      IF v_baris IS NULL OR NOT v_baris ? v_m[2] THEN
        RAISE EXCEPTION 'Data yang dirujuk (langkah %) tidak ditemukan', v_m[1]
          USING ERRCODE = 'no_data_found';
      END IF;
      RETURN v_baris -> v_m[2];
    ELSE
      RETURN p_nilai;
  END CASE;
END;
$$;

-- Susun "t.kol1 = (r).kol1 AND t.kol2 = (r).kol2" dari kunci objek filter.
CREATE OR REPLACE FUNCTION transport._tx_kondisi(p_filter JSONB, p_alias TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = transport, extensions
AS $$
  SELECT string_agg(format('t.%1$I = (%2$s).%1$I', k, p_alias), ' AND ')
    FROM jsonb_object_keys(p_filter) AS k;
$$;

CREATE OR REPLACE FUNCTION transport.jalankan_transaksi(p_langkah JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = transport, extensions
AS $$
DECLARE
  v_langkah JSONB;
  v_idx INT := 0;
  v_hasil JSONB := '[]'::jsonb;
  v_rows JSONB;
  v_rel regclass;
  v_data JSONB;
  v_filter JSONB;
  v_kolom TEXT;
  v_set TEXT;
  v_jml INT;
BEGIN
  IF jsonb_typeof(p_langkah) <> 'array' OR jsonb_array_length(p_langkah) = 0 THEN
    RAISE EXCEPTION 'Transaksi kosong' USING ERRCODE = '22023';
  END IF;

  FOR v_langkah IN SELECT e FROM jsonb_array_elements(p_langkah) AS a(e) LOOP
    v_rows := '[]'::jsonb;

    CASE v_langkah ->> 'op'

      WHEN 'nomor_dokumen' THEN
        IF v_langkah ->> 'jenis' = 'invoice' THEN
          SELECT jsonb_agg(to_jsonb(n)) INTO v_rows FROM transport.next_invoice_number() n;
        ELSIF v_langkah ->> 'jenis' = 'quotation' THEN
          SELECT jsonb_agg(to_jsonb(n)) INTO v_rows FROM transport.next_quotation_number() n;
        ELSE
          RAISE EXCEPTION 'Jenis dokumen % tidak dikenal', v_langkah ->> 'jenis' USING ERRCODE = '22023';
        END IF;

      WHEN 'setting' THEN
        IF v_langkah ->> 'nama' NOT LIKE 'app.%' THEN
          RAISE EXCEPTION 'Setting % tidak diizinkan', v_langkah ->> 'nama' USING ERRCODE = '42501';
        END IF;
        PERFORM set_config(v_langkah ->> 'nama', COALESCE(v_langkah ->> 'nilai', ''), true);

      WHEN 'insert' THEN
        v_rel := transport._tx_tabel(v_langkah ->> 'tabel');
        v_data := transport._tx_isi_rujukan(v_langkah -> 'data', v_hasil);
        IF jsonb_typeof(v_data) = 'object' THEN
          v_data := jsonb_build_array(v_data);
        END IF;
        IF jsonb_array_length(v_data) > 0 THEN
          -- Kolom diambil dari kunci data; kolom yang tidak disebut memakai
          -- DEFAULT tabel (id, status = 1, created_at, ...).
          SELECT string_agg(DISTINCT format('%I', k), ', ') INTO v_kolom
            FROM jsonb_array_elements(v_data) AS r(o), jsonb_object_keys(r.o) AS k;
          EXECUTE format(
            'WITH ins AS (INSERT INTO %1$s (%2$s) SELECT %2$s FROM jsonb_populate_recordset(NULL::%1$s, $1) RETURNING *)
             SELECT COALESCE(jsonb_agg(to_jsonb(ins)), ''[]''::jsonb) FROM ins',
            v_rel, v_kolom)
            INTO v_rows USING v_data;
        END IF;

      WHEN 'update' THEN
        v_rel := transport._tx_tabel(v_langkah ->> 'tabel');
        v_data := transport._tx_isi_rujukan(v_langkah -> 'data', v_hasil);
        v_filter := transport._tx_isi_rujukan(COALESCE(v_langkah -> 'filter', '{}'::jsonb), v_hasil);
        IF v_filter = '{}'::jsonb THEN
          RAISE EXCEPTION 'Update tanpa filter tidak diizinkan' USING ERRCODE = '22023';
        END IF;
        SELECT string_agg(format('%1$I = (x.d).%1$I', k), ', ') INTO v_set
          FROM jsonb_object_keys(v_data) AS k;
        EXECUTE format(
          'WITH upd AS (
             UPDATE %1$s t SET %2$s
               FROM (SELECT jsonb_populate_record(NULL::%1$s, $1) AS d,
                            jsonb_populate_record(NULL::%1$s, $2) AS f) x
              WHERE %3$s AND t.status = 1
             RETURNING t.*)
           SELECT COALESCE(jsonb_agg(to_jsonb(upd)), ''[]''::jsonb) FROM upd',
          v_rel, v_set, transport._tx_kondisi(v_filter, 'x.f'))
          INTO v_rows USING v_data, v_filter;

      WHEN 'hapus' THEN
        v_rel := transport._tx_tabel(v_langkah ->> 'tabel');
        v_filter := transport._tx_isi_rujukan(COALESCE(v_langkah -> 'filter', '{}'::jsonb), v_hasil);
        IF v_filter = '{}'::jsonb THEN
          RAISE EXCEPTION 'Hapus tanpa filter tidak diizinkan' USING ERRCODE = '22023';
        END IF;
        EXECUTE format(
          'WITH del AS (
             UPDATE %1$s t SET status = 2
               FROM (SELECT jsonb_populate_record(NULL::%1$s, $1) AS f) x
              WHERE %2$s AND t.status = 1
             RETURNING t.*)
           SELECT COALESCE(jsonb_agg(to_jsonb(del)), ''[]''::jsonb) FROM del',
          v_rel, transport._tx_kondisi(v_filter, 'x.f'))
          INTO v_rows USING v_filter;

      ELSE
        RAISE EXCEPTION 'Operasi % tidak dikenal', v_langkah ->> 'op' USING ERRCODE = '22023';
    END CASE;

    v_jml := jsonb_array_length(COALESCE(v_rows, '[]'::jsonb));
    IF COALESCE((v_langkah ->> 'wajib')::boolean, false) AND v_jml = 0 THEN
      RAISE EXCEPTION 'Data tidak ditemukan atau sudah dihapus (langkah %)', v_idx + 1
        USING ERRCODE = 'no_data_found';
    END IF;

    v_hasil := v_hasil || jsonb_build_array(COALESCE(v_rows, '[]'::jsonb));
    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_hasil;
END;
$$;

REVOKE ALL ON FUNCTION transport.jalankan_transaksi(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.jalankan_transaksi(JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION transport._tx_tabel(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION transport._tx_isi_rujukan(JSONB, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION transport._tx_kondisi(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport._tx_tabel(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION transport._tx_isi_rujukan(JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION transport._tx_kondisi(JSONB, TEXT) TO authenticated, service_role;

-- ── Catatan alasan di riwayat status unit, dalam transaksi yang sama ────────
-- Sama seperti riwayat job: alasan dititipkan lewat setting transaksi
-- `app.status_note` oleh pemanggil, lalu dicatat trigger bersama barisnya.
CREATE OR REPLACE FUNCTION transport.log_unit_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  IF NEW.status_operasional IS DISTINCT FROM OLD.status_operasional THEN
    INSERT INTO unit_status_history (unit_id, status_old, status_new, changed_by, reason)
    VALUES (NEW.id, OLD.status_operasional, NEW.status_operasional, auth.uid(),
            NULLIF(current_setting('app.status_note', true), ''));
  END IF;
  RETURN NEW;
END;
$function$;

-- ── Logout driver: lepas perangkat + tutup sesi dalam satu transaksi ────────
DROP FUNCTION IF EXISTS transport.driver_logout();
CREATE OR REPLACE FUNCTION transport.driver_logout(p_fcm_token TEXT DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  -- Perangkat dilepas dulu selagi sesi masih dikenali current_driver_id().
  IF COALESCE(btrim(p_fcm_token), '') <> '' THEN
    UPDATE driver_devices
       SET status = 2
     WHERE fcm_token = p_fcm_token AND driver_id = current_driver_id() AND status = 1;
  END IF;

  UPDATE driver_sessions
     SET revoked_at = now()
   WHERE token = current_driver_token()
     AND revoked_at IS NULL
     AND status = 1;
END;
$function$;
GRANT EXECUTE ON FUNCTION transport.driver_logout(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
