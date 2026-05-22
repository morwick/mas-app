"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

interface Props {
  unit: UnitWithService;
  initialRecords: ServiceRecord[];
}

export function ServiceHistoryTab({ unit, initialRecords }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [calibrateOpen, setCalibrateOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const records = useMemo(
    () =>
      [...initialRecords].sort(
        (a, b) =>
          new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime()
      ),
    [initialRecords]
  );

  const derived = useMemo(() => deriveServiceStatus(unit), [unit]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/units/${unit.id}/sync-mileage`, {
        method: "POST"
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        km?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast.success(
        `Odometer ter-update dari TrackSolid (${formatKm(body.km ?? 0)} hari ini)`
      );
      router.refresh();
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
            <strong>Baseline odometer belum di-set.</strong> Atur baseline
            sesuai pembacaan dashboard fisik unit supaya akumulasi km dari
            TrackSolid akurat.
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setCalibrateOpen(true)}
          >
            Atur baseline
          </button>
        </div>
      )}

      {/* Ringkasan */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12
        }}
      >
        <SummaryCell
          icon={<Gauge style={{ width: 16, height: 16 }} />}
          label="Odometer saat ini"
          value={formatKm(unit.current_odometer_km)}
          hint={
            unit.odometer_baseline_km > 0
              ? `Baseline ${formatKm(unit.odometer_baseline_km)} + akumulasi`
              : "Baseline 0 — atur dulu"
          }
        />
        <SummaryCell
          icon={<Wrench style={{ width: 16, height: 16 }} />}
          label="Servis terakhir"
          value={
            unit.last_service_odometer_km !== null
              ? formatKm(unit.last_service_odometer_km)
              : "Belum pernah"
          }
        />
        <SummaryCell
          label="Servis berikutnya"
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
                {formatKm(derived.next_service_at_km)}
              </span>
              <ServiceStatusBadge status={derived.status} />
            </div>
          }
          hint={
            derived.status === "overdue"
              ? `Lewat ${formatKm(Math.abs(derived.km_to_next_service))} dari jadwal`
              : `${formatKm(derived.km_to_next_service)} lagi`
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
            {formatKm(unit.service_interval_km)} interval
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
            {syncing ? "Sinkron…" : "Sync dari TrackSolid"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setCalibrateOpen(true)}
          >
            <Gauge style={{ width: 14, height: 14 }} />
            Atur baseline
          </button>
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
        currentOdometerKm={unit.current_odometer_km}
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
