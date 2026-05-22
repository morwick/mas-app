import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDailyMileage } from "@/lib/tracksolid/client";

/**
 * Cron: ambil totalMileage hari ini dari TrackSolid per unit aktif, UPSERT
 * ke unit_odometer_snapshots(unit_id, tanggal). Trigger DB akan recompute
 * units.current_odometer_km = baseline + SUM(daily_km).
 *
 * Schedule: setiap jam (lihat vercel.json crons).
 *
 * Auth: header `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron auto-inject).
 *
 * Penting:
 *   - UPSERT (bukan INSERT) karena totalMileage cumulative seharian.
 *   - tanggal = WIB local date, supaya rolling per hari Indonesia, bukan UTC.
 *   - Per-call timeout 8s, Promise.allSettled supaya 1 unit gagal tidak
 *     gugurkan yang lain.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const PER_CALL_TIMEOUT_MS = 8000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function wibParts(now: Date): {
  tanggal: string;
  startTime: string;
  endTime: string;
} {
  // Geser ke WIB lalu format manual supaya tidak terjebak TZ Node serverless.
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const tanggal = `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}`;
  const startTime = `${tanggal} 00:00:00`;
  const endTime = `${tanggal} ${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}:${pad(wib.getUTCSeconds())}`;
  return { tanggal, startTime, endTime };
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

function verifyCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface UnitRow {
  id: string;
  imei_gps: string | null;
}

interface PerUnitResult {
  unit_id: string;
  ok: boolean;
  km?: number;
  reason?: string;
}

async function processUnit(
  admin: ReturnType<typeof createAdminClient>,
  row: UnitRow,
  tanggal: string,
  startTime: string,
  endTime: string
): Promise<PerUnitResult> {
  if (!row.imei_gps) return { unit_id: row.id, ok: false, reason: "no-imei" };
  try {
    const m = await withTimeout(
      getDailyMileage(row.imei_gps, startTime, endTime),
      PER_CALL_TIMEOUT_MS
    );
    const { error: upErr } = await admin
      .from("unit_odometer_snapshots")
      .upsert(
        {
          unit_id: row.id,
          tanggal,
          daily_km: m.km,
          source: "tracksolid",
          fetched_at: new Date().toISOString()
        },
        { onConflict: "unit_id,tanggal" }
      );
    if (upErr) throw new Error(upErr.message);
    return { unit_id: row.id, ok: true, km: m.km };
  } catch (e) {
    return {
      unit_id: row.id,
      ok: false,
      reason: e instanceof Error ? e.message : "unknown"
    };
  }
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("units")
    .select("id, imei_gps")
    .eq("is_active", true)
    .not("imei_gps", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { tanggal, startTime, endTime } = wibParts(new Date());

  const results = await Promise.allSettled(
    (rows ?? []).map((r) =>
      processUnit(admin, r as UnitRow, tanggal, startTime, endTime)
    )
  );

  const summary = {
    tanggal,
    total: results.length,
    success: 0,
    failed: 0,
    failures: [] as Array<{ unit_id: string; reason: string }>
  };
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) {
      summary.success++;
    } else {
      summary.failed++;
      const reason =
        r.status === "fulfilled"
          ? (r.value.reason ?? "unknown")
          : String(r.reason);
      const unit_id = r.status === "fulfilled" ? r.value.unit_id : "?";
      summary.failures.push({ unit_id, reason });
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
