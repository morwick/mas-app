"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CircleDot, CheckCircle2, Wrench, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/ui/filter-chips";
import { StatCard } from "@/components/dashboard/stat-card";
import { UnitCard } from "@/components/dashboard/unit-card";
import { Fab } from "@/components/layout/fab";
import type { Unit } from "@/lib/types";

type Filter = "all" | "standby" | "bertugas" | "perbaikan";

interface ActiveJobSummary {
  unitId: string;
  job: {
    id: string;
    job_number: string;
    asal: string;
    tujuan: string;
    driver_nama: string;
  };
}

interface Props {
  units: Unit[];
  counts: { standby: number; bertugas: number; perbaikan: number };
  activeJobs: ActiveJobSummary[];
}

export function DashboardView({ units, counts, activeJobs }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return units;
    return units.filter((u) => u.status === filter);
  }, [units, filter]);

  const jobByUnit = useMemo(
    () => new Map(activeJobs.map((a) => [a.unitId, a.job])),
    [activeJobs]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="hidden lg:flex items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">Dashboard</h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            Ringkasan status armada hari ini
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/jobs">
            <Button variant="secondary" rightIcon={<ArrowRight className="w-4 h-4" />}>
              Semua job
            </Button>
          </Link>
          <Link href="/jobs/new">
            <Button leftIcon={<Plus className="w-4 h-4" />}>Job baru</Button>
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <StatCard
          label="Standby"
          value={counts.standby}
          icon={CircleDot}
          tone="standby"
          active={filter === "standby"}
          onClick={() => setFilter(filter === "standby" ? "all" : "standby")}
        />
        <StatCard
          label="Bertugas"
          value={counts.bertugas}
          icon={CheckCircle2}
          tone="bertugas"
          active={filter === "bertugas"}
          onClick={() => setFilter(filter === "bertugas" ? "all" : "bertugas")}
        />
        <StatCard
          label="Perbaikan"
          value={counts.perbaikan}
          icon={Wrench}
          tone="perbaikan"
          active={filter === "perbaikan"}
          onClick={() => setFilter(filter === "perbaikan" ? "all" : "perbaikan")}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h2">Status armada</h2>
          <span className="text-[12px] text-text-muted">
            {filtered.length} dari {units.length} unit
          </span>
        </div>
        <FilterChips
          value={filter}
          onChange={(k) => setFilter(k as Filter)}
          items={[
            { key: "all", label: "Semua", count: units.length },
            { key: "standby", label: "Standby", count: counts.standby },
            { key: "bertugas", label: "Bertugas", count: counts.bertugas },
            { key: "perbaikan", label: "Perbaikan", count: counts.perbaikan }
          ]}
        />
        <div className="grid gap-2.5 sm:gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((u) => {
            const job = jobByUnit.get(u.id);
            return (
              <UnitCard
                key={u.id}
                unit={u}
                job={
                  job
                    ? {
                        id: job.id,
                        job_number: job.job_number,
                        asal: job.asal,
                        tujuan: job.tujuan
                      }
                    : undefined
                }
                driverNama={job?.driver_nama}
              />
            );
          })}
        </div>
      </section>

      <Fab href="/jobs/new" label="Job baru" />
    </div>
  );
}
