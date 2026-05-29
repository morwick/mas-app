import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  MapPin,
  Truck,
  UserRound,
  Phone,
  Clock,
  ArrowRight
} from "lucide-react";
import { TrackSolidEmbed } from "@/components/tracking/tracksolid-embed";
import { EtaCard } from "@/components/tracking/eta-card";
import { JobStepper } from "@/components/jobs/job-stepper";
import { formatDateTime } from "@/lib/utils";
import type { Job, JobStatus, Unit, Driver } from "@/lib/types";

const STATUS_LABEL: Record<JobStatus, string> = {
  menunggu_pickup: "Menunggu pickup",
  loading: "Loading",
  dalam_perjalanan: "Dalam perjalanan",
  unloading: "Unloading",
  selesai: "Selesai",
  cancelled: "Dibatalkan"
};

interface Props {
  job: Job;
  unit: Unit | null;
  driver: Driver | null;
}

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  menunggu_pickup: { bg: "var(--status-pickup-bg)", fg: "var(--status-pickup-text)" },
  loading: { bg: "#fff4e0", fg: "#8a5a00" },
  dalam_perjalanan: {
    bg: "var(--brand-primary-light)",
    fg: "var(--brand-primary-dark)"
  },
  unloading: { bg: "#efeafe", fg: "#4a2bb0" },
  selesai: { bg: "var(--brand-primary-light)", fg: "var(--brand-primary-dark)" },
  cancelled: { bg: "#fcebeb", fg: "#791f1f" }
};

export function AdminTrackingDetailView({ job, unit, driver }: Props) {
  const statusColor = STATUS_COLOR[job.status] ?? {
    bg: "var(--bg-muted)",
    fg: "var(--text-secondary)"
  };
  const hasRoute =
    job.asal_lat != null &&
    job.asal_lng != null &&
    job.tujuan_lat != null &&
    job.tujuan_lng != null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Link
            href="/tracking"
            className="btn btn-secondary"
            style={{ textDecoration: "none" }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            Daftar
          </Link>
          <div>
            <div
              className="mono"
              style={{ fontSize: 11, color: "var(--text-tertiary)" }}
            >
              {job.job_number}
            </div>
            <div className="h2" style={{ marginTop: 2 }}>
              {job.customer_nama}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              fontSize: 12,
              padding: "5px 10px",
              borderRadius: 999,
              background: statusColor.bg,
              color: statusColor.fg,
              fontWeight: 600
            }}
          >
            {STATUS_LABEL[job.status]}
          </span>
          <Link
            href={`/jobs/${job.id}`}
            className="btn btn-secondary"
            style={{ textDecoration: "none" }}
          >
            Detail job
            <ExternalLink style={{ width: 12, height: 12 }} />
          </Link>
        </div>
      </div>

      {/* Stepper */}
      <div className="card card-pad">
        <JobStepper status={job.status} />
      </div>

      {/* Map */}
      <div
        className="card"
        style={{ overflow: "hidden", borderRadius: 14 }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "0.5px solid var(--border-default)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div>
            <div className="h3" style={{ fontSize: 14, marginBottom: 2 }}>
              Lokasi real-time
            </div>
            <div className="caption" style={{ fontSize: 10.5 }}>
              TrackSolid · update tiap 30 detik
            </div>
          </div>
          {unit?.tracksolid_share_link && (
            <a
              href={unit.tracksolid_share_link}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
              style={{ textDecoration: "none", fontSize: 12 }}
            >
              <ExternalLink style={{ width: 12, height: 12 }} />
              Buka TrackSolid
            </a>
          )}
        </div>
        <TrackSolidEmbed
          jobToken={job.share_token}
          externalLink={unit?.tracksolid_share_link ?? null}
          jobStatus={job.status}
          route={
            hasRoute
              ? {
                  asal: { lat: job.asal_lat!, lng: job.asal_lng! },
                  tujuan: { lat: job.tujuan_lat!, lng: job.tujuan_lng! },
                  polyline: job.route_polyline ?? null,
                  distance_km: job.route_distance_km ?? null
                }
              : null
          }
        />
      </div>

      {/* Info grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12
        }}
      >
        {/* ETA prediction */}
        {hasRoute && job.route_polyline && (
          <EtaCard
            jobToken={job.share_token}
            polyline={job.route_polyline}
            routeDistanceKm={job.route_distance_km ?? null}
            routeDurationMin={job.route_duration_min ?? null}
            plannedEta={job.eta ?? null}
            active={job.status === "dalam_perjalanan"}
          />
        )}

        {/* Rute */}
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Rute
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <MapPin
                style={{
                  width: 14,
                  height: 14,
                  color: "var(--brand-primary)",
                  flexShrink: 0,
                  marginTop: 2
                }}
              />
              <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--text-tertiary)",
                    marginBottom: 1
                  }}
                >
                  ASAL
                </div>
                {job.asal}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <ArrowRight
                style={{
                  width: 14,
                  height: 14,
                  color: "var(--text-tertiary)",
                  flexShrink: 0,
                  marginTop: 2
                }}
              />
              <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--text-tertiary)",
                    marginBottom: 1
                  }}
                >
                  TUJUAN
                </div>
                {job.tujuan}
              </div>
            </div>
            {job.route_distance_km != null && (
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--text-secondary)",
                  paddingTop: 8,
                  borderTop: "0.5px solid var(--border-default)"
                }}
              >
                Jarak rute: <strong>{job.route_distance_km.toFixed(1)} km</strong>
              </div>
            )}
          </div>
        </div>

        {/* Unit & driver */}
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Unit &amp; driver
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {unit && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Truck
                  style={{
                    width: 14,
                    height: 14,
                    color: "var(--brand-primary)",
                    flexShrink: 0
                  }}
                />
                <div style={{ fontSize: 12.5 }}>
                  <strong>{unit.kode_unit}</strong> — {unit.jenis_unit_nama}
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      marginTop: 1
                    }}
                  >
                    {unit.no_polisi}
                    {!unit.imei_gps && " · belum punya GPS"}
                  </div>
                </div>
              </div>
            )}
            {driver && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <UserRound
                  style={{
                    width: 14,
                    height: 14,
                    color: "var(--brand-primary)",
                    flexShrink: 0
                  }}
                />
                <div style={{ fontSize: 12.5 }}>
                  {driver.nama}
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      marginTop: 1,
                      display: "flex",
                      gap: 4,
                      alignItems: "center"
                    }}
                  >
                    <Phone style={{ width: 10, height: 10 }} />
                    {driver.no_hp}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Jadwal */}
        <div className="card card-pad">
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Jadwal
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Clock
                style={{
                  width: 14,
                  height: 14,
                  color: "var(--brand-primary)",
                  flexShrink: 0,
                  marginTop: 2
                }}
              />
              <div style={{ fontSize: 12.5 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--text-tertiary)",
                    marginBottom: 1
                  }}
                >
                  ETD (PICKUP)
                </div>
                {formatDateTime(job.etd)}
              </div>
            </div>
            {job.eta && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Clock
                  style={{
                    width: 14,
                    height: 14,
                    color: "var(--text-tertiary)",
                    flexShrink: 0,
                    marginTop: 2
                  }}
                />
                <div style={{ fontSize: 12.5 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-tertiary)",
                      marginBottom: 1
                    }}
                  >
                    ETA (TIBA)
                  </div>
                  {formatDateTime(job.eta)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
