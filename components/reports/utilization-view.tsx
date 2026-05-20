"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { UtilizationRow } from "@/lib/queries/reports";
import { exportToXlsx } from "@/lib/export";
import { cn } from "@/lib/utils";
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
      ? rows.reduce((sum, r) => sum + Number(r.persentase_utilisasi), 0) / rows.length
      : 0;

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
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-h1">Utilisasi armada</h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            Periode {formatDate(rangeStart)} sampai {formatDate(rangeEnd)}.
          </p>
        </div>
        <Button
          variant="secondary"
          leftIcon={<Download className="w-4 h-4" />}
          onClick={onExport}
        >
          Export Excel
        </Button>
      </div>

      <Card>
        <CardHeader title="Filter periode" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Periode">
            <Select
              value={period}
              onChange={(e) => updateParam("period", e.target.value)}
            >
              <option value="month_now">Bulan ini</option>
              <option value="month_prev">Bulan lalu</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>
          {period === "custom" && (
            <>
              <Field label="Dari">
                <input
                  type="date"
                  defaultValue={from}
                  onBlur={(e) => updateParam("from", e.target.value)}
                  className="w-full rounded-md bg-white border border-border h-10 px-3 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/20"
                />
              </Field>
              <Field label="Sampai">
                <input
                  type="date"
                  defaultValue={to}
                  onBlur={(e) => updateParam("to", e.target.value)}
                  className="w-full rounded-md bg-white border border-border h-10 px-3 text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/20"
                />
              </Field>
            </>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-subtle">
              Rata-rata utilisasi
            </p>
            <p className="text-[28px] font-semibold text-text leading-none mt-1">
              {avg.toFixed(1)}%
            </p>
          </div>
          <p className="text-[12px] text-text-muted">
            {rows.length} unit aktif
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="text-[13px] text-text-muted">
            Belum ada data unit aktif untuk periode ini.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => {
              const pct = Number(r.persentase_utilisasi);
              const totalDays =
                Number(r.hari_bertugas) +
                Number(r.hari_standby) +
                Number(r.hari_perbaikan);
              const pctStandby = totalDays > 0 ? (Number(r.hari_standby) / totalDays) * 100 : 0;
              const pctPerbaikan = totalDays > 0 ? (Number(r.hari_perbaikan) / totalDays) * 100 : 0;
              const pctBertugas = totalDays > 0 ? (Number(r.hari_bertugas) / totalDays) * 100 : 0;
              return (
                <div key={r.unit_id} className="border border-border rounded-md p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <p className="text-[14px] font-medium">{r.kode_unit}</p>
                      <p className="text-[11px] text-text-muted">{r.jenis}</p>
                    </div>
                    <p
                      className={cn(
                        "text-[15px] font-semibold",
                        pct > 60
                          ? "text-brand-dark"
                          : pct > 30
                          ? "text-status-perbaikan-fg"
                          : "text-text-muted"
                      )}
                    >
                      {pct.toFixed(0)}%
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-page overflow-hidden flex">
                    <div className="bg-brand h-full" style={{ width: `${pctBertugas}%` }} />
                    <div
                      className="bg-status-perbaikan-fg/60 h-full"
                      style={{ width: `${pctPerbaikan}%` }}
                    />
                    <div
                      className="bg-status-standby-fg/30 h-full"
                      style={{ width: `${pctStandby}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-text-muted flex-wrap">
                    <Legend
                      color="bg-brand"
                      label={`Bertugas ${Number(r.hari_bertugas).toFixed(1)}h`}
                    />
                    <Legend
                      color="bg-status-perbaikan-fg/60"
                      label={`Perbaikan ${Number(r.hari_perbaikan).toFixed(1)}h`}
                    />
                    <Legend
                      color="bg-status-standby-fg/30"
                      label={`Standby ${Number(r.hari_standby).toFixed(1)}h`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full", color)} />
      {label}
    </span>
  );
}
