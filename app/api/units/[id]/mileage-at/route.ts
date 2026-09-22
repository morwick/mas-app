import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/units/[id]/mileage-at?date=YYYY-MM-DD
 *
 * Return akumulasi km unit pada akhir tanggal yang diminta, dihitung dari
 * `units.odometer_baseline_km` + Σ `unit_odometer_snapshots.daily_km` sampai
 * dengan tanggal target (inklusif).
 *
 * Dipakai oleh ServiceFormModal saat admin backdate service: kolom "Akumulasi
 * KM saat servis" auto-fill dari sini, bukan dari pembacaan sekarang.
 *
 * Response:
 *   ok: true,
 *   date: "2026-05-16",
 *   akumulasi_km: 10509,            // akumulasi pada akhir target date
 *   current_akumulasi_km: 11309,    // akumulasi sekarang (referensi)
 *   km_after_target: 800,           // km tempuh setelah target date sampai sekarang
 *   data_quality: "complete" | "partial" | "no_data",
 *   missing_days: string[],         // tanggal di antara earliest snapshot s/d target yang belum ada datanya
 *   earliest_snapshot_date: string | null
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function todayWib(): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}`;
}

function buildDateRange(fromInclusive: string, toInclusive: string): string[] {
  const [fy, fm, fd] = fromInclusive.split("-").map(Number);
  const [ty, tm, td] = toInclusive.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  const out: string[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const dt = new Date(t);
    out.push(
      `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
    );
  }
  return out;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "Param `date` harus format YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const today = todayWib();
  if (date > today) {
    return NextResponse.json(
      { error: "Tanggal tidak boleh di masa depan" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: unit, error: unitErr } = await supabase
    .from("units")
    .select("id, odometer_baseline_km, current_odometer_km")
    .eq("id", id)
    .maybeSingle();
  if (unitErr) {
    return NextResponse.json({ error: unitErr.message }, { status: 500 });
  }
  if (!unit) {
    return NextResponse.json({ error: "Unit tidak ditemukan" }, { status: 404 });
  }

  const baseline = Number(unit.odometer_baseline_km ?? 0);
  const currentAkumulasi = Number(unit.current_odometer_km ?? 0);

  // Ambil snapshot terawal (untuk hitung data quality / earliest_snapshot_date)
  const { data: earliestRow } = await supabase
    .from("unit_odometer_snapshots")
    .select("tanggal")
    .eq("unit_id", id)
    .order("tanggal", { ascending: true })
    .limit(1)
    .maybeSingle();

  const earliest = earliestRow?.tanggal ?? null;

  // Ambil semua snapshot s/d target date untuk hitung akumulasi
  const { data: snapshots, error: snapErr } = await supabase
    .from("unit_odometer_snapshots")
    .select("tanggal, daily_km")
    .eq("unit_id", id)
    .lte("tanggal", date)
    .order("tanggal", { ascending: true });
  if (snapErr) {
    return NextResponse.json({ error: snapErr.message }, { status: 500 });
  }

  const rows = (snapshots ?? []) as Array<{ tanggal: string; daily_km: number }>;
  const sumUpToTarget = rows.reduce(
    (acc, r) => acc + Number(r.daily_km ?? 0),
    0
  );
  const akumulasi = baseline + sumUpToTarget;

  // Data quality assessment
  let dataQuality: "complete" | "partial" | "no_data" = "complete";
  let missingDays: string[] = [];

  if (!earliest || rows.length === 0) {
    // Belum ada snapshot apapun untuk unit ini (atau tidak ada yang s/d target)
    dataQuality = "no_data";
  } else if (date < earliest) {
    // Target lebih awal dari snapshot pertama → tidak punya datanya
    dataQuality = "no_data";
  } else {
    const expected = buildDateRange(earliest, date);
    const have = new Set(rows.map((r) => r.tanggal));
    missingDays = expected.filter((d) => !have.has(d));
    if (missingDays.length > 0) {
      dataQuality = missingDays.length / expected.length > 0.3
        ? "no_data"
        : "partial";
    }
  }

  const kmAfterTarget = Math.max(0, currentAkumulasi - akumulasi);

  return NextResponse.json({
    ok: true,
    date,
    akumulasi_km: dataQuality === "no_data" ? null : Math.round(akumulasi),
    current_akumulasi_km: Math.round(currentAkumulasi),
    km_after_target: dataQuality === "no_data" ? null : Math.round(kmAfterTarget),
    data_quality: dataQuality,
    missing_days: missingDays.slice(0, 20),
    earliest_snapshot_date: earliest
  });
}
