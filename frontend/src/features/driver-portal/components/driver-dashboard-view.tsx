import { Link, useNavigate } from "react-router-dom";
import { LogOut, ScrollText, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDriverAuth } from "@/lib/auth/DriverAuthContext";
import { DriverJobDetailView } from "./driver-job-detail-view";
import type { DriverJob } from "@/types";

interface Props {
  driverNama: string;
  /** Job yang belum diterima driver — biasanya 0 atau 1. */
  confirmJob: DriverJob | null;
  /** Job yang sedang berjalan (sudah diterima, belum selesai) — biasanya 0 atau 1. */
  activeJob: DriverJob | null;
}

/**
 * Halaman utama driver disederhanakan: langsung tampilkan detail job yang
 * perlu ditindaklanjuti (bukan daftar yang harus diklik lagi), karena satu
 * driver praktiknya cuma pernah punya 1 job perlu dikonfirmasi + 1 job aktif
 * dalam satu waktu. Riwayat job selesai dipindah ke halaman terpisah,
 * dibuka lewat ikon di kanan atas.
 */
export function DriverDashboardView({ driverNama, confirmJob, activeJob }: Props) {
  const { logout } = useDriverAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/driver/login", { replace: true });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Halo, {driverNama}</h1>
          <p className="text-sm text-text-muted">Job Anda hari ini</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Link
            to="/driver/riwayat"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-text-muted hover:bg-gray-100"
            title="Riwayat perjalanan"
          >
            <ScrollText className="w-5 h-5" />
          </Link>
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
      </div>

      {!confirmJob && !activeJob && (
        <div className="text-center py-12">
          <Truck className="w-12 h-12 mx-auto text-text-subtle mb-3" />
          <p className="text-sm text-text-muted">Tidak ada job aktif saat ini</p>
        </div>
      )}

      {/* Job yang belum dikonfirmasi didahulukan — driver harus menekan
          "Terima Job" (ada di dalam DriverJobDetailView) sebelum lanjut. */}
      {confirmJob && (
        <div className="flex flex-col gap-2">
          {activeJob && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Perlu dikonfirmasi
            </p>
          )}
          <DriverJobDetailView job={confirmJob} />
        </div>
      )}

      {/* Kasus jarang: job berikutnya sudah ditugaskan sebelum yang sekarang
          selesai — keduanya sekaligus ditampilkan supaya tidak ada yang
          terlewat. */}
      {activeJob && (
        <div className="flex flex-col gap-2">
          {confirmJob && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mt-2">
              Job aktif
            </p>
          )}
          <DriverJobDetailView job={activeJob} />
        </div>
      )}
    </div>
  );
}
