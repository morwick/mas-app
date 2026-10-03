import { useRef, useState, type ReactNode } from "react";
import { Plus, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Field, Textarea } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, formatRupiah } from "@/lib/utils";
import type { BiayaLain } from "@/types";
import { createBiayaLain, deleteBiayaLain, updateBiayaLain } from "../api";
import { useBiayaLainJob, useJenisBiaya } from "../queries";

interface Props {
  jobId: string;
  /** Finance & operator: hanya melihat. */
  hanyaLihat: boolean;
  /** Nomor tagihan bila job sudah ditagihkan — biaya lain terkunci. */
  nomorTagihan?: string | null;
}

/** `jenisBaru` = nama jenis biaya yang diketik & belum ada di daftar. */
type Form = { id?: string; jenisBiayaId: string; jenisBaru: string; nominal: string; catatan: string };

// Penanda opsi jenis baru di Combobox (bukan id dari database).
const BARU = "baru:";

/**
 * Kartu "Biaya Lain" di detail job: biaya perusahaan di luar uang jalan
 * (tol, parkir, bongkar muat…). Tidak ditagihkan ke customer; mengurangi
 * profit di laporan Laba tahunan.
 *
 * BATASAN: tambah / ubah / hapus hanya selama job belum ditagihkan (sama
 * dengan uang jalan); backend & database ikut menolak.
 */
export function BiayaLainCard({ jobId, hanyaLihat, nomorTagihan }: Props) {
  const toast = useToast();
  const biaya = useBiayaLainJob(jobId);
  const jenis = useJenisBiaya();
  const [detail, setDetail] = useState<BiayaLain | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<{ jenis?: string; nominal?: string }>({});
  const [hapus, setHapus] = useState<BiayaLain | null>(null);
  // Popup loading selama aksi berjalan; ref mencegah klik beruntun.
  const [busy, setBusy] = useState<string | null>(null);
  const sedangProses = useRef(false);

  const bisaUbah = !hanyaLihat && !nomorTagihan;
  const daftar = biaya.data ?? [];
  const total = daftar.reduce((s, b) => s + b.nominal, 0);
  const opsiJenis: ComboboxOption[] = (jenis.data ?? []).map((j) => ({ value: j.id, label: j.nama }));
  // Jenis baru yang sudah diketik ditampilkan sebagai opsi terpilih.
  if (form?.jenisBaru) opsiJenis.unshift({ value: BARU + form.jenisBaru, label: form.jenisBaru, hint: "Jenis baru" });

  function bukaTambah() {
    setErrors({});
    setForm({ jenisBiayaId: "", jenisBaru: "", nominal: "", catatan: "" });
  }

  function bukaUbah(b: BiayaLain) {
    setDetail(null);
    setErrors({});
    setForm({
      id: b.id,
      jenisBiayaId: b.jenis_biaya_id,
      jenisBaru: "",
      nominal: String(Math.round(b.nominal)),
      catatan: b.catatan ?? ""
    });
  }

  async function jalankan(pesan: string, aksi: () => Promise<{ ok: boolean; error?: string }>, sukses: string) {
    if (sedangProses.current) return false;
    sedangProses.current = true;
    setBusy(pesan);
    const res = await aksi();
    setBusy(null);
    sedangProses.current = false;
    if (!res.ok) {
      toast.error(res.error ?? "Gagal menyimpan");
      return false;
    }
    toast.success(sukses);
    return true;
  }

  async function simpan() {
    if (!form) return;
    const nominal = Number(form.nominal) || 0;
    const errs: typeof errors = {};
    if (!form.jenisBiayaId && !form.jenisBaru.trim()) errs.jenis = "Jenis biaya wajib dipilih atau diketik";
    if (nominal <= 0) errs.nominal = "Nominal harus lebih dari 0";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const input = {
      jenis_biaya_id: form.jenisBaru ? null : form.jenisBiayaId,
      jenis_biaya_nama: form.jenisBaru ? form.jenisBaru.trim() : null,
      nominal,
      catatan: form.catatan.trim() || null
    };
    const ok = await jalankan(
      form.id ? "Menyimpan perubahan biaya lain…" : "Menambahkan biaya lain…",
      () => (form.id ? updateBiayaLain(jobId, form.id, input) : createBiayaLain(jobId, input)),
      form.id ? "Biaya lain diperbarui" : "Biaya lain ditambahkan"
    );
    if (ok) setForm(null);
  }

  async function konfirmasiHapus() {
    if (!hapus) return;
    const b = hapus;
    const ok = await jalankan(`Menghapus biaya ${b.jenis_biaya_nama}…`, () => deleteBiayaLain(jobId, b.id), "Biaya lain dihapus");
    if (ok) setHapus(null);
  }

  return (
    <div className="card card-pad">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }} className="eyebrow">
          <Receipt style={{ width: 13, height: 13 }} />
          Biaya lain
        </div>
        {bisaUbah && (
          <Button size="sm" variant="secondary" onClick={bukaTambah}>
            <Plus style={{ width: 13, height: 13 }} />
            Tambah
          </Button>
        )}
      </div>

      {nomorTagihan && !hanyaLihat && (
        <p className="caption" style={{ marginTop: -6, marginBottom: 12 }}>
          Job sudah ditagihkan ({nomorTagihan}) — biaya lain tidak bisa ditambah, diubah, atau dihapus lagi.
        </p>
      )}

      {biaya.isError ? (
        <p className="caption">Biaya lain gagal dimuat.</p>
      ) : biaya.isPending ? (
        <p className="caption">Memuat…</p>
      ) : daftar.length === 0 ? (
        <p className="caption">Belum ada biaya lain.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Jenis biaya</th>
              <th style={{ textAlign: "right" }}>Nominal</th>
              <th style={{ width: 40 }} aria-label="Detail" />
            </tr>
          </thead>
          <tbody>
            {daftar.map((b) => (
              <tr key={b.id}>
                <td style={{ fontSize: 13 }}>{b.jenis_biaya_nama}</td>
                <td className="mono" style={{ textAlign: "right", fontSize: 12.5 }}>
                  {formatRupiah(b.nominal)}
                </td>
                <td style={{ textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => setDetail(b)}
                    aria-label={`Lihat detail biaya ${b.jenis_biaya_nama}`}
                    title="Lihat detail"
                    className="p-1.5 hover:bg-page rounded-md text-text-muted hover:text-text"
                  >
                    <Search style={{ width: 15, height: 15 }} />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ fontSize: 13, fontWeight: 700 }}>Total</td>
              <td className="mono" style={{ textAlign: "right", fontSize: 12.5, fontWeight: 700 }}>
                {formatRupiah(total)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      )}

      {/* Detail (ikon kaca pembesar) */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title="Detail biaya lain"
        maxWidth="max-w-[480px]"
        footer={
          detail && bisaUbah ? (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  setHapus(detail);
                  setDetail(null);
                }}
              >
                Hapus
              </Button>
              <Button variant="secondary" onClick={() => bukaUbah(detail)}>
                Ubah
              </Button>
              <Button onClick={() => setDetail(null)}>Tutup</Button>
            </>
          ) : (
            <Button onClick={() => setDetail(null)}>Tutup</Button>
          )
        }
      >
        {detail && (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <Isian label="Jenis biaya">{detail.jenis_biaya_nama}</Isian>
            <Isian label="Nominal">
              <span className="mono">{formatRupiah(detail.nominal)}</span>
            </Isian>
            <Isian label="Catatan" lebar>
              {detail.catatan ? <span style={{ whiteSpace: "pre-wrap" }}>{detail.catatan}</span> : "—"}
            </Isian>
            <Isian label="Dibuat oleh">{detail.created_by_nama ?? "—"}</Isian>
            <Isian label="Dibuat pada">{formatDateTime(detail.created_at)}</Isian>
          </div>
        )}
      </Modal>

      {/* Tambah / ubah */}
      <Modal
        open={form !== null}
        onClose={busy ? () => {} : () => setForm(null)}
        title={form?.id ? "Ubah biaya lain" : "Tambah biaya lain"}
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
        <div className="flex flex-col gap-4">
          <Field
            label="Jenis biaya"
            required
            hint="Ketik untuk mencari. Belum ada di daftar? Pilih “Tambah …” — jenis baru tersimpan bersama biaya ini."
          >
            <Combobox
              value={form?.jenisBaru ? BARU + form.jenisBaru : (form?.jenisBiayaId ?? "")}
              onChange={(v) =>
                setForm((f) => {
                  if (!f) return f;
                  if (v.startsWith(BARU)) return f; // opsi jenis baru yang sama dipilih ulang
                  return { ...f, jenisBiayaId: v, jenisBaru: "" };
                })
              }
              options={opsiJenis}
              placeholder="— pilih atau ketik jenis biaya —"
              searchPlaceholder="Ketik jenis biaya…"
              error={errors.jenis}
              onCreate={(nama) => setForm((f) => (f ? { ...f, jenisBiayaId: "", jenisBaru: nama.trim() } : f))}
              createLabel={(nama) => `Tambah "${nama.trim()}" sebagai jenis biaya baru`}
            />
          </Field>
          <Field label="Nominal" required>
            <CurrencyInput
              placeholder="0"
              value={form?.nominal ?? ""}
              onChange={(v) => setForm((f) => (f ? { ...f, nominal: v } : f))}
              error={errors.nominal}
            />
          </Field>
          <Field label="Catatan">
            <Textarea
              rows={2}
              maxLength={500}
              value={form?.catatan ?? ""}
              onChange={(e) => setForm((f) => (f ? { ...f, catatan: e.target.value } : f))}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={hapus !== null}
        onClose={() => (busy ? undefined : setHapus(null))}
        title={`Hapus biaya ${hapus?.jenis_biaya_nama ?? ""}?`}
        body={`Biaya ${hapus ? formatRupiah(hapus.nominal) : ""} akan dihapus dari job ini.`}
        confirmText="Ya, hapus"
        variant="danger"
        loading={busy !== null}
        onConfirm={konfirmasiHapus}
      />

      <LoadingOverlay message={busy} />
    </div>
  );
}

function Isian({ label, lebar, children }: { label: string; lebar?: boolean; children: ReactNode }) {
  return (
    <div style={lebar ? { gridColumn: "1 / -1" } : undefined}>
      <div className="eyebrow" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5 }}>{children}</div>
    </div>
  );
}
