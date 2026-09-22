import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUnitMileage } from "@/lib/services/mileage-sync";

/**
 * Batch fetch mileage hari ini untuk semua unit aktif. Dipakai polling
 * client-side dari halaman /services (interval 5 menit).
 *
 * Per unit:
 *   - Fetch totalMileage hari ini, UPSERT snapshot
 *   - Gap-fill: deteksi snapshot terbaru sebelum hari ini, lalu backfill
 *     semua tanggal di antaranya (max 30 hari). Cocok saat admin tidak buka
 *     aplikasi beberapa hari — polling pertama akan tarik semua gap.
 *
 * Auth: user session (RLS-aware). UPSERT snapshot via admin client
 * (snapshot table read-only untuk authenticated, service-role bypass).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const PER_UNIT_TIMEOUT_MS = 50000; // accomodate gap-fill up to 30 hari

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

interface MileageEntry {
  km: number;
  fetchedAt: string;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("units")
    .select("id, imei_gps")
    .eq("is_active", true)
    .not("imei_gps", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const admin = createAdminClient();

  const results = await Promise.allSettled(
    (rows ?? []).map(
      async (r: { id: string; imei_gps: string | null }) => {
        if (!r.imei_gps) return { id: r.id, entry: null as MileageEntry | null };
        try {
          const res = await withTimeout(
            syncUnitMileage(admin, r.id, r.imei_gps),
            PER_UNIT_TIMEOUT_MS
          );
          return {
            id: r.id,
            entry: {
              km: res.today_km,
              fetchedAt: new Date().toISOString()
            } satisfies MileageEntry
          };
        } catch {
          return { id: r.id, entry: null as MileageEntry | null };
        }
      }
    )
  );

  const out: Record<string, MileageEntry | null> = {};
  for (const r of results) {
    if (r.status === "fulfilled") out[r.value.id] = r.value.entry;
  }

  // Snapshot sudah di-UPSERT oleh syncUnitMileage; trigger DB recompute
  // current_odometer_km. Ambil yang fresh untuk return ke client.
  const { data: refreshed } = await admin
    .from("units")
    .select("id, current_odometer_km")
    .in(
      "id",
      (rows ?? []).map((r: { id: string }) => r.id)
    );

  const odometers: Record<string, number> = {};
  for (const u of (refreshed ?? []) as Array<{
    id: string;
    current_odometer_km: number | string;
  }>) {
    const n =
      typeof u.current_odometer_km === "number"
        ? u.current_odometer_km
        : Number(u.current_odometer_km);
    odometers[u.id] = Number.isFinite(n) ? n : 0;
  }

  return NextResponse.json({ daily: out, odometers });
}
