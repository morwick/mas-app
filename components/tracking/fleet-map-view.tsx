"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, RefreshCw, Search, Truck, WifiOff, X } from "lucide-react";
import { TrackingTabs } from "./tracking-tabs";
import { MapFullscreenButton } from "./map-fullscreen-button";
import type { Job, Unit, UnitStatus } from "@/lib/types";

const FleetMap = dynamic(
  () => import("./fleet-map").then((m) => m.FleetMap),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#e8f1de",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-tertiary)",
          fontSize: 12
        }}
      >
        Memuat peta…
      </div>
    )
  }
);

interface Props {
  units: Unit[];
  activeJobs: Job[];
}

interface LocationEntry {
  lat: number;
  lng: number;
  address: string | null;
  fetchedAt: string;
}

const POLL_MS = 30_000;

const STATUS_COLOR: Record<UnitStatus, { bg: string; fg: string; dot: string }> = {
  standby: {
    bg: "var(--brand-primary-light)",
    fg: "var(--brand-primary-dark)",
    dot: "#1C9600"
  },
  bertugas: { bg: "#fff4e0", fg: "#8a5a00", dot: "#E48F00" },
  perbaikan: { bg: "#f0f1f3", fg: "#374151", dot: "#6B7280" }
};

const STATUS_LABEL: Record<UnitStatus, string> = {
  standby: "Standby",
  bertugas: "Bertugas",
  perbaikan: "Perbaikan"
};

type StatusFilter = "" | UnitStatus;

export function FleetMapView({ units, activeJobs }: Props) {
  // unit_id → job aktif (kalau ada). Dipakai untuk popup quick-link dan
  // render polyline rute saat user fokus ke unit yang sedang bertugas.
  const jobsByUnit = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of activeJobs) m.set(j.unit_id, j);
    return m;
  }, [activeJobs]);

  const [locations, setLocations] = useState<
    Record<string, LocationEntry | null>
  >({});
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [focusUnitId, setFocusUnitId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("");
  const [query, setQuery] = useState("");

  const activeUnits = useMemo(
    () => units.filter((u) => u.is_active),
    [units]
  );

  async function fetchLocations() {
    try {
      setRefreshing(true);
      const res = await fetch("/api/units/locations", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        locations: Record<string, LocationEntry | null>;
      };
      setLocations(data.locations ?? {});
      setLoaded(true);
    } catch {
      // diam — auto retry di poll berikutnya
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      await fetchLocations();
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const counts = useMemo(() => {
    let standby = 0;
    let bertugas = 0;
    let perbaikan = 0;
    let gpsActive = 0;
    for (const u of activeUnits) {
      if (u.status === "standby") standby++;
      else if (u.status === "bertugas") bertugas++;
      else if (u.status === "perbaikan") perbaikan++;
      if (u.imei_gps && locations[u.id]) gpsActive++;
    }
    return { standby, bertugas, perbaikan, gpsActive, total: activeUnits.length };
  }, [activeUnits, locations]);

  const filteredUnits = useMemo(() => {
    const term = query.trim().toLowerCase();
    return activeUnits.filter((u) => {
      if (filter && u.status !== filter) return false;
      if (term) {
        const haystack = `${u.kode_unit} ${u.no_polisi} ${u.jenis_unit_nama}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [activeUnits, filter, query]);

  const mapUnits = useMemo(
    () =>
      filteredUnits
        .filter((u) => locations[u.id])
        .map((u) => {
          const job = jobsByUnit.get(u.id);
          const hasRoute =
            job &&
            job.asal_lat != null &&
            job.asal_lng != null &&
            job.tujuan_lat != null &&
            job.tujuan_lng != null;
          return {
            id: u.id,
            kode_unit: u.kode_unit,
            jenis_unit_nama: u.jenis_unit_nama,
            status: u.status,
            lat: locations[u.id]!.lat,
            lng: locations[u.id]!.lng,
            address: locations[u.id]!.address,
            job: job
              ? {
                  id: job.id,
                  number: job.job_number,
                  customer_nama: job.customer_nama,
                  tujuan: job.tujuan,
                  route: hasRoute
                    ? {
                        asal: { lat: job.asal_lat!, lng: job.asal_lng! },
                        tujuan: { lat: job.tujuan_lat!, lng: job.tujuan_lng! },
                        polyline: job.route_polyline ?? null
                      }
                    : null
                }
              : null
          };
        }),
    [filteredUnits, locations, jobsByUnit]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TrackingTabs />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <div>
          <div className="h1" style={{ marginBottom: 4 }}>
            Peta Armada
          </div>
          <div className="caption">
            Posisi GPS semua unit aktif. Klik unit di kanan untuk fokus di peta.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={fetchLocations}
          disabled={refreshing}
          style={{ fontSize: 12 }}
        >
          <RefreshCw
            style={{
              width: 13,
              height: 13,
              animation: refreshing ? "spin 0.8s linear infinite" : undefined
            }}
          />
          {refreshing ? "Memuat…" : "Refresh"}
        </button>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10
        }}
      >
        <StatCard
          label="Standby"
          value={counts.standby}
          color={STATUS_COLOR.standby.dot}
          active={filter === "standby"}
          onClick={() => setFilter(filter === "standby" ? "" : "standby")}
        />
        <StatCard
          label="Bertugas"
          value={counts.bertugas}
          color={STATUS_COLOR.bertugas.dot}
          active={filter === "bertugas"}
          onClick={() => setFilter(filter === "bertugas" ? "" : "bertugas")}
        />
        <StatCard
          label="Perbaikan"
          value={counts.perbaikan}
          color={STATUS_COLOR.perbaikan.dot}
          active={filter === "perbaikan"}
          onClick={() => setFilter(filter === "perbaikan" ? "" : "perbaikan")}
        />
        <StatCard
          label="GPS Aktif"
          value={`${counts.gpsActive} / ${counts.total}`}
          color="#3B5773"
        />
      </div>

      {/* Map + side panel */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          gap: 12,
          alignItems: "stretch",
          height: "calc(100vh - 280px)",
          minHeight: 420
        }}
        className="fleet-grid"
      >
        <MapFullscreenButton>
          <div
            className="card"
            style={{
              height: "100%",
              overflow: "hidden",
              position: "relative"
            }}
          >
            <FleetMap
              units={mapUnits}
              focusUnitId={focusUnitId}
              onUnitClick={(id) => setFocusUnitId(id)}
            />
          </div>
        </MapFullscreenButton>
        <div
          className="card card-pad"
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline"
            }}
          >
            <div className="h3">Daftar unit</div>
            <div className="caption" style={{ fontSize: 11 }}>
              {filteredUnits.length} unit
            </div>
          </div>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center"
            }}
          >
            <Search
              style={{
                position: "absolute",
                left: 9,
                width: 13,
                height: 13,
                color: "var(--text-tertiary)",
                pointerEvents: "none"
              }}
            />
            <input
              type="text"
              placeholder="Cari kode, plat, atau jenis"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 28px 7px 28px",
                border: "0.5px solid var(--border-default)",
                borderRadius: 8,
                fontSize: 12.5,
                background: "white"
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                title="Bersihkan"
                style={{
                  position: "absolute",
                  right: 6,
                  width: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  color: "var(--text-tertiary)"
                }}
              >
                <X style={{ width: 13, height: 13 }} />
              </button>
            )}
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              margin: "0 -4px",
              padding: "0 4px"
            }}
          >
            {filteredUnits.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  textAlign: "center"
                }}
              >
                {query
                  ? `Tidak ada unit cocok dengan "${query}".`
                  : "Tidak ada unit di filter ini."}
              </div>
            ) : (
              filteredUnits.map((u) => {
                const loc = locations[u.id];
                const hasGps = !!u.imei_gps;
                const status = STATUS_COLOR[u.status];
                const isFocus = focusUnitId === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={!loc}
                    onClick={() => {
                      if (loc) setFocusUnitId(u.id);
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      padding: "8px 10px",
                      border: isFocus
                        ? "1px solid var(--brand-primary)"
                        : "0.5px solid var(--border-default)",
                      borderRadius: 8,
                      background: isFocus
                        ? "var(--brand-primary-light)"
                        : "white",
                      textAlign: "left",
                      cursor: loc ? "pointer" : "not-allowed",
                      opacity: loc ? 1 : 0.6,
                      transition: "background 0.15s, border-color 0.15s"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          minWidth: 0
                        }}
                      >
                        <Truck
                          style={{
                            width: 13,
                            height: 13,
                            color: status.dot,
                            flexShrink: 0
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: "var(--text-primary)"
                          }}
                        >
                          {u.kode_unit}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-tertiary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {u.jenis_unit_nama}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 8,
                          background: status.bg,
                          color: status.fg,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          flexShrink: 0
                        }}
                      >
                        {STATUS_LABEL[u.status]}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10.5,
                        color: "var(--text-tertiary)"
                      }}
                    >
                      {loc ? (
                        <>
                          <MapPin
                            style={{ width: 10, height: 10, flexShrink: 0 }}
                          />
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {loc.address ??
                              `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}
                          </span>
                        </>
                      ) : (
                        <>
                          <WifiOff
                            style={{ width: 10, height: 10, flexShrink: 0 }}
                          />
                          <span>
                            {hasGps ? "GPS belum melaporkan" : "Tanpa GPS"}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          {!loaded && (
            <div
              className="caption"
              style={{ fontSize: 10.5, textAlign: "center" }}
            >
              Memuat lokasi…
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.fleet-grid) {
            grid-template-columns: 1fr !important;
            height: auto !important;
          }
          :global(.fleet-grid > *) {
            height: 50vh !important;
            min-height: 320px !important;
          }
        }
      `}</style>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  active,
  onClick
}: {
  label: string;
  value: number | string;
  color: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "10px 12px",
        border: active
          ? `1px solid ${color}`
          : "0.5px solid var(--border-default)",
        borderRadius: 8,
        background: active ? `${color}15` : "white",
        textAlign: "left",
        cursor: clickable ? "pointer" : "default",
        transition: "background 0.15s, border-color 0.15s"
      }}
      title={clickable ? "Klik untuk filter" : undefined}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--text-tertiary)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.3
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: color,
            flexShrink: 0
          }}
        />
        {label}
      </div>
      <div
        style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}
      >
        {value}
      </div>
    </button>
  );
}
