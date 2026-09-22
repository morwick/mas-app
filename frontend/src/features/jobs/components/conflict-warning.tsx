import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, Truck, User } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import type { ConflictCheckResult } from "@/lib/job-conflicts";
import { formatDateTime } from "@/lib/utils";

interface Props {
  conflicts: ConflictCheckResult;
  className?: string;
}

export function ConflictWarning({ conflicts, className }: Props) {
  if (!conflicts.hasAny) return null;

  return (
    <div
      className={`bg-status-cancelled-bg border border-danger/30 rounded-md p-3.5 flex items-start gap-3 ${
        className ?? ""
      }`}
    >
      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0">
        <AlertTriangle className="w-4 h-4 text-danger" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-status-cancelled-fg">
          Bentrok jadwal terdeteksi
        </p>
        <p className="text-[12px] text-status-cancelled-fg/80 mt-0.5">
          Window waktu yang Anda pilih overlap dengan job aktif berikut. Periksa
          ulang atau konfirmasi tetap simpan.
        </p>

        {conflicts.unit.length > 0 && (
          <ConflictGroup
            icon={<Truck className="w-3.5 h-3.5" />}
            label="Unit yang sama"
            jobs={conflicts.unit}
          />
        )}
        {conflicts.driver.length > 0 && (
          <ConflictGroup
            icon={<User className="w-3.5 h-3.5" />}
            label="Driver yang sama"
            jobs={conflicts.driver}
          />
        )}
      </div>
    </div>
  );
}

function ConflictGroup({
  icon,
  label,
  jobs
}: {
  icon: React.ReactNode;
  label: string;
  jobs: ConflictCheckResult["unit"];
}) {
  return (
    <div className="mt-2.5">
      <p className="text-[11px] uppercase tracking-wider text-status-cancelled-fg/70 inline-flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <ul className="mt-1 flex flex-col gap-1.5">
        {jobs.map((j) => (
          <li
            key={j.job_id}
            className="bg-white/60 rounded px-2.5 py-1.5 flex items-center justify-between gap-2 flex-wrap"
          >
            <div className="min-w-0 text-[12px]">
              <span className="font-medium text-text">{j.job_number}</span>
              <span className="text-text-muted"> · {j.customer_nama}</span>
              <span className="text-text-muted">
                {" · "}
                {formatDateTime(j.etd)}
                {j.eta ? ` → ${formatDateTime(j.eta)}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={j.status} />
              <Link
                to={`/jobs/${j.job_id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-brand-dark hover:underline"
              >
                Buka
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
