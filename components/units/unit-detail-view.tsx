"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  MapPin,
  Pencil,
  Plus,
  PowerOff,
  RotateCcw,
  Truck,
  Wrench
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UnitStatusModal } from "@/components/units/status-modal";
import { IncidentFormModal } from "@/components/units/incident-form-modal";
import { IncidentDetailModal } from "@/components/units/incident-detail-modal";
import { useToast } from "@/components/ui/toast";
import {
  changeUnitStatusAction,
  deactivateUnitAction
} from "@/lib/actions/units";
import type {
  Incident,
  Job,
  Unit,
  UnitStatus,
  UnitStatusHistoryEntry
} from "@/lib/types";
import {
  incidentStatusLabel,
  incidentTypeLabel
} from "@/lib/types";
import { formatDateTime, formatRupiah, timeAgo } from "@/lib/utils";

interface Props {
  unit: Unit;
  jobs: Job[];
  history: UnitStatusHistoryEntry[];
  incidents: Incident[];
}

type TabKey = "aktif" | "riwayat" | "history" | "insiden";

export function UnitDetailView({ unit, jobs, history, incidents }: Props) {
  const router = useRouter();
  const toast = useToast();

  const openIncidentCount = useMemo(
    () => incidents.filter((i) => i.status !== "resolved").length,
    [incidents]
  );

  const [tab, setTab] = useState<TabKey>(
    unit.status === "bertugas" ? "aktif" : "riwayat"
  );
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
      toast.error((res as any).error ?? "Gagal menonaktifkan unit");
    }
    // redirect happens in server action
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-h1">{unit.kode_unit}</h1>
              <StatusBadge status={unit.status} size="md" />
            </div>
            <p className="text-[13px] text-text-muted mt-0.5">
              {unit.jenis_unit_nama} &middot; {unit.no_polisi}
              {unit.tahun ? ` · ${unit.tahun}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={<RotateCcw className="w-4 h-4" />}
              onClick={() => setStatusOpen(true)}
            >
              Ubah status
            </Button>
            <Link href={`/units/${unit.id}/edit`}>
              <Button
                variant="secondary"
                leftIcon={<Pencil className="w-4 h-4" />}
              >
                Edit
              </Button>
            </Link>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/70 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          <div>
            <span className="text-text-subtle uppercase text-[10px] tracking-wider mr-2">
              Driver tetap
            </span>
            {unit.default_driver_nama ? (
              <span className="text-text">
                {unit.default_driver_nama}
                {unit.default_driver_no_hp && (
                  <span className="text-text-muted">
                    {" "}
                    · {unit.default_driver_no_hp}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-text-subtle italic">Belum ditugaskan</span>
            )}
          </div>
        </div>
        {unit.catatan && (
          <p className="mt-3 text-[13px] text-text-muted">
            <span className="text-text-subtle uppercase text-[10px] tracking-wider mr-2">
              Catatan
            </span>
            {unit.catatan}
          </p>
        )}
      </Card>

      <Tabs
        value={tab}
        onChange={(k) => setTab(k as TabKey)}
        items={[
          { key: "aktif", label: "Job aktif", count: activeJob ? 1 : 0 },
          { key: "riwayat", label: "Riwayat job", count: pastJobs.length },
          { key: "history", label: "Riwayat status", count: history.length },
          {
            key: "insiden",
            label: "Insiden",
            count: openIncidentCount > 0 ? openIncidentCount : incidents.length
          }
        ]}
      />

      {tab === "aktif" && (
        <>
          {activeJob ? (
            <Card>
              <CardHeader
                title={activeJob.job_number}
                description={activeJob.customer_nama}
                action={
                  <Link href={`/jobs/${activeJob.id}`}>
                    <Button variant="ghost" size="sm">
                      Buka detail
                    </Button>
                  </Link>
                }
              />
              <div className="flex flex-col gap-2 text-[13px]">
                <div className="flex items-start gap-2">
                  <Truck className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                  <span>{activeJob.alat_diangkut}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                  <span>
                    {activeJob.asal} <span className="text-text-subtle">→</span>{" "}
                    {activeJob.tujuan}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CalendarClock className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
                  <span>ETD {formatDateTime(activeJob.etd)}</span>
                </div>
                <div className="mt-1">
                  <StatusBadge status={activeJob.status} />
                </div>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={Truck}
              title="Tidak ada job aktif"
              description="Unit ini sedang tidak menjalankan pengiriman."
            />
          )}
        </>
      )}

      {tab === "riwayat" && (
        <div className="flex flex-col gap-2">
          {pastJobs.length === 0 && (
            <EmptyState
              icon={Truck}
              title="Belum ada riwayat"
              description="Riwayat job unit ini akan muncul di sini."
            />
          )}
          {pastJobs.map((j) => (
            <Link
              key={j.id}
              href={`/jobs/${j.id}`}
              className="block bg-card rounded-lg border border-border p-3.5 hover:border-border-hover"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium text-text">
                      {j.job_number}
                    </span>
                    <StatusBadge status={j.status} />
                  </div>
                  <p className="text-[12px] text-text-muted mt-0.5">
                    {j.customer_nama} &middot; {j.alat_diangkut}
                  </p>
                </div>
                <span className="text-[11px] text-text-subtle shrink-0">
                  {formatDateTime(j.etd)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "history" && (
        <Card>
          {history.length === 0 ? (
            <EmptyState icon={RotateCcw} title="Belum ada perubahan status" />
          ) : (
            <ol className="flex flex-col gap-3">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-3 text-[13px]">
                  <span className="w-2 h-2 mt-2 rounded-full bg-brand shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p>
                      <span className="text-text-muted">
                        {h.status_old ? `${h.status_old} →` : "Inisialisasi →"}
                      </span>{" "}
                      <span className="font-medium">{h.status_new}</span>
                    </p>
                    <p className="text-[11px] text-text-muted">
                      {formatDateTime(h.changed_at)} · oleh {h.changed_by_nama}
                      {h.reason ? ` · ${h.reason}` : ""}
                    </p>
                  </div>
                  <span className="text-[10px] text-text-subtle whitespace-nowrap">
                    {timeAgo(h.changed_at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {tab === "insiden" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-text-muted">
              {openIncidentCount > 0
                ? `${openIncidentCount} insiden belum selesai`
                : "Tidak ada insiden terbuka"}
            </p>
            <Button
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIncidentFormOpen(true)}
            >
              Catat insiden
            </Button>
          </div>

          {incidents.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="Belum ada catatan insiden"
              description="Catat insiden seperti kecelakaan, kerusakan, atau breakdown untuk riwayat & klaim asuransi."
              action={
                <Button
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => setIncidentFormOpen(true)}
                >
                  Catat insiden pertama
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {incidents.map((inc) => (
                <button
                  key={inc.id}
                  type="button"
                  onClick={() => setOpenIncident(inc)}
                  className="text-left bg-card rounded-lg border border-border p-3.5 hover:border-border-hover transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-medium text-text">
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
                          <Badge variant="neutral">{inc.job_number}</Badge>
                        )}
                      </div>
                      <p className="text-[12px] text-text-muted mt-1 line-clamp-2">
                        {inc.deskripsi}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-text-muted flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="w-3 h-3" />
                          {formatDateTime(inc.tanggal)}
                        </span>
                        {inc.lokasi && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3" />
                            {inc.lokasi}
                          </span>
                        )}
                        {inc.biaya_repair !== null &&
                          inc.biaya_repair !== undefined && (
                            <span className="inline-flex items-center gap-1">
                              <Wrench className="w-3 h-3" />
                              {formatRupiah(inc.biaya_repair)}
                            </span>
                          )}
                      </div>
                    </div>
                    {inc.photos.length > 0 && (
                      <div className="shrink-0 w-12 h-12 rounded-md overflow-hidden border border-border bg-page">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={inc.photos[0].file_url}
                          alt=""
                          className="w-full h-full object-cover"
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

      {unit.is_active && (
        <Card className="border-danger/30">
          <CardHeader
            title="Zona berbahaya"
            description="Nonaktifkan unit agar tidak muncul di pemilihan job baru."
            action={
              <Button
                variant="danger"
                leftIcon={<PowerOff className="w-4 h-4" />}
                onClick={() => setDeactOpen(true)}
              >
                Nonaktifkan unit
              </Button>
            }
          />
        </Card>
      )}

      <UnitStatusModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        currentStatus={unit.status}
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
