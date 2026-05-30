-- ============================================================================
-- Migration 20260601000003: Fix handle_new_user trigger setelah CHECK
-- constraint role berubah.
--
-- Trigger handle_new_user (migration 02) insert profile dengan
-- role='admin'. Setelah migration 20260601000001 menambah CHECK
-- constraint role IN ('owner', 'operator'), insert tersebut violate
-- constraint → "Database error creating new user" di Supabase Auth.
--
-- Fix: default role user baru jadi 'operator'. Owner perlu manual
-- promote ke owner via Settings → Pengguna (lebih aman daripada
-- auto-grant owner ke siapapun yang sign-up).
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, nama, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nama', split_part(NEW.email, '@', 1)),
    'operator'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
