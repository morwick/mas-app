import { useDeferredValue, useState } from "react";
import { Ban, IdCard, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
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
  blacklistKaryawan,
  cabutBlacklistKaryawan,
  createKaryawan,
  deleteKaryawan,
  updateKaryawan,
  type FilterAktif,
  type Karyawan
} from "../api";
import { useKaryawanList } from "../queries";

const LABEL_ROLE = {
  superadmin: "Super Admin",
  operator: "Operator",
  finance: "Finance",
  admin: "Admin"
} as const;

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
  if (k.mekanik) bagian.push("Mekanik");
  return bagian.length ? bagian.join(", ") : "—";
}

/** Alasan blacklist + kapan & oleh siapa — tampil di bawah nama. */
function InfoBlacklist({ k }: { k: Karyawan }) {
  if (!k.is_blacklist) return null;
  return (
    <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 2 }}>
      Alasan: {k.blacklist_alasan}
      <span style={{ color: "var(--text-tertiary)" }}>
        {" "}
        · {formatDate(k.blacklist_at)}
        {k.blacklist_oleh_nama ? ` oleh ${k.blacklist_oleh_nama}` : ""}
      </span>
    </div>
  );
}

function StatusBadge({ aktif, blacklist }: { aktif: boolean; blacklist?: boolean }) {
  if (blacklist) {
    return (
      <span
        style={{
          display: "inline-block",
          fontSize: 11,
          fontWeight: 700,
          padding: "3px 8px",
          borderRadius: 4,
          whiteSpace: "nowrap",
          background: "#b91c1c",
          color: "#fff"
        }}
      >
        Blacklist
      </span>
    );
  }
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
  const [blacklist, setBlacklist] = useState<{ k: Karyawan; alasan: string } | null>(null);
  const [cabut, setCabut] = useState<{ k: Karyawan; alasan: string } | null>(null);
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

  async function simpanBlacklist(e: React.FormEvent) {
    e.preventDefault();
    if (!blacklist || busy) return;
    const { k } = blacklist;
    const alasan = blacklist.alasan.trim();
    if (!alasan) {
      toast.error("Alasan blacklist wajib diisi.");
      return;
    }
    setBusy(`Mem-blacklist ${k.nama}…`);
    const res = await blacklistKaryawan(k.id, alasan);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${k.nama} di-blacklist. Sesi login web & mobile-nya sudah dicabut.`);
    setBlacklist(null);
  }

  async function simpanCabut(e: React.FormEvent) {
    e.preventDefault();
    if (!cabut || busy) return;
    const { k } = cabut;
    setBusy(`Mencabut blacklist ${k.nama}…`);
    const res = await cabutBlacklistKaryawan(k.id, cabut.alasan.trim() || null);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Blacklist ${k.nama} dicabut. Karyawan aktif kembali.`);
    setCabut(null);
  }

  const adaFilter = Boolean(q || aktif);
  const akanDinonaktifkan =
    form?.asal && form.asal.is_active && !form.aktif && (form.asal.akun.length > 0 || form.asal.driver);

  const tombolAksi = (k: Karyawan) => (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Pencil style={{ width: 14, height: 14 }} />}
        onClick={() => bukaEdit(k)}
        disabled={busy !== null}
      >
        Edit
      </Button>
      {k.is_blacklist ? (
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<ShieldCheck style={{ width: 14, height: 14 }} />}
          onClick={() => setCabut({ k, alasan: "" })}
          disabled={busy !== null}
        >
          Cabut blacklist
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Ban style={{ width: 14, height: 14 }} />}
          onClick={() => setBlacklist({ k, alasan: "" })}
          disabled={busy !== null}
          style={{ color: "#b91c1c" }}
        >
          Blacklist
        </Button>
      )}
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
          { key: "nonaktif", label: "Nonaktif" },
          { key: "blacklist", label: "Blacklist" }
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
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th style={{ width: 130 }}>Tanggal lahir</th>
                    <th>Alamat</th>
                    <th style={{ width: 170 }}>Terhubung ke</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th style={{ width: 330 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((k) => (
                    <tr key={k.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{k.nama}</div>
                        <InfoBlacklist k={k} />
                      </td>
                      <td>{k.tanggal_lahir ? formatDate(k.tanggal_lahir) : "—"}</td>
                      <td style={{ wordBreak: "break-word" }}>{k.alamat ?? "—"}</td>
                      <td className="caption">{keterhubungan(k)}</td>
                      <td>
                        <StatusBadge aktif={k.is_active} blacklist={k.is_blacklist} />
                      </td>
                      <td>{tombolAksi(k)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination state={pg} label="karyawan" attached />
          </div>

          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {items.map((k) => (
              <div key={k.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span style={{ fontWeight: 600 }}>{k.nama}</span>
                  <StatusBadge aktif={k.is_active} blacklist={k.is_blacklist} />
                </div>
                <InfoBlacklist k={k} />
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
              <DateInput
                value={form.tanggalLahir}
                max={hariIni()}
                onChange={(v) => setForm((p) => (p ? { ...p, tanggalLahir: v } : p))}
                clearable
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
              hint={
                form.asal?.is_blacklist
                  ? "Karyawan sedang di-blacklist — cabut blacklist dulu untuk mengaktifkannya."
                  : "Karyawan nonaktif: akun pengguna & driver miliknya tidak bisa login dan tidak muncul di pilihan. Sesi login yang sedang berjalan langsung dicabut."
              }
            >
              <Select
                disabled={Boolean(form.asal?.is_blacklist)}
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

      {blacklist && (
        <Modal
          open
          onClose={busy ? () => {} : () => setBlacklist(null)}
          title={`Blacklist karyawan — ${blacklist.k.nama}`}
          description="Hanya untuk karyawan yang sedang tidak bertugas (tidak ada job atau perintah kerja yang belum selesai)."
          footer={
            <>
              <Button variant="secondary" onClick={() => setBlacklist(null)} disabled={busy !== null}>
                Batal
              </Button>
              <Button type="submit" form="blacklist-form" variant="danger" loading={busy !== null}>
                Blacklist
              </Button>
            </>
          }
        >
          <form id="blacklist-form" onSubmit={simpanBlacklist} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              className="card card-pad"
              style={{ background: "var(--status-cancelled-bg)", color: "var(--status-cancelled-text)", fontSize: 13 }}
            >
              Setelah di-blacklist:
              <ul style={{ margin: "6px 0 0 18px", listStyle: "disc" }}>
                <li>karyawan menjadi nonaktif dan tidak bisa login ke web maupun aplikasi mobile;</li>
                <li>sesi login yang sedang berjalan langsung dicabut (PIN driver tidak diubah);</li>
                <li>data driver / mekaniknya menjadi nonaktif dan tidak bisa ditugaskan.</li>
              </ul>
              {(blacklist.k.akun.length > 0 || blacklist.k.driver || blacklist.k.mekanik) && (
                <div style={{ marginTop: 6 }}>Terhubung ke: {keterhubungan(blacklist.k)}.</div>
              )}
            </div>
            <Field label="Alasan blacklist" required>
              <Textarea
                value={blacklist.alasan}
                autoFocus
                maxLength={500}
                onChange={(e) => setBlacklist((p) => (p ? { ...p, alasan: e.target.value } : p))}
                placeholder="mis. Membawa kabur solar perusahaan"
              />
            </Field>
          </form>
        </Modal>
      )}

      {cabut && (
        <Modal
          open
          onClose={busy ? () => {} : () => setCabut(null)}
          title={`Cabut blacklist — ${cabut.k.nama}`}
          description={`Alasan blacklist: ${cabut.k.blacklist_alasan ?? "-"}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCabut(null)} disabled={busy !== null}>
                Batal
              </Button>
              <Button type="submit" form="cabut-blacklist-form" loading={busy !== null}>
                Cabut blacklist
              </Button>
            </>
          }
        >
          <form id="cabut-blacklist-form" onSubmit={simpanCabut} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 13 }}>
              Karyawan akan aktif kembali dan bisa login lagi. Data driver / mekanik / akun pengguna miliknya{" "}
              <strong>tidak</strong> otomatis aktif — aktifkan sendiri di menunya masing-masing bila perlu.
            </p>
            <Field label="Alasan dicabut">
              <Textarea
                value={cabut.alasan}
                maxLength={500}
                onChange={(e) => setCabut((p) => (p ? { ...p, alasan: e.target.value } : p))}
                placeholder="Opsional"
              />
            </Field>
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
