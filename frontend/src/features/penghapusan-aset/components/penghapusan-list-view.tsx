import { useDeferredValue, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, FileDown, PackageX, Pencil, Plus, Search, Undo2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { UnggahDokumenModal } from "@/components/surat/unggah-dokumen-modal";
import { DokumenSiapModal } from "@/components/surat/dokumen-siap-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { PageError } from "@/components/ui/page-state";
import { ALL_PAGE_SIZE, DEFAULT_PAGE_SIZE, Pagination, type PaginationState } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import {
  JENIS_ASET,
  batalkanPenghapusan,
  createPenghapusan,
  getPenghapusan,
  penghapusanTerkunci,
  updatePenghapusan,
  uploadBuktiPenghapusan,
  type InsidenDibukaLagi,
  type JenisAset,
  type PenghapusanAset,
  type PenghapusanAsetInput
} from "../api";
import { usePenghapusanList } from "../queries";
import { BatalPenghapusanModal } from "./batal-penghapusan-modal";
import { PenghapusanFormModal } from "./penghapusan-form-modal";

const LABEL_JENIS: Record<JenisAset, string> = { unit: "Unit", unit_trailer: "Unit Trailer" };

function hrefBeritaAcara(id: string): string {
  return `/penghapusan-aset/${id}/berita-acara`;
}

function hrefAset(p: PenghapusanAset): string {
  return p.jenis_aset === "unit" ? `/units/${p.unit_id}` : `/unit-trailer/${p.unit_trailer_id}`;
}

export function PenghapusanListView() {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [jenisAset, setJenisAset] = useState<JenisAset | "">("");
  const qTunda = useDeferredValue(q);

  // null = tertutup; { penghapusan: null } = catat baru; berisi = edit.
  const [form, setForm] = useState<{ penghapusan: PenghapusanAset | null } | null>(null);
  const [unggah, setUnggah] = useState<PenghapusanAset | null>(null);
  const [batal, setBatal] = useState<PenghapusanAset | null>(null);
  // Penghapusan yang baru tersimpan — tawarkan unduh berita acaranya.
  const [dokumenBaru, setDokumenBaru] = useState<string | null>(null);
  // Pesan popup loading; null = tidak ada proses yang berjalan.
  const [busy, setBusy] = useState<string | null>(null);

  const data = usePenghapusanList({ page, pageSize, q: qTunda, jenisAset });

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

  async function simpan(input: PenghapusanAsetInput): Promise<boolean> {
    const edit = form?.penghapusan;
    if (edit) {
      setBusy(`Menyimpan perubahan ${edit.nomor_berita_acara ?? edit.kode_aset}…`);
      const { jenis_aset: _j, asset_id: _a, ...isian } = input;
      const res = await updatePenghapusan(edit.id, isian);
      setBusy(null);
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      toast.success(`Penghapusan ${edit.nomor_berita_acara ?? edit.kode_aset} diperbarui`);
      return true;
    }
    setBusy("Mencatat penghapusan…");
    const res = await createPenghapusan(input);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success("Penghapusan tercatat — status kini Diafkirkan");
    setDokumenBaru(res.data.id);
    return true;
  }

  async function simpanUnggahan(p: PenghapusanAset, file: Record<string, File>): Promise<boolean> {
    const f = file.berita_acara;
    if (!f) return false;
    setBusy(`Mengunggah berita acara ${p.nomor_berita_acara ?? p.kode_aset}…`);
    const res = await uploadBuktiPenghapusan(p.id, f);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success("Berita acara bertanda tangan diunggah");
    return true;
  }

  async function lihatBukti(p: PenghapusanAset) {
    // Tab dibuka lebih dulu (saat klik) supaya tidak diblokir popup blocker.
    const tab = window.open("", "_blank");
    setBusy("Membuka dokumen…");
    try {
      const detail = await getPenghapusan(p.id);
      if (detail.bukti_url && tab) tab.location.href = detail.bukti_url;
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

  async function konfirmasiBatal(alasan: string, insiden: InsidenDibukaLagi[]) {
    if (!batal) return;
    const p = batal;
    setBusy(`Membatalkan penghapusan ${p.kode_aset}…`);
    const res = await batalkanPenghapusan(p.id, alasan, insiden);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setBatal(null);
    toast.success(`Penghapusan ${p.kode_aset} dibatalkan`);
  }

  const total = data.data?.total ?? 0;
  const items = data.data?.items ?? [];
  const size = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  const pg: PaginationState<PenghapusanAset> = {
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

  function Aksi({ p }: { p: PenghapusanAset }) {
    const terkunci = penghapusanTerkunci(p);
    const kunci = "Berita acara bertanda tangan sudah diunggah";
    const ikon = (I: typeof FileDown) => <I style={{ width: 14, height: 14 }} />;
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <ActionMenu
          items={[
            { label: "Unduh berita acara", icon: ikon(FileDown), href: hrefBeritaAcara(p.id) },
            {
              label: "Unggah berita acara bertanda tangan",
              icon: ikon(Upload),
              onSelect: () => setUnggah(p),
              disabled: busy !== null
            },
            ...(p.bukti_uploaded_at
              ? [{ label: "Lihat berita acara bertanda tangan", icon: ikon(Eye), onSelect: () => lihatBukti(p) }]
              : []),
            {
              label: "Edit",
              icon: ikon(Pencil),
              onSelect: () => setForm({ penghapusan: p }),
              disabled: terkunci || busy !== null,
              hint: terkunci ? kunci : undefined
            },
            {
              label: "Batalkan penghapusan",
              icon: ikon(Undo2),
              onSelect: () => setBatal(p),
              danger: true,
              disabled: terkunci || busy !== null,
              hint: terkunci ? kunci : undefined
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
            Penghapusan Unit &amp; Unit Trailer
          </h1>
          <p className="caption">
            Catatan penghapusan unit & unit trailer. Aset yang dihapus berstatus Diafkirkan dan tidak bisa dipakai job lagi.
          </p>
        </div>
        <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />} onClick={() => setForm({ penghapusan: null })}>
          Catat penghapusan
        </Button>
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => ubah(setQ)(e.target.value)}
            placeholder="Cari no. penghapusan, alasan, atau catatan…"
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
        <div className="card card-pad caption">Memuat penghapusan…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageX}
          title={adaFilter ? "Tidak ada penghapusan yang cocok" : "Belum ada penghapusan"}
          description={adaFilter ? "Coba ubah filter atau kata kunci pencarian." : "Catat penghapusan unit atau unit trailer pertama."}
        />
      ) : (
        <div style={{ opacity: data.isPlaceholderData ? 0.6 : 1, transition: "opacity 120ms" }}>
          {/* Desktop: tabel */}
          <div className="card hidden lg:block" style={{ overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 190 }}>No. penghapusan / tanggal</th>
                  <th>Aset</th>
                  <th>Alasan</th>
                  <th style={{ width: 150 }}>Dokumen TTD</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                        {p.nomor_berita_acara ?? "—"}
                      </div>
                      <div className="caption">{formatDate(p.tanggal_hapus)}</div>
                    </td>
                    <td>
                      <Link to={hrefAset(p)} style={{ fontWeight: 600 }}>
                        {p.kode_aset}
                      </Link>
                      <div className="caption">{LABEL_JENIS[p.jenis_aset]}</div>
                    </td>
                    <td>
                      <div>{p.alasan}</div>
                      {p.catatan && <div className="caption">{p.catatan}</div>}
                    </td>
                    <td className="caption">{p.bukti_uploaded_at ? "✓ Berita acara" : "Belum ada"}</td>
                    <td>
                      <Aksi p={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination state={pg} label="penghapusan" attached />
          </div>

          {/* Mobile: kartu */}
          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {items.map((p) => (
              <div key={p.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <Link to={hrefAset(p)} style={{ fontWeight: 700 }}>
                    {p.kode_aset} <span className="caption">· {LABEL_JENIS[p.jenis_aset]}</span>
                  </Link>
                  <span className="caption">{formatDate(p.tanggal_hapus)}</span>
                </div>
                <div className="caption mono">{p.nomor_berita_acara ?? "—"}</div>
                <div className="caption">{p.alasan}</div>
                <Aksi p={p} />
              </div>
            ))}
            <Pagination state={pg} label="penghapusan" />
          </div>
        </div>
      )}

      <PenghapusanFormModal
        open={form !== null}
        penghapusan={form?.penghapusan ?? null}
        onClose={() => setForm(null)}
        onSubmit={simpan}
        busy={busy !== null}
      />
      <UnggahDokumenModal
        open={unggah !== null}
        onClose={() => setUnggah(null)}
        judul={`Berita acara bertanda tangan — ${unggah?.nomor_berita_acara ?? unggah?.kode_aset ?? ""}`}
        busy={busy !== null}
        slot={[
          {
            key: "berita_acara",
            label: "Berita acara penghapusan bertanda tangan",
            diunggah: unggah?.bukti_uploaded_at ?? null
          }
        ]}
        onUnggah={(file) => (unggah ? simpanUnggahan(unggah, file) : Promise.resolve(false))}
      />
      <BatalPenghapusanModal
        penghapusan={batal}
        busy={busy !== null}
        onClose={() => setBatal(null)}
        onConfirm={konfirmasiBatal}
      />

      <DokumenSiapModal
        open={dokumenBaru !== null}
        onClose={() => setDokumenBaru(null)}
        judul="Penghapusan tercatat"
        keterangan="Unduh berita acaranya sekarang, atau nanti lewat tombol Berita acara di daftar."
        dokumen={dokumenBaru ? [{ label: "Berita Acara Penghapusan", href: hrefBeritaAcara(dokumenBaru) }] : []}
      />

      <LoadingOverlay message={busy} />
    </div>
  );
}
