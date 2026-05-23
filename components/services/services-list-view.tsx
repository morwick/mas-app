"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, RefreshCw, Search, Truck, Wrench } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { ServiceStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { JenisUnit, ServiceStatus, UnitWithService } from "@/lib/types";
import { deriveServiceStatus, formatKm } from "@/lib/service";

const MILEAGE_POLL_MS = 5 * 60 * 1000; // 5 menit

interface Props {
  units: UnitWithService[];
  jenisUnitList: JenisUnit[];
}

interface EnrichedRow {
  unit: UnitWithService;
  status: ServiceStatus;
  next_service_at_km: number;
  km_to_next_service: number;
  km_since_last_service: number;
  progress_percent: number;
}

const STATUS_RANK: Record<ServiceStatus, number> = {
  overdue: 0,
  mendekati: 1,
  ok: 2
};

export function ServicesListView({ units, jenisUnitList }: Props) {
  const [q, setQ] = useState("");
  const [jenis, setJenis] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | ServiceStatus>("");

  // Override odometer per unit dari hasil polling client-side. Awal kosong
  // → pakai nilai dari prop. Setelah polling sukses, prefer angka fresh.
  const [liveOdometer, setLiveOdometer] = useState<Record<string, number>>({});
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchMileage() {
      setPolling(true);
      try {
        const res = await fetch("/api/units/mileage", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          odometers?: Record<string, number>;
        };
        if (!cancelled && body.odometers) {
          setLiveOdometer(body.odometers);
          setLastSyncAt(new Date());
        }
      } catch {
        // Diam saja — retry di interval berikutnya
      } finally {
        if (!cancelled) setPolling(false);
      }
    }
    fetchMileage();
    const id = setInterval(fetchMileage, MILEAGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const rows: EnrichedRow[] = useMemo(() => {
    return units.map((u) => {
      // Pakai angka odometer fresh dari polling kalau ada
      const effective: UnitWithService = {
        ...u,
        current_odometer_km: liveOdometer[u.id] ?? u.current_odometer_km
      };
      const d = deriveServiceStatus(effective);
      return {
        unit: effective,
        status: d.status,
        next_service_at_km: d.next_service_at_km,
        km_to_next_service: d.km_to_next_service,
        km_since_last_service: d.km_since_last_service,
        progress_percent: d.progress_percent
      };
    });
  }, [units, liveOdometer]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (jenis && r.unit.jenis_unit_id !== jenis) return false;
        if (statusFilter && r.status !== statusFilter) return false;
        if (term) {
          if (
            !r.unit.kode_unit.toLowerCase().includes(term) &&
            !r.unit.no_polisi.toLowerCase().includes(term)
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => {
        const s = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (s !== 0) return s;
        // Within same status: overdue terbesar dulu, mendekati paling sedikit km tersisa dulu
        return a.km_to_next_service - b.km_to_next_service;
      });
  }, [rows, q, jenis, statusFilter]);

  const counts = useMemo(() => {
    const c = { ok: 0, mendekati: 0, overdue: 0 };
    rows.forEach((r) => {
      c[r.status]++;
    });
    return c;
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
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
        <div>
          <h1 className="h1" style={{ fontSize: 22, marginBottom: 4 }}>
            Service Unit
          </h1>
          <p className="body-sm muted">
            Pantau jadwal servis berkala tiap unit (per 10.000 km).
          </p>
        </div>
        <SyncIndicator polling={polling} lastSyncAt={lastSyncAt} />
      </div>

      {/* Stat row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10
        }}
      >
        <StatCard
          label="Overdue"
          value={counts.overdue}
          status="overdue"
          onClick={() => setStatusFilter((s) => (s === "overdue" ? "" : "overdue"))}
          active={statusFilter === "overdue"}
        />
        <StatCard
          label="Mendekati"
          value={counts.mendekati}
          status="mendekati"
          onClick={() =>
            setStatusFilter((s) => (s === "mendekati" ? "" : "mendekati"))
          }
          active={statusFilter === "mendekati"}
        />
        <StatCard
          label="OK"
          value={counts.ok}
          status="ok"
          onClick={() => setStatusFilter((s) => (s === "ok" ? "" : "ok"))}
          active={statusFilter === "ok"}
        />
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center"
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari kode unit atau nomor polisi…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <Select
          value={jenis}
          onChange={(e) => setJenis(e.target.value)}
          style={{ width: 160 }}
        >
          <option value="">Semua jenis</option>
          {jenisUnitList.map((j) => (
            <option key={j.id} value={j.id}>
              {j.nama}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "" | ServiceStatus)
          }
          style={{ width: 160 }}
        >
          <option value="">Semua status</option>
          <option value="overdue">Overdue</option>
          <option value="mendekati">Mendekati</option>
          <option value="ok">OK</option>
        </Select>
      </div>

      {/* Tabel */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Tidak ada unit yang cocok"
          description="Coba ubah filter atau hapus kata kunci pencarian."
        />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Kode</th>
                <th>Jenis</th>
                <th style={{ width: 130 }}>Sejak servis</th>
                <th style={{ minWidth: 220 }}>Progress</th>
                <th style={{ width: 130 }}>Sisa menuju</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.unit.id} className="row-link">
                  <td>
                    <Link
                      href={`/units/${r.unit.id}?tab=service`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        textDecoration: "none",
                        color: "inherit"
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          background: "var(--bg-subtle)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--text-secondary)"
                        }}
                      >
                        <Truck style={{ width: 14, height: 14 }} />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 1
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {r.unit.kode_unit}
                        </span>
                        <span
                          className="mono"
                          style={{
                            fontSize: 11,
                            color: "var(--text-tertiary)"
                          }}
                        >
                          {r.unit.no_polisi}
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td>{r.unit.jenis_unit_nama}</td>
                  <td className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                    {formatKm(r.km_since_last_service)}
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--text-tertiary)",
                        marginTop: 2,
                        fontWeight: 400
                      }}
                    >
                      target {formatKm(r.unit.service_interval_km)}
                    </div>
                  </td>
                  <td>
                    <ProgressCell
                      percent={r.progress_percent}
                      status={r.status}
                      sinceLast={r.km_since_last_service}
                      interval={r.unit.service_interval_km}
                    />
                  </td>
                  <td className="mono" style={{ fontSize: 12.5 }}>
                    {r.status === "overdue"
                      ? `Lewat ${formatKm(Math.abs(r.km_to_next_service))}`
                      : formatKm(r.km_to_next_service)}
                  </td>
                  <td>
                    <ServiceStatusBadge status={r.status} />
                  </td>
                  <td>
                    <Link
                      href={`/units/${r.unit.id}?tab=service`}
                      style={{
                        color: "var(--text-tertiary)",
                        display: "inline-flex"
                      }}
                    >
                      <ChevronRight style={{ width: 16, height: 16 }} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  status,
  onClick,
  active
}: {
  label: string;
  value: number;
  status: ServiceStatus;
  onClick: () => void;
  active: boolean;
}) {
  const color =
    status === "overdue"
      ? "var(--status-cancelled-text)"
      : status === "mendekati"
        ? "var(--status-perbaikan-text)"
        : "var(--brand-primary)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: 14,
        borderRadius: 10,
        border: `0.5px solid ${active ? color : "var(--border-default)"}`,
        background: active ? "var(--brand-primary-light)" : "white",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4
      }}
    >
      <span
        className="caption"
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "var(--text-tertiary)"
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 700, color }}>{value}</span>
    </button>
  );
}

function SyncIndicator({
  polling,
  lastSyncAt
}: {
  polling: boolean;
  lastSyncAt: Date | null;
}) {
  // Update label "X detik/menit lalu" tiap 30s tanpa re-fetch
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  let label = "Belum sinkron";
  if (polling && !lastSyncAt) label = "Memuat data…";
  else if (lastSyncAt) {
    const sec = Math.floor((Date.now() - lastSyncAt.getTime()) / 1000);
    if (sec < 60) label = "Baru saja";
    else if (sec < 3600) label = `${Math.floor(sec / 60)} menit lalu`;
    else label = `${Math.floor(sec / 3600)} jam lalu`;
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        color: "var(--text-tertiary)",
        padding: "6px 10px",
        border: "0.5px solid var(--border-default)",
        borderRadius: 99,
        background: "white"
      }}
      title={
        lastSyncAt
          ? `Polling otomatis tiap 5 menit. Terakhir: ${lastSyncAt.toLocaleTimeString("id-ID")}`
          : "Polling otomatis tiap 5 menit"
      }
    >
      <RefreshCw
        className={polling ? "animate-spin" : undefined}
        style={{
          width: 12,
          height: 12,
          color: polling
            ? "var(--brand-primary)"
            : "var(--text-tertiary)"
        }}
      />
      Sinkron: {label}
    </div>
  );
}

function ProgressCell({
  percent,
  status,
  sinceLast,
  interval
}: {
  percent: number;
  status: ServiceStatus;
  sinceLast: number;
  interval: number;
}) {
  const barColor =
    status === "overdue"
      ? "var(--status-cancelled-text)"
      : status === "mendekati"
        ? "var(--status-perbaikan-text)"
        : "var(--brand-primary)";
  return (
    <div style={{ minWidth: 180 }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          marginBottom: 4
        }}
      >
        {formatKm(sinceLast)} / {formatKm(interval)}
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 99,
          background: "var(--bg-subtle)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: `${Math.min(100, percent)}%`,
            height: "100%",
            background: barColor
          }}
        />
      </div>
    </div>
  );
}
