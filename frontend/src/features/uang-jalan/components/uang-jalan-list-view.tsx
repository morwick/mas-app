import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, Search, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRupiah, formatDate, formatDateTime } from "@/lib/utils";
import type { UangJalanJobRow, UangJalanRequest } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";

type Filter = "semua" | "pengajuan" | "berjalan" | "belum_cair" | "lewat_pagu";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "semua", label: "Semua" },
  { key: "pengajuan", label: "Ada pengajuan driver" },
  { key: "berjalan", label: "Masih jalan" },
  { key: "belum_cair", label: "Belum dikasih sama sekali" },
  { key: "lewat_pagu", label: "Lebih dari pagu" }
];

interface Props {
  rows: UangJalanJobRow[];
  /** Pengajuan driver yang menunggu kasir (Fase 3). */
  pengajuan?: UangJalanRequest[];
}

export function UangJalanListView({ rows, pengajuan = [] }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");

  const tersaring = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "pengajuan" && r.pengajuan_menunggu === 0) return false;
      if (filter === "berjalan" && r.status === "selesai") return false;
      if (filter === "belum_cair" && r.ringkasan.cair > 0) return false;
      if (filter === "lewat_pagu" && r.ringkasan.sisa >= 0) return false;
      if (!needle) return true;
      return (
        r.job_number.toLowerCase().includes(needle) ||
        (r.unit_kode ?? "").toLowerCase().includes(needle) ||
        (r.driver_nama ?? "").toLowerCase().includes(needle) ||
        (r.customer_nama ?? "").toLowerCase().includes(needle) ||
        r.asal.toLowerCase().includes(needle) ||
        r.tujuan.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, filter]);

  const total = useMemo(
    () =>
      tersaring.reduce(
        (a, r) => ({
          pagu: a.pagu + r.ringkasan.pagu,
          cair: a.cair + r.ringkasan.cair,
          sisa: a.sisa + r.ringkasan.sisa
        }),
        { pagu: 0, cair: 0, sisa: 0 }
      ),
    [tersaring]
  );

  const jumlah = useMemo(
    () => ({
      berjalan: rows.filter((r) => r.status !== "selesai").length,
      belum_cair: rows.filter((r) => r.ringkasan.cair === 0).length,
      lewat_pagu: rows.filter((r) => r.ringkasan.sisa < 0).length
    }),
    [rows]
  );

  const pg = usePagination(tersaring, { resetKey: `${q}|${filter}` });

  return (
    <div>
      <PageHeader
        title="Uang Jalan"
        description="Posisi uang jalan per job serta pengajuan dari driver yang perlu dicairkan."
        style={{ marginBottom: 16 }}
      />
      {pengajuan.length > 0 && (
        <div
          className="card card-pad"
          style={{ marginBottom: 16, borderColor: "#fed7aa", background: "#fff7ed" }}
        >
          <div className="h3" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <BellRing style={{ width: 16, height: 16, color: "#c2410c" }} />
            {pengajuan.length} pengajuan uang jalan menunggu dicairkan
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pengajuan.map((r) => (
              <Link
                key={r.id}
                to={`/jobs/${r.job_id}`}
                style={{ display: "flex", gap: 10, alignItems: "center", textDecoration: "none", color: "inherit", fontSize: 13 }}
              >
                <span className="mono" style={{ fontWeight: 600 }}>{r.job_number ?? "—"}</span>
                <span style={{ flex: 1 }}>
                  {r.driver_nama ?? "Driver"} mengajukan <b>{formatRupiah(r.nominal)}</b>
                  {r.catatan ? ` · ${r.catatan}` : ""}
                </span>
                <span className="caption">{formatDateTime(r.requested_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <Input
          leftIcon={<Search style={{ width: 15, height: 15 }} />}
          placeholder="Cari nomor job, unit, supir, customer, atau rute..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
      >
        {FILTERS.map((f) => {
          const aktif = filter === f.key;
          const n =
            f.key === "semua"
              ? rows.length
              : jumlah[f.key as keyof typeof jumlah];
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className="btn btn-sm"
              style={{
                background: aktif ? "var(--text-primary)" : "var(--bg-subtle)",
                color: aktif ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--border-default)",
                fontWeight: 600
              }}
            >
              {f.label}
              <span
                style={{
                  marginLeft: 6,
                  opacity: 0.7,
                  fontVariantNumeric: "tabular-nums"
                }}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {tersaring.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Tidak ada job"
          description="Coba ubah kata pencarian atau saringannya."
        />
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Unit / Supir</th>
                  <th>Rute</th>
                  <th style={{ textAlign: "right" }}>Pagu</th>
                  <th style={{ textAlign: "right" }}>Dikasih</th>
                  <th style={{ textAlign: "right" }}>Belum dikasih</th>
                  <th style={{ textAlign: "right" }}>Terakhir</th>
                  <th>Pengajuan</th>
                </tr>
              </thead>
              <tbody>
                {pg.items.map((r) => {
                  const minus = r.ringkasan.sisa < 0;
                  return (
                    <tr key={r.job_id}>
                      <td>
                        <Link
                          to={`/jobs/${r.job_id}`}
                          className="mono"
                          style={{
                            fontWeight: 600,
                            fontSize: 12.5,
                            textDecoration: "none",
                            color: "var(--brand-primary-dark)"
                          }}
                        >
                          {r.job_number}
                        </Link>
                        <div className="caption">{r.customer_nama ?? "—"}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {r.unit_kode ?? "—"}
                        </div>
                        <div className="caption">{r.driver_nama ?? "—"}</div>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {r.asal} → {r.tujuan}
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {r.ringkasan.pagu > 0
                          ? formatRupiah(r.ringkasan.pagu)
                          : "—"}
                        {r.ringkasan.penambahan > 0 && (
                          <div
                            className="caption"
                            style={{ color: "#b45309" }}
                          >
                            +{formatRupiah(r.ringkasan.penambahan)}
                          </div>
                        )}
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {formatRupiah(r.ringkasan.cair)}
                        {r.ringkasan.pagu > 0 && (
                          <div className="caption">
                            {r.ringkasan.persen_cair}%
                          </div>
                        )}
                      </td>
                      <td
                        className="mono"
                        style={{
                          textAlign: "right",
                          fontWeight: 700,
                          color: minus ? "#c13838" : "var(--text-primary)"
                        }}
                      >
                        {minus ? "-" : ""}
                        {formatRupiah(Math.abs(r.ringkasan.sisa))}
                      </td>
                      <td
                        className="caption mono"
                        style={{ textAlign: "right" }}
                      >
                        {r.pencairan_terakhir
                          ? formatDate(r.pencairan_terakhir)
                          : "—"}
                      </td>
                      <td>
                        {r.pengajuan_menunggu > 0 ? (
                          <span className="badge badge-perbaikan">{r.pengajuan_menunggu} menunggu</span>
                        ) : (
                          <span className="caption">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="caption">
                    {tersaring.length} job ditampilkan
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>
                    {formatRupiah(total.pagu)}
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>
                    {formatRupiah(total.cair)}
                  </td>
                  <td
                    className="mono"
                    style={{
                      textAlign: "right",
                      fontWeight: 700,
                      color: total.sisa < 0 ? "#c13838" : "var(--text-primary)"
                    }}
                  >
                    {total.sisa < 0 ? "-" : ""}
                    {formatRupiah(Math.abs(total.sisa))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <Pagination state={pg} label="pengajuan" attached />
        </div>
      )}
    </div>
  );
}
