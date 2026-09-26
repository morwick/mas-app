import { useDeferredValue, useState } from "react";
import { BadgeDollarSign, Eye, FileDown, Pencil, Plus, Search, Undo2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { DokumenSiapModal } from "@/components/surat/dokumen-siap-modal";
import { UnggahDokumenModal } from "@/components/surat/unggah-dokumen-modal";
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
  penjualanTerkunci,
  updatePenjualan,
  uploadBuktiPenjualan,
  type DokumenTtd,
  type JenisAset,
  type PenjualanUnit,
  type PenjualanUnitInput
} from "../api";
import { usePenjualanList } from "../queries";
import { PenjualanFormModal } from "./penjualan-form-modal";

const LABEL_JENIS: Record<JenisAset, string> = { unit: "Unit", unit_trailer: "Unit Trailer" };
const LABEL_DOKUMEN: Record<DokumenTtd, string> = { surat: "Surat penjualan", bast: "BAST" };
const KUNCI = "Surat / BAST bertanda tangan sudah diunggah";

/** Dokumen cetak penjualan: surat penjualan & berita acara serah terima. */
function dokumenPenjualan(id: string) {
  return [
    { label: "Surat Penjualan", href: `/penjualan-unit/${id}/surat` },
    { label: "Berita Acara Serah Terima", href: `/penjualan-unit/${id}/bast` }
  ];
}

export function PenjualanListView() {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [jenisAset, setJenisAset] = useState<JenisAset | "">("");
  const qTunda = useDeferredValue(q);

  // null = tertutup; { penjualan: null } = catat baru; berisi = edit.
  const [form, setForm] = useState<{ penjualan: PenjualanUnit | null } | null>(null);
  const [batal, setBatal] = useState<PenjualanUnit | null>(null);
  const [unggah, setUnggah] = useState<PenjualanUnit | null>(null);
  // Penjualan yang baru tersimpan — tawarkan unduh dokumennya.
  const [dokumenBaru, setDokumenBaru] = useState<string | null>(null);
  // Pesan popup loading; null = tidak ada proses yang berjalan.
  const [busy, setBusy] = useState<string | null>(null);

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

  async function simpan(input: PenjualanUnitInput): Promise<boolean> {
    const edit = form?.penjualan;
    if (edit) {
      setBusy(`Menyimpan perubahan ${edit.nomor_surat ?? edit.kode_aset}…`);
      const { jenis_aset: _j, asset_id: _a, ...isian } = input;
      const res = await updatePenjualan(edit.id, isian);
      setBusy(null);
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      toast.success(`Penjualan ${edit.nomor_surat ?? edit.kode_aset} diperbarui`);
      return true;
    }
    setBusy("Mencatat penjualan…");
    const res = await createPenjualan(input);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(`Penjualan ke ${input.nama_pembeli} tercatat`);
    setDokumenBaru(res.data.id);
    return true;
  }

  async function simpanUnggahan(p: PenjualanUnit, file: Record<string, File>): Promise<boolean> {
    for (const [dokumen, f] of Object.entries(file) as [DokumenTtd, File][]) {
      setBusy(`Mengunggah ${LABEL_DOKUMEN[dokumen]} ${p.nomor_surat ?? p.kode_aset}…`);
      const res = await uploadBuktiPenjualan(p.id, dokumen, f);
      if (!res.ok) {
        setBusy(null);
        toast.error(`${LABEL_DOKUMEN[dokumen]} gagal diunggah: ${res.error}`);
        return false;
      }
    }
    setBusy(null);
    toast.success("Dokumen bertanda tangan diunggah");
    return true;
  }

  async function lihatDokumen(p: PenjualanUnit, dokumen: DokumenTtd) {
    // Tab dibuka lebih dulu (saat klik) supaya tidak diblokir popup blocker.
    const tab = window.open("", "_blank");
    setBusy("Membuka dokumen…");
    try {
      const detail = await getPenjualan(p.id);
      const url = dokumen === "surat" ? detail.bukti_url : detail.bukti_bast_url;
      if (url && tab) tab.location.href = url;
      else {
        tab?.close();
        toast.error("Dokumen tidak bisa dibuka");
      }
    } catch (err) {
      tab?.close();
      toast.error(err instanceof Error ? err.message : "Dokumen tidak bisa dibuka");
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
    toast.success(`Penjualan ${p.kode_aset} dibatalkan`);
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
    const terkunci = penjualanTerkunci(p);
    const ikon = (I: typeof FileDown) => <I style={{ width: 14, height: 14 }} />;
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <ActionMenu
          items={[
            { label: "Unduh surat penjualan", icon: ikon(FileDown), href: dokumenPenjualan(p.id)[0].href },
            { label: "Unduh BAST", icon: ikon(FileDown), href: dokumenPenjualan(p.id)[1].href },
            {
              label: "Unggah dokumen bertanda tangan",
              icon: ikon(Upload),
              onSelect: () => setUnggah(p),
              disabled: busy !== null
            },
            ...(p.bukti_uploaded_at
              ? [{ label: "Lihat surat bertanda tangan", icon: ikon(Eye), onSelect: () => lihatDokumen(p, "surat") }]
              : []),
            ...(p.bukti_bast_uploaded_at
              ? [{ label: "Lihat BAST bertanda tangan", icon: ikon(Eye), onSelect: () => lihatDokumen(p, "bast") }]
              : []),
            {
              label: "Edit",
              icon: ikon(Pencil),
              onSelect: () => setForm({ penjualan: p }),
              disabled: terkunci || busy !== null,
              hint: terkunci ? KUNCI : undefined
            },
            {
              label: "Batalkan penjualan",
              icon: ikon(Undo2),
              onSelect: () => setBatal(p),
              danger: true,
              disabled: terkunci || busy !== null,
              hint: terkunci ? KUNCI : undefined
            }
          ]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            Penjualan Unit &amp; Unit Trailer
          </h1>
          <p className="caption">Catatan penjualan unit & unit trailer. Aset yang terjual tidak bisa dipakai job lagi.</p>
        </div>
        <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />} onClick={() => setForm({ penjualan: null })}>
          Catat penjualan
        </Button>
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => ubah(setQ)(e.target.value)}
            placeholder="Cari no. penjualan, nama, no HP, atau email pembeli…"
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
                  <th style={{ width: 190 }}>No. penjualan / tanggal</th>
                  <th>Aset</th>
                  <th>Pembeli</th>
                  <th style={{ width: 160, textAlign: "right" }}>Harga jual</th>
                  <th style={{ width: 150 }}>Dokumen TTD</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                        {p.nomor_surat ?? "—"}
                      </div>
                      <div className="caption">{formatDate(p.tanggal_jual)}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.kode_aset}</div>
                      <div className="caption">{LABEL_JENIS[p.jenis_aset]}</div>
                    </td>
                    <td>
                      <div>{p.nama_pembeli}</div>
                      {p.no_hp_pembeli && <div className="caption">{p.no_hp_pembeli}</div>}
                      {p.email_pembeli && <div className="caption">{p.email_pembeli}</div>}
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
                      {formatRupiah(p.harga_jual)}
                    </td>
                    <td className="caption">
                      <StatusTtd p={p} />
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
                <div className="caption mono">{p.nomor_surat ?? "—"}</div>
                <div className="caption">
                  {formatDate(p.tanggal_jual)} · {p.nama_pembeli}
                  {[p.no_hp_pembeli, p.email_pembeli].some(Boolean)
                    ? ` (${[p.no_hp_pembeli, p.email_pembeli].filter(Boolean).join(" · ")})`
                    : ""}
                </div>
                <div className="caption">
                  <StatusTtd p={p} />
                </div>
                <Aksi p={p} />
              </div>
            ))}
            <Pagination state={pg} label="penjualan" />
          </div>
        </div>
      )}

      <PenjualanFormModal
        open={form !== null}
        penjualan={form?.penjualan ?? null}
        onClose={() => setForm(null)}
        onSubmit={simpan}
        busy={busy !== null}
      />
      <UnggahDokumenModal
        open={unggah !== null}
        onClose={() => setUnggah(null)}
        judul={`Dokumen bertanda tangan — ${unggah?.nomor_surat ?? unggah?.kode_aset ?? ""}`}
        busy={busy !== null}
        slot={[
          { key: "surat", label: "Surat penjualan bertanda tangan", diunggah: unggah?.bukti_uploaded_at ?? null },
          { key: "bast", label: "BAST bertanda tangan", diunggah: unggah?.bukti_bast_uploaded_at ?? null }
        ]}
        onUnggah={(file) => (unggah ? simpanUnggahan(unggah, file) : Promise.resolve(false))}
      />

      {batal && (
        <ConfirmDialog
          open
          onClose={() => setBatal(null)}
          title={`Batalkan penjualan ${batal.kode_aset}?`}
          body={`Catatan penjualan ke ${batal.nama_pembeli} dihapus dan ${LABEL_JENIS[batal.jenis_aset].toLowerCase()} ini kembali ke status sebelum dijual. Insiden yang ditutup saat dijual dibuka lagi.`}
          confirmText="Ya, batalkan"
          variant="danger"
          onConfirm={konfirmasiBatal}
        />
      )}

      <DokumenSiapModal
        open={dokumenBaru !== null}
        onClose={() => setDokumenBaru(null)}
        judul="Penjualan tercatat"
        keterangan="Unduh dokumennya sekarang, atau nanti lewat tombol Surat / BAST di daftar."
        dokumen={dokumenBaru ? dokumenPenjualan(dokumenBaru) : []}
      />

      <LoadingOverlay message={busy} />
    </div>
  );
}

/** Ringkas status dokumen bertanda tangan di baris daftar. */
function StatusTtd({ p }: { p: PenjualanUnit }) {
  const ada = [p.bukti_uploaded_at ? "Surat" : null, p.bukti_bast_uploaded_at ? "BAST" : null].filter(Boolean);
  return <>{ada.length ? `✓ ${ada.join(" & ")}` : "Belum ada"}</>;
}
