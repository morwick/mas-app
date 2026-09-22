import { cn } from "@/lib/utils";
import {
  invoiceTampilStatusLabel,
  type InvoiceTampilStatus
} from "@/lib/types";

// Dipetakan ke kelas badge yang sudah ada di globals.css supaya warnanya
// konsisten dengan badge status unit, job, dan penawaran.
const statusClass: Record<InvoiceTampilStatus, string> = {
  draft: "",
  terkirim: "badge-pickup",
  lunas: "badge-selesai",
  // Jatuh tempo bukan pembatalan, tapi perlu sama menuntut perhatiannya —
  // ini satu-satunya keadaan di daftar yang berarti uang belum masuk padahal
  // sudah lewat tanggalnya.
  jatuh_tempo: "badge-perbaikan",
  batal: "badge-cancelled"
};

export function InvoiceStatusBadge({
  status,
  hariTerlambat,
  className
}: {
  status: InvoiceTampilStatus;
  /** Ditampilkan menempel pada status jatuh tempo, mis. "Jatuh tempo · 12 hari". */
  hariTerlambat?: number | null;
  className?: string;
}) {
  return (
    <span className={cn("badge", statusClass[status], className)}>
      <span className="badge-dot" />
      {invoiceTampilStatusLabel[status]}
      {status === "jatuh_tempo" && hariTerlambat ? ` · ${hariTerlambat} hari` : ""}
    </span>
  );
}
