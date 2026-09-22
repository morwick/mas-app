import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVehicleLocation } from "@/lib/tracksolid/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Admin-only endpoint: ambil alamat real-time semua unit aktif yang punya IMEI.
 *
 * Response: { [unit_id]: { lat, lng, address, fetchedAt } | null }
 * Unit yang IMEI-nya kosong atau TrackSolid error → null (UI tampilkan fallback).
 *
 * Strategi:
 *   - Promise.allSettled per IMEI → 1 unit gagal tidak block lainnya
 *   - Timeout 5s per call → halaman tidak menunggu device offline berlama-lama
 */

const PER_CALL_TIMEOUT_MS = 5000;

interface LocationEntry {
  lat: number;
  lng: number;
  address: string | null;
  fetchedAt: string;
}

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

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("units")
    .select("id, imei_gps")
    .eq("is_active", true)
    .not("imei_gps", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{ id: string; imei_gps: string | null }>;

  const results = await Promise.allSettled(
    rows.map(async (row) => {
      if (!row.imei_gps) return [row.id, null] as const;
      try {
        const loc = await withTimeout(
          getVehicleLocation(row.imei_gps),
          PER_CALL_TIMEOUT_MS
        );
        if (loc.lat === null || loc.lng === null) return [row.id, null] as const;
        return [
          row.id,
          {
            lat: loc.lat,
            lng: loc.lng,
            address: loc.address,
            fetchedAt: new Date().toISOString()
          } satisfies LocationEntry
        ] as const;
      } catch {
        return [row.id, null] as const;
      }
    })
  );

  const out: Record<string, LocationEntry | null> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      const [unitId, entry] = r.value;
      out[unitId] = entry;
    }
  }

  return NextResponse.json({ locations: out });
}
