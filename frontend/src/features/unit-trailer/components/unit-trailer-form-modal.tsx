import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { type JenisUnitTrailer, type UnitTrailer, type UnitTrailerInput } from "../api";

interface Props {
  open: boolean;
  /** Data yang diedit; kosong = tambah baru. */
  trailer: UnitTrailer | null;
  jenisList: JenisUnitTrailer[];
  /** Master Jenis Unit (truk) — wajib dipilih saat menambah jenis unit trailer. */
  jenisUnitList: { id: string; nama: string }[];
  busy: boolean;
  onClose: () => void;
  /** Kembalikan true bila tersimpan — modal ditutup oleh pemanggil. */
  onSave: (input: UnitTrailerInput) => Promise<boolean>;
  /** Tambah jenis baru; kembalikan jenis yang tersimpan atau null bila gagal. */
  onCreateJenis: (nama: string, jenisUnitId: string) => Promise<JenisUnitTrailer | null>;
}

const TAHUN_MIN = 1950;
const KAPASITAS_MAX = 999_999.99; // batas kolom NUMERIC(8, 2) di database

/**
 * Tahun & kapasitas diperiksa dari teks aslinya. Input type="number" di
 * browser mengosongkan isian yang bukan angka tanpa memberi tahu, sehingga
 * "20a0" dulu tersimpan diam-diam sebagai "tahun kosong".
 */
export function periksaTahun(teks: string): { nilai: number | null; error?: string } {
  const t = teks.trim();
  if (!t) return { nilai: null };
  const batasAtas = new Date().getFullYear() + 1;
  if (!/^\d{4}$/.test(t)) return { nilai: null, error: "Tahun tidak valid: harus angka 4 digit" };
  const n = Number(t);
  if (n < TAHUN_MIN || n > batasAtas)
    return { nilai: null, error: `Tahun tidak valid: harus antara ${TAHUN_MIN} dan ${batasAtas}` };
  return { nilai: n };
}

export function periksaKapasitas(teks: string): { nilai: number | null; error?: string } {
  const t = teks.trim();
  if (!t) return { nilai: null };
  if (!/^\d+([.,]\d{1,2})?$/.test(t))
    return {
      nilai: null,
      error: "Kapasitas muatan tidak valid: harus angka, maksimal 2 angka di belakang koma"
    };
  const n = Number(t.replace(",", "."));
  if (n <= 0 || n > KAPASITAS_MAX)
    return { nilai: null, error: "Kapasitas muatan tidak valid: harus lebih dari 0 ton" };
  return { nilai: n };
}

interface FormState {
  kode: string;
  jenisId: string;
  tahun: string;
  kapasitas: string;
  // Dokumen opsional: KIR & SRUT (Surat Registrasi Uji Tipe).
  kirNomor: string;
  kirBerlaku: string;
  srutNomor: string;
  srutTanggal: string;
}

function awal(trailer: UnitTrailer | null): FormState {
  return {
    kode: trailer?.kode_trailer ?? "",
    jenisId: trailer?.jenis_unit_trailer_id ?? "",
    tahun: trailer?.tahun != null ? String(trailer.tahun) : "",
    kapasitas: trailer?.kapasitas_ton != null ? String(trailer.kapasitas_ton) : "",
    kirNomor: trailer?.kir_nomor ?? "",
    kirBerlaku: trailer?.kir_berlaku_sampai ?? "",
    srutNomor: trailer?.srut_nomor ?? "",
    srutTanggal: trailer?.srut_tanggal ?? ""
  };
}

export function UnitTrailerFormModal({
  open,
  trailer,
  jenisList,
  jenisUnitList,
  busy,
  onClose,
  onSave,
  onCreateJenis
}: Props) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(awal(trailer));
  const [err, setErr] = useState<Partial<Record<keyof FormState, string>>>({});
  const [jenisBaruOpen, setJenisBaruOpen] = useState(false);
  const [jenisBaru, setJenisBaru] = useState("");
  const [jenisBaruErr, setJenisBaruErr] = useState("");
  const [jenisBaruUnit, setJenisBaruUnit] = useState("");
  const [jenisBaruUnitErr, setJenisBaruUnitErr] = useState("");

  // Isi ulang setiap kali modal dibuka untuk data yang berbeda.
  useEffect(() => {
    if (open) {
      setForm(awal(trailer));
      setErr({});
    }
  }, [open, trailer]);

  const jenisOptions = useMemo(
    () =>
      jenisList.map((j) => ({
        value: j.id,
        label: j.nama,
        hint: j.jenis_unit_nama ? `Jenis unit: ${j.jenis_unit_nama}` : undefined
      })),
    [jenisList]
  );

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErr((e) => ({ ...e, [k]: undefined }));
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof err = {};
    const tahun = periksaTahun(form.tahun);
    const kapasitas = periksaKapasitas(form.kapasitas);
    if (!form.kode.trim()) errs.kode = "Kode trailer wajib diisi";
    if (!form.jenisId) errs.jenisId = "Jenis unit trailer wajib dipilih";
    if (tahun.error) errs.tahun = tahun.error;
    if (kapasitas.error) errs.kapasitas = kapasitas.error;
    setErr(errs);
    const pesan = Object.values(errs).filter(Boolean);
    if (pesan.length > 0) {
      // Isian tidak valid → proses dibatalkan, tidak ada yang dikirim ke server.
      toast.error(`${trailer ? "Gagal mengubah data" : "Gagal menambah data"}. ${pesan[0]}`);
      return;
    }

    await onSave({
      kode_trailer: form.kode.trim(),
      jenis_unit_trailer_id: form.jenisId,
      tahun: tahun.nilai,
      kapasitas_ton: kapasitas.nilai,
      kir_nomor: form.kirNomor.trim() || null,
      kir_berlaku_sampai: form.kirBerlaku || null,
      srut_nomor: form.srutNomor.trim() || null,
      srut_tanggal: form.srutTanggal || null
    });
  }

  async function simpanJenisBaru() {
    const nama = jenisBaru.trim();
    setJenisBaruErr(nama ? "" : "Nama jenis unit trailer wajib diisi");
    setJenisBaruUnitErr(jenisBaruUnit ? "" : "Jenis unit wajib dipilih");
    if (!nama || !jenisBaruUnit) return;
    const jenis = await onCreateJenis(nama, jenisBaruUnit);
    // Gagal (mis. nama sudah ada) → isian dibiarkan, pesan tampil lewat toast.
    if (!jenis) return;
    set("jenisId", jenis.id);
    setJenisBaru("");
    setJenisBaruErr("");
    setJenisBaruUnit("");
    setJenisBaruUnitErr("");
    setJenisBaruOpen(false);
  }

  return (
    <>
      <Modal
        open={open}
        onClose={busy ? () => {} : onClose}
        title={trailer ? `Edit unit trailer — ${trailer.kode_trailer}` : "Tambah unit trailer"}
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" form="unit-trailer-form" loading={busy}>
              Simpan
            </Button>
          </>
        }
      >
        <form
          id="unit-trailer-form"
          onSubmit={simpan}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <Field label="Kode unit trailer" required hint="Harus unik, mis. TR-01.">
            <Input
              value={form.kode}
              onChange={(e) => set("kode", e.target.value)}
              error={err.kode}
              autoFocus
            />
          </Field>

          <Field label="Jenis unit trailer" required>
            <div className="flex flex-wrap gap-2">
              <div style={{ flex: 1, minWidth: 200 }}>
                <Combobox
                  value={form.jenisId}
                  onChange={(v) => set("jenisId", v)}
                  options={jenisOptions}
                  placeholder="Pilih jenis unit trailer"
                  searchPlaceholder="Cari jenis unit trailer…"
                  emptyText="Jenis unit trailer tidak ditemukan — tambahkan lewat tombol Jenis baru"
                  error={err.jenisId}
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setJenisBaruOpen(true)}
                disabled={busy}
              >
                <Plus style={{ width: 14, height: 14 }} />
                Jenis baru
              </button>
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
            <Field label="Tahun">
              <Input
                inputMode="numeric"
                maxLength={4}
                placeholder="2020"
                value={form.tahun}
                onChange={(e) => set("tahun", e.target.value)}
                error={err.tahun}
              />
            </Field>
            <Field label="Kapasitas muatan (ton)">
              <Input
                inputMode="decimal"
                placeholder="40 atau 40,5"
                value={form.kapasitas}
                onChange={(e) => set("kapasitas", e.target.value)}
                error={err.kapasitas}
              />
            </Field>
          </div>

          {/* Status tidak diisi di sini — sama seperti unit: Bertugas dari job,
              Breakdown / Perbaikan dari insiden, Standby / Diafkirkan lewat
              tombol Ubah status di halaman detail. */}
          <div className="field-label" style={{ marginTop: 4 }}>
            Dokumen <span className="caption">(opsional)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
            <Field label="Nomor KIR">
              <Input value={form.kirNomor} onChange={(e) => set("kirNomor", e.target.value)} />
            </Field>
            <Field label="KIR berlaku sampai">
              <Input
                type="date"
                value={form.kirBerlaku}
                onChange={(e) => set("kirBerlaku", e.target.value)}
              />
            </Field>
            <Field label="Nomor SRUT" hint="Surat Registrasi Uji Tipe">
              <Input value={form.srutNomor} onChange={(e) => set("srutNomor", e.target.value)} />
            </Field>
            <Field label="Tanggal SRUT">
              <Input
                type="date"
                value={form.srutTanggal}
                onChange={(e) => set("srutTanggal", e.target.value)}
              />
            </Field>
          </div>
        </form>
      </Modal>

      {/* Tambah jenis unit trailer tanpa meninggalkan form — seperti "Customer baru" di Tambah Job. */}
      <Modal
        open={jenisBaruOpen}
        onClose={busy ? () => {} : () => setJenisBaruOpen(false)}
        title="Jenis unit trailer baru"
        description="Tersimpan ke master Jenis Unit Trailer dan langsung terpilih."
        maxWidth="max-w-[420px]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setJenisBaruOpen(false)} disabled={busy}>
              Batal
            </Button>
            <Button onClick={simpanJenisBaru} loading={busy}>
              Simpan jenis
            </Button>
          </>
        }
      >
        <Field label="Nama jenis unit trailer" required>
          <Input
            value={jenisBaru}
            onChange={(e) => {
              setJenisBaru(e.target.value);
              setJenisBaruErr("");
            }}
            placeholder="Contoh: Flatbed"
            error={jenisBaruErr}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void simpanJenisBaru();
              }
            }}
          />
        </Field>
        <div style={{ height: 14 }} />
        <Field label="Jenis unit" required hint="Jenis unit (truk) yang menarik trailer jenis ini.">
          <Combobox
            value={jenisBaruUnit}
            onChange={(v) => {
              setJenisBaruUnit(v);
              setJenisBaruUnitErr("");
            }}
            options={jenisUnitList.map((j) => ({ value: j.id, label: j.nama }))}
            placeholder="Pilih jenis unit"
            searchPlaceholder="Cari jenis unit…"
            emptyText="Jenis unit tidak ditemukan"
            error={jenisBaruUnitErr}
          />
        </Field>
      </Modal>
    </>
  );
}
