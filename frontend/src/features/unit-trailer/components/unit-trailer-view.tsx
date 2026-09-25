import { useDeferredValue, useState } from "react";
import { Container, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  deleteUnitTrailer,
  updateUnitTrailer,
  type JenisUnitTrailer,
  type StatusTrailerTampil,
  type UnitTrailer,
  type UnitTrailerInput
} from "../api";
import { useJenisUnitTrailer, useUnitTrailer } from "../queries";
import { useJenisUnit } from "@/features/settings/queries";
import { UnitTrailerFormModal } from "./unit-trailer-form-modal";

const WARNA_STATUS: Record<StatusTrailerTampil, string> = {
  standby: "badge-standby",
  perbaikan: "badge-perbaikan",
  terjual: "badge-terjual"
};

function StatusBadge({ status }: { status: StatusTrailerTampil }) {
  const label = STATUS_TRAILER_TAMPIL.find((s) => s.value === status)?.label ?? status;
  return <span className={`badge ${WARNA_STATUS[status]}`}>{label}</span>;
}

function formatKapasitas(ton: number | null) {
  if (ton == null) return "—";
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(ton)} ton`;
}

export function UnitTrailerView() {
  const toast = useToast();
  const { canManageOperational } = useAuth();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusTrailerTampil | "">("");
  const [jenisUnitTrailerId, setJenisUnitTrailerId] = useState("");
  // Pencarian menunggu jeda ketik, tidak memanggil server tiap huruf.
  const qTunda = useDeferredValue(q);

  const [form, setForm] = useState<{ trailer: UnitTrailer | null } | null>(null);
  const [hapus, setHapus] = useState<UnitTrailer | null>(null);
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
    const edit = form?.trailer;
    setBusy(edit ? `Menyimpan perubahan ${edit.kode_trailer}…` : `Menambahkan ${input.kode_trailer}…`);
    const res = edit ? await updateUnitTrailer(edit.id, input) : await createUnitTrailer(input);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(edit ? `Unit trailer ${input.kode_trailer} diperbarui` : `Unit trailer ${input.kode_trailer} ditambahkan`);
    setForm(null);
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

  async function konfirmasiHapus() {
    if (!hapus) return;
    const t = hapus;
    setHapus(null);
    setBusy(`Menghapus ${t.kode_trailer}…`);
    const res = await deleteUnitTrailer(t.id);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Unit trailer ${t.kode_trailer} dihapus`);
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

  function Aksi({ t }: { t: UnitTrailer }) {
    // Trailer terjual dikelola lewat menu Penjualan Unit.
    if (t.status === "terjual") return null;
    return (
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setForm({ trailer: t })}
          disabled={busy !== null}
        >
          <Pencil style={{ width: 13, height: 13 }} />
          Edit
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm btn-icon"
          title="Hapus"
          aria-label={`Hapus ${t.kode_trailer}`}
          style={{ color: "#791f1f" }}
          onClick={() => setHapus(t)}
          disabled={busy !== null}
        >
          <Trash2 style={{ width: 14, height: 14 }} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div
        style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            Unit Trailer
          </h1>
          <p className="caption">Master data trailer: kode, jenis unit trailer, tahun, dan kapasitas muatan.</p>
        </div>
        {canManageOperational && (
          <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />} onClick={() => setForm({ trailer: null })}>
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
                  {canManageOperational && <th style={{ width: 130 }}></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.kode_trailer}</td>
                    <td>{t.jenis_nama ?? "—"}</td>
                    <td>{t.jenis_unit_nama ?? "—"}</td>
                    <td>{t.tahun ?? "—"}</td>
                    <td>{formatKapasitas(t.kapasitas_ton)}</td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    {canManageOperational && (
                      <td>
                        <Aksi t={t} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination state={pg} label="unit trailer" attached />
          </div>

          {/* Mobile: kartu */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {items.map((t) => (
              <div key={t.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>{t.kode_trailer}</span>
                  <StatusBadge status={t.status} />
                </div>
                <div className="caption">
                  {t.jenis_nama ?? "—"} ({t.jenis_unit_nama ?? "—"}) · {t.tahun ?? "—"} ·{" "}
                  {formatKapasitas(t.kapasitas_ton)}
                </div>
                {canManageOperational && <Aksi t={t} />}
              </div>
            ))}
            <Pagination state={pg} label="unit trailer" />
          </div>
        </div>
      )}

      <UnitTrailerFormModal
        open={form !== null}
        trailer={form?.trailer ?? null}
        jenisList={jenisList}
        jenisUnitList={jenisUnit.data ?? []}
        busy={busy !== null}
        onClose={() => setForm(null)}
        onSave={simpan}
        onCreateJenis={tambahJenis}
      />

      {hapus && (
        <ConfirmDialog
          open
          onClose={() => setHapus(null)}
          title={`Hapus unit trailer ${hapus.kode_trailer}?`}
          body="Data tidak hilang dari database (ditandai terhapus) dan masih bisa dikembalikan bila salah hapus."
          confirmText="Ya, hapus"
          variant="danger"
          onConfirm={konfirmasiHapus}
        />
      )}

      <LoadingOverlay message={busy} />
    </div>
  );
}
