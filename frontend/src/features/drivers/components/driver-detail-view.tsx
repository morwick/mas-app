import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import {
  DetailField,
  DokumenCard,
  JobAktifTab,
  RiwayatJobTab,
  isJobAktif
} from "@/features/units/components/aset-detail-parts";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate } from "@/lib/utils";
import type { Driver, Job } from "@/types";

interface Props {
  driver: Driver;
  jobs: Job[];
  /** Unit yang memakai driver ini sebagai driver tetap (bila ada). */
  unitTetap?: { unit_id: string; kode_unit: string } | null;
}

type TabKey = "aktif" | "riwayat";

export function initialsDriver(nama: string) {
  return nama
    .replace(/^(Pak|Bapak|Bu|Ibu)\s+/i, "")
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

export function DriverStatusBadge({ driver }: { driver: Driver }) {
  if (driver.is_blacklist) {
    return (
      <span
      className="badge"
      style={{ background: "#b91c1c", color: "#fff" }}
      title={driver.blacklist_alasan ? `Alasan: ${driver.blacklist_alasan}` : undefined}
    >
      Blacklist
    </span>
    );
  }
  if (!driver.is_active) return <span className="badge">Nonaktif</span>;
  return driver.status === "in_job" ? (
    <span className="badge badge-status-bertugas">
      <span className="badge-dot" />
      In Job
    </span>
  ) : (
    <span className="badge badge-status-standby">
      <span className="badge-dot" />
      Stand By
    </span>
  );
}

/**
 * Detail driver — pola sama dengan detail unit: kartu identitas, tab job
 * aktif / riwayat job, dan di kolom kanan dokumen (SIM) serta ringkasan job.
 */
export function DriverDetailView({ driver, jobs, unitTetap }: Props) {
  const { canManageOperational } = useAuth();
  const activeJob = useMemo(() => jobs.find(isJobAktif), [jobs]);
  const pastJobs = useMemo(() => jobs.filter((j) => !isJobAktif(j)), [jobs]);
  const [tab, setTab] = useState<TabKey>(activeJob ? "aktif" : "riwayat");

  const selesai = jobs.filter((j) => j.status === "selesai").length;
  const batal = jobs.filter((j) => j.status === "cancelled").length;

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
      {/* Kolom kiri */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card card-pad-lg">
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap"
            }}
          >
            <div style={{ display: "flex", gap: 14, minWidth: 0 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 99,
                  background: driver.is_active ? "var(--brand-primary)" : "var(--bg-subtle)",
                  color: driver.is_active ? "white" : "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                  fontSize: 18,
                  flexShrink: 0
                }}
              >
                {initialsDriver(driver.nama)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}
                >
                  <div className="h1" style={{ fontSize: 24 }}>
                    {driver.nama}
                  </div>
                  <DriverStatusBadge driver={driver} />
                </div>
                <div className="body-sm muted mono">{driver.no_hp}</div>
              </div>
            </div>
            {canManageOperational && (
              <Link
                to={`/drivers/${driver.id}/edit`}
                className="btn btn-secondary btn-sm"
                style={{ textDecoration: "none" }}
              >
                <Pencil style={{ width: 14, height: 14 }} />
                Edit
              </Link>
            )}
          </div>

          {driver.is_blacklist && (
            <div
              className="card card-pad"
              style={{
                background: "var(--status-cancelled-bg)",
                color: "var(--status-cancelled-text)",
                fontSize: 13,
                marginBottom: 14
              }}
            >
              <strong>Driver ini di-blacklist</strong>
              {driver.blacklist_at ? ` sejak ${formatDate(driver.blacklist_at)}` : ""}
              {driver.blacklist_oleh_nama ? ` oleh ${driver.blacklist_oleh_nama}` : ""}. Alasan:{" "}
              {driver.blacklist_alasan ?? "-"}. Driver nonaktif, tidak bisa login ke aplikasi, dan tidak bisa
              ditugaskan ke job. Blacklist hanya bisa dicabut di menu Karyawan.
            </div>
          )}

          <div className="divider" style={{ marginBottom: 14 }} />
          <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 16 }}>
            <DetailField label="No HP" value={driver.no_hp} mono />
            <DetailField label="No SIM" value={driver.no_sim || "—"} mono />
            <DetailField
              label="SIM berlaku sampai"
              value={driver.sim_berlaku_sampai ? formatDate(driver.sim_berlaku_sampai) : "—"}
            />
            <DetailField
              label="Unit tetap"
              valueNode={
                unitTetap ? (
                  <Link to={`/units/${unitTetap.unit_id}`} style={{ fontWeight: 500 }}>
                    {unitTetap.kode_unit}
                  </Link>
                ) : undefined
              }
              value={unitTetap ? undefined : "Belum ditugaskan"}
            />
            <DetailField label="Total job" value={String(jobs.length)} />
            <DetailField
              label="Job aktif"
              valueNode={
                driver.active_job_id ? (
                  <Link to={`/jobs/${driver.active_job_id}`} className="mono" style={{ fontWeight: 500 }}>
                    {driver.active_job_number ?? "Lihat job"}
                  </Link>
                ) : undefined
              }
              value={driver.active_job_id ? undefined : "—"}
            />
          </div>
          {(driver.alamat || driver.catatan) && (
            <>
              <div className="divider" style={{ margin: "14px 0" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {driver.alamat && <DetailField label="Alamat" value={driver.alamat} fullWidth />}
                {driver.catatan && <DetailField label="Catatan" value={driver.catatan} fullWidth />}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as TabKey)}
            items={[
              { key: "aktif", label: "Job aktif", count: activeJob ? 1 : 0 },
              { key: "riwayat", label: "Riwayat job", count: pastJobs.length }
            ]}
          />
          <div>
            {tab === "aktif" && <JobAktifTab activeJob={activeJob} labelAset="driver" />}
            {tab === "riwayat" && <RiwayatJobTab pastJobs={pastJobs} labelAset="driver" />}
          </div>
        </div>
      </div>

      {/* Kolom kanan */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <DokumenCard
          judul="Dokumen driver"
          kosong="Belum dicatat — isi lewat Edit driver"
          items={[
            { label: "SIM", tanggal: driver.sim_berlaku_sampai, nomor: driver.no_sim, url: driver.sim_url }
          ]}
        />
        <div className="card card-pad">
          <div className="h3" style={{ marginBottom: 12 }}>
            Ringkasan job
          </div>
          <div className="grid grid-cols-2" style={{ gap: 12 }}>
            <DetailField label="Total" value={String(jobs.length)} />
            <DetailField label="Sedang berjalan" value={String(jobs.length - selesai - batal)} />
            <DetailField label="Selesai" value={String(selesai)} />
            <DetailField label="Dibatalkan" value={String(batal)} />
          </div>
        </div>
      </div>
    </div>
  );
}
