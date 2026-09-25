import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle, Clock, MapPin, ScrollText, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DriverJob, Job } from "@/types";

interface Props {
  jobs: DriverJob[];
}

const STATUS_CONFIG: Record<Job["status"], { label: string; color: string }> = {
  menunggu_pickup: { label: "Ditugaskan", color: "bg-gray-100 text-gray-700" },
  ditugaskan: { label: "Ditugaskan", color: "bg-gray-100 text-gray-700" },
  diterima: { label: "Diterima", color: "bg-blue-100 text-blue-700" },
  loading: { label: "Loading", color: "bg-blue-100 text-blue-700" },
  dalam_perjalanan: { label: "Dalam Perjalanan", color: "bg-brand-primary text-white" },
  unloading: { label: "Unloading", color: "bg-orange-100 text-orange-700" },
  serah_terima_pool: { label: "Serah terima pool", color: "bg-purple-100 text-purple-700" },
  menunggu_validasi: { label: "Menunggu validasi admin", color: "bg-amber-100 text-amber-800" },
  selesai: { label: "Selesai", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Dibatalkan", color: "bg-status-cancelled-bg text-status-cancelled-fg" }
};

function formatEtd(etd: string): string {
  return new Date(etd).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** Riwayat job yang sudah selesai/dibatalkan — dipisah dari halaman utama. */
export function DriverHistoryView({ jobs }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link to="/driver/dashboard">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} />
        </Link>
        <h1 className="text-lg font-bold">Riwayat Perjalanan</h1>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-12">
          <ScrollText className="w-12 h-12 mx-auto text-text-subtle mb-3" />
          <p className="text-sm text-text-muted">Belum ada job selesai</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map((job) => {
            const cfg = STATUS_CONFIG[job.status];
            return (
              <Link
                key={job.id}
                to={`/driver/jobs/${job.id}?dari=riwayat`}
                className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand-primary"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{job.job_number}</div>
                    <div className="text-[13px] text-text-muted truncate">{job.customer_nama}</div>
                  </div>
                  <span className={`badge ${cfg.color} flex items-center gap-1 flex-shrink-0`}>
                    <CheckCircle className="w-3 h-3" />
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-start gap-1.5 text-[13px] text-text-muted">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-text-subtle" />
                  <span className="min-w-0">
                    {job.asal} → {job.tujuan}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[13px] text-text-muted">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0 text-text-subtle" />
                  <span>Berangkat {formatEtd(job.etd)}</span>
                </div>
                {(job.unit_kode || job.unit_no_polisi) && (
                  <div className="mt-1 flex items-center gap-1.5 text-[13px] text-text-muted">
                    <Truck className="w-3.5 h-3.5 flex-shrink-0 text-text-subtle" />
                    <span>
                      {job.unit_kode}
                      {job.unit_no_polisi ? ` (${job.unit_no_polisi})` : ""}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
