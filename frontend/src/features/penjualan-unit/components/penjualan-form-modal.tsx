import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { JENIS_ASET, type JenisAset, type PenjualanUnit, type PenjualanUnitInput } from "../api";
import { useAsetPilihan } from "../queries";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Diisi = mode edit penjualan ini (aset tidak bisa diganti); kosong = catat baru. */
  penjualan?: PenjualanUnit | null;
  /** Kembalikan true bila tersimpan (modal ditutup pemanggil). */
  onSubmit: (input: PenjualanUnitInput) => Promise<boolean>;
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

/** Sama dengan validasi backend & CHECK DB: 8–15 digit, boleh +, spasi, -, titik, kurung. */
export function noHpValid(v: string): boolean {
  const digit = v.replace(/\D/g, "").length;
  return /^\+?[0-9 .()-]+$/.test(v) && digit >= 8 && digit <= 15;
}

export function emailValid(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

const LABEL_STATUS: Record<string, string> = {
  standby: "Standby",
  bertugas: "Bertugas",
  breakdown: "Breakdown",
  perbaikan: "Perbaikan",
  diafkirkan: "Diafkirkan",
  terjual: "Terjual"
};

function hariIniWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

const KOSONG = {
  jenisAset: "unit" as JenisAset,
  assetId: "",
  namaPembeli: "",
  noHpPembeli: "",
  emailPembeli: "",
  harga: "",
  tanggal: "",
  catatan: "",
  penyerahNama: "",
  penyerahJabatan: ""
};

function dariPenjualan(p: PenjualanUnit): typeof KOSONG {
  return {
    jenisAset: p.jenis_aset,
    assetId: (p.jenis_aset === "unit" ? p.unit_id : p.unit_trailer_id) ?? "",
    namaPembeli: p.nama_pembeli,
    noHpPembeli: p.no_hp_pembeli ?? "",
    emailPembeli: p.email_pembeli ?? "",
    harga: String(p.harga_jual),
    tanggal: p.tanggal_jual.slice(0, 10),
    catatan: p.catatan ?? "",
    penyerahNama: p.penyerah_nama ?? "",
    penyerahJabatan: p.penyerah_jabatan ?? ""
  };
}

export function PenjualanFormModal({ open, onClose, penjualan, onSubmit, busy }: Props) {
  const isEdit = Boolean(penjualan);
  const [form, setForm] = useState(KOSONG);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Aset Breakdown: data siap kirim, menunggu "Apakah Anda yakin?".
  const [konfirmasi, setKonfirmasi] = useState<PenjualanUnitInput | null>(null);

  useEffect(() => {
    if (open) {
      setForm(penjualan ? dariPenjualan(penjualan) : { ...KOSONG, tanggal: hariIniWib() });
      setErrors({});
      setKonfirmasi(null);
    }
  }, [open, penjualan]);

  // Mode edit: aset tetap, jadi daftar pilihan aset tidak perlu dimuat.
  const aset = useAsetPilihan(form.jenisAset, open && !isEdit);
  // Aset Bertugas / Perbaikan / Terjual tetap bisa dipilih, tapi tidak bisa dijual.
  const asetTerpilih = aset.data?.find((a) => a.id === form.assetId);
  const alasanTidakBisa = asetTerpilih?.alasan_tidak_bisa ?? null;

  function set<K extends keyof typeof KOSONG>(key: K, value: (typeof KOSONG)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  async function simpan() {
    const harga = parseRupiah(form.harga);
    const next: Record<string, string> = {};
    if (!isEdit) {
      if (!form.assetId) next.assetId = "Pilih aset yang dijual";
      else if (alasanTidakBisa) next.assetId = alasanTidakBisa;
    }
    if (!form.namaPembeli.trim()) next.namaPembeli = "Nama pembeli wajib diisi";
    const noHp = form.noHpPembeli.trim();
    const email = form.emailPembeli.trim();
    if (noHp && !noHpValid(noHp)) next.noHpPembeli = "No HP tidak valid (8–15 digit)";
    if (email && !emailValid(email)) next.emailPembeli = "Format email tidak valid";
    if (harga <= 0) next.harga = "Harga jual wajib diisi";
    if (!form.tanggal) next.tanggal = "Tanggal jual wajib diisi";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const input: PenjualanUnitInput = {
      jenis_aset: form.jenisAset,
      asset_id: form.assetId,
      nama_pembeli: form.namaPembeli.trim(),
      no_hp_pembeli: noHp || null,
      email_pembeli: email || null,
      harga_jual: harga,
      tanggal_jual: form.tanggal,
      catatan: form.catatan.trim() || null,
      penyerah_nama: form.penyerahNama.trim() || null,
      penyerah_jabatan: form.penyerahJabatan.trim() || null
    };
    // Aset yang masih punya insiden terbuka (Breakdown): tanya dulu.
    if ((asetTerpilih?.insiden_terbuka ?? 0) > 0) {
      setKonfirmasi(input);
      return;
    }
    await kirim(input);
  }

  async function kirim(input: PenjualanUnitInput) {
    const ok = await onSubmit(input);
    setKonfirmasi(null);
    if (ok) onClose();
  }

  const labelAset = form.jenisAset === "unit" ? "unit" : "unit trailer";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit penjualan ${penjualan?.nomor_surat ?? ""}` : "Catat penjualan"}
      description={
        isEdit
          ? "Aset & nomor dokumen tidak berubah. Edit hanya bisa selama surat / BAST bertanda tangan belum diunggah."
          : "Aset yang dicatat terjual otomatis berstatus Terjual dan tidak bisa dipakai job lagi."
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={simpan}
            disabled={busy || Boolean(alasanTidakBisa)}
          >
            {busy ? "Menyimpan…" : isEdit ? "Simpan perubahan" : "Simpan penjualan"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {isEdit ? (
          <Field label={form.jenisAset === "unit" ? "Unit" : "Unit trailer"} hint="Aset tidak bisa diganti saat edit.">
            <Input value={penjualan?.kode_aset ?? ""} disabled />
          </Field>
        ) : (
          <>
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
            hint={`${labelAset[0].toUpperCase()}${labelAset.slice(1)} yang sedang Bertugas atau Perbaikan tidak bisa dijual`}
          >
            <Combobox
              value={form.assetId}
              onChange={(v) => set("assetId", v)}
              options={(aset.data ?? []).map((a) => ({
                value: a.id,
                label: a.kode,
                hint: [a.jenis_nama, a.alasan_tidak_bisa ? `${LABEL_STATUS[a.status] ?? a.status} — tidak bisa dijual` : LABEL_STATUS[a.status]]
                  .filter(Boolean)
                  .join(" · ")
              }))}
              placeholder={aset.isPending ? "Memuat…" : `Pilih ${labelAset}`}
              searchPlaceholder={`Cari kode ${labelAset}…`}
              emptyText={`Tidak ada ${labelAset} yang belum terjual`}
              error={errors.assetId && errors.assetId !== alasanTidakBisa ? errors.assetId : undefined}
            />
            {alasanTidakBisa && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  fontSize: 13,
                  lineHeight: 1.5,
                  background: "var(--status-perbaikan-bg)",
                  color: "var(--status-perbaikan-text)"
                }}
              >
                <AlertTriangle style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }} />
                <span>
                  {alasanTidakBisa} Silakan selesaikan terlebih dahulu.
                </span>
              </div>
            )}
          </Field>

          </>
        )}

        <Field label="Nama pembeli" required>
          <Input
            value={form.namaPembeli}
            onChange={(e) => set("namaPembeli", e.target.value)}
            placeholder="mis. PT Sinar Jaya / Budi Santoso"
            error={errors.namaPembeli}
          />
        </Field>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <Field label="No HP pembeli">
            <Input
              type="tel"
              inputMode="tel"
              value={form.noHpPembeli}
              onChange={(e) => set("noHpPembeli", e.target.value)}
              placeholder="08xxxxxxxxxx"
              error={errors.noHpPembeli}
            />
          </Field>
          <Field label="Email pembeli">
            <Input
              type="email"
              value={form.emailPembeli}
              onChange={(e) => set("emailPembeli", e.target.value)}
              placeholder="pembeli@perusahaan.co.id"
              error={errors.emailPembeli}
            />
          </Field>
        </div>

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

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <Field label="Diserahkan oleh (nama)" hint="Tercetak di tanda tangan penjual & BAST">
            <Input
              value={form.penyerahNama}
              onChange={(e) => set("penyerahNama", e.target.value)}
              placeholder="mis. Budi Santoso"
              maxLength={100}
            />
          </Field>
          <Field label="Jabatan">
            <Input
              value={form.penyerahJabatan}
              onChange={(e) => set("penyerahJabatan", e.target.value)}
              placeholder="mis. Kepala Pool"
              maxLength={100}
            />
          </Field>
        </div>
      </div>
      <ConfirmDialog
        open={konfirmasi !== null}
        onClose={() => setKonfirmasi(null)}
        onConfirm={() => konfirmasi && void kirim(konfirmasi)}
        loading={busy}
        variant="primary"
        title={`Jual ${labelAset} ${asetTerpilih?.kode ?? ""}?`}
        confirmText="Ya, jual"
        body={
          <>
            {labelAset[0].toUpperCase() + labelAset.slice(1)} ini berstatus{" "}
            <strong>Breakdown</strong> dan masih punya {asetTerpilih?.insiden_terbuka ?? 0} insiden yang
            belum selesai. Apakah Anda yakin mau menjual? Statusnya akan menjadi <strong>Terjual</strong> dan
            insidennya ditandai <strong>Selesai (terjual)</strong>.
          </>
        }
      />
    </Modal>
  );
}
