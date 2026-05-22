import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDailyMileage } from "@/lib/tracksolid/client";

/**
 * Trigger sync mileage untuk 1 unit on-demand (tombol "Sync dari TrackSolid"
 * di tab Service). Endpoint ini diakses dari UI admin → cek auth user normal
 * (RLS-aware), lalu pakai admin client untuk UPSERT snapshot.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function wibParts(now: Date) {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const tanggal = `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}`;
  const startTime = `${tanggal} 00:00:00`;
  const endTime = `${tanggal} ${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}:${pad(wib.getUTCSeconds())}`;
  return { tanggal, startTime, endTime };
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  // Verifikasi user login (RLS-aware client)
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ambil imei unit (lewat user client; RLS akan filter)
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

  const { tanggal, startTime, endTime } = wibParts(new Date());

  let km: number;
  try {
    const m = await getDailyMileage(unit.imei_gps, startTime, endTime);
    km = m.km;
  } catch (e) {
    return NextResponse.json(
      {
        error: `TrackSolid: ${e instanceof Error ? e.message : "unknown"}`
      },
      { status: 502 }
    );
  }

  // UPSERT pakai admin client (snapshot table tidak punya RLS INSERT untuk authenticated)
  const admin = createAdminClient();
  const { error: upErr } = await admin
    .from("unit_odometer_snapshots")
    .upsert(
      {
        unit_id: id,
        tanggal,
        daily_km: km,
        source: "tracksolid",
        fetched_at: new Date().toISOString()
      },
      { onConflict: "unit_id,tanggal" }
    );
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tanggal, km });
}
