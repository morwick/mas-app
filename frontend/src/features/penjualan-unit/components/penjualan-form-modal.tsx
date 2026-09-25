import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { JENIS_ASET, type JenisAset, type PenjualanUnitInput } from "../api";
import { useAsetPilihan } from "../queries";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Kembalikan true bila tersimpan (modal ditutup pemanggil). */
  onSubmit: (input: PenjualanUnitInput, bukti: File | null) => Promise<boolean>;
  busy: boolean;
}

function parseRupiah(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function displayRupiah(s: string): string {
  const n = parseRupiah(s);
  return n ? new Intl.NumberFormat("id-ID").format(n) : "";
}

function hariIniWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

const KOSONG = {
  jenisAset: "unit" as JenisAset,
  assetId: "",
  namaPembeli: "",
  kontakPembeli: "",
  harga: "",
  tanggal: "",
  catatan: ""
};

export function PenjualanFormModal({ open, onClose, onSubmit, busy }: Props) {
  const [form, setForm] = useState(KOSONG);
  const [bukti, setBukti] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm({ ...KOSONG, tanggal: hariIniWib() });
      setBukti(null);
      setErrors({});
    }
  }, [open]);

  const aset = useAsetPilihan(form.jenisAset, open);

  function set<K extends keyof typeof KOSONG>(key: K, value: (typeof KOSONG)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  async function simpan() {
    const harga = parseRupiah(form.harga);
    const next: Record<string, string> = {};
    if (!form.assetId) next.assetId = "Pilih aset yang dijual";
    if (!form.namaPembeli.trim()) next.namaPembeli = "Nama pembeli wajib diisi";
    if (harga <= 0) next.harga = "Harga jual wajib diisi";
    if (!form.tanggal) next.tanggal = "Tanggal jual wajib diisi";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const ok = await onSubmit(
      {
        jenis_aset: form.jenisAset,
        asset_id: form.assetId,
        nama_pembeli: form.namaPembeli.trim(),
        kontak_pembeli: form.kontakPembeli.trim() || null,
        harga_jual: harga,
        tanggal_jual: form.tanggal,
        catatan: form.catatan.trim() || null
      },
      bukti
    );
    if (ok) onClose();
  }

  const labelAset = form.jenisAset === "unit" ? "unit" : "unit trailer";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Catat penjualan"
      description="Aset yang dicatat terjual otomatis berstatus Terjual dan tidak bisa dipakai job lagi."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="button" className="btn btn-primary" onClick={simpan} disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan penjualan"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Jenis aset" required>
          <Select
            value={form.jenisAset}
            onChange={(e) => {
              set("jenisAset", e.target.value as JenisAset);
              set("assetId", "");
            }}
          >
            {JENIS_ASET.map((j) => (
              <option key={j.value} value={j.value}>
                {j.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={form.jenisAset === "unit" ? "Unit" : "Unit trailer"}
          required
          hint={`Hanya ${labelAset} berstatus Standby yang bisa dijual`}
        >
          <Combobox
            value={form.assetId}
            onChange={(v) => set("assetId", v)}
            options={(aset.data ?? []).map((a) => ({
              value: a.id,
              label: a.kode,
              hint: a.jenis_nama ?? undefined
            }))}
            placeholder={aset.isPending ? "Memuat…" : `Pilih ${labelAset}`}
            searchPlaceholder={`Cari kode ${labelAset}…`}
            emptyText={`Tidak ada ${labelAset} Standby`}
            error={errors.assetId}
          />
        </Field>

        <Field label="Nama pembeli" required>
          <Input
            value={form.namaPembeli}
            onChange={(e) => set("namaPembeli", e.target.value)}
            placeholder="mis. PT Sinar Jaya / Budi Santoso"
            error={errors.namaPembeli}
          />
        </Field>

        <Field label="Kontak pembeli">
          <Input
            value={form.kontakPembeli}
            onChange={(e) => set("kontakPembeli", e.target.value)}
            placeholder="No HP / email"
          />
        </Field>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <Field label="Harga jual (Rp)" required>
            <Input
              inputMode="numeric"
              value={displayRupiah(form.harga)}
              onChange={(e) => set("harga", e.target.value)}
              placeholder="0"
              error={errors.harga}
            />
          </Field>
          <Field label="Tanggal jual" required>
            <Input
              type="date"
              value={form.tanggal}
              onChange={(e) => set("tanggal", e.target.value)}
              error={errors.tanggal}
            />
          </Field>
        </div>

        <Field label="Catatan">
          <Textarea rows={2} value={form.catatan} onChange={(e) => set("catatan", e.target.value)} />
        </Field>

        <Field label="Bukti transaksi" hint="PDF / JPG / PNG / WEBP, maks. 10 MB — bisa juga diunggah nanti">
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setBukti(e.target.files?.[0] ?? null)}
          />
        </Field>
      </div>
    </Modal>
  );
}
