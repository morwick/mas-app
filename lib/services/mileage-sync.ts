import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDailyMileage } from "@/lib/tracksolid/client";

/**
 * Helper sync mileage per unit. Dipanggil dari endpoint polling
 * (/api/units/mileage batch & /api/units/[id]/sync-mileage per-unit).
 *
 * Logic gap-fill on-open:
 *   1. Fetch totalMileage hari ini → UPSERT snapshot hari ini
 *   2. Cari tanggal snapshot terbaru SEBELUM hari ini (lastDate).
 *   3. Kalau ada lastDate → loop dari lastDate s/d kemarin:
 *      - Snapshot sudah finalized (fetched_at >= hari berikutnya 00:00 WIB) → skip
 *      - Belum / tidak ada → fetch range full hari itu & UPSERT
 *   4. Cap MAX_BACKFILL_DAYS (30) untuk batasi call ke TrackSolid.
 *
 *   Kalau tidak ada snapshot lampau sama sekali → sistem baru aktif,
 *   skip backfill (jangan tarik data sebelum sistem aktif).
 *
 * "Finalized" = snapshot.fetched_at >= (tanggal + 1 hari) 00:00 WIB.
 * Artinya: snapshot di-fetch atau di-update di hari setelah tanggalnya,
 * sehingga nilai totalMileage sudah final (TrackSolid reset counter di hari baru).
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BACKFILL_DAYS = 30;
const BACKFILL_PAUSE_MS = 150;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface MileageWindow {
  tanggal: string;
  startTime: string;
  endTime: string;
}

function todayWindow(now: Date): MileageWindow {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const tanggal = `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}`;
  const startTime = `${tanggal} 00:00:00`;
  const endTime = `${tanggal} ${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}:${pad(wib.getUTCSeconds())}`;
  return { tanggal, startTime, endTime };
}

function fullDayWindow(tanggal: string): MileageWindow {
  return {
    tanggal,
    startTime: `${tanggal} 00:00:00`,
    endTime: `${tanggal} 23:59:59`
  };
}

/** (tanggal + 1 hari) 00:00 WIB sebagai UTC ISO string. */
function nextDayMidnightUtcIso(tanggal: string): string {
  const [y, m, d] = tanggal.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, -7, 0, 0)).toISOString();
}

/** Build daftar tanggal WIB inklusif dari `fromInclusive` s/d `toInclusive`. */
function buildDateRange(fromInclusive: string, toInclusive: string): string[] {
  const [fy, fm, fd] = fromInclusive.split("-").map(Number);
  const [ty, tm, td] = toInclusive.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  const out: string[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const dt = new Date(t);
    out.push(`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`);
  }
  return out;
}

/** Kurangi N hari dari tanggal WIB YYYY-MM-DD. */
function subDays(tanggal: string, n: number): string {
  const [y, m, d] = tanggal.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) - n * DAY_MS;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export interface SyncResult {
  today_km: number;
  yesterday_finalized: boolean;
  yesterday_km?: number;
  backfilled_dates: string[];
  capped: boolean;
}

export async function syncUnitMileage(
  admin: ReturnType<typeof createAdminClient>,
  unitId: string,
  imei: string,
  now: Date = new Date()
): Promise<SyncResult> {
  const today = todayWindow(now);

  // 1. Fetch hari ini & UPSERT
  const todayResult = await getDailyMileage(
    imei,
    today.startTime,
    today.endTime
  );
  const { error: todayErr } = await admin
    .from("unit_odometer_snapshots")
    .upsert(
      {
        unit_id: unitId,
        tanggal: today.tanggal,
        daily_km: todayResult.km,
        source: "tracksolid",
        fetched_at: new Date().toISOString()
      },
      { onConflict: "unit_id,tanggal" }
    );
  if (todayErr) throw new Error(todayErr.message);

  const empty: SyncResult = {
    today_km: todayResult.km,
    yesterday_finalized: false,
    backfilled_dates: [],
    capped: false
  };

  // 2. Cari snapshot terbaru SEBELUM hari ini
  const { data: lastRow } = await admin
    .from("unit_odometer_snapshots")
    .select("tanggal")
    .eq("unit_id", unitId)
    .lt("tanggal", today.tanggal)
    .order("tanggal", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastRow?.tanggal) {
    return empty;
  }

  // 3. Hitung range backfill: dari lastDate s/d kemarin, cap MAX_BACKFILL_DAYS
  const yesterday = subDays(today.tanggal, 1);
  if (lastRow.tanggal > yesterday) {
    return empty;
  }
  const earliest = subDays(today.tanggal, MAX_BACKFILL_DAYS);
  const fromDate = lastRow.tanggal < earliest ? earliest : lastRow.tanggal;
  const capped = lastRow.tanggal < earliest;
  const targetDates = buildDateRange(fromDate, yesterday);

  // 4. Ambil existing snapshot di range untuk cek finalization
  const { data: existing } = await admin
    .from("unit_odometer_snapshots")
    .select("tanggal, fetched_at")
    .eq("unit_id", unitId)
    .in("tanggal", targetDates);

  const fetchedAtMap = new Map<string, string>();
  for (const r of (existing ?? []) as Array<{
    tanggal: string;
    fetched_at: string;
  }>) {
    fetchedAtMap.set(r.tanggal, r.fetched_at);
  }

  // 5. Loop fetch missing / non-finalized
  const backfilled: string[] = [];
  let yesterdayKm: number | undefined;
  for (const tgl of targetDates) {
    const fetchedAt = fetchedAtMap.get(tgl);
    const finalized =
      typeof fetchedAt === "string" &&
      fetchedAt >= nextDayMidnightUtcIso(tgl);
    if (finalized) continue;

    const win = fullDayWindow(tgl);
    try {
      const r = await getDailyMileage(imei, win.startTime, win.endTime);
      const { error: upErr } = await admin
        .from("unit_odometer_snapshots")
        .upsert(
          {
            unit_id: unitId,
            tanggal: tgl,
            daily_km: r.km,
            source: "tracksolid",
            fetched_at: new Date().toISOString()
          },
          { onConflict: "unit_id,tanggal" }
        );
      if (upErr) throw new Error(upErr.message);
      backfilled.push(tgl);
      if (tgl === yesterday) yesterdayKm = r.km;
    } catch {
      // Tanggal ini gagal — lanjut. Polling berikutnya akan retry.
    }
    if (BACKFILL_PAUSE_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, BACKFILL_PAUSE_MS));
    }
  }

  return {
    today_km: todayResult.km,
    yesterday_finalized: backfilled.includes(yesterday),
    yesterday_km: yesterdayKm,
    backfilled_dates: backfilled,
    capped
  };
}
