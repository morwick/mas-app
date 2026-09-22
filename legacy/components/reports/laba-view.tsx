"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import type { JobProfitabilityRow } from "@/lib/types";
import { formatDate, formatRupiah } from "@/lib/utils";

interface Props {
  rows: JobProfitabilityRow[];
  start: string;
  end: string;
}

type SortKey = "etd" | "laba" | "pendapatan";

/**
 * Laba per job.
 *
 * Pendapatan dan biaya sudah tercatat sejak modul penawaran dan uang jalan,
 * tapi tidak pernah dipertemukan sampai invoice ada. Job yang belum ditagih
 * tetap ditampilkan dengan pendapatan nol — itu justru informasinya: pekerjaan
 * yang sudah keluar biaya tapi belum ditagihkan.
 */
export function LabaView({ rows, start, end }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [range, setRange] = useState({ start, end });
  const [sort, setSort] = useState<SortKey>("etd");

  const total = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          pendapatan: acc.pendapatan + r.pendapatan,
          uang_jalan: acc.uang_jalan + r.uang_jalan,
          insiden: acc.insiden + r.biaya_insiden,
          laba: acc.laba + r.laba
        }),
        { pendapatan: 0, uang_jalan: 0, insiden: 0, laba: 0 }
      ),
    [rows]
  );

  const belumDitagih = useMemo(
    () => rows.filter((r) => r.pendapatan === 0 && r.status === "selesai"),
    [rows]
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "laba") copy.sort((a, b) => a.laba - b.laba);
    if (sort === "pendapatan") copy.sort((a, b) => b.pendapatan - a.pendapatan);
    return copy;
  }, [rows, sort]);

  function terapkan() {
    const next = new URLSearchParams(params.toString());
    next.set("start", range.start);
    next.set("end", range.end);
    router.push(`/reports/laba?${next.toString()}`);
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="card card-pad">
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-end",
            flexWrap: "wrap"
          }}
        >
          <Field label="Dari tanggal">
            <Input
              type="date"
              value={range.start}
              onChange={(e) =>
                setRange((r) => ({ ...r, start: e.target.value }))
              }
            />
          </Field>
          <Field label="Sampai tanggal">
            <Input
              type="date"
              value={range.end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
            />
          </Field>
          <Button onClick={terapkan}>Terapkan</Button>
        </div>
        <p className="caption" style={{ marginTop: 8, color: "var(--text-tertiary)" }}>
          Rentang mengikuti tanggal berangkat job (ETD), bukan tanggal tagihan —
          supaya biaya dan pendapatan satu perjalanan selalu jatuh di periode
          yang sama.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))"
        }}
      >
        <StatCard label="Pendapatan (di luar PPN)" value={total.pendapatan} />
        <StatCard label="Uang jalan" value={-total.uang_jalan} />
        <StatCard label="Biaya insiden" value={-total.insiden} />
        <StatCard
          label="Laba kotor"
          value={total.laba}
          strong
          tone={total.laba < 0 ? "danger" : "positive"}
        />
      </div>

      {belumDitagih.length > 0 && (
        <div
          style={{
            border: "1px solid #F3D9A9",
            background: "#FDF6E7",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            color: "#7A5B12"
          }}
        >
          {belumDitagih.length} job sudah selesai tapi belum ada tagihannya —
          biayanya sudah keluar, pendapatannya belum masuk. Angka laba di atas
          akan naik setelah job itu ditagihkan.
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Belum ada job di rentang ini"
          description="Ubah rentang tanggalnya, atau buat job dulu."
        />
      ) : (
        <div className="card">
          <div className="card-header">
            <p className="eyebrow">Rincian per job</p>
            <div style={{ display: "flex", gap: 6 }}>
              {(
                [
                  { key: "etd", label: "Tanggal" },
                  { key: "laba", label: "Laba terkecil" },
                  { key: "pendapatan", label: "Nilai terbesar" }
                ] as Array<{ key: SortKey; label: string }>
              ).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSort(s.key)}
                  className="btn btn-sm"
                  style={{
                    background:
                      sort === s.key ? "var(--brand-primary)" : "transparent",
                    color: sort === s.key ? "white" : "var(--text-secondary)",
                    border:
                      sort === s.key ? "none" : "1px solid var(--border-default)"
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 130 }}>Job</th>
                  <th>Customer</th>
                  <th style={{ width: 80 }}>Unit</th>
                  <th style={{ width: 100 }}>Berangkat</th>
                  <th style={{ width: 130, textAlign: "right" }}>Pendapatan</th>
                  <th style={{ width: 130, textAlign: "right" }}>Uang jalan</th>
                  <th style={{ width: 120, textAlign: "right" }}>Insiden</th>
                  <th style={{ width: 130, textAlign: "right" }}>Laba</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.job_id} className="row-link">
                    <td>
                      <Link
                        href={`/jobs/${r.job_id}`}
                        className="mono"
                        style={{
                          textDecoration: "none",
                          color: "var(--text-primary)",
                          fontSize: 12.5,
                          fontWeight: 600
                        }}
                      >
                        {r.job_number}
                      </Link>
                    </td>
                    <td style={{ fontSize: 13 }}>{r.customer_nama}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {r.unit_kode}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {formatDate(r.etd)}
                    </td>
                    <td
                      className="mono"
                      style={{
                        textAlign: "right",
                        fontSize: 12.5,
                        color:
                          r.pendapatan === 0
                            ? "var(--text-tertiary)"
                            : "var(--text-primary)"
                      }}
                    >
                      {r.pendapatan === 0
                        ? "belum ditagih"
                        : formatRupiah(r.pendapatan)}
                    </td>
                    <td
                      className="mono"
                      style={{ textAlign: "right", fontSize: 12.5 }}
                    >
                      {formatRupiah(r.uang_jalan)}
                    </td>
                    <td
                      className="mono"
                      style={{
                        textAlign: "right",
                        fontSize: 12.5,
                        color:
                          r.biaya_insiden > 0
                            ? "#C13838"
                            : "var(--text-tertiary)"
                      }}
                    >
                      {r.biaya_insiden > 0 ? formatRupiah(r.biaya_insiden) : "—"}
                    </td>
                    <td
                      className="mono"
                      style={{
                        textAlign: "right",
                        fontSize: 12.5,
                        fontWeight: 700,
                        color:
                          r.laba < 0
                            ? "#C13838"
                            : r.pendapatan === 0
                              ? "var(--text-tertiary)"
                              : "var(--brand-primary-dark)"
                      }}
                    >
                      {formatRupiah(r.laba)}
                    </td>
                    <td>
                      <Link
                        href={`/jobs/${r.job_id}`}
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
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  strong,
  tone = "normal"
}: {
  label: string;
  value: number;
  strong?: boolean;
  tone?: "normal" | "positive" | "danger";
}) {
  const color =
    tone === "danger"
      ? "#C13838"
      : tone === "positive"
        ? "var(--brand-primary-dark)"
        : "var(--text-primary)";
  return (
    <div className="card card-pad">
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: strong ? 20 : 16, fontWeight: 700, color }}
      >
        {formatRupiah(value)}
      </div>
    </div>
  );
}
