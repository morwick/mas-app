import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVehicleLocation } from "@/lib/tracksolid/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Debug endpoint: test getVehicleLocation untuk semua IMEI di DB.
 * Hapus setelah debugging selesai.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const customImei = url.searchParams.get("imei");

  let imeisToTest: Array<{ source: string; imei: string }> = [];
  if (customImei) {
    imeisToTest.push({ source: "query", imei: customImei });
  } else {
    const { data: units } = await supabase
      .from("units")
      .select("kode_unit, imei_gps")
      .eq("is_active", true)
      .not("imei_gps", "is", null);
    imeisToTest = ((units ?? []) as Array<{ kode_unit: string; imei_gps: string }>).map(
      (u) => ({ source: u.kode_unit, imei: u.imei_gps })
    );
  }

  const probes = [];
  for (const t of imeisToTest) {
    try {
      const start = Date.now();
      const loc = await getVehicleLocation(t.imei);
      const ms = Date.now() - start;
      probes.push({
        kode_unit: t.source,
        imei: t.imei,
        elapsedMs: ms,
        ok: true,
        lat: loc.lat,
        lng: loc.lng,
        address: loc.address
      });
    } catch (err) {
      probes.push({
        kode_unit: t.source,
        imei: t.imei,
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return NextResponse.json({ probes });
}
