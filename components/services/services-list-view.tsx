"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, Truck, Wrench } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { ServiceStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { JenisUnit, ServiceStatus, UnitWithService } from "@/lib/types";
import { deriveServiceStatus, formatKm } from "@/lib/service";

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

  const rows: EnrichedRow[] = useMemo(() => {
    return units.map((u) => {
      const d = deriveServiceStatus(u);
      return {
        unit: u,
        status: d.status,
        next_service_at_km: d.next_service_at_km,
        km_to_next_service: d.km_to_next_service,
        km_since_last_service: d.km_since_last_service,
        progress_percent: d.progress_percent
      };
    });
  }, [units]);

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
      <div>
        <h1 className="h1" style={{ fontSize: 22, marginBottom: 4 }}>
          Service Unit
        </h1>
        <p className="body-sm muted">
          Pantau jadwal servis berkala tiap unit (per 10.000 km).
        </p>
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
                <th style={{ width: 130 }}>Odometer</th>
                <th style={{ minWidth: 220 }}>Progress</th>
                <th style={{ width: 130 }}>Servis berikutnya</th>
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
                  <td className="mono" style={{ fontSize: 13 }}>
                    {formatKm(r.unit.current_odometer_km)}
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
                    {formatKm(r.next_service_at_km)}
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--text-tertiary)",
                        marginTop: 2
                      }}
                    >
                      {r.status === "overdue"
                        ? `lewat ${formatKm(Math.abs(r.km_to_next_service))}`
                        : `${formatKm(r.km_to_next_service)} lagi`}
                    </div>
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
