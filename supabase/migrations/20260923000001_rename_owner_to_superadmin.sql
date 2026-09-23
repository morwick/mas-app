-- ============================================================================
-- Migration 20260923000001: role 'owner' → 'superadmin'
--
-- URUTAN DEPLOY — PENTING:
--   Migrasi ini HARUS dijalankan SEBELUM backend/frontend versi baru naik.
--   Kode baru hanya mengenal 'superadmin'; kalau kode duluan, semua akun
--   owner kehilangan hak aksesnya sampai migrasi ini jalan.
--
-- Kenapa memakai ALTER FUNCTION ... RENAME, bukan menulis ulang policy:
--   Policy RLS menyimpan referensi ke OID fungsi, bukan ke namanya. Mengganti
--   nama fungsi otomatis ikut memperbarui seluruh policy yang memanggilnya
--   (~35 policy tersebar di 5 migrasi), jadi tidak ada yang bisa tertinggal
--   dan tidak ada policy yang perlu di-drop/-create ulang.
-- ============================================================================

-- ── 1. Nilai role ───────────────────────────────────────────────────────────
-- Constraint dilepas dulu supaya UPDATE di bawah tidak ditolak.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

UPDATE profiles SET role = 'superadmin' WHERE role = 'owner';

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('superadmin', 'operator'));

-- Default user baru tetap 'operator' (lihat migration 20260601000003):
-- promosi ke superadmin dilakukan manual lewat Pengaturan → Pengguna.

-- ── 2. Fungsi penjaga RLS ───────────────────────────────────────────────────
-- Rename membawa serta semua policy yang memanggilnya.
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'is_owner'
     )
     AND NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'is_superadmin'
     )
  THEN
    ALTER FUNCTION public.is_owner() RENAME TO is_superadmin;
  END IF;
END $$;

-- Body-nya dicocokkan ke nilai role yang baru. CREATE OR REPLACE tidak
-- mengubah OID, jadi policy yang sudah menunjuk ke sini tetap utuh.
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role = 'superadmin'
  );
$$;

-- ── 3. Jaring pengaman ──────────────────────────────────────────────────────
-- Database yang sudah berisi data tapi tidak menyisakan satu pun superadmin
-- aktif berarti tidak ada yang bisa mengelola pengguna lagi. Diberitahukan,
-- bukan digagalkan, supaya database baru yang masih kosong tetap bisa migrasi.
DO $$
DECLARE
  jumlah_profil INTEGER;
  jumlah_superadmin INTEGER;
BEGIN
  SELECT count(*) INTO jumlah_profil FROM profiles;
  SELECT count(*) INTO jumlah_superadmin
    FROM profiles WHERE role = 'superadmin' AND is_active = true;

  IF jumlah_profil > 0 AND jumlah_superadmin = 0 THEN
    RAISE WARNING
      'Tidak ada superadmin aktif setelah migrasi (% profil). Set manual: UPDATE profiles SET role = ''superadmin'' WHERE email = ''...'';',
      jumlah_profil;
  ELSE
    RAISE NOTICE 'Migrasi role selesai: % superadmin aktif.', jumlah_superadmin;
  END IF;
END $$;
