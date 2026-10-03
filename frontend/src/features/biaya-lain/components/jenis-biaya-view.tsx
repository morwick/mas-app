import { useState, type ReactNode } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Modal } from "@/components/ui/modal";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import type { JenisBiaya } from "@/types";
import { createJenisBiaya, deleteJenisBiaya, updateJenisBiaya } from "../api";

const DUPLIKAT_MESSAGE = "Gagal! Jenis Biaya dengan nama ini sudah ada";

/** Sama dengan backend: tanpa beda huruf besar/kecil dan spasi berlebih. */
function namaKunci(nama: string) {
  return nama.trim().split(/\s+/).join(" ").toLowerCase();
}

type Form = { id?: string; nama: string };

/**
 * Master jenis biaya untuk kartu Biaya Lain di detail job (tol, parkir,
 * bongkar muat…). BATASAN: nama unik; jenis yang sudah dipakai biaya lain
 * tidak bisa dihapus.
 */
export function JenisBiayaView({ list }: { list: JenisBiaya[] }) {
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [hapus, setHapus] = useState<JenisBiaya | null>(null);
  // Popup loading selama aksi berjalan — mencegah klik beruntun.
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

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

  async function simpan() {
    if (!form || busy) return;
    const nama = form.nama.trim();
    if (!nama) {
      toast.error("Nama jenis biaya wajib diisi.");
      return;
    }
    // Cek cepat di sisi klien; backend & index unik database tetap memeriksa ulang.
    if (list.some((j) => j.id !== form.id && namaKunci(j.nama) === namaKunci(nama))) {
      toast.error(DUPLIKAT_MESSAGE);
      return;
    }
    const ok = await jalankan(
      form.id ? `Menyimpan jenis biaya ${nama}…` : `Menambahkan jenis biaya ${nama}…`,
      () => (form.id ? updateJenisBiaya(form.id, nama) : createJenisBiaya(nama)),
      form.id ? "Perubahan disimpan" : "Jenis biaya ditambahkan"
    );
    if (ok) setForm(null);
  }

  async function konfirmasiHapus() {
    if (!hapus || busy) return;
    const h = hapus;
    const ok = await jalankan(`Menghapus ${h.nama}…`, () => deleteJenisBiaya(h.id), "Jenis biaya dihapus");
    if (ok) setHapus(null);
  }

  const needle = q.trim().toLowerCase();
  const filtered = needle ? list.filter((j) => j.nama.toLowerCase().includes(needle)) : list;
  const pg = usePagination(filtered, { resetKey: q });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-h1">Jenis biaya</h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            Pilihan jenis untuk Biaya Lain di detail job (tol, parkir, bongkar muat, dll.)
          </p>
        </div>
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setForm({ nama: "" })} disabled={busy !== null}>
          Tambah jenis biaya
        </Button>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari jenis biaya…"
        leftIcon={<Search style={{ width: 15, height: 15 }} />}
      />
      <Card>
        <div className="flex flex-col">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-[13px] text-text-muted">
              {list.length === 0 ? "Belum ada jenis biaya." : "Tidak ada jenis biaya yang cocok."}
            </p>
          )}
          {pg.items.map((j, i) => (
            <div
              key={j.id}
              className={`flex items-center justify-between gap-3 py-3 ${i > 0 ? "border-t border-border/70" : ""}`}
            >
              <p className="text-[14px] font-medium">{j.nama}</p>
              <div className="flex items-center gap-1">
                <IconButton label={`Edit ${j.nama}`} onClick={() => setForm({ id: j.id, nama: j.nama })}>
                  <Pencil className="w-4 h-4" />
                </IconButton>
                <IconButton label={`Hapus ${j.nama}`} danger onClick={() => setHapus(j)}>
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
        <Pagination state={pg} label="jenis biaya" attached />
      </Card>

      <Modal
        open={form !== null}
        onClose={busy ? () => {} : () => setForm(null)}
        title={form?.id ? "Edit jenis biaya" : "Tambah jenis biaya"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={busy !== null}>
              Batal
            </Button>
            <Button onClick={simpan} loading={busy !== null}>
              Simpan
            </Button>
          </>
        }
      >
        <Field label="Nama" required>
          <Input
            value={form?.nama ?? ""}
            onChange={(e) => setForm((s) => (s ? { ...s, nama: e.target.value } : s))}
            placeholder="Contoh: Tol"
            maxLength={80}
            autoFocus
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={hapus !== null}
        onClose={() => (busy ? undefined : setHapus(null))}
        title={`Hapus jenis biaya ${hapus?.nama ?? ""}?`}
        body="Jenis biaya yang sudah dipakai di biaya lain job tidak bisa dihapus."
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
  children: ReactNode;
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
