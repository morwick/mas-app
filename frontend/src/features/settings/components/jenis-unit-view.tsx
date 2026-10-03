import { useMemo, useState } from "react";
import { Plus, Pencil, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import {
  createJenisUnit,
  deleteJenisUnit,
  updateJenisUnit
} from "@/features/settings/api";
import {
  createJenisUnitTrailer,
  deleteJenisUnitTrailer,
  updateJenisUnitTrailer,
  type JenisUnitTrailer
} from "@/features/unit-trailer/api";
import type { JenisUnit } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

interface Props {
  list: JenisUnit[];
  /** Jenis unit trailer — masing-masing milik satu jenis unit. */
  trailer: JenisUnitTrailer[];
}

const DUPLIKAT_MESSAGE = "Gagal! Jenis Unit dengan nama ini sudah ada";
const DUPLIKAT_TRAILER_MESSAGE = "Gagal! Jenis Unit Trailer dengan nama ini sudah ada";

/** Sama dengan backend: tanpa beda huruf besar/kecil dan spasi berlebih. */
function namaKunci(nama: string) {
  return nama.trim().split(/\s+/).join(" ").toLowerCase();
}

type FormJenis = { mode: "new" | "edit"; id?: string; nama: string };
type FormTrailer = { mode: "new" | "edit"; id?: string; nama: string; jenisUnitId: string };
type Hapus = { jenis: "unit" | "trailer"; id: string; nama: string };

type Tab = "unit" | "trailer";

/**
 * Satu menu untuk Jenis Unit (truk) dan Jenis Unit Trailer, masing-masing di
 * tab sendiri dengan pencarian sendiri. Semuanya bisa ditambah / diubah /
 * dihapus dari sini.
 */
export function JenisUnitView({ list, trailer }: Props) {
  const toast = useToast();
  const [formJenis, setFormJenis] = useState<FormJenis | null>(null);
  const [formTrailer, setFormTrailer] = useState<FormTrailer | null>(null);
  const [hapus, setHapus] = useState<Hapus | null>(null);
  // Popup loading selama aksi berjalan — mencegah klik beruntun.
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("unit");
  const [q, setQ] = useState("");
  const [qTrailer, setQTrailer] = useState("");
  const [filterJenis, setFilterJenis] = useState("");

  const trailerPerJenis = useMemo(() => {
    const m = new Map<string, JenisUnitTrailer[]>();
    for (const t of trailer) m.set(t.jenis_unit_id, [...(m.get(t.jenis_unit_id) ?? []), t]);
    return m;
  }, [trailer]);

  async function jalankan(pesan: string, aksi: () => Promise<{ ok: boolean; error?: string }>, sukses: string) {
    setBusy(pesan);
    const res = await aksi();
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error ?? "Gagal menyimpan");
      return false;
    }
    toast.success(sukses);
    return true;
  }

  async function simpanJenis() {
    if (!formJenis || busy) return;
    const nama = formJenis.nama.trim();
    if (!nama) {
      toast.error("Nama jenis unit wajib diisi.");
      return;
    }
    // Cek cepat di sisi klien; backend & index unik database tetap memeriksa ulang.
    if (list.some((j) => j.id !== formJenis.id && namaKunci(j.nama) === namaKunci(nama))) {
      toast.error(DUPLIKAT_MESSAGE);
      return;
    }
    const ok = await jalankan(
      formJenis.mode === "new" ? `Menambahkan jenis unit ${nama}…` : `Menyimpan jenis unit ${nama}…`,
      () => (formJenis.mode === "new" ? createJenisUnit(nama) : updateJenisUnit(formJenis.id!, nama)),
      formJenis.mode === "new" ? "Jenis unit ditambahkan" : "Perubahan disimpan"
    );
    if (ok) setFormJenis(null);
  }

  async function simpanTrailer() {
    if (!formTrailer || busy) return;
    const nama = formTrailer.nama.trim();
    if (!nama || !formTrailer.jenisUnitId) {
      toast.error("Nama dan jenis unit wajib diisi.");
      return;
    }
    if (trailer.some((t) => t.id !== formTrailer.id && namaKunci(t.nama) === namaKunci(nama))) {
      toast.error(DUPLIKAT_TRAILER_MESSAGE);
      return;
    }
    const ok = await jalankan(
      formTrailer.mode === "new"
        ? `Menambahkan jenis unit trailer ${nama}…`
        : `Menyimpan jenis unit trailer ${nama}…`,
      () =>
        formTrailer.mode === "new"
          ? createJenisUnitTrailer(nama, formTrailer.jenisUnitId)
          : updateJenisUnitTrailer(formTrailer.id!, nama, formTrailer.jenisUnitId),
      formTrailer.mode === "new" ? "Jenis unit trailer ditambahkan" : "Perubahan disimpan"
    );
    if (ok) setFormTrailer(null);
  }

  async function konfirmasiHapus() {
    if (!hapus || busy) return;
    const h = hapus;
    const ok = await jalankan(
      `Menghapus ${h.nama}…`,
      () => (h.jenis === "unit" ? deleteJenisUnit(h.id) : deleteJenisUnitTrailer(h.id)),
      h.jenis === "unit" ? "Jenis unit dihapus" : "Jenis unit trailer dihapus"
    );
    if (ok) setHapus(null);
  }

  const needle = q.trim().toLowerCase();
  const filtered = needle ? list.filter((j) => j.nama.toLowerCase().includes(needle)) : list;
  const pg = usePagination(filtered, { resetKey: q });

  // Tab trailer: cari di nama trailer & nama jenis unitnya, saring per jenis unit.
  const needleTrailer = qTrailer.trim().toLowerCase();
  const filteredTrailer = trailer.filter(
    (t) =>
      (!filterJenis || t.jenis_unit_id === filterJenis) &&
      (!needleTrailer ||
        t.nama.toLowerCase().includes(needleTrailer) ||
        (t.jenis_unit_nama ?? "").toLowerCase().includes(needleTrailer))
  );
  const pgTrailer = usePagination(filteredTrailer, { resetKey: `${qTrailer}|${filterJenis}` });

  const opsiJenis = list
    .filter((j) => j.is_active || j.id === formTrailer?.jenisUnitId)
    .map((j) => ({ value: j.id, label: j.nama }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-h1">Jenis unit</h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            Master jenis armada (truk) dan jenis unit trailer
          </p>
        </div>
        <Button
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() =>
            tab === "unit"
              ? setFormJenis({ mode: "new", nama: "" })
              : setFormTrailer({ mode: "new", nama: "", jenisUnitId: filterJenis })
          }
          disabled={busy !== null}
        >
          {tab === "unit" ? "Tambah jenis unit" : "Tambah jenis trailer"}
        </Button>
      </div>

      <Tabs
        value={tab}
        onChange={(k) => setTab(k as Tab)}
        items={[
          { key: "unit", label: "Jenis Unit", count: list.length },
          { key: "trailer", label: "Jenis Unit Trailer", count: trailer.length }
        ]}
      />

      {tab === "unit" ? (
        <>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari jenis unit…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
          <Card>
            <div className="flex flex-col">
              {filtered.length === 0 && (
                <p className="py-6 text-center text-[13px] text-text-muted">
                  {list.length === 0 ? "Belum ada jenis unit." : "Tidak ada jenis unit yang cocok."}
                </p>
              )}
              {pg.items.map((j, i) => {
                const jumlahTrailer = trailerPerJenis.get(j.id)?.length ?? 0;
                const keterangan = [!j.is_active ? "Nonaktif" : null, jumlahTrailer ? `${jumlahTrailer} jenis trailer` : null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div
                    key={j.id}
                    className={`flex items-center justify-between gap-3 py-3 ${i > 0 ? "border-t border-border/70" : ""}`}
                  >
                    <div>
                      <p className="text-[14px] font-medium">{j.nama}</p>
                      {keterangan && <p className="text-[11px] text-text-subtle">{keterangan}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <IconButton
                        label={`Edit ${j.nama}`}
                        onClick={() => setFormJenis({ mode: "edit", id: j.id, nama: j.nama })}
                      >
                        <Pencil className="w-4 h-4" />
                      </IconButton>
                      <IconButton
                        label={`Hapus ${j.nama}`}
                        danger
                        onClick={() => setHapus({ jenis: "unit", id: j.id, nama: j.nama })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination state={pg} label="jenis unit" attached />
          </Card>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <div style={{ flex: "1 1 240px" }}>
              <Input
                value={qTrailer}
                onChange={(e) => setQTrailer(e.target.value)}
                placeholder="Cari jenis trailer atau jenis unit…"
                leftIcon={<Search style={{ width: 15, height: 15 }} />}
              />
            </div>
            <div style={{ flex: "0 1 220px" }}>
              <Combobox
                value={filterJenis}
                onChange={setFilterJenis}
                options={list.map((j) => ({ value: j.id, label: j.nama }))}
                placeholder="Semua jenis unit"
                searchPlaceholder="Cari jenis unit…"
                clearable
              />
            </div>
          </div>
          <Card>
            <div className="flex flex-col">
              {filteredTrailer.length === 0 && (
                <p className="py-6 text-center text-[13px] text-text-muted">
                  {trailer.length === 0 ? "Belum ada jenis unit trailer." : "Tidak ada jenis unit trailer yang cocok."}
                </p>
              )}
              {pgTrailer.items.map((t, i) => (
                <div
                  key={t.id}
                  className={`flex items-center justify-between gap-3 py-3 ${i > 0 ? "border-t border-border/70" : ""}`}
                >
                  <div>
                    <p className="text-[14px] font-medium">{t.nama}</p>
                    <p className="text-[11px] text-text-subtle">{t.jenis_unit_nama ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label={`Edit ${t.nama}`}
                      onClick={() =>
                        setFormTrailer({ mode: "edit", id: t.id, nama: t.nama, jenisUnitId: t.jenis_unit_id })
                      }
                    >
                      <Pencil className="w-4 h-4" />
                    </IconButton>
                    <IconButton
                      label={`Hapus ${t.nama}`}
                      danger
                      onClick={() => setHapus({ jenis: "trailer", id: t.id, nama: t.nama })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
            <Pagination state={pgTrailer} label="jenis unit trailer" attached />
          </Card>
        </>
      )}

      <Modal
        open={formJenis !== null}
        onClose={busy ? () => {} : () => setFormJenis(null)}
        title={formJenis?.mode === "new" ? "Tambah jenis unit" : "Edit jenis unit"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormJenis(null)} disabled={busy !== null}>
              Batal
            </Button>
            <Button onClick={simpanJenis} loading={busy !== null}>
              Simpan
            </Button>
          </>
        }
      >
        <Field label="Nama" required>
          <Input
            value={formJenis?.nama ?? ""}
            onChange={(e) => setFormJenis((s) => (s ? { ...s, nama: e.target.value } : s))}
            placeholder="Contoh: Lowbed"
            autoFocus
          />
        </Field>
      </Modal>

      <Modal
        open={formTrailer !== null}
        onClose={busy ? () => {} : () => setFormTrailer(null)}
        title={formTrailer?.mode === "new" ? "Tambah jenis unit trailer" : "Edit jenis unit trailer"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormTrailer(null)} disabled={busy !== null}>
              Batal
            </Button>
            <Button onClick={simpanTrailer} loading={busy !== null}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Nama" required>
            <Input
              value={formTrailer?.nama ?? ""}
              onChange={(e) => setFormTrailer((s) => (s ? { ...s, nama: e.target.value } : s))}
              placeholder="Contoh: Lowbed 3 as"
              autoFocus
            />
          </Field>
          <Field label="Jenis unit" required>
            <Combobox
              value={formTrailer?.jenisUnitId ?? ""}
              onChange={(v) => setFormTrailer((s) => (s ? { ...s, jenisUnitId: v } : s))}
              options={opsiJenis}
              placeholder="— pilih jenis unit —"
              searchPlaceholder="Cari jenis unit…"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={hapus !== null}
        onClose={() => (busy ? undefined : setHapus(null))}
        title={hapus?.jenis === "trailer" ? `Hapus jenis unit trailer ${hapus.nama}?` : `Hapus jenis unit ${hapus?.nama ?? ""}?`}
        body={
          hapus?.jenis === "trailer"
            ? "Jenis unit trailer yang masih dipakai unit trailer aktif tidak bisa dihapus."
            : "Jenis unit yang masih dipakai unit, punya jenis unit trailer, atau sudah dipakai di surat penawaran tidak bisa dihapus."
        }
        confirmText="Ya, hapus"
        variant="danger"
        loading={busy !== null}
        onConfirm={konfirmasiHapus}
      />

      <LoadingOverlay message={busy} />
    </div>
  );
}

function IconButton({
  label,
  danger,
  onClick,
  children
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        danger
          ? "p-2 hover:bg-status-cancelled-bg rounded-md text-status-cancelled-fg"
          : "p-2 hover:bg-page rounded-md text-text-muted hover:text-text"
      }
    >
      {children}
    </button>
  );
}
