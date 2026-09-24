import { useDeferredValue, useState } from "react";
import { IdCard, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FilterChips } from "@/components/ui/filter-chips";
import { EmptyState } from "@/components/ui/empty-state";
import { PageError } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { useToast } from "@/components/ui/toast";
import {
  ALL_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  Pagination,
  type PaginationState
} from "@/components/ui/pagination";
import { formatDate } from "@/lib/utils";
import {
  createKaryawan,
  deleteKaryawan,
  updateKaryawan,
  type FilterAktif,
  type Karyawan
} from "../api";
import { useKaryawanList } from "../queries";

const LABEL_ROLE = { superadmin: "Super Admin", operator: "Operator" } as const;

type FormState = {
  id: string | null;
  nama: string;
  tanggalLahir: string;
  alamat: string;
  aktif: boolean;
  /** Karyawan asal (edit) — untuk peringatan saat dinonaktifkan. */
  asal: Karyawan | null;
};

const hariIni = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });

/** Akun & driver yang terhubung, mis. "Operator, Driver". */
function keterhubungan(k: Karyawan): string {
  const bagian: string[] = k.akun.map((a) => LABEL_ROLE[a.role] ?? a.role);
  if (k.driver) bagian.push("Driver");
  return bagian.length ? bagian.join(", ") : "—";
}

function StatusBadge({ aktif }: { aktif: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 4,
        whiteSpace: "nowrap",
        background: aktif ? "var(--status-standby-bg)" : "var(--status-cancelled-bg)",
        color: aktif ? "var(--status-standby-text)" : "var(--status-cancelled-text)"
      }}
    >
      {aktif ? "Aktif" : "Nonaktif"}
    </span>
  );
}

export function KaryawanView() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [aktif, setAktif] = useState<FilterAktif>("");
  const qTunda = useDeferredValue(q);

  const [form, setForm] = useState<FormState | null>(null);
  const [hapus, setHapus] = useState<Karyawan | null>(null);
  // Popup loading selama aksi berjalan — mencegah klik beruntun.
  const [busy, setBusy] = useState<string | null>(null);

  const list = useKaryawanList({ page, pageSize, q: qTunda, aktif });

  function ubah<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  const total = list.data?.total ?? 0;
  const items = list.data?.items ?? [];
  const size = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  const pg: PaginationState<Karyawan> = {
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

  function bukaTambah() {
    setForm({ id: null, nama: "", tanggalLahir: "", alamat: "", aktif: true, asal: null });
  }

  function bukaEdit(k: Karyawan) {
    setForm({
      id: k.id,
      nama: k.nama,
      tanggalLahir: k.tanggal_lahir ?? "",
      alamat: k.alamat ?? "",
      aktif: k.is_active,
      asal: k
    });
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
    const nama = form.nama.trim();
    if (!nama) {
      toast.error("Data belum lengkap: nama karyawan wajib diisi.");
      return;
    }
    if (form.tanggalLahir && form.tanggalLahir > hariIni()) {
      toast.error("Tanggal lahir tidak boleh di masa depan.");
      return;
    }
    const input = {
      nama,
      tanggal_lahir: form.tanggalLahir || null,
      alamat: form.alamat.trim() || null,
      is_active: form.aktif
    };
    setBusy(form.id ? `Menyimpan perubahan ${nama}…` : `Menambahkan karyawan ${nama}…`);
    const res = form.id ? await updateKaryawan(form.id, input) : await createKaryawan(input);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(form.id ? `Data ${nama} diperbarui` : `Karyawan ${nama} ditambahkan`);
    setForm(null);
  }

  async function konfirmasiHapus() {
    if (!hapus || busy) return;
    const k = hapus;
    setBusy(`Menghapus karyawan ${k.nama}…`);
    const res = await deleteKaryawan(k.id);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Karyawan ${k.nama} dihapus`);
    setHapus(null);
  }

  const adaFilter = Boolean(q || aktif);
  const akanDinonaktifkan =
    form?.asal && form.asal.is_active && !form.aktif && (form.asal.akun.length > 0 || form.asal.driver);

  const tombolAksi = (k: Karyawan) => (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Pencil style={{ width: 14, height: 14 }} />}
        onClick={() => bukaEdit(k)}
        disabled={busy !== null}
      >
        Edit
      </Button>
      <Button
        variant="danger"
        size="sm"
        leftIcon={<Trash2 style={{ width: 14, height: 14 }} />}
        onClick={() => setHapus(k)}
        disabled={busy !== null}
      >
        Hapus
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <PageHeader
          style={{ flex: 1, minWidth: 240 }}
          title="Karyawan"
          description="Data karyawan PT MAS. Hanya karyawan yang bisa dibuatkan akun pengguna atau dijadikan driver. Karyawan nonaktif tidak bisa login."
        />
        <Button leftIcon={<Plus style={{ width: 16, height: 16 }} />} onClick={bukaTambah}>
          Tambah karyawan
        </Button>
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => ubah(setQ)(e.target.value)}
            placeholder="Cari nama atau alamat…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
      </div>

      <FilterChips
        value={aktif || "semua"}
        onChange={(k) => ubah(setAktif)(k === "semua" ? "" : (k as FilterAktif))}
        items={[
          { key: "semua", label: "Semua" },
          { key: "aktif", label: "Aktif" },
          { key: "nonaktif", label: "Nonaktif" }
        ]}
      />

      {list.isError ? (
        <PageError error={list.error} onRetry={list.refetch} />
      ) : list.isPending ? (
        <div className="card card-pad caption">Memuat karyawan…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={IdCard}
          title={adaFilter ? "Tidak ada karyawan yang cocok" : "Belum ada karyawan"}
          description={adaFilter ? "Coba ubah filter atau kata kunci pencarian." : "Tambahkan karyawan pertama."}
        />
      ) : (
        <div style={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: "opacity 120ms" }}>
          <div className="card hidden lg:block" style={{ overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th style={{ width: 130 }}>Tanggal lahir</th>
                  <th>Alamat</th>
                  <th style={{ width: 170 }}>Terhubung ke</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 190 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((k) => (
                  <tr key={k.id}>
                    <td style={{ fontWeight: 500 }}>{k.nama}</td>
                    <td>{k.tanggal_lahir ? formatDate(k.tanggal_lahir) : "—"}</td>
                    <td style={{ wordBreak: "break-word" }}>{k.alamat ?? "—"}</td>
                    <td className="caption">{keterhubungan(k)}</td>
                    <td>
                      <StatusBadge aktif={k.is_active} />
                    </td>
                    <td>{tombolAksi(k)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination state={pg} label="karyawan" attached />
          </div>

          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {items.map((k) => (
              <div key={k.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{k.nama}</span>
                  <StatusBadge aktif={k.is_active} />
                </div>
                <div className="caption">
                  {k.tanggal_lahir ? `Lahir ${formatDate(k.tanggal_lahir)} · ` : ""}
                  Terhubung: {keterhubungan(k)}
                </div>
                {k.alamat && <div style={{ fontSize: 13 }}>{k.alamat}</div>}
                {tombolAksi(k)}
              </div>
            ))}
            <Pagination state={pg} label="karyawan" />
          </div>
        </div>
      )}

      {form && (
        <Modal
          open
          onClose={busy ? () => {} : () => setForm(null)}
          title={form.id ? `Edit karyawan — ${form.asal?.nama ?? ""}` : "Tambah karyawan"}
          description={
            form.id
              ? "Perubahan nama ikut mengubah nama akun pengguna dan driver milik karyawan ini."
              : "Setelah ditambahkan, karyawan bisa dibuatkan akun di menu Pengguna atau dijadikan driver."
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => setForm(null)} disabled={busy !== null}>
                Batal
              </Button>
              <Button type="submit" form="karyawan-form" loading={busy !== null}>
                {form.id ? "Simpan" : "Tambah"}
              </Button>
            </>
          }
        >
          <form id="karyawan-form" onSubmit={simpan} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Nama" required>
              <Input
                value={form.nama}
                onChange={(e) => setForm((p) => (p ? { ...p, nama: e.target.value } : p))}
                autoFocus
              />
            </Field>
            <Field label="Tanggal lahir">
              <Input
                type="date"
                value={form.tanggalLahir}
                max={hariIni()}
                onChange={(e) => setForm((p) => (p ? { ...p, tanggalLahir: e.target.value } : p))}
              />
            </Field>
            <Field label="Alamat">
              <Textarea
                value={form.alamat}
                onChange={(e) => setForm((p) => (p ? { ...p, alamat: e.target.value } : p))}
              />
            </Field>
            <Field
              label="Status"
              required
              hint="Karyawan nonaktif: akun pengguna & driver miliknya tidak bisa login dan tidak muncul di pilihan."
            >
              <Select
                value={form.aktif ? "aktif" : "nonaktif"}
                onChange={(e) => setForm((p) => (p ? { ...p, aktif: e.target.value === "aktif" } : p))}
              >
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Nonaktif</option>
              </Select>
            </Field>
            {akanDinonaktifkan && form.asal && (
              <div
                className="card card-pad"
                style={{ background: "var(--status-cancelled-bg)", color: "var(--status-cancelled-text)", fontSize: 13 }}
              >
                {form.asal.nama} terhubung ke: {keterhubungan(form.asal)}. Setelah dinonaktifkan, semuanya tidak bisa
                login sampai karyawan diaktifkan kembali.
              </div>
            )}
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={hapus !== null}
        onClose={() => (busy ? undefined : setHapus(null))}
        onConfirm={konfirmasiHapus}
        title={`Hapus karyawan ${hapus?.nama ?? ""}?`}
        body={
          hapus && (hapus.akun.length > 0 || hapus.driver)
            ? `Karyawan ini masih terhubung ke ${keterhubungan(hapus)} — penghapusan akan ditolak. Hapus akun/driver-nya dulu, atau ubah status karyawan menjadi Nonaktif.`
            : "Data karyawan disembunyikan (tidak dihapus permanen) dan masih bisa dikembalikan admin database bila perlu."
        }
        confirmText="Ya, hapus"
        variant="danger"
        loading={busy !== null}
      />

      <LoadingOverlay message={busy} />
    </div>
  );
}
