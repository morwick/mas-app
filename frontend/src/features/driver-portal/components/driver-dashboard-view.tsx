import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Truck,
  Package,
  CheckCircle,
  Clock,
  MapPin,
  BellRing,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useDriverAuth } from "@/lib/auth/DriverAuthContext";
import { isActiveStatus } from "@/lib/job-status";
import type { DriverJob } from "@/types";
import type { Job } from "@/types";

interface Props {
  driverNama: string;
  jobs: DriverJob[];
}

const statusConfig: Record<
  Job["status"],
  { label: string; color: string; icon: React.ReactNode }
> = {
  menunggu_pickup: {
    label: "Ditugaskan",
    color: "bg-gray-100 text-gray-700",
    icon: <Clock className="w-3 h-3" />
  },
  ditugaskan: {
    label: "Ditugaskan",
    color: "bg-gray-100 text-gray-700",
    icon: <Clock className="w-3 h-3" />
  },
  diterima: {
    label: "Diterima",
    color: "bg-blue-100 text-blue-700",
    icon: <CheckCircle className="w-3 h-3" />
  },
  loading: {
    label: "Loading",
    color: "bg-blue-100 text-blue-700",
    icon: <Package className="w-3 h-3" />
  },
  dalam_perjalanan: {
    label: "Dalam Perjalanan",
    color: "bg-brand-primary text-white",
    icon: <Truck className="w-3 h-3" />
  },
  unloading: {
    label: "Unloading",
    color: "bg-orange-100 text-orange-700",
    icon: <Package className="w-3 h-3" />
  },
  serah_terima_pool: {
    label: "Serah terima pool",
    color: "bg-purple-100 text-purple-700",
    icon: <Package className="w-3 h-3" />
  },
  menunggu_validasi: {
    label: "Menunggu validasi admin",
    color: "bg-amber-100 text-amber-800",
    icon: <Clock className="w-3 h-3" />
  },
  selesai: {
    label: "Selesai",
    color: "bg-green-100 text-green-700",
    icon: <CheckCircle className="w-3 h-3" />
  },
  cancelled: {
    label: "Dibatalkan",
    color: "bg-status-cancelled-bg text-status-cancelled-fg",
    icon: <Clock className="w-3 h-3" />
  }
};

function isActive(job: DriverJob): boolean {
  return isActiveStatus(job.status);
}

/** Job aktif yang belum ditekan "Terima" oleh driver. */
function needsAccept(job: DriverJob): boolean {
  return isActive(job) && !job.accepted_at;
}

function formatEtd(etd: string): string {
  return new Date(etd).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

type Filter = "baru" | "active" | "completed" | "all";

export function DriverDashboardView({ driverNama, jobs }: Props) {
  const { logout } = useDriverAuth();
  const navigate = useNavigate();
  async function onLogout() {
    await logout();
    navigate("/driver/login", { replace: true });
  }
  const counts = useMemo(
    () => ({
      all: jobs.length,
      baru: jobs.filter(needsAccept).length,
      active: jobs.filter(isActive).length,
      completed: jobs.filter((j) => j.status === "selesai").length
    }),
    [jobs]
  );

  // Kalau ada job yang belum dikonfirmasi, itu yang pertama harus dilihat
  // driver saat membuka aplikasi — bukan daftar job yang sudah jalan.
  const [filter, setFilter] = useState<Filter>(
    counts.baru > 0 ? "baru" : "active"
  );

  const filteredJobs = useMemo(() => {
    if (filter === "baru") return jobs.filter(needsAccept);
    if (filter === "active") return jobs.filter(isActive);
    if (filter === "completed") return jobs.filter((j) => j.status === "selesai");
    return jobs;
  }, [jobs, filter]);

  const chips: Array<{ key: Filter; label: string; count: number }> = [
    { key: "baru", label: "Perlu dikonfirmasi", count: counts.baru },
    { key: "active", label: "Aktif", count: counts.active },
    { key: "completed", label: "Selesai", count: counts.completed },
    { key: "all", label: "Semua", count: counts.all }
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Halo, {driverNama}</h1>
          <p className="text-sm text-text-muted">Job yang ditugaskan ke Anda</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leftIcon={<LogOut className="w-4 h-4" />}
          onClick={onLogout}
        >
          Keluar
        </Button>
      </div>

      {counts.baru > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
          <BellRing className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-900">
            {counts.baru} job menunggu konfirmasi Anda. Buka job-nya lalu tekan{" "}
            <span className="font-semibold">Terima Job</span> supaya kantor tahu
            Anda sudah membacanya.
          </p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === chip.key
                ? "bg-brand-primary text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {chip.label} ({chip.count})
          </button>
        ))}
      </div>

      {filteredJobs.length === 0 ? (
        <div className="text-center py-12">
          <Truck className="w-12 h-12 mx-auto text-text-subtle mb-3" />
          <p className="text-sm text-text-muted">
            {filter === "baru"
              ? "Semua job sudah Anda konfirmasi"
              : filter === "active"
              ? "Tidak ada job aktif saat ini"
              : filter === "completed"
              ? "Belum ada job selesai"
              : "Belum ada job"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredJobs.map((job) => {
            const cfg = statusConfig[job.status];
            const belumKonfirmasi = needsAccept(job);
            return (
              <Link
                key={job.id}
                to={`/driver/jobs/${job.id}`}
                className={`block rounded-lg border bg-card p-4 transition-colors hover:border-brand-primary ${
                  belumKonfirmasi ? "border-amber-300" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{job.job_number}</div>
                    <div className="text-[13px] text-text-muted truncate">
                      {job.customer_nama}
                    </div>
                  </div>
                  <span
                    className={`badge ${cfg.color} flex items-center gap-1 flex-shrink-0`}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </span>
                </div>

                {belumKonfirmasi && (
                  <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    <BellRing className="w-3 h-3" />
                    Belum dikonfirmasi
                  </div>
                )}

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
