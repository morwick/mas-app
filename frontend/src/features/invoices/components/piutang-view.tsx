import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Search, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import type { InvoiceListRow, PiutangSummaryRow } from "@/types";
import { formatDate, formatRupiah } from "@/lib/utils";

interface Props {
  summary: PiutangSummaryRow[];
  /** Tagihan terkirim yang belum lunas, diurut dari yang paling lama menunggak. */
  outstanding: InvoiceListRow[];
}

export function PiutangView({ summary, outstanding }: Props) {
  const [q, setQ] = useState("");

  const total = useMemo(
    () =>
      summary.reduce(
        (acc, r) => ({
          sisa: acc.sisa + r.sisa,
          belum: acc.belum + r.belum_jatuh_tempo,
          u1: acc.u1 + r.umur_1_30,
          u2: acc.u2 + r.umur_31_60,
          u3: acc.u3 + r.umur_60_plus
        }),
        { sisa: 0, belum: 0, u1: 0, u2: 0, u3: 0 }
      ),
    [summary]
  );

  const filteredInvoices = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return outstanding;
    return outstanding.filter(
      (r) =>
        r.invoice_number.toLowerCase().includes(needle) ||
        r.customer_nama.toLowerCase().includes(needle)
    );
  }, [outstanding, q]);

  if (summary.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Tidak ada piutang"
        description="Semua tagihan yang sudah dikirim sudah lunas."
      />
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Ringkasan umur piutang.
          Yang menentukan tindakan bukan total piutangnya, melainkan berapa
          yang sudah lama lewat — itu yang perlu ditelepon hari ini. */}
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))"
        }}
      >
        <StatCard label="Total piutang" value={total.sisa} strong />
        <StatCard label="Belum jatuh tempo" value={total.belum} />
        <StatCard label="Lewat 1–30 hari" value={total.u1} tone="warning" />
        <StatCard label="Lewat 31–60 hari" value={total.u2} tone="warning" />
        <StatCard label="Lewat 60+ hari" value={total.u3} tone="danger" />
      </div>

      {/* Per customer */}
      <div className="card">
        <div className="card-header">
          <p className="eyebrow">Piutang per customer</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th style={{ width: 70, textAlign: "right" }}>Tagihan</th>
                <th style={{ width: 140, textAlign: "right" }}>Belum jt. tempo</th>
                <th style={{ width: 120, textAlign: "right" }}>1–30 hari</th>
                <th style={{ width: 120, textAlign: "right" }}>31–60 hari</th>
                <th style={{ width: 120, textAlign: "right" }}>60+ hari</th>
                <th style={{ width: 150, textAlign: "right" }}>Total sisa</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.customer_id}>
                  <td style={{ fontWeight: 600, fontSize: 13.5 }}>
                    {r.customer_nama}
                  </td>
                  <td className="muted" style={{ textAlign: "right", fontSize: 12.5 }}>
                    {r.jumlah_invoice}
                  </td>
                  <Money value={r.belum_jatuh_tempo} />
                  <Money value={r.umur_1_30} tone="warning" />
                  <Money value={r.umur_31_60} tone="warning" />
                  <Money value={r.umur_60_plus} tone="danger" />
                  <td
                    className="mono"
                    style={{
                      textAlign: "right",
                      fontSize: 12.5,
                      fontWeight: 700
                    }}
                  >
                    {formatRupiah(r.sisa)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daftar tagihan */}
      <div className="card">
        <div className="card-header">
          <p className="eyebrow">Tagihan yang belum lunas</p>
          <div style={{ width: 260 }}>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nomor atau customer…"
              leftIcon={<Search style={{ width: 15, height: 15 }} />}
            />
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 180 }}>Nomor tagihan</th>
                <th>Customer</th>
                <th style={{ width: 120 }}>Jatuh tempo</th>
                <th style={{ width: 140, textAlign: "right" }}>Sisa</th>
                <th style={{ width: 160 }}>Status</th>
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((row) => (
                <tr key={row.id} className="row-link">
                  <td>
                    <Link
                      to={`/invoices/${row.id}`}
                      className="mono"
                      style={{
                        textDecoration: "none",
                        color: "var(--text-primary)",
                        fontSize: 12.5,
                        fontWeight: 600
                      }}
                    >
                      {row.invoice_number}
                    </Link>
                  </td>
                  <td style={{ fontSize: 13.5 }}>{row.customer_nama}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {row.jatuh_tempo ? formatDate(row.jatuh_tempo) : "—"}
                  </td>
                  <td
                    className="mono"
                    style={{
                      textAlign: "right",
                      fontSize: 12.5,
                      fontWeight: 600,
                      color:
                        row.status_tampil === "jatuh_tempo"
                          ? "#C13838"
                          : "var(--text-primary)"
                    }}
                  >
                    {formatRupiah(row.sisa)}
                  </td>
                  <td>
                    <InvoiceStatusBadge
                      status={row.status_tampil}
                      hariTerlambat={row.hari_terlambat}
                    />
                  </td>
                  <td>
                    <Link
                      to={`/invoices/${row.id}`}
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
    </div>
  );
}

const toneColor: Record<"normal" | "warning" | "danger", string> = {
  normal: "var(--text-primary)",
  warning: "#B45309",
  danger: "#C13838"
};

function Money({
  value,
  tone = "normal"
}: {
  value: number;
  tone?: "normal" | "warning" | "danger";
}) {
  return (
    <td
      className="mono"
      style={{
        textAlign: "right",
        fontSize: 12.5,
        color: value > 0 ? toneColor[tone] : "var(--text-tertiary)"
      }}
    >
      {value > 0 ? formatRupiah(value) : "—"}
    </td>
  );
}

function StatCard({
  label,
  value,
  tone = "normal",
  strong
}: {
  label: string;
  value: number;
  tone?: "normal" | "warning" | "danger";
  strong?: boolean;
}) {
  return (
    <div className="card card-pad">
      <div className="eyebrow" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: strong ? 20 : 16,
          fontWeight: 700,
          color: value > 0 ? toneColor[tone] : "var(--text-tertiary)"
        }}
      >
        {formatRupiah(value)}
      </div>
    </div>
  );
}
