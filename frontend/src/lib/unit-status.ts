import type { UnitStatus } from "@/types";

/**
 * Unit yang sudah keluar dari armada (terjual / diafkirkan): tidak bisa dipakai
 * job dan tidak ditampilkan di dashboard, peta, maupun jadwal.
 */
export const STATUS_BUKAN_ARMADA: readonly UnitStatus[] = ["terjual", "diafkirkan"];

export function bukanArmada(status: UnitStatus): boolean {
  return STATUS_BUKAN_ARMADA.includes(status);
}
