"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Flag,
  MapPin,
  PackageCheck,
  Plus,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Fab } from "@/components/layout/fab";
import { formatDate, formatTime } from "@/lib/utils";
import type { Customer, Job, JobStatus } from "@/lib/types";

type TabKey = "aktif" | "selesai" | "cancelled";
const activeStatuses: JobStatus[] = [
  "menunggu_pickup",
  "loading",
  "dalam_perjalanan",
  "unloading"
];

interface Props {
  jobs: Job[];
  customers: Customer[];
  unitMap: Record<string, { kode_unit: string; jenis: string }>;
  driverMap: Record<string, string>;
}

function takeLastSegment(text: string): string {
  if (text.includes("—")) {
    const parts = text.split("—");
    return parts[parts.length - 1].trim();
  }
  return text.split(",")[0].trim();
}

export function JobsListView({
  jobs,
  customers,
  unitMap,
  driverMap
}: Props) {
  const [tab, setTab] = useState<TabKey>("aktif");
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState("");

  const counts = useMemo(
    () => ({
      aktif: jobs.filter((j) => activeStatuses.includes(j.status)).length,
      selesai: jobs.filter((j) => j.status === "selesai").length,
      cancelled: jobs.filter((j) => j.status === "cancelled").length
    }),
    [jobs]
  );

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (tab === "aktif" && !activeStatuses.includes(j.status)) return false;
      if (tab === "selesai" && j.status !== "selesai") return false;
      if (tab === "cancelled" && j.status !== "cancelled") return false;
      if (customerId && j.customer_id !== customerId) return false;
      if (q) {
        const t = q.toLowerCase();
        if (
          !j.job_number.toLowerCase().includes(t) &&
          !j.customer_nama.toLowerCase().includes(t) &&
          !j.alat_diangkut.toLowerCase().includes(t)
        )
          return false;
      }
      return true;
    });
  }, [jobs, tab, q, customerId]);

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <Tabs
          variant="pill"
          value={tab}
          onChange={(k) => setTab(k as TabKey)}
          items={[
            { key: "aktif", label: "Aktif", count: counts.aktif },
            { key: "selesai", label: "Selesai", count: counts.selesai },
            { key: "cancelled", label: "Dibatalkan", count: counts.cancelled }
          ]}
        />
        <div
          style={{
            display: "flex",
            gap: 8,
            flex: 1,
            justifyContent: "flex-end",
            alignItems: "center"
          }}
        >
          <div style={{ width: 280 }}>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari job, customer, alat…"
              leftIcon={<Search style={{ width: 15, height: 15 }} />}
              style={{ height: 36 }}
            />
          </div>
          <Select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            style={{ width: 200, height: 36 }}
          >
            <option value="">Semua customer</option>
            {customers
              .filter((c) => c.is_active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama_perusahaan}
                </option>
              ))}
          </Select>
          <Link href="/jobs/new" className="hidden lg:inline-flex">
            <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
              Job baru
            </Button>
          </Link>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={PackageCheck}
            title={
              tab === "aktif"
                ? "Belum ada job aktif"
                : tab === "selesai"
                  ? "Belum ada job selesai"
                  : "Belum ada job dibatalkan"
            }
            description={
              tab === "aktif"
                ? "Buat job baru untuk mulai mencatat pengiriman."
                : undefined
            }
            action={
              tab === "aktif" ? (
                <Link href="/jobs/new">
                  <Button
                    leftIcon={<Plus style={{ width: 16, height: 16 }} />}
                  >
                    Job baru
                  </Button>
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Job ID</th>
                <th>Customer &amp; Alat</th>
                <th>Rute</th>
                <th style={{ width: 130 }}>Unit / Driver</th>
                <th style={{ width: 130 }}>ETD → ETA</th>
                <th style={{ width: 150 }}>Status</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const u = unitMap[j.unit_id];
                const driverNama = driverMap[j.driver_id];
                return (
                  <tr key={j.id} className="row-link">
                    <td>
                      <Link
                        href={`/jobs/${j.id}`}
                        style={{
                          display: "block",
                          textDecoration: "none",
                          color: "inherit"
                        }}
                      >
                        <div
                          className="mono"
                          style={{ fontWeight: 600, fontSize: 12.5 }}
                        >
                          {j.job_number}
                        </div>
                        <div
                          className="caption mono"
                          style={{ fontSize: 10.5 }}
                        >
                          {formatDate(j.created_at)}
                        </div>
                      </Link>
                    </td>
                    <td>
                      <div
                        style={{
                          fontWeight: 500,
                          fontSize: 13.5,
                          marginBottom: 2
                        }}
                      >
                        {j.customer_nama}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {j.alat_diangkut}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 2,
                          color: "var(--text-secondary)"
                        }}
                      >
                        <MapPin
                          style={{
                            width: 11,
                            height: 11,
                            color: "var(--text-tertiary)"
                          }}
                        />
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 240,
                            display: "inline-block"
                          }}
                        >
                          {takeLastSegment(j.asal)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          color: "var(--brand-primary-dark)"
                        }}
                      >
                        <Flag style={{ width: 11, height: 11 }} />
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 240,
                            display: "inline-block"
                          }}
                        >
                          {takeLastSegment(j.tujuan)}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      <div style={{ fontWeight: 600 }}>{u?.kode_unit ?? "—"}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {driverNama
                          ? driverNama.split(" ").slice(0, 2).join(" ")
                          : "—"}
                      </div>
                    </td>
                    <td className="mono" style={{ fontSize: 11.5 }}>
                      <div>{formatTime(j.etd)}</div>
                      <div className="muted" style={{ fontSize: 10.5 }}>
                        → {j.eta ? formatTime(j.eta) : "—"}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={j.status} />
                    </td>
                    <td>
                      <Link
                        href={`/jobs/${j.id}`}
                        style={{
                          color: "var(--text-tertiary)",
                          display: "inline-flex"
                        }}
                      >
                        <ChevronRight style={{ width: 16, height: 16 }} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Fab href="/jobs/new" label="Job baru" />
    </div>
  );
}
