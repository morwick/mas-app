"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Building2, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Fab } from "@/components/layout/fab";
import type { Customer } from "@/lib/types";

interface Props {
  customers: Customer[];
  jobCounts: Record<string, number>;
}

export function CustomersListView({ customers, jobCounts }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");

  const counts = useMemo(
    () => ({
      all: customers.length,
      active: customers.filter((c) => c.is_active).length,
      inactive: customers.filter((c) => !c.is_active).length
    }),
    [customers]
  );

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (filter === "active" && !c.is_active) return false;
      if (filter === "inactive" && c.is_active) return false;
      if (q && !c.nama_perusahaan.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [customers, q, filter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 hidden lg:block">Customer</h1>
          <p className="hidden lg:block text-[13px] text-text-muted mt-0.5">
            Master data perusahaan customer
          </p>
        </div>
        <Link href="/customers/new" className="hidden lg:block">
          <Button leftIcon={<Plus className="w-4 h-4" />}>Tambah customer</Button>
        </Link>
      </div>

      <Card className="flex flex-col gap-3">
        <Input
          placeholder="Cari nama perusahaan"
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
          icon={Building2}
          title="Belum ada customer"
          description="Tambahkan customer pertama Anda."
          action={
            <Link href="/customers/new">
              <Button leftIcon={<Plus className="w-4 h-4" />}>Tambah customer</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}/edit`}
              className="block bg-card rounded-lg border border-border p-3.5 hover:border-border-hover"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-md bg-brand-light text-brand-dark flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-medium text-text truncate">
                      {c.nama_perusahaan}
                    </p>
                    {!c.is_active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-page text-text-muted border border-border">
                        Nonaktif
                      </span>
                    )}
                  </div>
                  {c.alamat && (
                    <p className="text-[12px] text-text-muted mt-0.5 inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{c.alamat}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-text-subtle mt-1.5">
                    {jobCounts[c.id] ?? 0} job tercatat
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Fab href="/customers/new" label="Tambah customer" />
    </div>
  );
}
