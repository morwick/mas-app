import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Fab } from "@/components/layout/fab";
import { InvoiceStatusBadge, StatusBayarBadge } from "./invoice-status-badge";
import { statusBayarLabel, type InvoiceListRow, type InvoiceTampilStatus, type StatusBayar } from "@/types";
import { formatDate, formatRupiah } from "@/lib/utils";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { KepalaKolomLihat, TombolLihat, useBarisDetail } from "@/components/ui/baris-detail";

interface Props {
  invoices: InvoiceListRow[];
}

/** "aktif" = semua kecuali batal. */
type FilterKey = "all" | "aktif" | InvoiceTampilStatus;
const FILTER_KEYS: FilterKey[] = ["all", "aktif", "draft", "terkirim", "jatuh_tempo", "lunas", "batal"];

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

/** Angka bulan (1–12) / tahun dari query URL; selain itu = semua. */
function angkaParam(nilai: string | null, min: number, max: number): number | null {
  const n = Number(nilai);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function InvoicesListView({ invoices }: Props) {
  const barisDetail = useBarisDetail();
  const [q, setQ] = useState("");
  const [filterBayar, setFilterBayar] = useState<"all" | StatusBayar>("all");
  // Status, bulan & tahun tanggal tagihan disimpan di URL supaya bisa dibuka
  // langsung (mis. dari angka omset di laporan Laba tahunan: status=aktif).
  const [sp, setSp] = useSearchParams();
  const statusParam = sp.get("status") as FilterKey | null;
  // Default "aktif" (tagihan batal disembunyikan); "Semua" tersimpan sebagai status=all.
  const filter: FilterKey = statusParam && FILTER_KEYS.includes(statusParam) ? statusParam : "aktif";
  const bulan = angkaParam(sp.get("bulan"), 1, 12);
  const tahun = angkaParam(sp.get("tahun"), 2000, 2100);

  function ubahParam(kunci: "status" | "bulan" | "tahun", nilai: string) {
    const next = new URLSearchParams(sp);
    if (nilai && !(kunci === "status" && nilai === "aktif")) next.set(kunci, nilai);
    else next.delete(kunci);
    setSp(next, { replace: true });
  }

  const pilihanTahun = useMemo(() => {
    const set = new Set(invoices.map((r) => Number(r.tanggal.slice(0, 4))));
    if (tahun) set.add(tahun);
    return [...set].filter(Boolean).sort((a, b) => b - a);
  }, [invoices, tahun]);

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
      if (tahun && Number(row.tanggal.slice(0, 4)) !== tahun) return false;
      if (bulan && Number(row.tanggal.slice(5, 7)) !== bulan) return false;
      if (filter === "aktif" && row.status_tampil === "batal") return false;
      if (filter !== "all" && filter !== "aktif" && row.status_tampil !== filter) return false;
      if (filterBayar !== "all" && row.status_bayar !== filterBayar) return false;
      if (!needle) return true;
      return (
        row.invoice_number.toLowerCase().includes(needle) ||
        row.customer_nama.toLowerCase().includes(needle) ||
        (row.proyek_nomor ?? []).some((n) => n.toLowerCase().includes(needle)) ||
        (row.pic_nama ?? "").toLowerCase().includes(needle)
      );
    });
  }, [invoices, q, filter, filterBayar, bulan, tahun]);

  // Total semua tagihan yang lolos filter (bukan hanya halaman ini): sebelum
  // PPN & PPh, total tagihan (+ PPN − PPh 23), dan sisa yang belum masuk.
  // Tagihan batal tidak ikut — itu bukan tagihan / piutang.
  const total = useMemo(
    () =>
      filtered
        .filter((r) => r.status !== "batal")
        .reduce(
          (acc, r) => ({
            sebelum: acc.sebelum + r.subtotal,
            total: acc.total + r.total,
            sisa: acc.sisa + r.sisa
          }),
          { sebelum: 0, total: 0, sisa: 0 }
        ),
    [filtered]
  );


  const pg = usePagination(filtered, { resetKey: `${q}|${filter}|${filterBayar}|${bulan}|${tahun}` });

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="toolbar">
        <div style={{ flex: 1, minWidth: 240 }}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor tagihan atau customer…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <div style={{ width: 140 }}>
          <Select value={bulan ?? ""} onChange={(e) => ubahParam("bulan", e.target.value)} aria-label="Filter bulan">
            <option value="">Semua bulan</option>
            {NAMA_BULAN.map((nama, i) => (
              <option key={nama} value={i + 1}>
                {nama}
              </option>
            ))}
          </Select>
        </div>
        <div style={{ width: 120 }}>
          <Select value={tahun ?? ""} onChange={(e) => ubahParam("tahun", e.target.value)} aria-label="Filter tahun">
            <option value="">Semua tahun</option>
            {pilihanTahun.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div style={{ width: 180 }}>
          <Select
            value={filterBayar}
            onChange={(e) => setFilterBayar(e.target.value as "all" | StatusBayar)}
            aria-label="Filter status bayar"
          >
            <option value="all">Semua status bayar</option>
            {(Object.keys(statusBayarLabel) as StatusBayar[]).map((k) => (
              <option key={k} value={k}>
                {statusBayarLabel[k]}
              </option>
            ))}
          </Select>
        </div>
        <Link to="/invoices/new" className="hidden lg:inline-flex">
          <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
            Buat tagihan
          </Button>
        </Link>
      </div>

      <FilterChips
        value={filter}
        onChange={(k) => ubahParam("status", k)}
        items={[
          { key: "all", label: "Semua", count: invoices.length },
          { key: "aktif", label: "Aktif", count: invoices.length - counts.batal },
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
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <KepalaKolomLihat />
                    <th style={{ width: 180 }}>Nomor tagihan</th>
                    <th>Customer</th>
                    <th style={{ width: 110 }}>Tanggal</th>
                    <th style={{ width: 110 }}>Jatuh tempo</th>
                    <th style={{ width: 150, textAlign: "right" }}>Sebelum PPN & PPh</th>
                    <th style={{ width: 140, textAlign: "right" }}>Total</th>
                    <th style={{ width: 140, textAlign: "right" }}>Sisa</th>
                    <th style={{ width: 150 }}>Status</th>
                    <th style={{ width: 130 }}>Status bayar</th>
                  </tr>
                </thead>
                <tbody>
                  {pg.items.map((row) => (
                    <tr key={row.id} {...barisDetail(`/invoices/${row.id}`)}>
                      <td style={{ width: 44 }}>
                        <TombolLihat tujuan={`/invoices/${row.id}`} />
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
                          {row.invoice_number}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                          {row.customer_nama}
                        </div>
                      </td>
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {formatDate(row.tanggal)}
                      </td>
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {row.jatuh_tempo ? formatDate(row.jatuh_tempo) : "—"}
                      </td>
                      {/* Subtotal = jumlah rincian, belum ditambah PPN & belum dipotong PPh 23. */}
                      <td className="mono muted" style={{ textAlign: "right", fontSize: 12.5 }}>
                        {formatRupiah(row.subtotal)}
                      </td>
                      <td
                        className="mono"
                        style={{
                          textAlign: "right",
                          fontSize: 12.5,
                          fontWeight: 600
                        }}
                      >
                        {/* Total tagihan = subtotal + PPN − PPh 23 (yang dibayar customer). */}
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
                        <StatusBayarBadge status={row.status_bayar} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Total</span> ·{" "}
                      {filtered.length} tagihan ditampilkan · tagihan batal tidak dijumlah
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}>
                      {formatRupiah(total.sebelum)}
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}>
                      {formatRupiah(total.total)}
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}>
                      {formatRupiah(total.sisa)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
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
                  <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <InvoiceStatusBadge
                      status={row.status_tampil}
                      hariTerlambat={row.hari_terlambat}
                    />
                    <StatusBayarBadge status={row.status_bayar} />
                  </span>
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
                  <span className="mono" style={{ textAlign: "right" }}>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{formatRupiah(row.total)}</span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)" }}>
                      sebelum PPN & PPh {formatRupiah(row.subtotal)}
                    </span>
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
