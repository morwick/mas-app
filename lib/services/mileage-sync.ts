import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDailyMileage } from "@/lib/tracksolid/client";

/**
 * Helper sync mileage per unit. Dipanggil dari endpoint polling
 * (/api/units/mileage batch & /api/units/[id]/sync-mileage per-unit).
 *
 * Logic:
 *   1. Fetch totalMileage hari ini → UPSERT snapshot hari ini
 *   2. Smart backfill kemarin: HANYA kalau snapshot kemarin sudah ada di DB
 *      (artinya: sistem sudah aktif kemarin) DAN belum di-finalize.
 *      Tujuan: pastikan snapshot kemarin = nilai final 23:59, bukan
 *      mid-day kalau admin tutup laptop sebelum tengah malam.
 *
 *   Backfill TIDAK akan create row baru untuk tanggal yang belum pernah
 *   ke-snapshot — supaya data sebelum sistem aktif tidak ikut tertarik.
 *
 * "Finalized" = snapshot.fetched_at >= hari ini 00:00 WIB. Polling pertama
 * di hari baru akan finalize kemarin sekali, lalu skip seterusnya.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface MileageWindow {
  tanggal: string;     // YYYY-MM-DD (WIB)
  startTime: string;   // "YYYY-MM-DD HH:mm:ss"
  endTime: string;
}

function todayWindow(now: Date): MileageWindow {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const tanggal = `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}`;
  const startTime = `${tanggal} 00:00:00`;
  const endTime = `${tanggal} ${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}:${pad(wib.getUTCSeconds())}`;
  return { tanggal, startTime, endTime };
}

function yesterdayWindow(now: Date): MileageWindow {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS - DAY_MS);
  const tanggal = `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}`;
  return {
    tanggal,
    startTime: `${tanggal} 00:00:00`,
    endTime: `${tanggal} 23:59:59`
  };
}

/** Hari ini WIB 00:00:00 dalam ISO UTC (untuk perbandingan dengan fetched_at). */
function todayWibMidnightIso(now: Date): string {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const y = wib.getUTCFullYear();
  const m = wib.getUTCMonth();
  const d = wib.getUTCDate();
  return new Date(Date.UTC(y, m, d, -7, 0, 0)).toISOString();
}

export interface SyncResult {
  today_km: number;
  yesterday_finalized: boolean;
  yesterday_km?: number;
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

  // 2. Smart backfill kemarin — HANYA kalau snapshot kemarin sudah ada
  const yesterday = yesterdayWindow(now);
  const { data: yRow } = await admin
    .from("unit_odometer_snapshots")
    .select("daily_km, fetched_at")
    .eq("unit_id", unitId)
    .eq("tanggal", yesterday.tanggal)
    .maybeSingle();

  // Snapshot kemarin tidak ada → sistem belum aktif kemarin → SKIP
  if (yRow == null) {
    return { today_km: todayResult.km, yesterday_finalized: false };
  }

  // Snapshot ada, cek apakah sudah finalized
  const todayMidnightUtc = todayWibMidnightIso(now);
  const alreadyFinalized =
    typeof yRow.fetched_at === "string" &&
    yRow.fetched_at >= todayMidnightUtc;
  if (alreadyFinalized) {
    return { today_km: todayResult.km, yesterday_finalized: false };
  }

  // 3. Re-fetch kemarin pakai range penuh untuk dapat nilai final
  try {
    const ymResult = await getDailyMileage(
      imei,
      yesterday.startTime,
      yesterday.endTime
    );
    const { error: yErr } = await admin
      .from("unit_odometer_snapshots")
      .upsert(
        {
          unit_id: unitId,
          tanggal: yesterday.tanggal,
          daily_km: ymResult.km,
          source: "tracksolid",
          fetched_at: new Date().toISOString()
        },
        { onConflict: "unit_id,tanggal" }
      );
    if (yErr) throw new Error(yErr.message);
    return {
      today_km: todayResult.km,
      yesterday_finalized: true,
      yesterday_km: ymResult.km
    };
  } catch {
    // Backfill gagal → tidak fatal. Hari ini tetap ter-sync, polling
    // berikutnya akan coba lagi.
    return { today_km: todayResult.km, yesterday_finalized: false };
  }
}
