"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, UserRound, Phone, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Fab } from "@/components/layout/fab";
import type { Driver } from "@/lib/types";

interface Props {
  drivers: Driver[];
}

export function DriversListView({ drivers }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");

  const counts = useMemo(
    () => ({
      all: drivers.length,
      active: drivers.filter((d) => d.is_active).length,
      inactive: drivers.filter((d) => !d.is_active).length
    }),
    [drivers]
  );

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      if (filter === "active" && !d.is_active) return false;
      if (filter === "inactive" && d.is_active) return false;
      if (q) {
        const t = q.toLowerCase();
        if (!d.nama.toLowerCase().includes(t) && !d.no_hp.includes(t))
          return false;
      }
      return true;
    });
  }, [drivers, q, filter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 hidden lg:block">Driver</h1>
          <p className="hidden lg:block text-[13px] text-text-muted mt-0.5">
            Master data driver yang dapat di-assign ke job
          </p>
        </div>
        <Link href="/drivers/new" className="hidden lg:block">
          <Button leftIcon={<Plus className="w-4 h-4" />}>Tambah driver</Button>
        </Link>
      </div>

      <Card className="flex flex-col gap-3">
        <Input
          placeholder="Cari nama atau no HP"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />
        <FilterChips
          value={filter}
          onChange={(k) => setFilter(k as typeof filter)}
          items={[
            { key: "active", label: "Aktif", count: counts.active },
            { key: "inactive", label: "Nonaktif", count: counts.inactive },
            { key: "all", label: "Semua", count: counts.all }
          ]}
        />
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Belum ada driver"
          description="Tambahkan driver pertama untuk mulai assign ke job."
          action={
            <Link href="/drivers/new">
              <Button leftIcon={<Plus className="w-4 h-4" />}>Tambah driver</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2">
          {filtered.map((d) => (
            <Link
              key={d.id}
              href={`/drivers/${d.id}/edit`}
              className="block bg-card rounded-lg border border-border p-3.5 hover:border-border-hover transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-light text-brand-dark flex items-center justify-center text-[14px] font-medium shrink-0">
                  {d.nama
                    .replace(/^(Pak|Bapak|Bu|Ibu)\s+/i, "")
                    .split(" ")
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-medium text-text">{d.nama}</p>
                    {!d.is_active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-page text-text-muted border border-border">
                        Nonaktif
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[12px] text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {d.no_hp}
                    </span>
                    {d.alamat && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <MapPin className="w-3.5 h-3.5" />
                        {d.alamat}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Fab href="/drivers/new" label="Tambah driver" />
    </div>
  );
}
