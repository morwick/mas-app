import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/server";
import { getVehicleLocation } from "@/lib/tracksolid/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public endpoint untuk front-end customer polling lokasi truk.
 *
 * Alur:
 *   1. Validasi share_token job (pakai anon RLS; job yang selesai/cancelled
 *      otomatis tidak readable → 410 Gone biar front-end stop polling).
 *   2. Ambil units.imei_gps untuk job tsb.
 *   3. Call TrackSolid getMonitorInfo dengan IMEI itu.
 *   4. Return { lat, lng, address, fetchedAt }.
 *
 * Error semantics yang harus dibedakan client:
 *   200 — data OK, lanjutkan polling
 *   404 — token tidak valid
 *   410 — job sudah selesai/cancelled → stop polling
 *   422 — unit belum punya IMEI → fallback ke link-out
 *   502 — TrackSolid error / network issue → retry next interval
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const supabase = createAnonClient(token);

  // Single query: jobs join units. RLS untuk anon block kalau job sudah selesai/cancelled
  // → response data null = perlakukan sebagai "expired".
  const { data, error } = await supabase
    .from("jobs")
    .select("id, status, unit_id, units!inner(imei_gps)")
    .eq("share_token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    // Bisa karena token salah, atau RLS block (job selesai). UX customer
    // sama: stop polling. Pakai 410 supaya client tahu ini permanen.
    return NextResponse.json(
      { error: "Job tidak ditemukan atau sudah selesai" },
      { status: 410 }
    );
  }

  const row = data as unknown as {
    id: string;
    status: string;
    unit_id: string;
    units: { imei_gps: string | null } | { imei_gps: string | null }[] | null;
  };

  // Supabase nested select kadang kembalikan array, kadang object. Normalize.
  const unit = Array.isArray(row.units) ? row.units[0] : row.units;
  const imei = unit?.imei_gps ?? null;

  if (!imei) {
    return NextResponse.json(
      { error: "Unit belum punya IMEI tracking" },
      { status: 422 }
    );
  }

  try {
    const loc = await getVehicleLocation(imei);
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
