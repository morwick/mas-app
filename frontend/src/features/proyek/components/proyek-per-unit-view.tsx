import { Fragment, useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Truck, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { FilterChips } from "@/components/ui/filter-chips";
import { EmptyState } from "@/components/ui/empty-state";
import { PageError } from "@/components/ui/page-state";
import { ALL_PAGE_SIZE, DEFAULT_PAGE_SIZE, Pagination, type PaginationState } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/badge";
import { bulanTahunWIB, formatDate } from "@/lib/utils";
import type { JobUnitBaris, ProyekPerUnit, StatusProyek } from "../api";
import { useProyekPerUnit } from "../queries";
import { RuteJob } from "@/features/jobs/components/rute-job";
import { ProyekMenuHeader } from "./proyek-menu-header";
import { NAMA_BULAN, opsiTahun } from "./proyek-list-view";

/** Tanggal saja (tanpa jam). Belum muat → keterangan + tanggal ETD sebagai acuan. */
function TanggalMuat({ j }: { j: JobUnitBaris }) {
  if (j.tanggal_muat) return <span className="mono">{formatDate(j.tanggal_muat)}</span>;
  return <span className="caption">Belum muat{j.etd ? ` · ETD ${formatDate(j.etd)}` : ""}</span>;
}

function TanggalBongkar({ j }: { j: JobUnitBaris }) {
  return j.tanggal_bongkar ? <span className="mono">{formatDate(j.tanggal_bongkar)}</span> : <span className="caption">—</span>;
}

function CustomerProyek({ nama }: { nama: string | null }) {
  return nama ? <>{nama}</> : <span style={{ color: "var(--status-pickup-text)", fontWeight: 700 }}>KOSONGAN</span>;
}

function TautanProyek({ j }: { j: JobUnitBaris }) {
  return (
    <Link to={`/proyek/${j.proyek_id}`} className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>
      {j.nomor_proyek}
    </Link>
  );
}

function TautanJob({ j }: { j: JobUnitBaris }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <Link to={`/jobs/${j.job_id}`} className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>
        {j.job_number}
      </Link>
      {j.dibatalkan && <StatusBadge status="cancelled" />}
    </span>
  );
}

/**
 * Tab "Proyek per unit": unit (paging per unit di server) dan, di bawahnya,
 * job-job yang memakai unit itu pada periode terpilih — no. proyek, no. job,
 * customer, rute, tanggal muat & bongkar (tanggal saja), urut tanggal muat.
 * Default: bulan & tahun berjalan, status Aktif. Unit tanpa job tidak tampil.
 */
export function ProyekPerUnitView() {
  const [periodeAwal] = useState(() => bulanTahunWIB());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [bulan, setBulan] = useState(periodeAwal.bulan);
  const [tahun, setTahun] = useState(periodeAwal.tahun);
  const [statusProyek, setStatusProyek] = useState<StatusProyek | "">("aktif");
  // Pencarian menunggu jeda ketik, tidak memanggil server tiap huruf.
  const qTunda = useDeferredValue(q);

  const data = useProyekPerUnit({ page, pageSize, q: qTunda, bulan, tahun, statusProyek });

  // Setiap filter berubah, kembali ke halaman 1.
  function ubah<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  const bisaReset = Boolean(
    q || statusProyek !== "aktif" || bulan !== periodeAwal.bulan || tahun !== periodeAwal.tahun
  );
  function resetFilter() {
    setQ("");
    setBulan(periodeAwal.bulan);
    setTahun(periodeAwal.tahun);
    setStatusProyek("aktif");
    setPage(1);
  }

  const bulanOptions = useMemo<ComboboxOption[]>(
    () => NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama })),
    []
  );
  const tahunOptions = useMemo(opsiTahun, []);

  const total = data.data?.total ?? 0;
  const items: ProyekPerUnit[] = data.data?.items ?? [];
  const size = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  const pg: PaginationState<ProyekPerUnit> = {
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
      <ProyekMenuHeader aktif="unit" />

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => ubah(setQ)(e.target.value)}
            placeholder="Cari kode unit, no. polisi, no. job, no. proyek, customer…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
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
      </div>

      <FilterChips
        value={statusProyek || "semua"}
        onChange={(k) => ubah(setStatusProyek)(k === "semua" ? "" : (k as StatusProyek))}
        items={[
          { key: "semua", label: "Semua" },
          { key: "aktif", label: "Aktif" },
          { key: "batal", label: "Dibatalkan" }
        ]}
      />

      <p className="caption" style={{ margin: 0 }}>
        Periode & urutan memakai tanggal muat; job yang belum muat memakai ETD.
      </p>

      {data.isError ? (
        <PageError error={data.error} onRetry={data.refetch} />
      ) : data.isPending ? (
        <div className="card card-pad caption">Memuat proyek per unit…</div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Truck}
            title="Tidak ada job di periode ini"
            description="Hanya unit yang punya job yang ditampilkan. Coba ubah filter atau kata kunci pencarian."
          />
        </div>
      ) : (
        <div style={{ opacity: data.isPlaceholderData ? 0.6 : 1, transition: "opacity 120ms" }}>
          {/* Desktop: satu tabel, baris unit sebagai judul kelompok. */}
          <div className="card hidden lg:block" style={{ overflow: "hidden" }}>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 190 }}>No. proyek</th>
                    <th style={{ width: 170 }}>No. job</th>
                    <th>Customer</th>
                    <th>Rute</th>
                    <th style={{ width: 150 }}>Tanggal muat</th>
                    <th style={{ width: 130 }}>Tanggal bongkar</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => (
                    <Fragment key={u.unit_id}>
                      <tr style={{ background: "var(--bg-muted)" }}>
                        <td colSpan={6} style={{ paddingTop: 8, paddingBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <Link to={`/units/${u.unit_id}`} style={{ fontWeight: 700, fontSize: 13.5 }}>
                              {u.kode_unit}
                            </Link>
                            {u.no_polisi && (
                              <span className="mono caption" style={{ whiteSpace: "nowrap" }}>
                                {u.no_polisi}
                              </span>
                            )}
                            {u.jenis_unit_nama && <span className="caption">· {u.jenis_unit_nama}</span>}
                            <span className="caption">· {u.jobs.length} job</span>
                          </div>
                        </td>
                      </tr>
                      {u.jobs.map((j) => (
                        <tr key={j.job_id} style={{ opacity: j.dibatalkan ? 0.7 : 1 }}>
                          <td style={{ paddingLeft: 32 }}>
                            <TautanProyek j={j} />
                          </td>
                          <td>
                            <TautanJob j={j} />
                          </td>
                          <td style={{ fontSize: 13 }}>
                            <CustomerProyek nama={j.customer_nama} />
                          </td>
                          <td style={{ fontSize: 12 }}>
                            <RuteJob asal={j.asal} tujuan={j.tujuan} />
                          </td>
                          <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                            <TanggalMuat j={j} />
                          </td>
                          <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                            <TanggalBongkar j={j} />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination state={pg} label="unit" attached />
          </div>

          {/* Mobile: kartu per unit. */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {items.map((u) => (
              <div key={u.unit_id} className="list-card" style={{ gap: 8 }}>
                <div className="list-card-row">
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/units/${u.unit_id}`} style={{ fontWeight: 700, fontSize: 14 }}>
                      {u.kode_unit}
                    </Link>
                    <div className="caption">
                      <span className="mono" style={{ whiteSpace: "nowrap" }}>
                        {u.no_polisi ?? "—"}
                      </span>
                      {u.jenis_unit_nama ? ` · ${u.jenis_unit_nama}` : ""}
                    </div>
                  </div>
                  <span className="caption">{u.jobs.length} job</span>
                </div>
                {u.jobs.map((j) => (
                  <div
                    key={j.job_id}
                    style={{ borderTop: "0.5px dashed var(--border-default)", paddingTop: 6, opacity: j.dibatalkan ? 0.7 : 1 }}
                  >
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <TautanProyek j={j} />
                      <TautanJob j={j} />
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <CustomerProyek nama={j.customer_nama} />
                    </div>
                    <div style={{ fontSize: 12, margin: "2px 0" }}>
                      <RuteJob asal={j.asal} tujuan={j.tujuan} />
                    </div>
                    <div className="caption">
                      Muat: <TanggalMuat j={j} /> · Bongkar: <TanggalBongkar j={j} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <Pagination state={pg} label="unit" />
          </div>
        </div>
      )}
    </div>
  );
}
