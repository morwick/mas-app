// Deteksi bentrok jadwal — fungsi murni, dipakai untuk peringatan real-time
// saat admin mengisi form. Backend menjalankan logika yang sama sebagai
// defense-in-depth sebelum menyimpan.

import { ACTIVE_JOB_STATUSES } from "@/lib/job-status";
import { localInputToDate } from "@/lib/utils";
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

/** Pesan saat job ditolak karena bentrok jadwal (sama dengan pesan server). */
export const BENTROK_JADWAL_MESSAGE = "Gagal! Ada bentrok jadwal. Silakan dicek kembali.";

interface FindConflictsInput {
  unitId: string;
  driverId: string;
  etd: string;
  eta?: string | null;
  /** Job ID yang sedang di-edit, agar tidak konflik dengan dirinya sendiri. */
  excludeJobId?: string;
}

const ACTIVE_STATUSES: JobStatus[] = ACTIVE_JOB_STATUSES;

/** ETA fallback 12 jam dari ETD bila eta tidak diisi. */
const ETA_FALLBACK_HOURS = 12;

/**
 * Nilai form ("YYYY-MM-DDTHH:mm", jam WIB) atau ISO dari server → Date.
 * Nilai form tidak membawa zona, jadi ditafsirkan sebagai WIB.
 */
function keDate(value: string): Date {
  return (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && localInputToDate(value)) || new Date(value);
}

function effectiveEnd(etd: string, eta: string | null | undefined): Date {
  if (eta) return keDate(eta);
  return new Date(keDate(etd).getTime() + ETA_FALLBACK_HOURS * 60 * 60 * 1000);
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

  const candidateStart = keDate(input.etd);
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
