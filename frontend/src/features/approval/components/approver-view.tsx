import { useDeferredValue, useState } from "react";
import { Plus, Search, Settings, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Field, Input, Select } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Modal } from "@/components/ui/modal";
import { PageError } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { ALL_PAGE_SIZE, DEFAULT_PAGE_SIZE, Pagination, type PaginationState } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import {
  hapusApprover,
  MODE_LABEL,
  tambahApprover,
  ubahModeApproval,
  ubahUrutanApprover,
  type Approver,
  type FiturApproval,
  type FiturApprovalInfo,
  type ModeApproval
} from "../api";
import { useApproverList, useCalonApprover, useFiturApproval } from "../queries";

type FormTambah = { fitur: FiturApproval | ""; karyawanId: string; urutan: string };

/**
 * Master Data → Approver (superadmin): mode approval per fitur dan siapa approvernya.
 *
 * BATASAN (dijaga database, migration 20261001000009):
 * - approver harus karyawan aktif yang punya akun pengguna web aktif;
 * - fitur tanpa approver tidak bisa diajukan sama sekali;
 * - perubahan mode / approver hanya berlaku untuk pengajuan berikutnya.
 */
export function ApproverView() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [fitur, setFitur] = useState<FiturApproval | "">("");
  const qTunda = useDeferredValue(q);

  const [tambah, setTambah] = useState<FormTambah | null>(null);
  const [ubahLevel, setUbahLevel] = useState<{ a: Approver; urutan: string } | null>(null);
  const [hapus, setHapus] = useState<Approver | null>(null);
  // Pengaturan mode approval per fitur — disimpan di balik ikon setting
  // supaya kartunya tidak memenuhi layar.
  const [modeOpen, setModeOpen] = useState(false);
  // Popup loading selama aksi berjalan — mencegah klik beruntun.
  const [busy, setBusy] = useState<string | null>(null);

  const daftarFitur = useFiturApproval();
  const list = useApproverList({ page, pageSize, fitur, q: qTunda });
  const calon = useCalonApprover(tambah !== null);
  const fiturMap = new Map((daftarFitur.data ?? []).map((f) => [f.kode, f]));

  function ubah<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  const total = list.data?.total ?? 0;
  const items = list.data?.items ?? [];
  const size = pageSize === ALL_PAGE_SIZE ? Math.max(total, 1) : pageSize;
  const pg: PaginationState<Approver> = {
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

  async function gantiMode(f: FiturApprovalInfo, mode: ModeApproval) {
    if (busy || mode === f.mode) return;
    await jalankan(`Mengubah mode ${f.nama}…`, () => ubahModeApproval(f.kode, mode), `Mode ${f.nama} diperbarui`);
  }

  async function simpanTambah(e: React.FormEvent) {
    e.preventDefault();
    if (!tambah || busy) return;
    if (!tambah.fitur || !tambah.karyawanId) {
      toast.error("Fitur dan karyawan wajib dipilih.");
      return;
    }
    const urutan = Number(tambah.urutan) || 1;
    const ok = await jalankan(
      "Menambahkan approver…",
      () => tambahApprover({ fitur_kode: tambah.fitur as FiturApproval, karyawan_id: tambah.karyawanId, urutan }),
      "Approver ditambahkan"
    );
    if (ok) setTambah(null);
  }

  async function simpanLevel(e: React.FormEvent) {
    e.preventDefault();
    if (!ubahLevel || busy) return;
    const urutan = Number(ubahLevel.urutan);
    if (!(urutan >= 1 && urutan <= 20)) {
      toast.error("Level harus antara 1 dan 20.");
      return;
    }
    const ok = await jalankan("Menyimpan level…", () => ubahUrutanApprover(ubahLevel.a.id, urutan), "Level diperbarui");
    if (ok) setUbahLevel(null);
  }

  async function konfirmasiHapus() {
    if (!hapus || busy) return;
    const ok = await jalankan(
      `Menghapus ${hapus.karyawan_nama}…`,
      () => hapusApprover(hapus.id),
      `${hapus.karyawan_nama} bukan lagi approver ${hapus.fitur_nama}`
    );
    if (ok) setHapus(null);
  }

  const berjenjang = (a: Approver) => a.mode === "berjenjang";
  const fiturTambah = tambah?.fitur ? fiturMap.get(tambah.fitur) : undefined;

  const tombolAksi = (a: Approver) => (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
      {berjenjang(a) && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setUbahLevel({ a, urutan: String(a.urutan) })}
          disabled={busy !== null}
        >
          Ubah level
        </Button>
      )}
      <Button
        variant="danger"
        size="sm"
        leftIcon={<Trash2 style={{ width: 14, height: 14 }} />}
        onClick={() => setHapus(a)}
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
          title="Approver"
          description="Atur siapa yang menyetujui pengajuan di setiap fitur. Satu penolakan membuat pengajuan langsung ditolak."
        />
        <Button
          variant="secondary"
          leftIcon={<Settings style={{ width: 16, height: 16 }} />}
          onClick={() => setModeOpen(true)}
          disabled={busy !== null}
          title="Atur mode approval per fitur"
        >
          Mode approval
        </Button>
        <Button
          leftIcon={<Plus style={{ width: 16, height: 16 }} />}
          onClick={() => setTambah({ fitur: fitur, karyawanId: "", urutan: "1" })}
          disabled={busy !== null}
        >
          Tambah approver
        </Button>
      </div>

      {/* Fitur tanpa approver tetap diingatkan walau pengaturan mode disembunyikan. */}
      {(daftarFitur.data ?? []).some((f) => !f.jumlah_approver) && (
        <div className="caption" style={{ color: "#b91c1c" }}>
          Belum ada approver untuk:{" "}
          {(daftarFitur.data ?? [])
            .filter((f) => !f.jumlah_approver)
            .map((f) => f.nama)
            .join(", ")}{" "}
          — pengajuannya belum bisa dibuat.
        </div>
      )}

      <div className="toolbar">
        <div className="toolbar-search">
          <Input
            value={q}
            onChange={(e) => ubah(setQ)(e.target.value)}
            placeholder="Cari nama approver atau fitur…"
            leftIcon={<Search style={{ width: 15, height: 15 }} />}
          />
        </div>
      </div>

      <FilterChips
        value={fitur || "semua"}
        onChange={(k) => ubah(setFitur)(k === "semua" ? "" : (k as FiturApproval))}
        items={[
          { key: "semua", label: "Semua fitur" },
          ...(daftarFitur.data ?? []).map((f) => ({ key: f.kode, label: f.nama, count: f.jumlah_approver }))
        ]}
      />

      {list.isError ? (
        <PageError error={list.error} onRetry={list.refetch} />
      ) : list.isPending ? (
        <div className="card card-pad caption">Memuat approver…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={q || fitur ? "Tidak ada approver yang cocok" : "Belum ada approver"}
          description={q || fitur ? "Coba ubah filter atau kata kunci." : "Tambahkan approver pertama."}
        />
      ) : (
        <div style={{ opacity: list.isPlaceholderData ? 0.6 : 1, transition: "opacity 120ms" }}>
          <div className="card hidden lg:block" style={{ overflow: "hidden" }}>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fitur</th>
                    <th>Approver</th>
                    <th style={{ width: 90 }}>Level</th>
                    <th style={{ width: 220 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id}>
                      <td>{a.fitur_nama}</td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{a.karyawan_nama}</span>
                        {!a.karyawan_aktif && <NonaktifBadge />}
                      </td>
                      <td>{berjenjang(a) ? a.urutan : "—"}</td>
                      <td>{tombolAksi(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination state={pg} label="approver" attached />
          </div>

          <div className="lg:hidden flex flex-col" style={{ gap: 8 }}>
            {items.map((a) => (
              <div key={a.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontWeight: 600 }}>
                  {a.karyawan_nama}
                  {!a.karyawan_aktif && <NonaktifBadge />}
                </div>
                <div className="caption">
                  {a.fitur_nama}
                  {berjenjang(a) ? ` · level ${a.urutan}` : ""}
                </div>
                {tombolAksi(a)}
              </div>
            ))}
            <Pagination state={pg} label="approver" />
          </div>
        </div>
      )}

      {tambah && (
        <Modal
          open
          onClose={busy ? () => {} : () => setTambah(null)}
          title="Tambah approver"
          description="Hanya karyawan aktif yang punya akun pengguna web yang bisa dipilih."
          footer={
            <>
              <Button variant="secondary" onClick={() => setTambah(null)} disabled={busy !== null}>
                Batal
              </Button>
              <Button type="submit" form="approver-form" loading={busy !== null}>
                Tambah
              </Button>
            </>
          }
        >
          <form id="approver-form" onSubmit={simpanTambah} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Fitur" required>
              <Select
                value={tambah.fitur}
                onChange={(e) => setTambah((t) => (t ? { ...t, fitur: e.target.value as FiturApproval } : t))}
              >
                <option value="">— pilih fitur —</option>
                {(daftarFitur.data ?? []).map((f) => (
                  <option key={f.kode} value={f.kode}>
                    {f.nama}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Karyawan" required>
              <Combobox
                value={tambah.karyawanId}
                onChange={(v) => setTambah((t) => (t ? { ...t, karyawanId: v } : t))}
                options={(calon.data ?? []).map((k) => ({ value: k.id, label: k.nama }))}
                placeholder={calon.isPending ? "Memuat karyawan…" : "— pilih karyawan —"}
                searchPlaceholder="Cari nama karyawan…"
              />
            </Field>
            {fiturTambah?.mode === "berjenjang" && (
              <Field label="Level" required hint="1 = memutuskan pertama. Level berikutnya menunggu level sebelumnya.">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={tambah.urutan}
                  onChange={(e) => setTambah((t) => (t ? { ...t, urutan: e.target.value } : t))}
                />
              </Field>
            )}
          </form>
        </Modal>
      )}

      {ubahLevel && (
        <Modal
          open
          onClose={busy ? () => {} : () => setUbahLevel(null)}
          title={`Ubah level — ${ubahLevel.a.karyawan_nama}`}
          description={`${ubahLevel.a.fitur_nama}. Berlaku untuk pengajuan berikutnya.`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setUbahLevel(null)} disabled={busy !== null}>
                Batal
              </Button>
              <Button type="submit" form="level-form" loading={busy !== null}>
                Simpan
              </Button>
            </>
          }
        >
          <form id="level-form" onSubmit={simpanLevel}>
            <Field label="Level" required>
              <Input
                type="number"
                min={1}
                max={20}
                autoFocus
                value={ubahLevel.urutan}
                onChange={(e) => setUbahLevel((s) => (s ? { ...s, urutan: e.target.value } : s))}
              />
            </Field>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={hapus !== null}
        onClose={() => (busy ? undefined : setHapus(null))}
        onConfirm={konfirmasiHapus}
        title={`Hapus approver ${hapus?.karyawan_nama ?? ""}?`}
        body="Pengajuan yang sedang berjalan tetap menunggu keputusannya. Bila fitur ini tidak punya approver lagi, pengajuan baru tidak bisa dibuat."
        confirmText="Ya, hapus"
        variant="danger"
        loading={busy !== null}
      />

      <Modal
        open={modeOpen}
        onClose={() => setModeOpen(false)}
        title="Mode approval"
        description="Berlaku untuk pengajuan berikutnya; pengajuan yang sedang berjalan tidak berubah."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(daftarFitur.data ?? []).map((f) => (
            <div key={f.kode} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{f.nama}</div>
              <Select
                aria-label={`Mode approval ${f.nama}`}
                value={f.mode}
                onChange={(e) => gantiMode(f, e.target.value as ModeApproval)}
                disabled={busy !== null}
              >
                {(Object.keys(MODE_LABEL) as ModeApproval[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </Select>
              <div className="caption" style={{ color: f.jumlah_approver ? undefined : "#b91c1c" }}>
                {f.jumlah_approver
                  ? `${f.jumlah_approver} approver`
                  : "Belum ada approver — pengajuan fitur ini belum bisa dibuat"}
              </div>
            </div>
          ))}
        </div>
      </Modal>
      <LoadingOverlay message={busy} />
    </div>
  );
}

function NonaktifBadge() {
  return (
    <span className="badge" style={{ marginLeft: 6 }} title="Tidak ikut di pengajuan baru">
      Nonaktif
    </span>
  );
}
