/**
 * Penanda "driver menunggu pencairan uang jalan" untuk daftar job.
 *
 * Perjalanan driver terkunci sampai admin mengunggah bukti transfer (BR-02),
 * jadi pengajuan yang menggantung menahan job — bukan sekadar catatan
 * administratif. Karena itu ditampilkan sejajar status job, bukan disembunyikan
 * di halaman Uang Jalan.
 */

import { Wallet } from "lucide-react";
import { formatRupiah, timeAgo } from "@/lib/utils";

interface Props {
  nominal?: number | null;
  since?: string | null;
  /** Versi ringkas tanpa nominal — untuk ruang sempit. */
  compact?: boolean;
}

export function UangJalanPendingBadge({ nominal, since, compact }: Props) {
  const label =
    nominal != null && !compact
      ? `Menunggu pencairan ${formatRupiah(nominal)}`
      : "Menunggu pencairan";

  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-status-perbaikan-bg text-status-perbaikan-fg"
      style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3 }}
      title={
        since
          ? `Driver mengajukan uang jalan ${timeAgo(since)} — belum dicairkan`
          : "Driver mengajukan uang jalan — belum dicairkan"
      }
    >
      <Wallet style={{ width: 11, height: 11, flexShrink: 0 }} aria-hidden />
      {label}
    </span>
  );
}
