"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Calendar,
  Download,
  Sparkles,
  Truck
} from "lucide-react";
import { Select, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { UtilizationRow } from "@/lib/queries/reports";
import { exportToXlsx } from "@/lib/export";
import { formatDate } from "@/lib/utils";

interface Props {
  rows: UtilizationRow[];
  period: "month_now" | "month_prev" | "custom";
  from?: string;
  to?: string;
  rangeStart: string;
  rangeEnd: string;
}

export function UtilizationView({
  rows,
  period,
  from,
  to,
  rangeStart,
  rangeEnd
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/reports/utilisasi?${params.toString()}`);
  }

  const avg =
    rows.length > 0
      ? rows.reduce((sum, r) => sum + Number(r.persentase_utilisasi), 0) /
        rows.length
      : 0;

  const totalBertugas = rows.reduce(
    (s, r) => s + Number(r.hari_bertugas),
    0
  );

  const best = rows.reduce<UtilizationRow | null>(
    (b, r) =>
      !b ||
      Number(r.persentase_utilisasi) > Number(b.persentase_utilisasi)
        ? r
        : b,
    null
  );

  function onExport() {
    if (rows.length === 0) {
      toast.warning("Tidak ada data untuk di-export");
      return;
    }
    exportToXlsx(
      rows.map((r) => ({
        "Kode Unit": r.kode_unit,
        Jenis: r.jenis,
        "Hari Bertugas": Number(r.hari_bertugas),
        "Hari Standby": Number(r.hari_standby),
        "Hari Perbaikan": Number(r.hari_perbaikan),
        "% Utilisasi": Number(r.persentase_utilisasi)
      })),
      `utilisasi-${formatDate(rangeStart)}-sd-${formatDate(rangeEnd)}.xlsx`,
      "Utilisasi Armada"
    );
    toast.success("File Excel berhasil di-download");
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Field>
            <Select
              value={period}
              onChange={(e) => updateParam("period", e.target.value)}
              style={{ width: 180, height: 36 }}
            >
              <option value="month_now">Bulan ini</option>
              <option value="month_prev">Bulan lalu</option>
              <option value="custom">Custom range</option>
            </Select>
          </Field>
          {period === "custom" && (
            <>
              <input
                type="date"
                defaultValue={from}
                onBlur={(e) => updateParam("from", e.target.value)}
                className="input"
                style={{ width: 160, height: 36 }}
              />
              <input
                type="date"
                defaultValue={to}
                onBlur={(e) => updateParam("to", e.target.value)}
                className="input"
                style={{ width: 160, height: 36 }}
              />
            </>
          )}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onExport}
        >
          <Download style={{ width: 14, height: 14 }} />
          Export Excel
        </button>
      </div>

      {/* KPI cards */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12
        }}
      >
        <KpiCard
          label="Periode"
          value={`${formatDate(rangeStart)} - ${formatDate(rangeEnd)}`}
          sub={`${
            Math.round(
              (new Date(rangeEnd).getTime() -
                new Date(rangeStart).getTime()) /
                86400000
            ) + 1
          } hari`}
          icon={<Calendar style={{ width: 13, height: 13 }} />}
        />
        <KpiCard
          label="Rata-rata utilisasi"
          value={`${avg.toFixed(1)}%`}
          sub={`${rows.length} unit aktif`}
          icon={<BarChart3 style={{ width: 13, height: 13 }} />}
          tone="brand"
        />
        <KpiCard
          label="Total hari bertugas"
          value={String(totalBertugas)}
          sub="Akumulasi seluruh unit"
          icon={<Truck style={{ width: 13, height: 13 }} />}
        />
        {best && (
          <KpiCard
            label="Unit terbaik"
            value={best.kode_unit}
            sub={`${Number(best.persentase_utilisasi).toFixed(0)}% utilisasi`}
            icon={<Sparkles style={{ width: 13, height: 13 }} />}
            tone="brand"
          />
        )}
      </div>

      {/* Bar chart */}
      <div className="card">
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "0.5px solid var(--border-default)"
          }}
        >
          <div className="h3">Utilisasi per unit</div>
          <div className="caption">
            Persentase hari bertugas dari total hari periode
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {rows.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-tertiary)",
                fontSize: 13
              }}
            >
              Belum ada data unit aktif untuk periode ini.
            </div>
          ) : (
            <UtilBarChart data={rows} />
          )}
        </div>
      </div>

      {/* Table */}
      {rows.length > 0 && (
        <div className="card">
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "0.5px solid var(--border-default)"
            }}
          >
            <div className="h3">Detail per unit</div>
          </div>
          <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Jenis</th>
                <th style={{ textAlign: "right" }}>Bertugas</th>
                <th style={{ textAlign: "right" }}>Standby</th>
                <th style={{ textAlign: "right" }}>Perbaikan</th>
                <th style={{ width: 240 }}>Utilisasi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const pct = Number(u.persentase_utilisasi);
                return (
                  <tr key={u.unit_id}>
                    <td style={{ fontWeight: 600 }}>{u.kode_unit}</td>
                    <td className="muted">{u.jenis}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {Number(u.hari_bertugas).toFixed(1)}h
                    </td>
                    <td
                      style={{ textAlign: "right" }}
                      className="muted"
                    >
                      {Number(u.hari_standby).toFixed(1)}h
                    </td>
                    <td
                      style={{ textAlign: "right" }}
                      className="muted"
                    >
                      {Number(u.hari_perbaikan).toFixed(1)}h
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            height: 8,
                            background: "var(--bg-subtle)",
                            borderRadius: 99,
                            overflow: "hidden"
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background:
                                pct >= 70
                                  ? "var(--brand-primary)"
                                  : pct >= 40
                                    ? "#D89A24"
                                    : "#C13838"
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            minWidth: 38,
                            textAlign: "right"
                          }}
                        >
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone?: "neutral" | "brand";
}) {
  const bg = tone === "brand" ? "var(--brand-primary-light)" : "var(--bg-subtle)";
  const col =
    tone === "brand" ? "var(--brand-primary-dark)" : "var(--text-secondary)";
  return (
    <div
      className="card card-pad"
      style={{ padding: 14 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8
        }}
      >
        <div className="eyebrow" style={{ fontSize: 10.5 }}>
          {label}
        </div>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: bg,
            color: col,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {icon}
        </div>
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          marginBottom: 2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {value}
      </div>
      <div className="caption" style={{ fontSize: 11 }}>
        {sub}
      </div>
    </div>
  );
}

function UtilBarChart({ data }: { data: UtilizationRow[] }) {
  const maxH = 160;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 12,
        height: maxH + 30,
        padding: "0 4px",
        overflowX: "auto"
      }}
    >
      {data.map((u) => {
        const pct = Number(u.persentase_utilisasi);
        const h = (pct / 100) * maxH;
        const col =
          pct >= 70
            ? "var(--brand-primary)"
            : pct >= 40
              ? "#D89A24"
              : "#C13838";
        return (
          <div
            key={u.unit_id}
            style={{
              flex: 1,
              minWidth: 40,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: "var(--text-secondary)"
              }}
            >
              {pct.toFixed(0)}%
            </div>
            <div
              style={{
                width: "100%",
                maxWidth: 36,
                height: h,
                background: col,
                borderRadius: "4px 4px 0 0",
                minHeight: 4,
                transition: "height 300ms ease"
              }}
            />
            <div
              style={{
                fontSize: 10.5,
                color: "var(--text-tertiary)",
                fontWeight: 500
              }}
            >
              {u.kode_unit}
            </div>
          </div>
        );
      })}
    </div>
  );
}
