import Link from "next/link";
import { ChevronRight, MapPin, User } from "lucide-react";
import type { Unit } from "@/lib/types";
import { StatusBadge } from "@/components/ui/badge";

interface UnitCardProps {
  unit: Unit;
  job?: {
    id: string;
    job_number: string;
    asal: string;
    tujuan: string;
  };
  driverNama?: string;
}

export function UnitCard({ unit, job, driverNama }: UnitCardProps) {
  return (
    <Link
      href={`/units/${unit.id}`}
      className="block bg-card rounded-lg border border-border p-3 sm:p-4 hover:border-border-hover transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-text">{unit.kode_unit}</p>
            <StatusBadge status={unit.status} />
          </div>
          <p className="text-[12px] text-text-muted mt-0.5">
            {unit.jenis_unit_nama} &middot; {unit.no_polisi}
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-text-subtle shrink-0" />
      </div>

      {job && unit.status === "bertugas" ? (
        <div className="mt-3 pt-3 border-t border-border/70">
          <div className="flex items-center gap-1.5 text-[12px] text-text-muted">
            <MapPin className="w-3.5 h-3.5" />
            <p className="truncate">
              {job.asal} <span className="text-text-subtle">→</span> {job.tujuan}
            </p>
          </div>
          {driverNama && (
            <div className="flex items-center gap-1.5 text-[12px] text-text-muted mt-1">
              <User className="w-3.5 h-3.5" />
              <span>{driverNama}</span>
              <span className="text-text-subtle">·</span>
              <span className="text-text font-medium">{job.job_number}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1.5 text-[12px]">
          <User className="w-3.5 h-3.5 text-text-subtle" />
          {unit.default_driver_nama ? (
            <span className="text-text-muted">{unit.default_driver_nama}</span>
          ) : (
            <span className="text-text-subtle italic">Driver belum ditugaskan</span>
          )}
        </div>
      )}
      {unit.status === "perbaikan" && unit.catatan && (
        <p className="mt-2 text-[12px] text-status-perbaikan-fg">{unit.catatan}</p>
      )}
    </Link>
  );
}
