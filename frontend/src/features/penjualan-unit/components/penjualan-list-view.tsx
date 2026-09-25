import { useDeferredValue, useRef, useState, type ChangeEvent } from "react";
import { BadgeDollarSign, FileText, Plus, Search, Undo2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { PageError } from "@/components/ui/page-state";
import { ALL_PAGE_SIZE, DEFAULT_PAGE_SIZE, Pagination, type PaginationState } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatRupiah } from "@/lib/utils";
import {
  JENIS_ASET,
  batalkanPenjualan,
  createPenjualan,
  getPenjualan,
  uploadBuktiPenjualan,
  type JenisAset,
  type PenjualanUnit,
  type PenjualanUnitInput
} from "../api";
import { usePenjualanList } from "../queries";
import { PenjualanFormModal } from "./penjualan-form-modal";

const LABEL_JENIS: Record<JenisAset, string> = { unit: "Unit", unit_trailer: "Unit Trailer" };

export function PenjualanListView() {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [jenisAset, setJenisAset] = useState<JenisAset | "">("");
  const qTunda = useDeferredValue(q);

  const [formOpen, setFormOpen] = useState(false);
  const [batal, setBatal] = useState<PenjualanUnit | null>(null);
  // Pesan popup loading; null = tidak ada proses yang berjalan.
  const [busy, setBusy] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<PenjualanUnit | null>(null);

  const data = usePenjualanList({ page, pageSize, q: qTunda, jenisAset });

  function ubah<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  const adaFilter = Boolean(q || jenisAset);
  function resetFilter() {
    setQ("");
    setJenisAset("");
    setPage(1);
  }

  async function simpan(input: PenjualanUnitInput, bukti: File | null): Promise<boolean> {
    setBusy("Mencatat penjualan…");
    const res = await createPenjualan(input);
    if (!res.ok) {
      setBusy(null);
      toast.error(res.error);
      return false;
    }
    if (bukti) {
      setBusy("Mengunggah bukti transaksi…");
      const up = await uploadBuktiPenjualan(res.data.id, bukti);
      if (!up.ok) {
        setBusy(null);
        // Penjualan sudah tersimpan — bukti bisa diunggah ulang dari daftar.
        toast.error(`Penjualan tercatat, tapi bukti gagal diunggah: ${up.error}`);
        return true;
      }
    }
    setBusy(null);
    toast.success(`Penjualan ke ${input.nama_pembeli} tercatat`);
    return true;
  }

  function pilihBukti(p: PenjualanUnit) {
    setUploadTarget(p);
    fileRef.current?.click();
  }

  async function onBuktiDipilih(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const target = uploadTarget;
    setUploadTarget(null);
    if (!file || !target) return;
    setBusy(`Mengunggah bukti ${target.kode_aset}…`);
    const res = await uploadBuktiPenjualan(target.id, file);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Bukti penjualan ${target.kode_aset} diunggah`);
  }

  async function lihatBukti(p: PenjualanUnit) {
    // Tab dibuka lebih dulu (saat klik) supaya tidak diblokir popup blocker.
    const tab = window.open("", "_blank");
    setBusy("Membuka bukti…");
    try {
      const detail = await getPenjualan(p.id);
      if (detail.bukti_url && tab) tab.location.href = detail.bukti_url;
      else {
        tab?.close();
        toast.error("Bukti tidak bisa dibuka");
      }
    } catch (err) {
      tab?.close();
      toast.error(err instanceof Error ? err.message : "Bukti tidak bisa dibuka");
    } finally {
      setBusy(null);
    }
  }

  async function konfirmasiBatal() {
    if (!batal) return;
    const p = batal;
    setBatal(null);
    setBusy(`Membatalkan penjualan ${p.kode_aset}…`);
    const res = await batalkanPenjualan(p.id);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Penjualan ${p.kode_aset} dibatalkan — status kembali Standby`);
  }

  const total = data.data?.total ?? 0;
  const items = data.data?.items ?? [];
  const size = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  const pg: PaginationState<PenjualanUnit> = {
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

  function Aksi({ p }: { p: PenjualanUnit }) {
    return (
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {p.bukti_uploaded_at ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => lihatBukti(p)} disabled={busy !== null}>
            <FileText style={{ width: 13, height: 13 }} />
            Bukti
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => pilihBukti(p)}
          disabled={busy !== null}
          title={p.bukti_uploaded_at ? "Ganti file bukti" : "Unggah bukti"}
        >
          <Upload style={{ width: 13, height: 13 }} />
          {p.bukti_uploaded_at ? "Ganti" : "Unggah bukti"}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ color: "#791f1f" }}
          onClick={() => setBatal(p)}
          disabled={busy !== null}
        >
          <Undo2 style={{ width: 13, height: 13 }} />
          Batalkan
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            Penjualan Unit
          </h1>
          <p className="caption">Catatan penjualan unit & unit trailer. Aset yang terjual tidak bisa dipakai job lagi.</p>
        </div>
        <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />} onClick={() => setFormOpen(true)}>
          Catat penjualan
        </Button>
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => ubah(setQ)(e.target.value)}
            placeholder="Cari nama pembeli…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <div className="toolbar-filter">
          <Select
            value={jenisAset}
            onChange={(e) => ubah(setJenisAset)(e.target.value as JenisAset | "")}
            aria-label="Filter jenis aset"
          >
            <option value="">Semua jenis aset</option>
            {JENIS_ASET.map((j) => (
              <option key={j.value} value={j.value}>
                {j.label}
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
        <div className="card card-pad caption">Memuat penjualan…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={BadgeDollarSign}
          title={adaFilter ? "Tidak ada penjualan yang cocok" : "Belum ada penjualan"}
          description={adaFilter ? "Coba ubah filter atau kata kunci pencarian." : "Catat penjualan unit atau unit trailer pertama."}
        />
      ) : (
        <div style={{ opacity: data.isPlaceholderData ? 0.6 : 1, transition: "opacity 120ms" }}>
          {/* Desktop: tabel */}
          <div className="card hidden lg:block" style={{ overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Tanggal</th>
                  <th>Aset</th>
                  <th>Pembeli</th>
                  <th style={{ width: 160, textAlign: "right" }}>Harga jual</th>
                  <th style={{ width: 280 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.tanggal_jual)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.kode_aset}</div>
                      <div className="caption">{LABEL_JENIS[p.jenis_aset]}</div>
                    </td>
                    <td>
                      <div>{p.nama_pembeli}</div>
                      {p.kontak_pembeli && <div className="caption">{p.kontak_pembeli}</div>}
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
                      {formatRupiah(p.harga_jual)}
                    </td>
                    <td>
                      <Aksi p={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination state={pg} label="penjualan" attached />
          </div>

          {/* Mobile: kartu */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {items.map((p) => (
              <div key={p.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>
                    {p.kode_aset} <span className="caption">· {LABEL_JENIS[p.jenis_aset]}</span>
                  </span>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {formatRupiah(p.harga_jual)}
                  </span>
                </div>
                <div className="caption">
                  {formatDate(p.tanggal_jual)} · {p.nama_pembeli}
                  {p.kontak_pembeli ? ` (${p.kontak_pembeli})` : ""}
                </div>
                <Aksi p={p} />
              </div>
            ))}
            <Pagination state={pg} label="penjualan" />
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={onBuktiDipilih}
      />

      <PenjualanFormModal open={formOpen} onClose={() => setFormOpen(false)} onSubmit={simpan} busy={busy !== null} />

      {batal && (
        <ConfirmDialog
          open
          onClose={() => setBatal(null)}
          title={`Batalkan penjualan ${batal.kode_aset}?`}
          body={`Catatan penjualan ke ${batal.nama_pembeli} dihapus dan ${LABEL_JENIS[batal.jenis_aset].toLowerCase()} ini kembali berstatus Standby.`}
          confirmText="Ya, batalkan"
          variant="danger"
          onConfirm={konfirmasiBatal}
        />
      )}

      <LoadingOverlay message={busy} />
    </div>
  );
}
