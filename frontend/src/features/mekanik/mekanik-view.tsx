import { useDeferredValue, useEffect, useState } from "react";
import { HardHat, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
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
  createMekanik,
  deleteMekanik,
  setMekanikAktif,
  updateMekanik,
  useKaryawanMekanik,
  useMekanikPage,
  type Mekanik,
  type MekanikInput
} from "./api";

const KOSONG: MekanikInput = { karyawan_id: "", no_hp: null, keahlian: null, catatan: null };

/** Master Mekanik internal — nama diambil dari data Karyawan. */
export function MekanikView() {
  const toast = useToast();
  const { canManageOperational } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [aktif, setAktif] = useState<"aktif" | "nonaktif" | "">("aktif");
  const qTunda = useDeferredValue(q);
  const data = useMekanikPage({ page, pageSize, q: qTunda, aktif });

  const [form, setForm] = useState<{ mekanik: Mekanik | null; isi: MekanikInput } | null>(null);
  const [hapus, setHapus] = useState<Mekanik | null>(null);
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

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <PageHeader
          title="Mekanik"
          description="Mekanik internal yang bisa ditugaskan di perintah kerja perbaikan. Nama diambil dari menu Karyawan."
          style={{ flex: 1, minWidth: 240 }}
        />
        {canManageOperational && (
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setForm({ mekanik: null, isi: KOSONG })}>
            Tambah mekanik
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
            placeholder="Cari nama, no HP, atau keahlian…"
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
            { key: "aktif", label: "Aktif" },
            { key: "nonaktif", label: "Nonaktif" },
            { key: "semua", label: "Semua" }
          ]}
        />
      </div>

      {data.isError ? (
        <PageError error={data.error} onRetry={data.refetch} />
      ) : data.isPending ? (
        <div className="card card-pad caption">Memuat mekanik…</div>
      ) : pg.items.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title={q ? "Tidak ada mekanik yang cocok" : "Belum ada mekanik"}
          description={q ? "Coba kata kunci lain." : "Tambahkan mekanik dari data karyawan."}
        />
      ) : (
        <div className="card" style={{ overflow: "hidden", opacity: data.isPlaceholderData ? 0.6 : 1 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>No HP</th>
                  <th>Keahlian</th>
                  {canManageOperational && <th style={{ width: 150 }}></th>}
                </tr>
              </thead>
              <tbody>
                {pg.items.map((m) => {
                  const wa = m.no_hp ? tautanWhatsApp(m.no_hp) : null;
                  return (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>
                        {m.nama}
                        {!m.is_active && (
                          <span className="badge" style={{ fontSize: 10, height: 18, marginLeft: 8 }}>
                            Nonaktif
                          </span>
                        )}
                        {!m.karyawan_aktif && (
                          <span className="badge badge-cancelled" style={{ fontSize: 10, height: 18, marginLeft: 8 }}>
                            Karyawan nonaktif
                          </span>
                        )}
                      </td>
                      <td>
                        {m.no_hp ? (
                          <a
                            href={wa ?? `tel:${m.no_hp}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mono inline-flex items-center gap-1"
                          >
                            <Phone style={{ width: 12, height: 12 }} />
                            {m.no_hp}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{m.keahlian ?? "—"}</td>
                      {canManageOperational && (
                        <td>
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                            <Button
                              size="sm"
                              variant="ghost"
                              leftIcon={<Pencil className="w-3.5 h-3.5" />}
                              onClick={() =>
                                setForm({
                                  mekanik: m,
                                  isi: {
                                    karyawan_id: m.karyawan_id,
                                    no_hp: m.no_hp,
                                    keahlian: m.keahlian,
                                    catatan: m.catatan
                                  }
                                })
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                jalankan(
                                  m.is_active ? "Menonaktifkan mekanik…" : "Mengaktifkan mekanik…",
                                  () => setMekanikAktif(m.id, !m.is_active),
                                  m.is_active ? "Mekanik dinonaktifkan" : "Mekanik diaktifkan"
                                )
                              }
                            >
                              {m.is_active ? "Nonaktifkan" : "Aktifkan"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Hapus ${m.nama}`}
                              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                              onClick={() => setHapus(m)}
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
          <Pagination state={pg} label="mekanik" attached />
        </div>
      )}

      <MekanikFormModal
        open={form !== null}
        mekanik={form?.mekanik ?? null}
        awal={form?.isi ?? KOSONG}
        busy={busy !== null}
        onClose={() => setForm(null)}
        onSave={async (isi) => {
          const ok = await jalankan(
            "Menyimpan mekanik…",
            () => (form?.mekanik ? updateMekanik(form.mekanik.id, isi) : createMekanik(isi)),
            form?.mekanik ? "Perubahan mekanik disimpan" : "Mekanik ditambahkan"
          );
          if (ok) setForm(null);
        }}
      />
      <ConfirmDialog
        open={hapus !== null}
        onClose={() => setHapus(null)}
        title={`Hapus mekanik ${hapus?.nama ?? ""}?`}
        body="Data karyawannya tidak ikut terhapus. Mekanik yang sudah pernah bertugas tidak bisa dihapus — nonaktifkan saja."
        confirmText="Ya, hapus"
        variant="danger"
        loading={busy !== null}
        onConfirm={async () => {
          if (!hapus) return;
          const ok = await jalankan("Menghapus mekanik…", () => deleteMekanik(hapus.id), "Mekanik dihapus");
          if (ok) setHapus(null);
        }}
      />
      <LoadingOverlay message={busy} />
    </div>
  );
}

function MekanikFormModal({
  open,
  mekanik,
  awal,
  busy,
  onClose,
  onSave
}: {
  open: boolean;
  mekanik: Mekanik | null;
  awal: MekanikInput;
  busy: boolean;
  onClose: () => void;
  onSave: (isi: MekanikInput) => void;
}) {
  const karyawan = useKaryawanMekanik();
  const [isi, setIsi] = useState<MekanikInput>(awal);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setIsi(awal);
      setError("");
    }
  }, [open, awal]);

  const options = (karyawan.data ?? []).map((k) => ({
    value: k.id,
    label: k.nama,
    hint: k.mekanik_id && k.mekanik_id !== mekanik?.id ? "Sudah terdaftar sebagai mekanik" : undefined,
    disabled: Boolean(k.mekanik_id && k.mekanik_id !== mekanik?.id)
  }));
  if (mekanik && !options.some((o) => o.value === mekanik.karyawan_id)) {
    options.unshift({ value: mekanik.karyawan_id, label: mekanik.nama, hint: "Karyawan nonaktif", disabled: false });
  }
  const set = (k: keyof MekanikInput) => (v: string) => setIsi((s) => ({ ...s, [k]: v || null }));

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={mekanik ? "Edit mekanik" : "Tambah mekanik"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="mekanik-form" loading={busy}>
            Simpan
          </Button>
        </>
      }
    >
      <form
        id="mekanik-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isi.karyawan_id) {
            setError("Pilih nama karyawan");
            return;
          }
          onSave(isi);
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <Field label="Nama" required hint="Pilih dari data karyawan (menu Karyawan).">
          <Combobox
            value={isi.karyawan_id}
            onChange={(v) => {
              setIsi((s) => ({ ...s, karyawan_id: v }));
              setError("");
            }}
            options={options}
            placeholder={karyawan.isLoading ? "Memuat karyawan…" : "Pilih karyawan"}
            searchPlaceholder="Ketik nama karyawan…"
            emptyText="Karyawan tidak ditemukan"
            error={error || undefined}
          />
        </Field>
        <Field label="No HP">
          <Input type="tel" value={isi.no_hp ?? ""} onChange={(e) => set("no_hp")(e.target.value)} />
        </Field>
        <Field label="Keahlian" hint="mis. mesin, kelistrikan, hidrolik">
          <Input value={isi.keahlian ?? ""} onChange={(e) => set("keahlian")(e.target.value)} />
        </Field>
        <Field label="Catatan">
          <Textarea value={isi.catatan ?? ""} onChange={(e) => set("catatan")(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
