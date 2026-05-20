"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { exportToXlsx } from "@/lib/export";
import { formatDateTime } from "@/lib/utils";
import type { Customer, Job } from "@/lib/types";

interface Props {
  jobs: Job[];
  customers: Customer[];
  unitMap: Record<string, { kode_unit: string; jenis: string }>;
  driverMap: Record<string, string>;
  customerId: string;
  period: string;
}

export function CustomerReportView({
  jobs,
  customers,
  unitMap,
  driverMap,
  customerId,
  period
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/reports/customers?${params.toString()}`);
  }

  function onExport() {
    if (jobs.length === 0) {
      toast.warning("Tidak ada data untuk di-export");
      return;
    }
    exportToXlsx(
      jobs.map((j) => ({
        "Job Number": j.job_number,
        Customer: j.customer_nama,
        Tanggal: formatDateTime(j.etd),
        Alat: j.alat_diangkut,
        "Kode Unit": unitMap[j.unit_id]?.kode_unit ?? "-",
        Jenis: unitMap[j.unit_id]?.jenis ?? "-",
        Driver: driverMap[j.driver_id] ?? "-",
        Asal: j.asal,
        Tujuan: j.tujuan,
        Status: j.status
      })),
      `riwayat-customer-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Riwayat Customer"
    );
    toast.success("File Excel berhasil di-download");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-h1">Riwayat customer</h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            Riwayat pengiriman per customer untuk evaluasi kerjasama.
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
        <CardHeader title="Filter" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer">
            <Select
              value={customerId}
              onChange={(e) => updateParam("customer", e.target.value)}
            >
              <option value="">Semua customer</option>
              {customers
                .filter((c) => c.is_active || c.id === customerId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama_perusahaan}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Periode">
            <Select
              value={period}
              onChange={(e) => updateParam("period", e.target.value)}
            >
              <option value="all">Semua waktu</option>
              <option value="month_now">Bulan ini</option>
              <option value="month_prev">Bulan lalu</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`${jobs.length} job`}
          description={
            customerId
              ? customers.find((c) => c.id === customerId)?.nama_perusahaan
              : "Semua customer"
          }
        />
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wider text-text-subtle border-b border-border">
              <tr>
                <th className="py-2 pr-3 font-medium">Tanggal</th>
                <th className="py-2 pr-3 font-medium">Job</th>
                <th className="py-2 pr-3 font-medium">Customer</th>
                <th className="py-2 pr-3 font-medium">Alat</th>
                <th className="py-2 pr-3 font-medium">Unit</th>
                <th className="py-2 pr-3 font-medium">Driver</th>
                <th className="py-2 pr-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr
                  key={j.id}
                  className="border-b border-border last:border-0 align-top"
                >
                  <td className="py-3 pr-3 text-text-muted whitespace-nowrap">
                    {formatDateTime(j.etd)}
                  </td>
                  <td className="py-3 pr-3 font-medium">{j.job_number}</td>
                  <td className="py-3 pr-3">{j.customer_nama}</td>
                  <td className="py-3 pr-3">{j.alat_diangkut}</td>
                  <td className="py-3 pr-3">
                    {unitMap[j.unit_id]?.kode_unit ?? "-"}{" "}
                    <span className="text-text-muted">
                      ({unitMap[j.unit_id]?.jenis ?? "-"})
                    </span>
                  </td>
                  <td className="py-3 pr-3">{driverMap[j.driver_id] ?? "-"}</td>
                  <td className="py-3 pr-3">
                    <StatusBadge status={j.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
