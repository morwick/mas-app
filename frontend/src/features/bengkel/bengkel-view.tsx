import { useDeferredValue, useEffect, useState } from "react";
import { Pencil, Phone, Plus, Search, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Field, Input, Textarea } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { PageError } from "@/components/ui/page-state";
import { DEFAULT_PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import { serverPageState, tautanWhatsApp } from "@/lib/server-page";
import {
  createBengkel,
  deleteBengkel,
  setBengkelAktif,
  updateBengkel,
  useBengkelCounts,
  useBengkelPage,
  type Bengkel,
  type BengkelInput
} from "./api";

const KOSONG: BengkelInput = {
  nama: "",
  alamat: null,
  pic_nama: null,
  no_hp: null,
  spesialisasi: null,
  catatan: null
};

/** Master Bengkel luar — pelaksana perbaikan selain mekanik internal. */
export function BengkelView() {
  const toast = useToast();
  const { canManageOperational } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [aktif, setAktif] = useState<"aktif" | "nonaktif" | "">("aktif");
  const qTunda = useDeferredValue(q);
  const data = useBengkelPage({ page, pageSize, q: qTunda, aktif });
  const counts = useBengkelCounts(qTunda);

  const [form, setForm] = useState<{ id: string | null; isi: BengkelInput } | null>(null);
  const [hapus, setHapus] = useState<Bengkel | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const pg = serverPageState(data.data, page, pageSize, setPage, (s) => {
    setPageSize(s);
    setPage(1);
  });

  async function jalankan(pesan: string, aksi: () => Promise<{ ok: boolean; error?: string }>, sukses: string) {
    setBusy(pesan);
    const res = await aksi();
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error ?? "Gagal");
      return false;
    }
    toast.success(sukses);
    return true;
  }

  async function simpan(isi: BengkelInput) {
    if (!form) return;
    const ok = await jalankan(
      "Menyimpan bengkel…",
      () => (form.id ? updateBengkel(form.id, isi) : createBengkel(isi)),
      form.id ? "Perubahan bengkel disimpan" : `Bengkel ${isi.nama} ditambahkan`
    );
    if (ok) setForm(null);
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <PageHeader
          title="Bengkel"
          description="Bengkel / vendor luar yang bisa dipilih sebagai pelaksana perintah kerja perbaikan."
          style={{ flex: 1, minWidth: 240 }}
        />
        {canManageOperational && (
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setForm({ id: null, isi: KOSONG })}>
            Tambah bengkel
          </Button>
        )}
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama, alamat, PIC, no HP, spesialisasi…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
        <FilterChips
          value={aktif || "semua"}
          onChange={(k) => {
            setAktif(k === "semua" ? "" : (k as "aktif" | "nonaktif"));
            setPage(1);
          }}
          items={[
            { key: "aktif", label: "Aktif", count: counts.data?.active },
            { key: "nonaktif", label: "Nonaktif", count: counts.data?.inactive },
            { key: "semua", label: "Semua", count: counts.data?.all }
          ]}
        />
      </div>

      {data.isError ? (
        <PageError error={data.error} onRetry={data.refetch} />
      ) : data.isPending ? (
        <div className="card card-pad caption">Memuat bengkel…</div>
      ) : pg.items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={q ? "Tidak ada bengkel yang cocok" : "Belum ada bengkel"}
          description={q ? "Coba kata kunci lain." : "Tambahkan bengkel luar yang biasa dipakai."}
        />
      ) : (
        <div className="card" style={{ overflow: "hidden", opacity: data.isPlaceholderData ? 0.6 : 1 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nama bengkel</th>
                  <th>PIC / kontak</th>
                  <th>Spesialisasi</th>
                  <th>Alamat</th>
                  {canManageOperational && <th style={{ width: 150 }}></th>}
                </tr>
              </thead>
              <tbody>
                {pg.items.map((b) => {
                  const wa = b.no_hp ? tautanWhatsApp(b.no_hp) : null;
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>
                        {b.nama}
                        {!b.is_active && (
                          <span className="badge" style={{ fontSize: 10, height: 18, marginLeft: 8 }}>
                            Nonaktif
                          </span>
                        )}
                      </td>
                      <td>
                        <div>{b.pic_nama ?? "—"}</div>
                        {b.no_hp && (
                          <a
                            href={wa ?? `tel:${b.no_hp}`}
                            target="_blank"
                            rel="noreferrer"
                            className="caption mono inline-flex items-center gap-1"
                          >
                            <Phone style={{ width: 11, height: 11 }} />
                            {b.no_hp}
                          </a>
                        )}
                      </td>
                      <td>{b.spesialisasi ?? "—"}</td>
                      <td className="caption">{b.alamat ?? "—"}</td>
                      {canManageOperational && (
                        <td>
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                            <Button
                              size="sm"
                              variant="ghost"
                              leftIcon={<Pencil className="w-3.5 h-3.5" />}
                              onClick={() => setForm({ id: b.id, isi: { ...b } })}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                jalankan(
                                  b.is_active ? "Menonaktifkan bengkel…" : "Mengaktifkan bengkel…",
                                  () => setBengkelAktif(b.id, !b.is_active),
                                  b.is_active ? "Bengkel dinonaktifkan" : "Bengkel diaktifkan"
                                )
                              }
                            >
                              {b.is_active ? "Nonaktifkan" : "Aktifkan"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Hapus ${b.nama}`}
                              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                              onClick={() => setHapus(b)}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination state={pg} label="bengkel" attached />
        </div>
      )}

      <BengkelFormModal
        open={form !== null}
        awal={form?.isi ?? KOSONG}
        judul={form?.id ? "Edit bengkel" : "Tambah bengkel"}
        busy={busy !== null}
        onClose={() => setForm(null)}
        onSave={simpan}
      />
      <ConfirmDialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        title={`Hapus bengkel ${hapus?.nama ?? ""}?`}
        body="Bengkel yang sudah dipakai di perintah kerja tidak bisa dihapus — nonaktifkan saja."
        confirmText="Ya, hapus"
        variant="danger"
        loading={busy !== null}
        onConfirm={async () => {
          if (!hapus) return;
          const ok = await jalankan("Menghapus bengkel…", () => deleteBengkel(hapus.id), "Bengkel dihapus");
          if (ok) setHapus(null);
        }}
      />
      <LoadingOverlay message={busy} />
    </div>
  );
}

function BengkelFormModal({
  open,
  awal,
  judul,
  busy,
  onClose,
  onSave
}: {
  open: boolean;
  awal: BengkelInput;
  judul: string;
  busy: boolean;
  onClose: () => void;
  onSave: (isi: BengkelInput) => void;
}) {
  const [isi, setIsi] = useState<BengkelInput>(awal);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setIsi(awal);
      setError("");
    }
  }, [open, awal]);

  const set = (k: keyof BengkelInput) => (v: string) => setIsi((s) => ({ ...s, [k]: v || null }));

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={judul}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="bengkel-form" loading={busy}>
            Simpan
          </Button>
        </>
      }
    >
      <form
        id="bengkel-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isi.nama.trim()) {
            setError("Nama bengkel wajib diisi");
            return;
          }
          onSave({ ...isi, nama: isi.nama.trim() });
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <Field label="Nama bengkel" required>
          <Input
            value={isi.nama}
            onChange={(e) => {
              setIsi((s) => ({ ...s, nama: e.target.value }));
              setError("");
            }}
            error={error}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
          <Field label="Nama PIC">
            <Input value={isi.pic_nama ?? ""} onChange={(e) => set("pic_nama")(e.target.value)} />
          </Field>
          <Field label="No HP">
            <Input type="tel" value={isi.no_hp ?? ""} onChange={(e) => set("no_hp")(e.target.value)} />
          </Field>
        </div>
        <Field label="Spesialisasi" hint="mis. mesin diesel, kelistrikan, body & cat">
          <Input value={isi.spesialisasi ?? ""} onChange={(e) => set("spesialisasi")(e.target.value)} />
        </Field>
        <Field label="Alamat">
          <Textarea value={isi.alamat ?? ""} onChange={(e) => set("alamat")(e.target.value)} />
        </Field>
        <Field label="Catatan">
          <Textarea value={isi.catatan ?? ""} onChange={(e) => set("catatan")(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
