import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVehicleLocation } from "@/lib/tracksolid/client";

/**
 * Admin endpoint: ambil lokasi real-time 1 unit. Dipakai tombol
 * "Pakai lokasi unit" di form Lokasi asal — admin sering set asal job baru
 * dari posisi truk yang sekarang standby (di garasi atau site sebelumnya).
 *
 * Response: { lat, lng, address, fetchedAt }
 * Errors:
 *   401 unauth | 404 unit not found | 422 no IMEI | 502 TrackSolid error
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(
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
    .select("id, imei_gps")
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
      { error: "Unit belum punya IMEI tracking" },
      { status: 422 }
    );
  }

  try {
    const loc = await getVehicleLocation(unit.imei_gps);
    if (loc.lat === null || loc.lng === null) {
      return NextResponse.json(
        { error: "Device offline / belum pernah fix posisi" },
        { status: 502 }
      );
    }
    return NextResponse.json({
      lat: loc.lat,
      lng: loc.lng,
      address: loc.address,
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TrackSolid error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
