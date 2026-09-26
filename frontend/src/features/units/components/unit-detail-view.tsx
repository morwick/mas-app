import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import {
  Download,
  PackageCheck,
  Pencil,
  Truck
} from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { HapusAtauNonaktifkan } from "@/features/units/components/hapus-atau-nonaktifkan";
import {
  DetailField,
  DokumenCard,
  InsidenPanel,
  JobAktifTab,
  RiwayatJobTab,
  RiwayatStatusTab,
  UNIT_STATUS_LABEL,
  UtilisasiCard,
  hitungInsiden,
  isJobAktif,
  utilisasiSementara
} from "@/features/units/components/aset-detail-parts";
import { ServiceHistoryTab } from "@/features/services/components/service-history-tab";
import { deriveServiceStatus } from "@/lib/service";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import type {
  Incident,
  Job,
  ServiceRecord,
  Unit,
  UnitStatusHistoryEntry,
  UnitWithService
} from "@/types";

interface Props {
  unit: Unit;
  jobs: Job[];
  history: UnitStatusHistoryEntry[];
  incidents: Incident[];
  services: ServiceRecord[];
}

type TabKey = "aktif" | "riwayat" | "history" | "insiden" | "service";

export function UnitDetailView({
  unit,
  jobs,
  history,
  incidents,
  services
}: Props) {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { canManageOperational } = useAuth();

  const unitWithService: UnitWithService = useMemo(() => {
    const lastFromRecords =
      services.length > 0
        ? Math.max(...services.map((s) => s.odometer_km))
        : null;
    return { ...unit, last_service_odometer_km: lastFromRecords };
  }, [unit, services]);
  const serviceDerived = useMemo(
    () => deriveServiceStatus(unitWithService),
    [unitWithService]
  );

  const initialTab: TabKey = ((): TabKey => {
    const qp = searchParams.get("tab");
    if (qp === "service" || qp === "insiden" || qp === "history" || qp === "riwayat" || qp === "aktif") {
      return qp;
    }
    return unit.status === "bertugas" ? "aktif" : "riwayat";
  })();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const activeJob = useMemo(
    () => jobs.find((j) => !["selesai", "cancelled"].includes(j.status)),
    [jobs]
  );
  const pastJobs = useMemo(
    () => jobs.filter((j) => ["selesai", "cancelled"].includes(j.status)),
    [jobs]
  );

  const utilisasi = useMemo(() => utilisasiSementara(jobs, unit.status), [jobs, unit.status]);

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
      {/* Left column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header card */}
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
            <div style={{ display: "flex", gap: 14 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: "var(--brand-primary-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--brand-primary-dark)",
                  flexShrink: 0
                }}
              >
                <Truck style={{ width: 28, height: 28 }} />
              </div>
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 2,
                    flexWrap: "wrap"
                  }}
                >
                  <div className="h1" style={{ fontSize: 24 }}>
                    {unit.kode_unit}
                  </div>
                  <StatusBadge status={unit.status} />
                </div>
                <div className="body-sm muted">
                  {unit.jenis_unit_nama} · {unit.no_polisi}
                  {unit.tahun ? ` · ${unit.tahun}` : ""}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {canManageOperational && (
                <Link
                  to={`/units/${unit.id}/edit`}
                  className="btn btn-secondary btn-sm"
                  style={{ textDecoration: "none" }}
                >
                  <Pencil style={{ width: 14, height: 14 }} />
                  Edit
                </Link>
              )}
            </div>
          </div>

          <div className="divider" style={{ marginBottom: 14 }} />
          <div
            className="grid grid-cols-2 sm:grid-cols-3"
            style={{ gap: 16 }}
          >
            <DetailField label="Jenis unit" value={unit.jenis_unit_nama} />
            <DetailField label="No. polisi" value={unit.no_polisi} mono />
            <DetailField
              label="Tahun"
              value={unit.tahun ? String(unit.tahun) : "—"}
            />
            <DetailField
              label="Total job"
              value={`${utilisasi.totalJobs}`}
            />
            <DetailField
              label="Driver tetap"
              value={unit.default_driver_nama ?? "Belum ditugaskan"}
            />
            <DetailField
              label="Status saat ini"
              valueNode={<StatusBadge status={unit.status} />}
            />
          </div>
          {unit.catatan && (
            <>
              <div className="divider" style={{ margin: "14px 0" }} />
              <DetailField label="Catatan" value={unit.catatan} fullWidth />
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="card">
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as TabKey)}
            items={[
              { key: "aktif", label: "Job aktif", count: activeJob ? 1 : 0 },
              { key: "riwayat", label: "Riwayat job", count: pastJobs.length },
              {
                key: "history",
                label: "Riwayat status",
                count: history.length
              },
              {
                key: "insiden",
                label: "Insiden",
                count: hitungInsiden(incidents)
              },
              {
                key: "service",
                label: "Service",
                count:
                  serviceDerived.status === "overdue"
                    ? 1
                    : serviceDerived.status === "mendekati"
                      ? 1
                      : services.length
              }
            ]}
          />

          <div>
            {tab === "aktif" && <JobAktifTab activeJob={activeJob} labelAset="unit" />}
            {tab === "riwayat" && <RiwayatJobTab pastJobs={pastJobs} labelAset="unit" />}
            {tab === "history" && <RiwayatStatusTab history={history} />}
            {tab === "insiden" && (
              <InsidenPanel
                aset={{ unit_id: unit.id }}
                kode={unit.kode_unit}
                labelAset="unit"
                status={unit.status}
                incidents={incidents}
                activeJobs={jobs.filter(isJobAktif)}
              />
            )}

            {tab === "service" && (
              <ServiceHistoryTab
                unit={unitWithService}
                initialRecords={services}
              />
            )}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <DokumenCard
          kosong="Belum dicatat — isi lewat Edit unit"
          items={[
            { label: "STNK", tanggal: unit.stnk_berlaku_sampai, nomor: unit.stnk_nomor },
            { label: "KIR", tanggal: unit.kir_berlaku_sampai, nomor: unit.kir_nomor },
            { label: "Pajak", tanggal: unit.pajak_berlaku_sampai, nomor: null }
          ]}
        />
        <UtilisasiCard utilisasi={utilisasi} />
        <div className="card card-pad">
          <div className="h3" style={{ marginBottom: 4 }}>
            Aksi cepat
          </div>
          <div className="caption" style={{ marginBottom: 12 }}>
            Operasi terhadap unit ini
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            {canManageOperational && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ justifyContent: "flex-start" }}
                onClick={() => {
                  // Hanya unit Standby yang bisa dipakai job — status lain ditolak di sini
                  // supaya user tidak baru tahu setelah mengisi form job.
                  if (unit.status !== "standby") {
                    toast.error(
                      `Unit ${unit.kode_unit} tidak bisa di-assign ke job karena berstatus ${UNIT_STATUS_LABEL[unit.status]}. Hanya unit Standby yang bisa di-assign.`
                    );
                    return;
                  }
                  navigate("/jobs/new");
                }}
              >
                <PackageCheck style={{ width: 16, height: 16 }} /> Assign ke job baru
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ justifyContent: "flex-start" }}
            >
              <Download style={{ width: 16, height: 16 }} /> Export riwayat
            </button>
            {canManageOperational && (
              <HapusAtauNonaktifkan
                jenis="unit"
                id={unit.id}
                kode={unit.kode_unit}
                isActive={unit.is_active}
              />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
