import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDailyMileage } from "@/lib/tracksolid/client";

/**
 * Backfill mileage untuk N hari ke belakang. Dipakai kalau cron miss
 * beberapa hari atau saat first deploy untuk seed data.
 *
 * Auth: sama dengan cron utama — header Authorization: Bearer <CRON_SECRET>.
 *
 * Query params:
 *   - days: number (default 7, max 60)
 *   - unitId: string (opsional — kalau diisi, backfill 1 unit saja)
 *   - force: "1" untuk overwrite snapshot yang sudah ada (default skip kalau ada)
 *
 * Catatan: TrackSolid mungkin tidak retain data sejauh days yang besar.
 * Test dulu dengan days=3 sebelum scale.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const PER_CALL_TIMEOUT_MS = 8000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function wibDateString(d: Date): string {
  const w = new Date(d.getTime() + WIB_OFFSET_MS);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
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
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  return handleBackfill(req);
}

export async function POST(req: Request) {
  return handleBackfill(req);
}

async function handleBackfill(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? "7");
  const days = Math.max(1, Math.min(60, Number.isFinite(daysParam) ? daysParam : 7));
  const unitIdParam = url.searchParams.get("unitId");
  const force = url.searchParams.get("force") === "1";

  const admin = createAdminClient();

  // Ambil unit target
  let unitsQuery = admin
    .from("units")
    .select("id, imei_gps")
    .eq("is_active", true)
    .not("imei_gps", "is", null);
  if (unitIdParam) unitsQuery = unitsQuery.eq("id", unitIdParam);
  const { data: units, error: uErr } = await unitsQuery;
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  // Generate list tanggal WIB
  const today = new Date();
  const targetDates: string[] = [];
  for (let i = days; i >= 1; i--) {
    // i=days → paling lama; i=1 → kemarin. Hari ini di-handle oleh cron utama
    // supaya backfill tidak overwrite snapshot yang baru di-update.
    targetDates.push(wibDateString(new Date(today.getTime() - i * DAY_MS)));
  }

  const summary = {
    days,
    units: units?.length ?? 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
    failures: [] as Array<{ unit_id: string; tanggal: string; reason: string }>
  };

  // Cek snapshot yang sudah ada untuk skip (kecuali force)
  let existingMap = new Set<string>();
  if (!force && units && units.length > 0) {
    const { data: existing } = await admin
      .from("unit_odometer_snapshots")
      .select("unit_id, tanggal")
      .in("unit_id", units.map((u) => u.id))
      .in("tanggal", targetDates);
    existingMap = new Set(
      (existing ?? []).map(
        (r: { unit_id: string; tanggal: string }) => `${r.unit_id}|${r.tanggal}`
      )
    );
  }

  for (const u of units ?? []) {
    if (!u.imei_gps) continue;
    for (const tgl of targetDates) {
      if (!force && existingMap.has(`${u.id}|${tgl}`)) {
        summary.skipped++;
        continue;
      }
      const startTime = `${tgl} 00:00:00`;
      const endTime = `${tgl} 23:59:59`;
      try {
        const m = await withTimeout(
          getDailyMileage(u.imei_gps, startTime, endTime),
          PER_CALL_TIMEOUT_MS
        );
        const { error: upErr } = await admin
          .from("unit_odometer_snapshots")
          .upsert(
            {
              unit_id: u.id,
              tanggal: tgl,
              daily_km: m.km,
              source: "tracksolid",
              fetched_at: new Date().toISOString()
            },
            { onConflict: "unit_id,tanggal" }
          );
        if (upErr) throw new Error(upErr.message);
        summary.inserted++;
      } catch (e) {
        summary.failed++;
        summary.failures.push({
          unit_id: u.id,
          tanggal: tgl,
          reason: e instanceof Error ? e.message : "unknown"
        });
      }
      // Jeda kecil supaya TrackSolid tidak treat kita sebagai bot.
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
