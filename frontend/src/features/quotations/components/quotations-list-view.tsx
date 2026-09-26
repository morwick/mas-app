import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight, FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Fab } from "@/components/layout/fab";
import { QuotationStatusBadge } from "./quotation-status-badge";
import type { Customer, QuotationListRow, QuotationStatus } from "@/types";
import { formatDate, formatRupiah } from "@/lib/utils";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";

interface Props {
  quotations: QuotationListRow[];
  customers: Customer[];
  /** Datang dari query string (mis. diklik dari kolom "Jumlah penawaran" di menu Customer). */
  initialCustomerId?: string;
  /** Filter awal dari URL (`?filter=`), mis. dari kartu "Perlu tindakan" dashboard. */
  initialFilter?: string;
  /** Finance: hanya melihat — tanpa tombol buat penawaran. */
  hanyaLihat?: boolean;
}

// "deal_pending" bukan status di database — ia turunan dari status deal yang
// belum punya job sama sekali. Dipisah sebagai chip sendiri karena itulah
// daftar kerja admin: penawaran yang sudah disetujui tapi belum dijadwalkan.
type FilterKey = "all" | QuotationStatus | "deal_pending" | "akan_kedaluwarsa";

/** Terkirim & masa berlakunya habis dalam sekian hari (sama dengan dashboard). */
const AKAN_KEDALUWARSA_HARI = 7;

function tanggalLokal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function akanKedaluwarsa(row: QuotationListRow, hariIni: string, batas: string): boolean {
  if (row.status !== "terkirim" || !row.berlaku_sampai) return false;
  const t = row.berlaku_sampai.slice(0, 10);
  return t >= hariIni && t <= batas;
}

/** Deal yang masih punya item deal belum dibuatkan job. */
function dealBelumJob(row: QuotationListRow): boolean {
  if (row.status !== "deal") return false;
  return row.jumlah_item_deal_belum_job != null ? row.jumlah_item_deal_belum_job > 0 : row.jumlah_job === 0;
}

const FILTER_URL: FilterKey[] = ["all", "draft", "terkirim", "deal", "deal_pending", "akan_kedaluwarsa", "ditolak", "kedaluwarsa"];

interface Pelaksanaan {
  label: string;
  tone: "belum" | "jalan" | "selesai" | "netral";
}

/**
 * Ringkas kemajuan pelaksanaan sebuah penawaran.
 *
 * Hanya relevan untuk penawaran yang sudah deal — sebelum itu memang belum
 * boleh ada job, jadi menampilkan "belum ada job" justru menyesatkan.
 */
function pelaksanaan(row: QuotationListRow): Pelaksanaan {
  if (row.status !== "deal") return { label: "—", tone: "netral" };
  if (row.jumlah_job === 0) return { label: "Belum ada job", tone: "belum" };

  const { jumlah_job, jumlah_job_selesai, jumlah_item } = row;
  // Tuntas hanya kalau setiap rute sudah punya job DAN semuanya selesai.
  // Tanpa syarat pertama, penawaran 3 rute yang baru dijalankan 1 rute akan
  // terlihat selesai begitu job tunggal itu rampung.
  if (jumlah_job_selesai === jumlah_job && jumlah_job >= jumlah_item)
    return { label: "Selesai", tone: "selesai" };

  return {
    label: `${jumlah_job_selesai} dari ${jumlah_job} job selesai`,
    tone: "jalan"
  };
}

const toneColor: Record<Pelaksanaan["tone"], string> = {
  belum: "var(--text-primary)",
  jalan: "var(--text-secondary)",
  selesai: "var(--brand-primary-dark)",
  netral: "var(--text-tertiary)"
};

export function QuotationsListView({
  quotations,
  customers,
  initialCustomerId,
  initialFilter,
  hanyaLihat = false
}: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>(
    FILTER_URL.includes(initialFilter as FilterKey) ? (initialFilter as FilterKey) : "all"
  );
  const { hariIni, batasKedaluwarsa } = useMemo(() => {
    const now = new Date();
    const batas = new Date(now);
    batas.setDate(batas.getDate() + AKAN_KEDALUWARSA_HARI);
    return { hariIni: tanggalLokal(now), batasKedaluwarsa: tanggalLokal(batas) };
  }, []);
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");

  // Menyesuaikan saat halaman dibuka lagi lewat tautan customer lain
  // (mis. dari kolom "Jumlah penawaran" di menu Customer) tanpa remount komponen.
  useEffect(() => {
    setCustomerId(initialCustomerId ?? "");
  }, [initialCustomerId]);

  const customerOptions = useMemo<ComboboxOption[]>(
    () =>
      customers
        .filter((c) => c.is_active)
        .map((c) => ({
          value: c.id,
          label: c.nama_perusahaan,
          hint: c.kota ?? undefined
        })),
    [customers]
  );

  // Dihitung dari baris yang sudah dipetakan, bukan lewat query terpisah —
  // status kedaluwarsa diturunkan saat baca, jadi COUNT di database akan
  // memberi angka yang berbeda dari yang tampil.
  const counts = useMemo(() => {
    const c: Record<QuotationStatus, number> = {
      draft: 0,
      terkirim: 0,
      deal: 0,
      ditolak: 0,
      kedaluwarsa: 0
    };
    for (const row of quotations) c[row.status] += 1;
    return c;
  }, [quotations]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return quotations.filter((row) => {
      if (filter === "deal_pending") {
        if (!dealBelumJob(row)) return false;
      } else if (filter === "akan_kedaluwarsa") {
        if (!akanKedaluwarsa(row, hariIni, batasKedaluwarsa)) return false;
      } else if (filter !== "all" && row.status !== filter) {
        return false;
      }
      if (customerId && row.customer_id !== customerId) return false;
      if (!needle) return true;
      return (
        row.quote_number.toLowerCase().includes(needle) ||
        row.customer_nama.toLowerCase().includes(needle) ||
        (row.objek ?? "").toLowerCase().includes(needle) ||
        (row.pic_nama ?? "").toLowerCase().includes(needle)
      );
    });
  }, [quotations, q, filter, customerId, hariIni, batasKedaluwarsa]);

  const totalNilai = useMemo(
    () => filtered.reduce((sum, r) => sum + r.total, 0),
    [filtered]
  );

  const dealBelumJalan = useMemo(() => quotations.filter(dealBelumJob).length, [quotations]);
  const jumlahAkanKedaluwarsa = useMemo(
    () => quotations.filter((r) => akanKedaluwarsa(r, hariIni, batasKedaluwarsa)).length,
    [quotations, hariIni, batasKedaluwarsa]
  );

  const pg = usePagination(filtered, { resetKey: `${q}|${filter}|${customerId}` });

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <PageHeader
        title="Penawaran"
        description="Surat penawaran harga ke customer beserta statusnya."
      />
      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nomor surat, customer, atau alat…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <div className="toolbar-filter">
          <Combobox
            value={customerId}
            onChange={setCustomerId}
            options={customerOptions}
            placeholder="Semua customer"
            searchPlaceholder="Cari customer…"
            emptyText="Customer tidak ditemukan"
            clearable
          />
        </div>
        {!hanyaLihat && (
          <Link to="/quotations/new" className="hidden lg:inline-flex">
            <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
              Buat penawaran
            </Button>
          </Link>
        )}
      </div>

      <FilterChips
        value={filter}
        onChange={(k) => setFilter(k as FilterKey)}
        items={[
          { key: "all", label: "Semua", count: quotations.length },
          { key: "draft", label: "Draft", count: counts.draft },
          { key: "terkirim", label: "Terkirim", count: counts.terkirim },
          { key: "deal", label: "Deal", count: counts.deal },
          {
            key: "deal_pending",
            label: "Deal — belum ada job",
            count: dealBelumJalan
          },
          {
            key: "akan_kedaluwarsa",
            label: "Akan kedaluwarsa",
            count: jumlahAkanKedaluwarsa
          },
          { key: "ditolak", label: "Ditolak", count: counts.ditolak },
          {
            key: "kedaluwarsa",
            label: "Kedaluwarsa",
            count: counts.kedaluwarsa
          }
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={
            quotations.length === 0
              ? "Belum ada penawaran"
              : "Tidak ada yang cocok"
          }
          description={
            quotations.length === 0
              ? "Buat surat penawaran pertama — nomor surat diisi otomatis."
              : "Coba ubah kata kunci atau filter statusnya."
          }
          action={
            quotations.length === 0 && !hanyaLihat ? (
              <Link to="/quotations/new">
                <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>
                  Buat penawaran
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
                  <th style={{ width: 180 }}>Nomor surat</th>
                  <th>Customer</th>
                  <th style={{ width: 110 }}>Tanggal</th>
                  <th style={{ width: 110 }}>Berlaku s.d.</th>
                  <th style={{ width: 150, textAlign: "right" }}>Nilai</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 170 }}>Pelaksanaan</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {pg.items.map((row) => (
                  <tr key={row.id} className="row-link">
                    <td>
                      <Link
                        to={`/quotations/${row.id}`}
                        className="mono"
                        style={{
                          textDecoration: "none",
                          color: "var(--text-primary)",
                          fontSize: 12.5,
                          fontWeight: 600
                        }}
                      >
                        {row.quote_number}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                        {row.customer_nama}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--text-tertiary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {row.objek || `${row.jumlah_item} baris rincian`}
                      </div>
                    </td>
                    <td className="muted" style={{ fontSize: 12.5 }}>
                      {formatDate(row.tanggal)}
                    </td>
                    <td
                      style={{
                        fontSize: 12.5,
                        color: row.status === "kedaluwarsa" ? "#C13838" : "var(--text-secondary)",
                        fontWeight: row.status === "kedaluwarsa" ? 600 : 400
                      }}
                    >
                      {row.berlaku_sampai ? formatDate(row.berlaku_sampai) : "—"}
                    </td>
                    <td
                      className="mono"
                      style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600 }}
                    >
                      {formatRupiah(row.total)}
                    </td>
                    <td>
                      <QuotationStatusBadge status={row.status} />
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {(() => {
                        const p = pelaksanaan(row);
                        return (
                          <span
                            style={{
                              color: toneColor[p.tone],
                              fontWeight: p.tone === "belum" ? 600 : 400,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5
                            }}
                          >
                            {p.tone === "selesai" && (
                              <CheckCircle2 style={{ width: 13, height: 13 }} />
                            )}
                            {p.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      <Link
                        to={`/quotations/${row.id}`}
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
                  <td colSpan={4} style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {filtered.length} penawaran ditampilkan
                  </td>
                  <td
                    className="mono"
                    style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}
                  >
                    {formatRupiah(totalNilai)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {pg.items.map((row) => (
              <Link
                key={row.id}
                to={`/quotations/${row.id}`}
                className="list-card"
              >
                <div className="list-card-row">
                  <span
                    className="mono"
                    style={{ fontSize: 12, fontWeight: 700 }}
                  >
                    {row.quote_number}
                  </span>
                  <QuotationStatusBadge status={row.status} />
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, paddingTop: 2 }}>
                  {row.customer_nama}
                </div>
                {row.objek && (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {row.objek}
                  </div>
                )}
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
                    {formatDate(row.tanggal)}
                    {row.berlaku_sampai && (
                      <>
                        {" · s.d. "}
                        <span
                          style={{
                            color: row.status === "kedaluwarsa" ? "#C13838" : "var(--text-tertiary)",
                            fontWeight: row.status === "kedaluwarsa" ? 600 : 400
                          }}
                        >
                          {formatDate(row.berlaku_sampai)}
                        </span>
                      </>
                    )}
                  </span>
                  <span
                    className="mono"
                    style={{ fontWeight: 700, color: "var(--text-primary)" }}
                  >
                    {formatRupiah(row.total)}
                  </span>
                </div>
                {row.status === "deal" && (
                  <div
                    style={{
                      fontSize: 12,
                      paddingTop: 4,
                      borderTop: "1px solid var(--border-default)",
                      marginTop: 4,
                      color: toneColor[pelaksanaan(row).tone],
                      fontWeight: pelaksanaan(row).tone === "belum" ? 600 : 400
                    }}
                  >
                    {pelaksanaan(row).label}
                  </div>
                )}
              </Link>
            ))}
          </div>

          <Pagination state={pg} label="penawaran" />
        </>
      )}

      {!hanyaLihat && <Fab href="/quotations/new" label="Buat penawaran" />}
    </div>
  );
}
