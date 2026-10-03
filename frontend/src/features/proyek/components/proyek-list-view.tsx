import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { FilterChips } from "@/components/ui/filter-chips";
import { EmptyState } from "@/components/ui/empty-state";
import { PageError } from "@/components/ui/page-state";
import { Fab } from "@/components/layout/fab";
import {
  ALL_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  Pagination,
  type PaginationState
} from "@/components/ui/pagination";
import { bulanTahunWIB, formatDate } from "@/lib/utils";
import type { Customer, ProyekRingkas } from "@/types";
import { FILTER_TANPA_CUSTOMER, type StatusProyek, type StatusTagih } from "../api";
import { useProyekPage } from "../queries";
import { ProyekMenuHeader } from "./proyek-menu-header";
import { StatusBadge } from "@/components/ui/badge";
import { proyekDibatalkan } from "../status";
import { KepalaKolomLihat, TombolLihat, useBarisDetail } from "@/components/ui/baris-detail";

export const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember"
];

/** Pilihan tahun filter: tahun ini mundur 5 tahun (nomor proyek memuat tahunnya). */
export function opsiTahun(): ComboboxOption[] {
  const sekarang = bulanTahunWIB().tahun;
  return Array.from({ length: 6 }, (_, i) => {
    const t = String(sekarang - i);
    return { value: t, label: t };
  });
}

function TagihanProyek({ p }: { p: ProyekRingkas }) {
  // Kosongan (tanpa customer) tidak pernah ditagih — tanpa status tagihan.
  if (!p.invoice_number && !p.customer_id) return <span className="caption">—</span>;
  if (!p.invoice_number)
    return <span className="caption">Belum ditagih</span>;
  return (
    <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
      {p.invoice_number}
    </span>
  );
}

function RingkasJob({ p }: { p: ProyekRingkas }) {
  return (
    // Job batal tidak ikut dihitung.
    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.jumlah_job - p.jumlah_job_batal} job</div>
  );
}

/** Customer proyek; kosong = unit jalan kosongan. */
function CustomerProyek({ p }: { p: ProyekRingkas }) {
  return p.customer_nama ? <>{p.customer_nama}</> : <span style={{ color: "var(--status-pickup-text)", fontWeight: 700 }}>KOSONGAN</span>;
}

/**
 * Tombol "Tambah job": membuka form proyek dengan 1 job baru siap diisi.
 * BATASAN: proyek yang sudah masuk tagihan tidak bisa ditambah job (database
 * juga menolak — trg_jobs_tolak_tambah_proyek_ditagih), jadi tombolnya disembunyikan.
 */
function TombolTambahJob({ p }: { p: ProyekRingkas }) {
  if (p.invoice_id) return null;
  return (
    <Link
      to={`/proyek/${p.id}/tambah-job`}
      className="btn btn-secondary btn-sm"
      style={{ textDecoration: "none", whiteSpace: "nowrap" }}
      onClick={(e) => e.stopPropagation()}
      title={`Tambah job ke proyek ${p.nomor_proyek}`}
    >
      <Plus style={{ width: 13, height: 13 }} />
      Tambah job
    </Link>
  );
}

export function ProyekListView({ customers }: { customers: Customer[] }) {
  const barisDetail = useBarisDetail();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState("");
  // Default: bulan & tahun berjalan (WIB). Dikosongkan = semua bulan/tahun.
  const [periodeAwal] = useState(() => bulanTahunWIB());
  const [bulan, setBulan] = useState(periodeAwal.bulan);
  const [tahun, setTahun] = useState(periodeAwal.tahun);
  // Default: proyek Aktif. Filter tagihan hanya tampil (dan berlaku) di Aktif.
  const [statusProyek, setStatusProyek] = useState<StatusProyek | "">("aktif");
  const [statusTagih, setStatusTagih] = useState<StatusTagih | "">("");
  // Pencarian menunggu jeda ketik, tidak memanggil server tiap huruf.
  const qTunda = useDeferredValue(q);

  const proyek = useProyekPage({
    page,
    pageSize,
    q: qTunda,
    customerId,
    bulan,
    tahun,
    statusTagih,
    statusProyek
  });

  // Setiap filter berubah, kembali ke halaman 1.
  function ubah<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  // Tombol reset & pesan "tidak ada yang cocok" hanya bila filter beda dari default.
  const bisaReset = Boolean(
    q || customerId || statusTagih || bulan !== periodeAwal.bulan || tahun !== periodeAwal.tahun
  );
  function resetFilter() {
    setQ("");
    setCustomerId("");
    setBulan(periodeAwal.bulan);
    setTahun(periodeAwal.tahun);
    setStatusTagih("");
    setPage(1);
  }

  const customerOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: FILTER_TANPA_CUSTOMER, label: "Tanpa customer (kosongan)" },
      ...customers.map((c) => ({
        value: c.id,
        label: c.nama_perusahaan,
        hint: c.kota ?? undefined
      }))
    ],
    [customers]
  );
  const bulanOptions = useMemo<ComboboxOption[]>(
    () => NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama })),
    []
  );
  const tahunOptions = useMemo(opsiTahun, []);

  const total = proyek.data?.total ?? 0;
  const items = proyek.data?.items ?? [];
  const size = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  const pg: PaginationState<ProyekRingkas> = {
    page,
    pageCount: Math.max(1, Math.ceil(total / size)),
    total,
    pageSize,
    items,
    from: total === 0 ? 0 : (page - 1) * size + 1,
    to: Math.min(page * size, total),
    setPage,
    setPageSize: ubah(setPageSize)
  };

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <ProyekMenuHeader aktif="proyek" />

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => ubah(setQ)(e.target.value)}
            placeholder="Cari no. proyek, customer, PIC, no. job…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <div className="toolbar-filter">
          <Combobox
            value={customerId}
            onChange={ubah(setCustomerId)}
            options={customerOptions}
            placeholder="Semua customer"
            searchPlaceholder="Cari customer…"
            emptyText="Customer tidak ditemukan"
            clearable
          />
        </div>
        <div style={{ minWidth: 150 }}>
          <Combobox
            value={bulan ? String(bulan) : ""}
            onChange={(v) => ubah(setBulan)(Number(v) || 0)}
            options={bulanOptions}
            placeholder="Semua bulan"
            searchPlaceholder="Cari bulan…"
            clearable
          />
        </div>
        <div style={{ minWidth: 120 }}>
          <Combobox
            value={tahun ? String(tahun) : ""}
            onChange={(v) => ubah(setTahun)(Number(v) || 0)}
            options={tahunOptions}
            placeholder="Semua tahun"
            searchPlaceholder="Cari tahun…"
            clearable
          />
        </div>
        {bisaReset && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilter}>
            <X style={{ width: 14, height: 14 }} />
            Reset filter
          </button>
        )}
        <Link to="/jobs/new" className="hidden lg:inline-flex">
          <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>Proyek baru</Button>
        </Link>
      </div>

      <div className="flex flex-col" style={{ gap: 8 }}>
        <FilterChips
          value={statusProyek || "semua"}
          onChange={(k) => {
            ubah(setStatusProyek)(k === "semua" ? "" : (k as StatusProyek));
            // Filter tagihan hanya milik kelompok Aktif — mulai lagi dari "Semua tagihan".
            setStatusTagih("");
          }}
          items={[
            { key: "semua", label: "Semua" },
            { key: "aktif", label: "Aktif" },
            { key: "batal", label: "Dibatalkan" }
          ]}
        />
        {/* Filter tagihan hanya untuk proyek Aktif; di Semua/Dibatalkan disembunyikan. */}
        {statusProyek === "aktif" && (
          <FilterChips
            value={statusTagih || "semua"}
            onChange={(k) => ubah(setStatusTagih)(k === "semua" ? "" : (k as StatusTagih))}
            items={[
              { key: "semua", label: "Semua tagihan" },
              { key: "belum", label: "Belum Ditagih" },
              { key: "sudah", label: "Sudah Ditagih" }
            ]}
          />
        )}
      </div>

      {proyek.isError ? (
        <PageError error={proyek.error} onRetry={proyek.refetch} />
      ) : proyek.isPending ? (
        <div className="card card-pad caption">Memuat proyek…</div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FolderKanban}
            title={
              bisaReset
                ? "Tidak ada proyek yang cocok"
                : statusProyek === "batal"
                ? "Tidak ada proyek dibatalkan"
                : bulan && tahun
                ? `Belum ada proyek di ${NAMA_BULAN[bulan - 1]} ${tahun}`
                : "Belum ada proyek"
            }
            description={
              bisaReset
                ? "Coba ubah filter atau kata kunci pencarian."
                : "Buat proyek baru beserta job pertamanya, atau pilih bulan lain."
            }
            action={
              bisaReset ? undefined : (
                <Link to="/jobs/new">
                  <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />}>Proyek baru</Button>
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div style={{ opacity: proyek.isPlaceholderData ? 0.6 : 1, transition: "opacity 120ms" }}>
          {/* Desktop: tabel */}
          <div className="card hidden lg:block" style={{ overflow: "hidden" }}>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <KepalaKolomLihat />
                    <th style={{ width: 200 }}>No. Proyek</th>
                    <th>Customer</th>
                    <th>PIC lapangan</th>
                    <th style={{ width: 150 }}>Unit / Penawaran</th>
                    <th style={{ width: 120 }}>Job</th>
                    <th style={{ width: 170 }}>Tagihan</th>
                    <th style={{ width: 150 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} {...barisDetail(`/proyek/${p.id}`)}>
                      <td style={{ width: 44 }}>
                        <TombolLihat tujuan={`/proyek/${p.id}`} />
                      </td>
                      <td>
                        <div className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>
                          {p.nomor_proyek}
                        </div>
                        {proyekDibatalkan(p) && <StatusBadge status="cancelled" className="mt-1" />}
                      </td>
                      <td style={{ fontWeight: 500, fontSize: 13.5 }}>
                        <CustomerProyek p={p} />
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        <div>{p.pic_nama || "—"}</div>
                        {p.pic_no_hp && <div className="caption mono">{p.pic_no_hp}</div>}
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        <div className="mono">{p.unit_kode || "—"}</div>
                        {p.quote_number && <div className="caption mono">{p.quote_number}</div>}
                      </td>
                      <td>
                        <RingkasJob p={p} />
                      </td>
                      <td>
                        <TagihanProyek p={p} />
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                          <TombolTambahJob p={p} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination state={pg} label="proyek" attached />
          </div>

          {/* Mobile: kartu */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {items.map((p) => (
              <Link key={p.id} to={`/proyek/${p.id}`} className="list-card">
                <div className="list-card-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mono" style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text-primary)" }}>
                      {p.nomor_proyek}
                    </div>
                    {proyekDibatalkan(p) && <StatusBadge status="cancelled" className="mt-1" />}
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      <CustomerProyek p={p} />
                    </div>
                    {p.unit_kode && <div className="caption mono">Unit {p.unit_kode}</div>}
                    {p.pic_nama && (
                      <div className="caption">
                        PIC {p.pic_nama}
                        {p.pic_no_hp ? ` · ${p.pic_no_hp}` : ""}
                      </div>
                    )}
                  </div>
                  <RingkasJob p={p} />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11.5,
                    paddingTop: 6,
                    borderTop: "0.5px dashed var(--border-default)"
                  }}
                >
                  <span className="caption mono">{formatDate(p.created_at)}</span>
                  <TagihanProyek p={p} />
                </div>
                {!p.invoice_id && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <TombolTambahJob p={p} />
                  </div>
                )}
              </Link>
            ))}
            <Pagination state={pg} label="proyek" />
          </div>
        </div>
      )}

      <Fab href="/jobs/new" label="Proyek baru" />
    </div>
  );
}
