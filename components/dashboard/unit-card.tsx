"use client";

import Link from "next/link";
import { PackageCheck } from "lucide-react";
import type { Unit } from "@/lib/types";
import { StatusBadge } from "@/components/ui/badge";

interface UnitCardProps {
  unit: Unit;
  job?: {
    id: string;
    job_number: string;
    asal: string;
    tujuan: string;
  };
  driverNama?: string;
}

export function UnitCard({ unit, job }: UnitCardProps) {
  return (
    <Link
      href={`/units/${unit.id}`}
      style={{
        display: "block",
        background: "var(--bg-muted)",
        border: "0.5px solid var(--border-default)",
        borderRadius: 10,
        padding: 12,
        textDecoration: "none",
        color: "var(--text-primary)",
        transition: "all 120ms ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(0,0,0,0.25)";
        e.currentTarget.style.background = "white";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
        e.currentTarget.style.background = "var(--bg-muted)";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.005em"
            }}
          >
            {unit.kode_unit}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-tertiary)"
            }}
          >
            {unit.jenis_unit_nama} · {unit.no_polisi}
          </div>
        </div>
        <StatusBadge status={unit.status} />
      </div>
      {job ? (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginTop: 8
          }}
        >
          <PackageCheck style={{ width: 12, height: 12, flexShrink: 0 }} />
          <span
            className="mono"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {job.job_number}
          </span>
        </div>
      ) : (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-tertiary)",
            marginTop: 8
          }}
        >
          {unit.status === "perbaikan"
            ? unit.catatan || "Sedang diperbaiki"
            : "Tidak ada job aktif"}
        </div>
      )}
    </Link>
  );
}
