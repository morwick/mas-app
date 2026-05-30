"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Gauge, Plus, RefreshCw, Wrench } from "lucide-react";
import { ServiceStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { ServiceFormModal } from "@/components/services/service-form-modal";
import { CalibrateBaselineModal } from "@/components/services/calibrate-baseline-modal";
import {
  jenisServiceLabel,
  type ServiceRecord,
  type UnitWithService
} from "@/lib/types";
import { deriveServiceStatus, formatKm } from "@/lib/service";
import { formatDate } from "@/lib/utils";

const MILEAGE_POLL_MS = 5 * 60 * 1000;

interface Props {
  unit: UnitWithService;
  initialRecords: ServiceRecord[];
}

interface SyncResponse {
  ok?: boolean;
  km?: number;
  current_odometer_km?: number | null;
  error?: string;
}

export function ServiceHistoryTab({ unit, initialRecords }: Props) {
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [calibrateOpen, setCalibrateOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [liveOdometer, setLiveOdometer] = useState<number | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  // Polling 5 menit untuk unit ini saja (lebih hemat ketimbang batch endpoint).
  // Skip kalau unit belum punya IMEI atau bukan tab service yang aktif.
  useEffect(() => {
    if (!unit.imei_gps) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/units/${unit.id}/sync-mileage`, {
          method: "POST"
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as SyncResponse;
        if (cancelled || !body.ok) return;
        if (body.current_odometer_km != null) {
          setLiveOdometer(body.current_odometer_km);
        }
        setLastSyncAt(new Date());
      } catch {
        // diam, retry interval berikutnya
      }
    }

    tick();
    const id = setInterval(tick, MILEAGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [unit.id, unit.imei_gps]);

  const records = useMemo(
    () =>
      [...initialRecords].sort(
        (a, b) =>
          new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime()
      ),
    [initialRecords]
  );

  // Pakai odometer fresh dari polling kalau sudah ada
  const effectiveUnit: UnitWithService = useMemo(
    () =>
      liveOdometer != null
        ? { ...unit, current_odometer_km: liveOdometer }
        : unit,
    [unit, liveOdometer]
  );

  const derived = useMemo(
    () => deriveServiceStatus(effectiveUnit),
    [effectiveUnit]
  );

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/units/${unit.id}/sync-mileage`, {
        method: "POST"
      });
      const body = (await res.json().catch(() => ({}))) as SyncResponse;
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      if (body.current_odometer_km != null) {
        setLiveOdometer(body.current_odometer_km);
      }
      setLastSyncAt(new Date());
      toast.success(
        `Odometer ter-update (${formatKm(body.km ?? 0)} hari ini)`
      );
    } catch (e) {
      toast.error(
        `Gagal sync TrackSolid: ${e instanceof Error ? e.message : "unknown"}`
      );
    } finally {
      setSyncing(false);
    }
  }

  const baselineUnset = unit.odometer_baseline_km === 0 && records.length === 0;

  return (
    <div
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* Banner kalibrasi */}
      {baselineUnset && (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            padding: 12,
            border: "0.5px solid var(--border-strong)",
            borderRadius: 8,
            background: "var(--brand-primary-light)"
          }}
        >
          <AlertCircle
            style={{
              width: 18,
              height: 18,
              color: "var(--brand-primary-dark)",
              marginTop: 2,
              flexShrink: 0
            }}
          />
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
            <strong>Counter awal belum di-set.</strong> Untuk unit baru pilih
            0. Untuk unit lama, isi km yang sudah ditempuh sejak servis
            terakhir.
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setCalibrateOpen(true)}
          >
            Set counter
          </button>
        </div>
      )}

      {/* Ringkasan */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3"
        style={{ gap: 12 }}
      >
        <SummaryCell
          icon={<Gauge style={{ width: 16, height: 16 }} />}
          label="Sejak servis terakhir"
          valueNode={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap"
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {formatKm(derived.km_since_last_service)}
              </span>
              <ServiceStatusBadge status={derived.status} />
            </div>
          }
          hint={`Target servis tiap ${formatKm(effectiveUnit.service_interval_km)}`}
        />
        <SummaryCell
          label="Sisa menuju servis"
          value={
            derived.status === "overdue"
              ? `Lewat ${formatKm(Math.abs(derived.km_to_next_service))}`
              : formatKm(derived.km_to_next_service)
          }
          hint={
            derived.status === "overdue"
              ? "Segera lakukan servis"
              : derived.status === "mendekati"
                ? "Siapkan jadwal servis"
                : "Aman"
          }
        />
        <SummaryCell
          icon={<Wrench style={{ width: 16, height: 16 }} />}
          label="Servis terakhir"
          value={
            records.length > 0
              ? formatDate(records[0].tanggal)
              : "Belum pernah"
          }
          hint={
            unit.last_service_odometer_km !== null
              ? `pada odo total ${formatKm(unit.last_service_odometer_km)}`
              : undefined
          }
        />
      </div>

      {/* Progress bar */}
      <div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-tertiary)",
            marginBottom: 6,
            display: "flex",
            justifyContent: "space-between"
          }}
        >
          <span>
            {formatKm(derived.km_since_last_service)} dari{" "}
            {formatKm(effectiveUnit.service_interval_km)} interval
          </span>
          <span>{Math.round(derived.progress_percent)}%</span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 99,
            background: "var(--bg-subtle)",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              width: `${Math.min(100, derived.progress_percent)}%`,
              height: "100%",
              background:
                derived.status === "overdue"
                  ? "var(--status-cancelled-text)"
                  : derived.status === "mendekati"
                    ? "var(--status-perbaikan-text)"
                    : "var(--brand-primary)",
              transition: "width 200ms ease"
            }}
          />
        </div>
      </div>

      {/* Action bar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleSync}
            disabled={syncing || !unit.imei_gps}
            title={
              unit.imei_gps ? undefined : "Unit ini belum punya IMEI GPS"
            }
          >
            <RefreshCw
              className={syncing ? "animate-spin" : undefined}
              style={{ width: 14, height: 14 }}
            />
            {syncing ? "Sinkron…" : "Sync sekarang"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCalibrateOpen(true)}
          >
            <Gauge style={{ width: 14, height: 14 }} />
            Set counter
          </button>
          {unit.imei_gps && (
            <SyncIndicator polling={syncing} lastSyncAt={lastSyncAt} />
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setFormOpen(true)}
        >
          <Plus style={{ width: 14, height: 14 }} />
          Catat service
        </button>
      </div>

      {/* Riwayat */}
      <div>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--text-secondary)",
            marginBottom: 10
          }}
        >
          Riwayat service ({records.length})
        </div>
        {records.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="Belum ada catatan service"
            description="Catat servis pertama untuk mulai tracking interval 10.000 km."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {records.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  gap: 14,
                  paddingBottom: i === records.length - 1 ? 0 : 14,
                  position: "relative"
                }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 99,
                      background: "var(--brand-primary)",
                      marginTop: 6
                    }}
                  />
                  {i < records.length - 1 && (
                    <div
                      style={{
                        position: "absolute",
                        top: 18,
                        left: 4,
                        width: 1,
                        bottom: -14,
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
                      marginBottom: 2,
                      flexWrap: "wrap"
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {jenisServiceLabel[r.jenis]}
                    </span>
                    <span
                      className="mono"
                      style={{ fontSize: 12, color: "var(--text-tertiary)" }}
                    >
                      odo {formatKm(r.odometer_km)}
                    </span>
                  </div>
                  <div className="caption" style={{ fontSize: 11 }}>
                    {formatDate(r.tanggal)} · oleh {r.created_by_nama}
                  </div>
                  {r.catatan && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--text-secondary)",
                        marginTop: 4
                      }}
                    >
                      {r.catatan}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ServiceFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        unitId={unit.id}
        unitKode={unit.kode_unit}
        currentOdometerKm={effectiveUnit.current_odometer_km}
        serviceIntervalKm={effectiveUnit.service_interval_km}
      />
      <CalibrateBaselineModal
        open={calibrateOpen}
        onClose={() => setCalibrateOpen(false)}
        unitId={unit.id}
        unitKode={unit.kode_unit}
        currentBaselineKm={unit.odometer_baseline_km}
      />
    </div>
  );
}

function SyncIndicator({
  polling,
  lastSyncAt
}: {
  polling: boolean;
  lastSyncAt: Date | null;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  let label = "Belum sinkron";
  if (polling && !lastSyncAt) label = "Memuat…";
  else if (lastSyncAt) {
    const sec = Math.floor((Date.now() - lastSyncAt.getTime()) / 1000);
    if (sec < 60) label = "Baru saja";
    else if (sec < 3600) label = `${Math.floor(sec / 60)} mnt lalu`;
    else label = `${Math.floor(sec / 3600)} jam lalu`;
  }

  return (
    <span
      style={{
        fontSize: 11,
        color: "var(--text-tertiary)",
        display: "inline-flex",
        alignItems: "center",
        gap: 4
      }}
      title="Polling otomatis tiap 5 menit"
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 99,
          background: polling
            ? "var(--brand-primary)"
            : "var(--text-tertiary)"
        }}
      />
      {label}
    </span>
  );
}

function SummaryCell({
  icon,
  label,
  value,
  valueNode,
  hint
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div
      style={{
        padding: 12,
        border: "0.5px solid var(--border-default)",
        borderRadius: 8,
        background: "white"
      }}
    >
      <div
        className="caption"
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 6
        }}
      >
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>
        {valueNode ?? value}
      </div>
      {hint && (
        <div
          className="caption"
          style={{ fontSize: 11, marginTop: 4, color: "var(--text-tertiary)" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
