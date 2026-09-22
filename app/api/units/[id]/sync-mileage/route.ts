import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncUnitMileage } from "@/lib/services/mileage-sync";

/**
 * Sync mileage 1 unit on-demand:
 *   - Tombol "Sync sekarang" di tab Service
 *   - Polling 5 menit dari tab Service (component-level)
 *
 * Logic sync sama dengan endpoint batch: hari ini + gap-fill up to 30 hari.
 *
 * Auth: user session (RLS-aware).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: unit, error: unitErr } = await supabase
    .from("units")
    .select("id, imei_gps, is_active")
    .eq("id", id)
    .maybeSingle();
  if (unitErr) {
    return NextResponse.json({ error: unitErr.message }, { status: 500 });
  }
  if (!unit) {
    return NextResponse.json({ error: "Unit tidak ditemukan" }, { status: 404 });
  }
  if (!unit.imei_gps) {
    return NextResponse.json(
      { error: "Unit belum punya IMEI GPS" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  let syncRes;
  try {
    syncRes = await syncUnitMileage(admin, id, unit.imei_gps);
  } catch (e) {
    return NextResponse.json(
      {
        error: `TrackSolid: ${e instanceof Error ? e.message : "unknown"}`
      },
      { status: 502 }
    );
  }

  // Ambil current_odometer_km terbaru setelah recompute trigger
  const { data: fresh } = await admin
    .from("units")
    .select("current_odometer_km")
    .eq("id", id)
    .maybeSingle();

  const current =
    fresh?.current_odometer_km != null
      ? typeof fresh.current_odometer_km === "number"
        ? fresh.current_odometer_km
        : Number(fresh.current_odometer_km)
      : null;

  return NextResponse.json({
    ok: true,
    km: syncRes.today_km,
    current_odometer_km: current
  });
}
