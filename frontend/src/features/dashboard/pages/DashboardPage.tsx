import { useEffect } from "react";
import { PageError, PageLoading } from "@/components/ui/page-state";
import { sinkronOdometer } from "@/features/services/api";
import { useSesiTrackSolid } from "@/features/tracksolid/use-sesi-tracksolid";
import { useCurrentUser } from "@/lib/auth/AuthContext";
import { dengarTersambung } from "@/lib/tracksolid-captcha";
import { DashboardView } from "../components/dashboard-view";
import { FinanceDashboardView } from "../components/finance-dashboard-view";
import { PerluApprovalCard } from "../components/perlu-approval-card";
import { useDashboard, useFinanceDashboard } from "../queries";

/** Sama dengan menu Service: odometer GPS disinkron (maks. sekali / 5 menit
 * untuk seluruh aplikasi), lalu dashboard disegarkan — angka service di
 * "Perlu tindakan" jadi sama dengan menu Service. */
const SINKRON_ODOMETER_MS = 5 * 60_000;

function OperationalDashboardPage() {
  // Odometer GPS dari TrackSolid: cek sesi saat dibuka, popup captcha bila perlu
  // (sama dengan menu Unit, Pantau, Service).
  useSesiTrackSolid();
  const q = useDashboard();
  useEffect(() => {
    const sinkron = () => void sinkronOdometer().catch(() => undefined);
    sinkron();
    const id = window.setInterval(sinkron, SINKRON_ODOMETER_MS);
    // Login captcha berhasil → sinkron sekarang juga, tanpa menunggu 5 menit.
    const lepas = dengarTersambung(() => void sinkronOdometer(true).catch(() => undefined));
    return () => {
      window.clearInterval(id);
      lepas();
    };
  }, []);
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  const activeJobs = q.data.active_jobs.map((e) => ({ unitId: e.unit_id, job: e.job }));
  return (
    <DashboardView
      units={q.data.units}
      counts={q.data.counts}
      activeJobs={activeJobs}
      jobsMenungguValidasi={q.data.jobs_menunggu_validasi}
      uangJalanDiajukan={q.data.uang_jalan_diajukan}
      jobBelumKonfirmasi={q.data.job_belum_konfirmasi}
      proyekBelumDitagih={q.data.proyek_belum_ditagih}
      dokumenJatuhTempo={q.data.dokumen_jatuh_tempo}
      monitoringServis={q.data.monitoring_servis}
      penawaranDealTanpaProyek={q.data.penawaran_deal_tanpa_proyek ?? 0}
      penawaranAkanKedaluwarsa={q.data.penawaran_akan_kedaluwarsa ?? 0}
    />
  );
}

function FinanceDashboardPage() {
  const q = useFinanceDashboard();
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <PageError error={q.error} onRetry={q.refetch} />;
  return <FinanceDashboardView data={q.data} />;
}

export function DashboardPage() {
  const user = useCurrentUser();
  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      {/* Approver bisa di role apa pun — widget muncul hanya bila ada yang menunggu. */}
      <PerluApprovalCard />
      {user.role === "finance" ? <FinanceDashboardPage /> : <OperationalDashboardPage />}
    </div>
  );
}
