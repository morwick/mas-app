"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Select, Field } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { exportToXlsx } from "@/lib/export";
import { formatDate, formatDateTime } from "@/lib/utils";
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Field>
            <Select
              value={customerId}
              onChange={(e) => updateParam("customer", e.target.value)}
              style={{ width: 260, height: 36 }}
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
          <Field>
            <Select
              value={period}
              onChange={(e) => updateParam("period", e.target.value)}
              style={{ width: 160, height: 36 }}
            >
              <option value="all">Semua waktu</option>
              <option value="month_now">Bulan ini</option>
              <option value="month_prev">Bulan lalu</option>
            </Select>
          </Field>
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

      <div className="card">
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "0.5px solid var(--border-default)"
          }}
        >
          <div className="h3">
            {jobs.length} job
          </div>
          <div className="caption">
            {customerId
              ? customers.find((c) => c.id === customerId)?.nama_perusahaan
              : "Semua customer"}
          </div>
        </div>
        {jobs.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-tertiary)",
              fontSize: 13
            }}
          >
            Tidak ada data untuk filter yang dipilih.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Job ID</th>
                <th>Customer</th>
                <th>Alat</th>
                <th>Unit / Driver</th>
                <th>Rute</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const u = unitMap[j.unit_id];
                const d = driverMap[j.driver_id];
                return (
                  <tr key={j.id}>
                    <td className="mono" style={{ fontSize: 11.5 }}>
                      {formatDate(j.etd)}
                    </td>
                    <td
                      className="mono"
                      style={{ fontSize: 12, fontWeight: 600 }}
                    >
                      {j.job_number}
                    </td>
                    <td>{j.customer_nama}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {j.alat_diangkut}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 600 }}>
                        {u?.kode_unit ?? "—"}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {d ? d.split(" ").slice(0, 2).join(" ") : "—"}
                      </div>
                    </td>
                    <td
                      className="muted"
                      style={{ fontSize: 11.5, maxWidth: 220 }}
                    >
                      {j.asal.split(",")[0]} → {j.tujuan.split(",")[0]}
                    </td>
                    <td>
                      <StatusBadge status={j.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
