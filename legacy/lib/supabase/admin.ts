import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — BYPASS RLS. HANYA dipakai untuk:
 *   - Cron job tanpa user context (sync mileage harian/jam-an)
 *   - Operasi sistem internal yang harus tulis ke table read-only-for-admin
 *
 * JANGAN dipakai dari:
 *   - Server Component / Page yang serve user request (pakai createClient di server.ts)
 *   - Server Action yang dipanggil dari UI (RLS-aware harus aktif)
 *
 * File ini "server-only" → build error kalau di-import dari client bundle.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL tidak diset");
  }
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY tidak diset");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
