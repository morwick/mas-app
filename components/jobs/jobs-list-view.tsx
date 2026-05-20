"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  PackageCheck,
  MapPin,
  Truck,
  User,
  CalendarClock
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Fab } from "@/components/layout/fab";
import { formatDateTime } from "@/lib/utils";
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

export function JobsListView({ jobs, customers, unitMap, driverMap }: Props) {
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
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 hidden lg:block">Job</h1>
          <p className="hidden lg:block text-[13px] text-text-muted mt-0.5">
            Pengiriman aktif dan riwayat
          </p>
        </div>
        <Link href="/jobs/new" className="hidden lg:block">
          <Button leftIcon={<Plus className="w-4 h-4" />}>Job baru</Button>
        </Link>
      </div>

      <Tabs
        value={tab}
        onChange={(k) => setTab(k as TabKey)}
        items={[
          { key: "aktif", label: "Aktif", count: counts.aktif },
          { key: "selesai", label: "Selesai", count: counts.selesai },
          { key: "cancelled", label: "Dibatalkan", count: counts.cancelled }
        ]}
      />

      <Card className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Cari nomor job, customer, atau alat"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Semua customer</option>
            {customers
              .filter((c) => c.is_active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama_perusahaan}
                </option>
              ))}
          </Select>
        </div>
      </Card>

      {filtered.length === 0 ? (
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
            tab === "aktif" && (
              <Link href="/jobs/new">
                <Button leftIcon={<Plus className="w-4 h-4" />}>Job baru</Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((j) => {
            const u = unitMap[j.unit_id];
            const driverNama = driverMap[j.driver_id];
            return (
              <Link
                key={j.id}
                href={`/jobs/${j.id}`}
                className="block bg-card rounded-lg border border-border p-3.5 hover:border-border-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-text">
                        {j.job_number}
                      </span>
                      <StatusBadge status={j.status} />
                    </div>
                    <p className="text-[13px] text-text mt-0.5 truncate">
                      {j.customer_nama}
                    </p>
                  </div>
                  <span className="text-[11px] text-text-subtle shrink-0">
                    {formatDateTime(j.etd)}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-[12px] text-text-muted">
                  <p className="inline-flex items-start gap-1.5">
                    <Truck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span className="truncate">{j.alat_diangkut}</span>
                  </p>
                  <p className="inline-flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span className="truncate">
                      {j.asal} <span className="text-text-subtle">→</span> {j.tujuan}
                    </span>
                  </p>
                  <p className="inline-flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {driverNama}
                      {u && (
                        <>
                          {" "}
                          <span className="text-text-subtle">·</span> {u.kode_unit}
                        </>
                      )}
                    </span>
                  </p>
                  {j.eta && (
                    <p className="inline-flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                      <span>ETA {formatDateTime(j.eta)}</span>
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Fab href="/jobs/new" label="Job baru" />
    </div>
  );
}
