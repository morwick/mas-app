import { useMemo, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import type { ProyekProfitabilityRow } from "@/types";
import { formatDate, formatRupiah } from "@/lib/utils";
import { KepalaKolomLihat, TombolLihat, useBarisDetail } from "@/components/ui/baris-detail";

interface Props {
  rows: ProyekProfitabilityRow[];
  start: string;
  end: string;
}

type SortKey = "etd" | "laba" | "pendapatan";

/**
 * Laba per proyek.
 *
 * Tagihan ditulis per proyek, jadi pendapatan & biaya dipertemukan per
 * proyek (semua job-nya dijumlah). Proyek yang belum ditagih tetap
 * ditampilkan dengan pendapatan nol — itu justru informasinya: pekerjaan yang
 * sudah keluar biaya tapi belum ditagihkan.
 */
export function LabaView({ rows, start, end }: Props) {
  const barisDetail = useBarisDetail();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [range, setRange] = useState({ start, end });
  const [sort, setSort] = useState<SortKey>("etd");

  const total = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          pendapatan: acc.pendapatan + r.pendapatan,
          uang_jalan: acc.uang_jalan + r.uang_jalan,
          insiden: acc.insiden + r.biaya_insiden,
          laba: acc.laba + r.laba,
          // Proyek kosongan (tanpa customer) tidak ditagih → cost perusahaan.
          cost_kosongan: acc.cost_kosongan + (r.kosongan ? r.uang_jalan + r.biaya_insiden : 0)
        }),
        { pendapatan: 0, uang_jalan: 0, insiden: 0, laba: 0, cost_kosongan: 0 }
      ),
    [rows]
  );

  const belumDitagih = useMemo(
    // Kosongan memang tidak ditagih.
    () => rows.filter((r) => !r.invoice_id && r.semua_selesai && !r.kosongan),
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
    navigate(`/reports/laba?${next.toString()}`);
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
            <DateInput
              value={range.start}
              onChange={(v) =>
                setRange((r) => ({ ...r, start: v }))
              }
            />
          </Field>
          <Field label="Sampai tanggal">
            <DateInput
              value={range.end}
              onChange={(v) => setRange((r) => ({ ...r, end: v }))}
            />
          </Field>
          <Button onClick={terapkan}>Terapkan</Button>
        </div>
        <p className="caption" style={{ marginTop: 8, color: "var(--text-tertiary)" }}>
          Rentang mengikuti tanggal berangkat job pertama proyek (ETD), bukan
          tanggal tagihan — seluruh job proyek ikut dihitung, supaya biaya dan
          pendapatan satu proyek selalu jatuh di periode yang sama.
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
        {total.cost_kosongan > 0 && (
          <StatCard label="Cost perusahaan (kosongan)" value={-total.cost_kosongan} tone="danger" />
        )}
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
          {belumDitagih.length} proyek sudah selesai tapi belum ada tagihannya —
          biayanya sudah keluar, pendapatannya belum masuk. Angka laba di atas
          akan naik setelah proyek itu ditagihkan.
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Belum ada proyek di rentang ini"
          description="Ubah rentang tanggalnya, atau buat proyek dulu."
        />
      ) : (
        <div className="card">
          <div className="card-header">
            <p className="eyebrow">Rincian per proyek</p>
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
                  <KepalaKolomLihat />
                  <th style={{ width: 170 }}>Proyek</th>
                  <th>Customer</th>
                  <th style={{ width: 100 }}>Unit</th>
                  <th style={{ width: 100 }}>Berangkat</th>
                  <th style={{ width: 130, textAlign: "right" }}>Pendapatan</th>
                  <th style={{ width: 130, textAlign: "right" }}>Uang jalan</th>
                  <th style={{ width: 120, textAlign: "right" }}>Insiden</th>
                  <th style={{ width: 130, textAlign: "right" }}>Laba</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.proyek_id} {...barisDetail(`/proyek/${r.proyek_id}`)}>
                    <td style={{ width: 44 }}>
                      <TombolLihat tujuan={`/proyek/${r.proyek_id}`} />
                    </td>
                    <td>
                      <span
                        className="mono"
                        style={{
                          textDecoration: "none",
                          color: "var(--text-primary)",
                          fontSize: 12.5,
                          fontWeight: 600
                        }}
                      >
                        {r.nomor_proyek}
                      </span>
                      <div className="caption" style={{ fontSize: 10.5 }}>
                        {r.jumlah_job} job
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {r.kosongan ? <span className="muted">Kosongan · cost perusahaan</span> : r.customer_nama}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {r.unit_kode}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {formatDate(r.etd_awal)}
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
                      {r.pendapatan !== 0
                        ? formatRupiah(r.pendapatan)
                        : r.kosongan
                          ? "tidak ditagih"
                          : r.invoice_id
                            ? formatRupiah(0)
                            : r.semua_selesai
                              ? "belum ditagih"
                              : "job belum selesai"}
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
