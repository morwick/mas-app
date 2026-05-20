"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Fab } from "@/components/layout/fab";
import type { JenisUnit, Unit } from "@/lib/types";

interface Props {
  units: Unit[];
  jenisUnitList: JenisUnit[];
}

export function UnitsListView({ units, jenisUnitList }: Props) {
  const [q, setQ] = useState("");
  const [jenis, setJenis] = useState("");
  const [status, setStatus] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    return units.filter((u) => {
      if (!showInactive && !u.is_active) return false;
      if (jenis && u.jenis_unit_id !== jenis) return false;
      if (status && u.status !== status) return false;
      if (q) {
        const term = q.toLowerCase();
        if (
          !u.kode_unit.toLowerCase().includes(term) &&
          !u.no_polisi.toLowerCase().includes(term)
        )
          return false;
      }
      return true;
    });
  }, [units, q, jenis, status, showInactive]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 hidden lg:block">Unit</h1>
          <p className="hidden lg:block text-[13px] text-text-muted mt-0.5">
            Master data armada, status, dan riwayat
          </p>
        </div>
        <Link href="/units/new" className="hidden lg:block">
          <Button leftIcon={<Plus className="w-4 h-4" />}>Tambah unit</Button>
        </Link>
      </div>

      <Card padded={false} className="p-3 lg:p-4 flex flex-col gap-3">
        <Input
          placeholder="Cari kode unit atau no polisi"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />
        <div className="grid grid-cols-2 gap-2">
          <Select value={jenis} onChange={(e) => setJenis(e.target.value)}>
            <option value="">Semua jenis</option>
            {jenisUnitList.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nama}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua status</option>
            <option value="standby">Standby</option>
            <option value="bertugas">Bertugas</option>
            <option value="perbaikan">Perbaikan</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-text-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="w-4 h-4 accent-brand"
          />
          Tampilkan unit nonaktif
        </label>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Tidak ada unit"
          description="Coba ubah filter atau tambah unit baru."
          action={
            <Link href="/units/new">
              <Button leftIcon={<Plus className="w-4 h-4" />}>Tambah unit</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((u) => (
            <Link
              key={u.id}
              href={`/units/${u.id}`}
              className="bg-card rounded-lg border border-border p-3.5 hover:border-border-hover transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[15px] font-semibold text-text">
                      {u.kode_unit}
                    </p>
                    <StatusBadge status={u.status} />
                    {!u.is_active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-page text-text-muted border border-border">
                        Nonaktif
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-text-muted mt-0.5">
                    {u.jenis_unit_nama} &middot; {u.no_polisi}
                    {u.tahun ? ` · ${u.tahun}` : ""}
                  </p>
                </div>
              </div>
              <p className="text-[12px] mt-2">
                {u.default_driver_nama ? (
                  <>
                    <span className="text-text-subtle uppercase text-[10px] tracking-wider mr-1.5">
                      Driver
                    </span>
                    <span className="text-text">{u.default_driver_nama}</span>
                  </>
                ) : (
                  <span className="text-text-subtle italic">Driver belum ditugaskan</span>
                )}
              </p>
              {u.catatan && (
                <p className="text-[12px] text-text-muted mt-2 line-clamp-2">
                  {u.catatan}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      <Fab href="/units/new" label="Tambah unit" />
    </div>
  );
}
