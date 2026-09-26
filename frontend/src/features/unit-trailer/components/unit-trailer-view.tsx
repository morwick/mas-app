import { useDeferredValue, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Container, Plus, Search, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { PageError } from "@/components/ui/page-state";
import {
  ALL_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  Pagination,
  type PaginationState
} from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  STATUS_TRAILER_TAMPIL,
  createJenisUnitTrailer,
  createUnitTrailer,
  type JenisUnitTrailer,
  type StatusTrailerTampil,
  type UnitTrailer,
  type UnitTrailerInput
} from "../api";
import { useJenisUnitTrailer, useUnitTrailer } from "../queries";
import { useJenisUnit } from "@/features/settings/queries";
import { UnitTrailerFormModal } from "./unit-trailer-form-modal";

function formatKapasitas(ton: number | null) {
  if (ton == null) return "—";
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(ton)} ton`;
}

export function UnitTrailerView() {
  const toast = useToast();
  const { canManageOperational } = useAuth();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusTrailerTampil | "">("");
  const [jenisUnitTrailerId, setJenisUnitTrailerId] = useState("");
  // Pencarian menunggu jeda ketik, tidak memanggil server tiap huruf.
  const qTunda = useDeferredValue(q);

  const [formOpen, setFormOpen] = useState(false);
  // Pesan popup loading; null = tidak ada proses yang berjalan.
  const [busy, setBusy] = useState<string | null>(null);

  const jenis = useJenisUnitTrailer();
  const jenisUnit = useJenisUnit();
  const [jenisTambahan, setJenisTambahan] = useState<JenisUnitTrailer[]>([]);
  const jenisList = [
    ...(jenis.data ?? []),
    ...jenisTambahan.filter((j) => !(jenis.data ?? []).some((x) => x.id === j.id))
  ];

  const data = useUnitTrailer({ page, pageSize, q: qTunda, status, jenisUnitTrailerId });

  function ubah<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  const adaFilter = Boolean(q || status || jenisUnitTrailerId);
  function resetFilter() {
    setQ("");
    setStatus("");
    setJenisUnitTrailerId("");
    setPage(1);
  }

  async function simpan(input: UnitTrailerInput): Promise<boolean> {
    setBusy(`Menambahkan ${input.kode_trailer}…`);
    const res = await createUnitTrailer(input);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(`Unit trailer ${input.kode_trailer} ditambahkan`);
    setFormOpen(false);
    return true;
  }

  async function tambahJenis(nama: string, jenisUnitId: string): Promise<JenisUnitTrailer | null> {
    setBusy(`Menambahkan jenis unit trailer ${nama}…`);
    const res = await createJenisUnitTrailer(nama, jenisUnitId);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    setJenisTambahan((list) => [...list, res.data]);
    toast.success(`Jenis unit trailer ${res.data.nama} ditambahkan`);
    return res.data;
  }

  const total = data.data?.total ?? 0;
  const items = data.data?.items ?? [];
  const size = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  const pg: PaginationState<UnitTrailer> = {
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
      <div
        style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            Unit Trailer
          </h1>
          <p className="caption">
            Master data trailer: kode, jenis unit trailer, tahun, kapasitas muatan, dan dokumen. Klik baris untuk
            melihat detail, riwayat, dan insiden.
          </p>
        </div>
        {canManageOperational && (
          <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />} onClick={() => setFormOpen(true)}>
            Tambah unit trailer
          </Button>
        )}
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => ubah(setQ)(e.target.value)}
            placeholder="Cari kode trailer…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <div className="toolbar-filter" style={{ minWidth: 200 }}>
          <Combobox
            value={jenisUnitTrailerId}
            onChange={ubah(setJenisUnitTrailerId)}
            options={jenisList.map((j) => ({
              value: j.id,
              label: j.nama,
              hint: j.jenis_unit_nama ?? undefined
            }))}
            placeholder="Semua jenis unit trailer"
            searchPlaceholder="Cari jenis unit trailer…"
            clearable
          />
        </div>
        <div className="toolbar-filter">
          <Select
            value={status}
            onChange={(e) => ubah(setStatus)(e.target.value as StatusTrailerTampil | "")}
            aria-label="Filter status"
          >
            <option value="">Semua status</option>
            {STATUS_TRAILER_TAMPIL.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        {adaFilter && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilter}>
            <X style={{ width: 14, height: 14 }} />
            Reset filter
          </button>
        )}
      </div>

      {data.isError ? (
        <PageError error={data.error} onRetry={data.refetch} />
      ) : data.isPending ? (
        <div className="card card-pad caption">Memuat unit trailer…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Container}
          title={adaFilter ? "Tidak ada unit trailer yang cocok" : "Belum ada unit trailer"}
          description={adaFilter ? "Coba ubah filter atau kata kunci pencarian." : "Tambahkan unit trailer pertama."}
        />
      ) : (
        <div style={{ opacity: data.isPlaceholderData ? 0.6 : 1, transition: "opacity 120ms" }}>
          {/* Desktop: tabel */}
          <div className="card hidden lg:block" style={{ overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Kode trailer</th>
                  <th>Jenis unit trailer</th>
                  <th>Jenis unit</th>
                  <th style={{ width: 90 }}>Tahun</th>
                  <th style={{ width: 150 }}>Kapasitas muatan</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr
                    key={t.id}
                    className="row-link"
                    tabIndex={0}
                    onClick={() => navigate(`/unit-trailer/${t.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(`/unit-trailer/${t.id}`);
                    }}
                  >
                    <td style={{ fontWeight: 600 }}>
                      {t.kode_trailer}
                      {!t.is_active && (
                        <span className="badge" style={{ fontSize: 10, height: 18, marginLeft: 8 }}>
                          Nonaktif
                        </span>
                      )}
                    </td>
                    <td>{t.jenis_nama ?? "—"}</td>
                    <td>{t.jenis_unit_nama ?? "—"}</td>
                    <td>{t.tahun ?? "—"}</td>
                    <td>{formatKapasitas(t.kapasitas_ton)}</td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>
                      <ChevronRight style={{ width: 16, height: 16, color: "var(--text-tertiary)" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination state={pg} label="unit trailer" attached />
          </div>

          {/* Mobile: kartu */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {items.map((t) => (
              <Link
                key={t.id}
                to={`/unit-trailer/${t.id}`}
                className="card card-pad"
                style={{ display: "flex", flexDirection: "column", gap: 6, textDecoration: "none", color: "inherit" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>
                    {t.kode_trailer}
                    {!t.is_active && (
                      <span className="badge" style={{ fontSize: 10, height: 18, marginLeft: 8 }}>
                        Nonaktif
                      </span>
                    )}
                  </span>
                  <StatusBadge status={t.status} />
                </div>
                <div className="caption">
                  {t.jenis_nama ?? "—"} ({t.jenis_unit_nama ?? "—"}) · {t.tahun ?? "—"} ·{" "}
                  {formatKapasitas(t.kapasitas_ton)}
                </div>
              </Link>
            ))}
            <Pagination state={pg} label="unit trailer" />
          </div>
        </div>
      )}

      <UnitTrailerFormModal
        open={formOpen}
        trailer={null}
        jenisList={jenisList}
        jenisUnitList={jenisUnit.data ?? []}
        busy={busy !== null}
        onClose={() => setFormOpen(false)}
        onSave={simpan}
        onCreateJenis={tambahJenis}
      />

      <LoadingOverlay message={busy} />
    </div>
  );
}
