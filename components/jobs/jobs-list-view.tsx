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
        <div className="overflow-x-auto scrollbar-thin" style={{ maxWidth: "100%" }}>
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
        </div>
        <div className="toolbar" style={{ flex: 1, justifyContent: "flex-end" }}>
          <div style={{ flex: 1, maxWidth: 280, minWidth: 0 }}>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari job, customer, alat…"
              leftIcon={<Search style={{ width: 15, height: 15 }} />}
            />
          </div>
          <Select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            style={{ width: 200 }}
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
          <Link
            href="/orders/baru"
            className="hidden lg:inline-flex"
            title="Wizard 4 tahap: order → rute → harga → assign kendaraan"
          >
            <Button variant="secondary">Order via Wizard</Button>
          </Link>
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
        <>
          {/* Desktop: tabel */}
          <div className="card hidden lg:block">
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

          {/* Mobile: card list */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {filtered.map((j) => {
              const u = unitMap[j.unit_id];
              const driverNama = driverMap[j.driver_id];
              return (
                <Link
                  key={j.id}
                  href={`/jobs/${j.id}`}
                  className="list-card"
                >
                  <div className="list-card-row">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        className="mono"
                        style={{
                          fontWeight: 600,
                          fontSize: 12.5,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {j.job_number}
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {j.customer_nama}
                      </div>
                    </div>
                    <StatusBadge status={j.status} />
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {j.alat_diangkut}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      fontSize: 12,
                      color: "var(--text-secondary)"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <MapPin
                        style={{
                          width: 11,
                          height: 11,
                          color: "var(--text-tertiary)",
                          flexShrink: 0
                        }}
                      />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
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
                      <Flag
                        style={{
                          width: 11,
                          height: 11,
                          flexShrink: 0
                        }}
                      />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {takeLastSegment(j.tujuan)}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 11.5,
                      color: "var(--text-tertiary)",
                      paddingTop: 6,
                      borderTop: "0.5px dashed var(--border-default)"
                    }}
                  >
                    <span>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {u?.kode_unit ?? "—"}
                      </span>
                      {driverNama && (
                        <>
                          {" · "}
                          {driverNama.split(" ").slice(0, 2).join(" ")}
                        </>
                      )}
                    </span>
                    <span className="mono">
                      {formatTime(j.etd)}
                      {j.eta ? ` → ${formatTime(j.eta)}` : ""}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <Fab href="/jobs/new" label="Job baru" />
    </div>
  );
}
