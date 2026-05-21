import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVehicleLocation } from "@/lib/tracksolid/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Debug endpoint: cek koneksi TrackSolid dengan detail error.
 * Hapus setelah debugging selesai.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const envCheck = {
    TRACKSOLID_ACCOUNT_set: !!process.env.TRACKSOLID_ACCOUNT,
    TRACKSOLID_ACCOUNT_length: process.env.TRACKSOLID_ACCOUNT?.length ?? 0,
    TRACKSOLID_PASSWORD_set: !!process.env.TRACKSOLID_PASSWORD,
    TRACKSOLID_PASSWORD_length: process.env.TRACKSOLID_PASSWORD?.length ?? 0
  };

  // Ambil satu unit dengan IMEI untuk dijadikan probe
  const { data: units } = await supabase
    .from("units")
    .select("id, kode_unit, imei_gps")
    .eq("is_active", true)
    .not("imei_gps", "is", null)
    .limit(1);

  const probe = (units ?? [])[0] as
    | { id: string; kode_unit: string; imei_gps: string }
    | undefined;

  if (!probe) {
    return NextResponse.json({
      envCheck,
      error: "Tidak ada unit aktif dengan IMEI di DB"
    });
  }

  try {
    const start = Date.now();
    const loc = await getVehicleLocation(probe.imei_gps);
    const ms = Date.now() - start;
    return NextResponse.json({
      envCheck,
      probe: {
        kode_unit: probe.kode_unit,
        imei: probe.imei_gps,
        elapsedMs: ms
      },
      result: loc
    });
  } catch (err) {
    return NextResponse.json({
      envCheck,
      probe: {
        kode_unit: probe.kode_unit,
        imei: probe.imei_gps
      },
      error: err instanceof Error ? err.message : String(err),
      errorName: err instanceof Error ? err.name : undefined,
      errorStack: err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined
    });
  }
}
