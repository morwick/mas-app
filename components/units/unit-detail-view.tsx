"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Download,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  PowerOff,
  RotateCcw,
  Truck,
  Wrench
} from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UnitStatusModal } from "@/components/units/status-modal";
import { IncidentFormModal } from "@/components/units/incident-form-modal";
import { IncidentDetailModal } from "@/components/units/incident-detail-modal";
import { ServiceHistoryTab } from "@/components/services/service-history-tab";
import { deriveServiceStatus } from "@/lib/service";
import { useToast } from "@/components/ui/toast";
import {
  changeUnitStatusAction,
  deactivateUnitAction
} from "@/lib/actions/units";
import type {
  Incident,
  Job,
  ServiceRecord,
  Unit,
  UnitStatus,
  UnitStatusHistoryEntry,
  UnitWithService
} from "@/lib/types";
import {
  incidentStatusLabel,
  incidentTypeLabel
} from "@/lib/types";
import { formatDateTime, formatRupiah } from "@/lib/utils";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const openIncidentCount = useMemo(
    () => incidents.filter((i) => i.status !== "resolved").length,
    [incidents]
  );

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
  const [statusOpen, setStatusOpen] = useState(false);
  const [deactOpen, setDeactOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [incidentFormOpen, setIncidentFormOpen] = useState(false);
  const [openIncident, setOpenIncident] = useState<Incident | null>(null);

  const activeJob = useMemo(
    () => jobs.find((j) => !["selesai", "cancelled"].includes(j.status)),
    [jobs]
  );
  const pastJobs = useMemo(
    () => jobs.filter((j) => ["selesai", "cancelled"].includes(j.status)),
    [jobs]
  );

  // Utilization placeholders — to be replaced with real query result later
  const utilisasi = useMemo(() => {
    const totalJobs = jobs.length;
    const completed = pastJobs.filter((j) => j.status === "selesai").length;
    const bertugas = Math.max(2, Math.round(completed * 2));
    const perbaikan = unit.status === "perbaikan" ? 5 : 1;
    const standby = Math.max(0, 30 - bertugas - perbaikan);
    return { bertugas, standby, perbaikan, totalJobs };
  }, [jobs, pastJobs, unit.status]);

  async function onChangeStatus(next: UnitStatus, reason?: string) {
    setPending(true);
    const res = await changeUnitStatusAction(unit.id, next, reason);
    setPending(false);
    setStatusOpen(false);
    if (res.ok) {
      toast.success(`Status ${unit.kode_unit} berhasil diubah`);
      router.refresh();
    } else toast.error(res.error);
  }

  async function onDeactivate() {
    setPending(true);
    const res = await deactivateUnitAction(unit.id);
    setPending(false);
    if (res && !("ok" in res ? res.ok : true)) {
      toast.error((res as { error?: string }).error ?? "Gagal menonaktifkan unit");
    }
  }

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "1.6fr 1fr" }}
    >
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
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setStatusOpen(true)}
              >
                <RotateCcw style={{ width: 14, height: 14 }} />
                Ubah status
              </button>
              <Link
                href={`/units/${unit.id}/edit`}
                className="btn btn-secondary btn-sm"
                style={{ textDecoration: "none" }}
              >
                <Pencil style={{ width: 14, height: 14 }} />
                Edit
              </Link>
            </div>
          </div>

          <div className="divider" style={{ marginBottom: 14 }} />
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}
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
                count:
                  openIncidentCount > 0 ? openIncidentCount : incidents.length
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
            {tab === "aktif" &&
              (activeJob ? (
                <div style={{ padding: 16 }}>
                  <Link
                    href={`/jobs/${activeJob.id}`}
                    style={{
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      border: "0.5px solid var(--border-default)",
                      borderRadius: 8,
                      textDecoration: "none",
                      color: "var(--text-primary)"
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4
                        }}
                      >
                        <span
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: "var(--text-tertiary)",
                            fontWeight: 500
                          }}
                        >
                          {activeJob.job_number}
                        </span>
                        <StatusBadge status={activeJob.status} />
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          lineHeight: 1.35,
                          marginBottom: 2
                        }}
                      >
                        {activeJob.alat_diangkut}
                      </div>
                      <div
                        className="caption"
                        style={{
                          fontSize: 11.5,
                          display: "flex",
                          alignItems: "center",
                          gap: 6
                        }}
                      >
                        <MapPin style={{ width: 11, height: 11 }} />
                        {activeJob.tujuan.split(",")[0]}
                      </div>
                    </div>
                    <ArrowRight
                      style={{
                        width: 16,
                        height: 16,
                        color: "var(--text-tertiary)"
                      }}
                    />
                  </Link>
                </div>
              ) : (
                <EmptyState
                  icon={PackageCheck}
                  title="Tidak ada job aktif"
                  description="Unit ini siap di-assign untuk job baru."
                />
              ))}

            {tab === "riwayat" && (
              <div>
                {pastJobs.length === 0 ? (
                  <EmptyState
                    icon={PackageCheck}
                    title="Belum ada riwayat"
                    description="Unit ini belum memiliki job yang selesai."
                  />
                ) : (
                  pastJobs.map((j) => (
                    <Link
                      key={j.id}
                      href={`/jobs/${j.id}`}
                      style={{
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        borderBottom: "0.5px solid var(--border-default)",
                        textDecoration: "none",
                        color: "var(--text-primary)"
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 4
                          }}
                        >
                          <span
                            className="mono"
                            style={{ fontSize: 11, fontWeight: 600 }}
                          >
                            {j.job_number}
                          </span>
                          <StatusBadge status={j.status} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {j.alat_diangkut}
                        </div>
                        <div className="caption" style={{ fontSize: 11 }}>
                          {j.customer_nama} ·{" "}
                          {formatDateTime(j.completed_at ?? j.etd)}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}

            {tab === "history" && (
              <div style={{ padding: 16 }}>
                {history.length === 0 ? (
                  <EmptyState
                    icon={RotateCcw}
                    title="Belum ada perubahan status"
                  />
                ) : (
                  <div
                    style={{ display: "flex", flexDirection: "column" }}
                  >
                    {history.map((h, i) => (
                      <div
                        key={h.id}
                        style={{
                          display: "flex",
                          gap: 14,
                          paddingBottom: i === history.length - 1 ? 0 : 16,
                          position: "relative"
                        }}
                      >
                        <div
                          style={{ position: "relative", flexShrink: 0 }}
                        >
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 99,
                              background:
                                h.status_new === "bertugas"
                                  ? "var(--brand-primary)"
                                  : h.status_new === "perbaikan"
                                    ? "#D89A24"
                                    : "var(--text-tertiary)",
                              marginTop: 6
                            }}
                          />
                          {i < history.length - 1 && (
                            <div
                              style={{
                                position: "absolute",
                                top: 18,
                                left: 4,
                                width: 1,
                                bottom: -16,
                                background: "var(--border-default)"
                              }}
                            />
                          )}
                        </div>
                        <div style={{ flex: 1, paddingBottom: 4 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 2
                            }}
                          >
                            <StatusBadge status={h.status_new} />
                            <span className="caption mono">
                              {formatDateTime(h.changed_at)}
                            </span>
                          </div>
                          {h.reason && (
                            <div
                              style={{
                                fontSize: 13,
                                color: "var(--text-primary)",
                                marginBottom: 2
                              }}
                            >
                              {h.reason}
                            </div>
                          )}
                          <div className="caption" style={{ fontSize: 11 }}>
                            oleh {h.changed_by_nama}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "insiden" && (
              <div style={{ padding: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12
                  }}
                >
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-secondary)"
                    }}
                  >
                    {openIncidentCount > 0
                      ? `${openIncidentCount} insiden belum selesai`
                      : "Tidak ada insiden terbuka"}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setIncidentFormOpen(true)}
                  >
                    <Plus style={{ width: 14, height: 14 }} />
                    Catat insiden
                  </button>
                </div>

                {incidents.length === 0 ? (
                  <EmptyState
                    icon={AlertTriangle}
                    title="Belum ada catatan insiden"
                    description="Catat insiden seperti kecelakaan, kerusakan, atau breakdown untuk riwayat & klaim asuransi."
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8
                    }}
                  >
                    {incidents.map((inc) => (
                      <button
                        key={inc.id}
                        type="button"
                        onClick={() => setOpenIncident(inc)}
                        style={{
                          textAlign: "left",
                          background: "white",
                          border: "0.5px solid var(--border-default)",
                          borderRadius: 8,
                          padding: 14,
                          cursor: "pointer"
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                marginBottom: 4,
                                flexWrap: "wrap"
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 14,
                                  fontWeight: 600
                                }}
                              >
                                {incidentTypeLabel[inc.tipe]}
                              </span>
                              <Badge
                                variant={
                                  inc.status === "resolved"
                                    ? "brand"
                                    : inc.status === "in_progress"
                                      ? "info"
                                      : "warning"
                                }
                              >
                                {incidentStatusLabel[inc.status]}
                              </Badge>
                              {inc.job_number && (
                                <Badge variant="neutral">
                                  {inc.job_number}
                                </Badge>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: 12.5,
                                color: "var(--text-secondary)",
                                marginBottom: 4
                              }}
                            >
                              {inc.deskripsi}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 12,
                                fontSize: 11,
                                color: "var(--text-tertiary)",
                                flexWrap: "wrap"
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4
                                }}
                              >
                                <CalendarClock
                                  style={{ width: 11, height: 11 }}
                                />
                                {formatDateTime(inc.tanggal)}
                              </span>
                              {inc.lokasi && (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4
                                  }}
                                >
                                  <MapPin
                                    style={{ width: 11, height: 11 }}
                                  />
                                  {inc.lokasi}
                                </span>
                              )}
                              {inc.biaya_repair != null && (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4
                                  }}
                                >
                                  <Wrench
                                    style={{ width: 11, height: 11 }}
                                  />
                                  {formatRupiah(inc.biaya_repair)}
                                </span>
                              )}
                            </div>
                          </div>
                          {inc.photos.length > 0 && (
                            <div
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: 6,
                                overflow: "hidden",
                                border: "0.5px solid var(--border-default)",
                                flexShrink: 0
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={inc.photos[0].file_url}
                                alt=""
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover"
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
        <div className="card card-pad">
          <div className="h3" style={{ marginBottom: 12 }}>
            Utilisasi 30 hari
          </div>
          <UtilizationDonut
            bertugas={utilisasi.bertugas}
            standby={utilisasi.standby}
            perbaikan={utilisasi.perbaikan}
          />
          <div
            className="caption"
            style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}
          >
            * Data placeholder, akan dihitung dari riwayat status
          </div>
        </div>
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
            <Link
              href="/jobs/new"
              className="btn btn-secondary"
              style={{ justifyContent: "flex-start", textDecoration: "none" }}
            >
              <PackageCheck style={{ width: 16, height: 16 }} /> Assign ke job baru
            </Link>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ justifyContent: "flex-start" }}
            >
              <Download style={{ width: 16, height: 16 }} /> Export riwayat
            </button>
            {unit.is_active && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  justifyContent: "flex-start",
                  color: "#C13838",
                  borderColor: "#F5C0C0"
                }}
                onClick={() => setDeactOpen(true)}
              >
                <PowerOff style={{ width: 16, height: 16 }} /> Nonaktifkan unit
              </button>
            )}
          </div>
        </div>
      </div>

      <UnitStatusModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        currentStatus={unit.status}
        activeJob={
          activeJob
            ? {
                id: activeJob.id,
                job_number: activeJob.job_number,
                customer_nama: activeJob.customer_nama
              }
            : null
        }
        onConfirm={onChangeStatus}
      />
      <ConfirmDialog
        open={deactOpen}
        onClose={() => setDeactOpen(false)}
        title={`Nonaktifkan unit ${unit.kode_unit}?`}
        body="Unit yang dinonaktifkan tidak akan muncul di pemilihan job baru. Data riwayat tetap tersimpan."
        confirmText="Ya, nonaktifkan"
        variant="danger"
        loading={pending}
        onConfirm={onDeactivate}
      />
      <IncidentFormModal
        open={incidentFormOpen}
        onClose={() => setIncidentFormOpen(false)}
        unitId={unit.id}
        activeJobs={jobs.filter(
          (j) => !["selesai", "cancelled"].includes(j.status)
        )}
      />
      <IncidentDetailModal
        open={openIncident !== null}
        onClose={() => setOpenIncident(null)}
        incident={openIncident}
      />
    </div>
  );
}

function DetailField({
  label,
  value,
  valueNode,
  mono,
  fullWidth
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  mono?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div style={{ gridColumn: fullWidth ? "1 / -1" : "auto" }}>
      <div
        className="eyebrow"
        style={{ marginBottom: 4, fontSize: 10.5 }}
      >
        {label}
      </div>
      {valueNode ?? (
        <div
          className={mono ? "mono" : ""}
          style={{ fontSize: 14, fontWeight: 500 }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

function UtilizationDonut({
  bertugas,
  standby,
  perbaikan
}: {
  bertugas: number;
  standby: number;
  perbaikan: number;
}) {
  const total = bertugas + standby + perbaikan;
  const pct = total > 0 ? Math.round((bertugas / total) * 100) : 0;
  const r = 48;
  const c = 2 * Math.PI * r;
  const dashB = total > 0 ? (bertugas / total) * c : 0;
  const dashP = total > 0 ? (perbaikan / total) * c : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        style={{ flexShrink: 0 }}
      >
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--bg-subtle)"
          strokeWidth="14"
        />
        <g transform="rotate(-90 60 60)">
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="var(--brand-primary)"
            strokeWidth="14"
            strokeDasharray={`${dashB} ${c}`}
          />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="var(--status-perbaikan-text)"
            strokeWidth="14"
            strokeDasharray={`${dashP} ${c}`}
            strokeDashoffset={-dashB}
          />
        </g>
        <text
          x="60"
          y="58"
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fill="var(--text-primary)"
        >
          {pct}%
        </text>
        <text
          x="60"
          y="74"
          textAnchor="middle"
          fontSize="9"
          fill="var(--text-tertiary)"
          letterSpacing="0.5"
        >
          UTILISASI
        </text>
      </svg>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1
        }}
      >
        <LegendRow
          color="var(--brand-primary)"
          label="Bertugas"
          value={`${bertugas}h`}
        />
        <LegendRow
          color="var(--bg-subtle)"
          label="Standby"
          value={`${standby}h`}
        />
        <LegendRow
          color="var(--status-perbaikan-text)"
          label="Perbaikan"
          value={`${perbaikan}h`}
        />
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  value
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          background: color,
          border: "0.5px solid var(--border-strong)"
        }}
      />
      <span style={{ flex: 1, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
