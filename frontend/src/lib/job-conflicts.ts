// Deteksi bentrok jadwal — fungsi murni, dipakai untuk peringatan real-time
// saat admin mengisi form. Backend menjalankan logika yang sama sebagai
// defense-in-depth sebelum menyimpan.

import type { Job, JobStatus } from "@/types";

export interface JobConflict {
  job_id: string;
  job_number: string;
  customer_nama: string;
  etd: string;
  eta: string | null;
  status: JobStatus;
  /** Apakah konflik karena unit yang sama, driver yang sama, atau keduanya. */
  reason: "unit" | "driver" | "both";
}

export interface ConflictCheckResult {
  unit: JobConflict[];
  driver: JobConflict[];
  hasAny: boolean;
}

interface FindConflictsInput {
  unitId: string;
  driverId: string;
  etd: string;
  eta?: string | null;
  /** Job ID yang sedang di-edit, agar tidak konflik dengan dirinya sendiri. */
  excludeJobId?: string;
}

const ACTIVE_STATUSES: JobStatus[] = [
  "menunggu_pickup",
  "loading",
  "dalam_perjalanan",
  "unloading"
];

/** ETA fallback 12 jam dari ETD bila eta tidak diisi. */
const ETA_FALLBACK_HOURS = 12;

function effectiveEnd(etd: string, eta: string | null | undefined): Date {
  if (eta) return new Date(eta);
  return new Date(
    new Date(etd).getTime() + ETA_FALLBACK_HOURS * 60 * 60 * 1000
  );
}

function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Cari job aktif yang bentrok dengan kandidat assignment. "Bentrok" bila:
 * - Window waktu overlap (etd ≤ x < eta-effective)
 * - DAN status job lain masih aktif (belum selesai/cancelled)
 * - DAN unit_id ATAU driver_id sama
 */
export function findJobConflicts(
  input: FindConflictsInput,
  activeJobs: Job[]
): ConflictCheckResult {
  if (!input.unitId || !input.driverId || !input.etd) {
    return { unit: [], driver: [], hasAny: false };
  }

  const candidateStart = new Date(input.etd);
  const candidateEnd = effectiveEnd(input.etd, input.eta ?? null);

  const unit: JobConflict[] = [];
  const driver: JobConflict[] = [];

  for (const j of activeJobs) {
    if (input.excludeJobId && j.id === input.excludeJobId) continue;
    if (!ACTIVE_STATUSES.includes(j.status)) continue;

    const sameUnit = j.unit_id === input.unitId;
    const sameDriver = j.driver_id === input.driverId;
    if (!sameUnit && !sameDriver) continue;

    const otherStart = new Date(j.etd);
    const otherEnd = effectiveEnd(j.etd, j.eta);
    if (!rangesOverlap(candidateStart, candidateEnd, otherStart, otherEnd))
      continue;

    const reason: JobConflict["reason"] =
      sameUnit && sameDriver ? "both" : sameUnit ? "unit" : "driver";

    const conflict: JobConflict = {
      job_id: j.id,
      job_number: j.job_number,
      customer_nama: j.customer_nama,
      etd: j.etd,
      eta: j.eta ?? null,
      status: j.status,
      reason
    };

    if (sameUnit) unit.push(conflict);
    if (sameDriver) driver.push(conflict);
  }

  return { unit, driver, hasAny: unit.length > 0 || driver.length > 0 };
}
