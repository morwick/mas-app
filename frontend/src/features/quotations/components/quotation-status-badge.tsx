import { cn } from "@/lib/utils";
import { quotationStatusLabel, type QuotationStatus } from "@/types";

// Dipetakan ke kelas badge yang sudah ada di globals.css supaya warnanya
// konsisten dengan badge status unit & job.
const statusClass: Record<QuotationStatus, string> = {
  draft: "",
  terkirim: "badge-pickup",
  deal: "badge-selesai",
  ditolak: "badge-cancelled",
  kedaluwarsa: "badge-perbaikan"
};

export function QuotationStatusBadge({
  status,
  className
}: {
  status: QuotationStatus;
  className?: string;
}) {
  return (
    <span className={cn("badge", statusClass[status], className)}>
      <span className="badge-dot" />
      {quotationStatusLabel[status]}
    </span>
  );
}
