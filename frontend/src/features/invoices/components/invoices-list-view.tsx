import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Fab } from "@/components/layout/fab";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import type { InvoiceListRow, InvoiceTampilStatus } from "@/types";
import { formatDate, formatRupiah } from "@/lib/utils";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";

interface Props {
  invoices: InvoiceListRow[];
}

type FilterKey = "all" | InvoiceTampilStatus;

export function InvoicesListView({ invoices }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  // Dihitung dari baris yang sudah dipetakan, bukan lewat query terpisah —
  // status jatuh tempo diturunkan saat baca, jadi COUNT di database akan
  // memberi angka yang berbeda dari yang tampil di layar.
  const counts = useMemo(() => {
    const c: Record<InvoiceTampilStatus, number> = {
      draft: 0,
      terkirim: 0,
      jatuh_tempo: 0,
      lunas: 0,
      batal: 0
    };
    for (const row of invoices) c[row.status_tampil] += 1;
    return c;
  }, [invoices]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invoices.filter((row) => {
      if (filter !== "all" && row.status_tampil !== filter) return false;
      if (!needle) return true;
      return (
        row.invoice_number.toLowerCase().includes(needle) ||
        row.customer_nama.toLowerCase().includes(needle) ||
        (row.pic_nama ?? "").toLowerCase().includes(needle)
      );
    });
  }, [invoices, q, filter]);

  // Yang menarik dari daftar tagihan bukan total nilainya, melainkan berapa
  // yang belum masuk. Tagihan batal tidak ikut — itu bukan piutang.
  const sisaTertagih = useMemo(
    () =>
      filtered
        .filter((r) => r.status !== "batal")
        .reduce((sum, r) => sum + r.sisa, 0),
    [filtered]
  );

  const pg = usePagination(filtered, { resetKey: `${q}|${filter}` });

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <PageHeader
        title="Tagihan"
        description="Tagihan (invoice) ke customer beserta status pembayarannya."
      />
      <div className="toolbar">
        <div style={{ flex: 1, minWidth: 240 }}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor tagihan atau customer…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <Link to="/invoices/new" className="hidden lg:inline-flex">
          <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
            Buat tagihan
          </Button>
        </Link>
      </div>

      <FilterChips
        value={filter}
        onChange={(k) => setFilter(k as FilterKey)}
        items={[
          { key: "all", label: "Semua", count: invoices.length },
          { key: "draft", label: "Draft", count: counts.draft },
          { key: "terkirim", label: "Terkirim", count: counts.terkirim },
          { key: "jatuh_tempo", label: "Jatuh tempo", count: counts.jatuh_tempo },
          { key: "lunas", label: "Lunas", count: counts.lunas },
          { key: "batal", label: "Batal", count: counts.batal }
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            invoices.length === 0 ? "Belum ada tagihan" : "Tidak ada yang cocok"
          }
          description={
            invoices.length === 0
              ? "Buat tagihan pertama — job yang sudah selesai bisa ditarik langsung tanpa diketik ulang."
              : "Coba ubah kata kunci atau filter statusnya."
          }
          action={
            invoices.length === 0 ? (
              <Link to="/invoices/new">
                <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
                  Buat tagihan
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="card hidden lg:block">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Nomor tagihan</th>
                  <th>Customer</th>
                  <th style={{ width: 110 }}>Tanggal</th>
                  <th style={{ width: 110 }}>Jatuh tempo</th>
                  <th style={{ width: 140, textAlign: "right" }}>Total</th>
                  <th style={{ width: 140, textAlign: "right" }}>Sisa</th>
                  <th style={{ width: 150 }}>Status</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {pg.items.map((row) => (
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
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                        {row.customer_nama}
                      </div>
                      <div
                        style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}
                      >
                        {row.jumlah_item} baris rincian
                      </div>
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {formatDate(row.tanggal)}
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {row.jatuh_tempo ? formatDate(row.jatuh_tempo) : "—"}
                    </td>
                    <td
                      className="mono"
                      style={{
                        textAlign: "right",
                        fontSize: 12.5,
                        fontWeight: 600
                      }}
                    >
                      {formatRupiah(row.total)}
                    </td>
                    <td
                      className="mono"
                      style={{
                        textAlign: "right",
                        fontSize: 12.5,
                        fontWeight: 600,
                        color:
                          row.sisa > 0 && row.status_tampil === "jatuh_tempo"
                            ? "#C13838"
                            : row.sisa > 0
                              ? "var(--text-primary)"
                              : "var(--text-tertiary)"
                      }}
                    >
                      {row.status === "batal" ? "—" : formatRupiah(row.sisa)}
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
              <tfoot>
                <tr>
                  <td
                    colSpan={5}
                    style={{ fontSize: 12, color: "var(--text-tertiary)" }}
                  >
                    {filtered.length} tagihan ditampilkan · sisa belum masuk
                  </td>
                  <td
                    className="mono"
                    style={{
                      textAlign: "right",
                      fontWeight: 700,
                      fontSize: 13
                    }}
                  >
                    {formatRupiah(sisaTertagih)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {pg.items.map((row) => (
              <Link
                key={row.id}
                to={`/invoices/${row.id}`}
                className="list-card"
              >
                <div className="list-card-row">
                  <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
                    {row.invoice_number}
                  </span>
                  <InvoiceStatusBadge
                    status={row.status_tampil}
                    hariTerlambat={row.hari_terlambat}
                  />
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, paddingTop: 2 }}>
                  {row.customer_nama}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: 6,
                    fontSize: 12.5
                  }}
                >
                  <span style={{ color: "var(--text-tertiary)" }}>
                    {row.jatuh_tempo
                      ? `Jatuh tempo ${formatDate(row.jatuh_tempo)}`
                      : formatDate(row.tanggal)}
                  </span>
                  <span
                    className="mono"
                    style={{ fontWeight: 700, color: "var(--text-primary)" }}
                  >
                    {formatRupiah(row.total)}
                  </span>
                </div>
                {row.status !== "batal" && row.sisa > 0 && row.dibayar > 0 && (
                  <div
                    style={{
                      fontSize: 12,
                      paddingTop: 4,
                      borderTop: "1px solid var(--border-default)",
                      marginTop: 4,
                      color: "var(--text-secondary)"
                    }}
                  >
                    Sudah dibayar {formatRupiah(row.dibayar)} · sisa{" "}
                    {formatRupiah(row.sisa)}
                  </div>
                )}
              </Link>
            ))}
          </div>

          <Pagination state={pg} label="tagihan" />
        </>
      )}

      <Fab href="/invoices/new" label="Buat tagihan" />
    </div>
  );
}
