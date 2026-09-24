import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin,
  Truck,
  ArrowRight,
  Activity,
  Clock,
  AlertTriangle
} from "lucide-react";
import { computeEta, compareEta } from "@/lib/routing/eta";
import { TrackingTabs } from "@/features/tracking/components/tracking-tabs";
import { JOB_STATUS_COLOR, JOB_STATUS_LABEL } from "@/lib/job-status";
import type { Job, JobStatus, Unit } from "@/types";
import { fleetLocations } from "@/features/tracking/api";
import { Pagination, usePagination } from "@/components/ui/pagination";

const STATUS_LABEL: Record<JobStatus, string> = JOB_STATUS_LABEL;
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = JOB_STATUS_COLOR;

const ETA_COLOR: Record<string, { bg: string; fg: string; icon: string }> = {
  ontime: {
    bg: "var(--brand-primary-light)",
    fg: "var(--brand-primary-dark)",
    icon: "var(--brand-primary)"
  },
  early: {
    bg: "var(--brand-primary-light)",
    fg: "var(--brand-primary-dark)",
    icon: "var(--brand-primary)"
  },
  warn: { bg: "#fff4e0", fg: "#8a5a00", icon: "#c97900" },
  late: { bg: "#fcebeb", fg: "#791f1f", icon: "#c93030" }
};

const POLL_INTERVAL_MS = 30_000;

interface LocationEntry {
  lat: number;
  lng: number;
  address: string | null;
  fetched_at: string;
}

interface Props {
  jobs: Job[];
  units: Unit[];
}

export function AdminTrackingListView({ jobs, units }: Props) {
  const unitsMap = useMemo(() => {
    const m = new Map<string, Unit>();
    for (const u of units) m.set(u.id, u);
    return m;
  }, [units]);
  const [locations, setLocations] = useState<
    Record<string, LocationEntry | null>
  >({});

  useEffect(() => {
    let cancelled = false;

    async function fetchOnce() {
      try {
        const data = await fleetLocations();
        if (!cancelled) setLocations(data.locations ?? {});
      } catch {
        // silent fail — coba lagi di poll berikutnya
      }
    }

    fetchOnce();
    const id = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Pre-compute ETA per job — cached oleh jobs/locations dependency
  const etaByJob = useMemo(() => {
    const map = new Map<
      string,
      { label: string; severity: "ontime" | "warn" | "late" | "early" }
    >();
    for (const job of jobs) {
      if (job.status !== "dalam_perjalanan") continue; // ETA cuma relevan saat truk jalan
      if (!job.route_polyline) continue;
      const loc = locations[job.unit_id];
      if (!loc) continue;
      const eta = computeEta({
        truckLat: loc.lat,
        truckLng: loc.lng,
        polyline: job.route_polyline,
        routeDistanceKm: job.route_distance_km ?? null,
        routeDurationMin: job.route_duration_min ?? null
      });
      if (!eta) continue;
      const planned = job.eta ? new Date(job.eta) : null;
      map.set(job.id, compareEta(eta.predicted_arrival, planned));
    }
    return map;
  }, [jobs, locations]);

  const pg = usePagination(jobs);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TrackingTabs />
      <div>
        <div className="h1" style={{ marginBottom: 4 }}>
          Pantau Job Aktif
        </div>
        <div className="caption">
          Klik salah satu untuk lihat peta rute + posisi truk real-time.
        </div>
      </div>

      {jobs.length === 0 ? (
        <div
          className="card card-pad-lg"
          style={{ textAlign: "center", padding: 48 }}
        >
          <Activity
            style={{
              width: 36,
              height: 36,
              color: "var(--text-tertiary)",
              margin: "0 auto"
            }}
          />
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
            Tidak ada job aktif saat ini.
          </div>
          <Link
            to="/jobs/new"
            className="btn btn-primary"
            style={{ marginTop: 16, textDecoration: "none" }}
          >
            Buat job baru
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12
          }}
        >
          {pg.items.map((job) => {
            const unit = unitsMap.get(job.unit_id);
            const statusColor = STATUS_COLOR[job.status] ?? {
              bg: "var(--bg-muted)",
              fg: "var(--text-secondary)"
            };
            const hasRoute =
              job.asal_lat != null &&
              job.asal_lng != null &&
              job.tujuan_lat != null &&
              job.tujuan_lng != null;
            const eta = etaByJob.get(job.id);
            return (
              <Link
                key={job.id}
                to={`/tracking/${job.id}`}
                className="card card-pad"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  transition: "transform 0.15s, box-shadow 0.15s"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        marginBottom: 2
                      }}
                    >
                      {job.job_number}
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {job.customer_nama}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      padding: "3px 7px",
                      borderRadius: 999,
                      background: statusColor.bg,
                      color: statusColor.fg,
                      whiteSpace: "nowrap",
                      fontWeight: 600
                    }}
                  >
                    {STATUS_LABEL[job.status]}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "flex-start",
                      lineHeight: 1.4
                    }}
                  >
                    <MapPin
                      style={{
                        width: 12,
                        height: 12,
                        color: "var(--brand-primary)",
                        flexShrink: 0,
                        marginTop: 2
                      }}
                    />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical"
                      }}
                    >
                      {job.asal}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "flex-start",
                      lineHeight: 1.4
                    }}
                  >
                    <ArrowRight
                      style={{
                        width: 12,
                        height: 12,
                        color: "var(--text-tertiary)",
                        flexShrink: 0,
                        marginTop: 2
                      }}
                    />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical"
                      }}
                    >
                      {job.tujuan}
                    </span>
                  </div>
                </div>

                {eta && (
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: ETA_COLOR[eta.severity].bg,
                      color: ETA_COLOR[eta.severity].fg,
                      fontSize: 11.5,
                      fontWeight: 500
                    }}
                  >
                    {eta.severity === "late" || eta.severity === "warn" ? (
                      <AlertTriangle
                        style={{
                          width: 12,
                          height: 12,
                          color: ETA_COLOR[eta.severity].icon,
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <Clock
                        style={{
                          width: 12,
                          height: 12,
                          color: ETA_COLOR[eta.severity].icon,
                          flexShrink: 0
                        }}
                      />
                    )}
                    Prediksi sampai {eta.label}
                  </div>
                )}

                <div
                  style={{
                    borderTop: "0.5px solid var(--border-default)",
                    paddingTop: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 11.5,
                    color: "var(--text-tertiary)"
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 5,
                      alignItems: "center",
                      padding: "4px 9px",
                      borderRadius: 6,
                      background: "var(--brand-primary-light)",
                      color: "var(--brand-primary-dark)",
                      fontWeight: 700,
                      fontSize: 12.5,
                      letterSpacing: 0.3,
                      border: "0.5px solid var(--brand-primary)"
                    }}
                  >
                    <Truck
                      style={{
                        width: 13,
                        height: 13,
                        color: "var(--brand-primary)"
                      }}
                    />
                    {unit?.kode_unit ?? "—"}
                  </span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {hasRoute && job.route_distance_km != null && (
                      <span>{job.route_distance_km.toFixed(0)} km</span>
                    )}
                    {unit?.imei_gps ? (
                      <span
                        style={{
                          display: "inline-flex",
                          gap: 3,
                          alignItems: "center",
                          color: "var(--brand-primary-dark)"
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: "var(--brand-primary)"
                          }}
                        />
                        GPS aktif
                      </span>
                    ) : (
                      <span>Tanpa GPS</span>
                    )}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {jobs.length > 0 && <Pagination state={pg} label="job" />}
    </div>
  );
}
