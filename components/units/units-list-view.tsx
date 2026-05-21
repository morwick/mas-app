"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Plus,
  Search,
  Truck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
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
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ width: 160 }}
        >
          <option value="">Semua status</option>
          <option value="standby">Standby</option>
          <option value="bertugas">Bertugas</option>
          <option value="perbaikan">Perbaikan</option>
        </Select>
        <Link href="/units/new" className="hidden lg:inline-flex">
          <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
            Tambah unit
          </Button>
        </Link>
      </div>

      <label
        className="flex items-center gap-2"
        style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}
      >
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          style={{ width: 14, height: 14, accentColor: "var(--brand-primary)" }}
        />
        Tampilkan unit nonaktif
      </label>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Tidak ada unit"
          description="Coba ubah filter atau tambah unit baru."
          action={
            <Link href="/units/new">
              <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
                Tambah unit
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Kode</th>
                <th>Jenis</th>
                <th>No. Polisi</th>
                <th style={{ width: 80 }}>Tahun</th>
                <th style={{ width: 140 }}>Status</th>
                <th>Driver default</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="row-link">
                  <td>
                    <Link
                      href={`/units/${u.id}`}
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
                      <span style={{ fontWeight: 600 }}>{u.kode_unit}</span>
                      {!u.is_active && (
                        <span
                          className="badge"
                          style={{ fontSize: 10, height: 18 }}
                        >
                          Nonaktif
                        </span>
                      )}
                    </Link>
                  </td>
                  <td>{u.jenis_unit_nama}</td>
                  <td className="mono" style={{ fontSize: 13 }}>
                    {u.no_polisi}
                  </td>
                  <td className="muted">{u.tahun ?? "—"}</td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="muted" style={{ fontSize: 12.5 }}>
                    {u.default_driver_nama ?? (
                      <span style={{ color: "var(--text-tertiary)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <Link
                      href={`/units/${u.id}`}
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

      <Fab href="/units/new" label="Tambah unit" />
    </div>
  );
}
