import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { UNIT_STATUS_LABEL } from "@/features/units/components/aset-detail-parts";
import type { UnitStatus } from "@/types";
import { JENIS_ASET, type JenisAset, type PenghapusanAset, type PenghapusanAsetInput } from "../api";
import { useAsetDihapusPilihan } from "../queries";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Diisi = mode edit penghapusan ini (aset tidak bisa diganti); kosong = catat baru. */
  penghapusan?: PenghapusanAset | null;
  /** Kembalikan true bila tersimpan (modal ditutup pemanggil). */
  onSubmit: (input: PenghapusanAsetInput) => Promise<boolean>;
  busy: boolean;
}

function hariIniWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function labelStatus(status: string): string {
  return UNIT_STATUS_LABEL[status as UnitStatus] ?? status;
}

const KOSONG = {
  jenisAset: "unit" as JenisAset,
  assetId: "",
  tanggal: "",
  alasan: "",
  catatan: ""
};

export function PenghapusanFormModal({ open, onClose, penghapusan, onSubmit, busy }: Props) {
  const toast = useToast();
  const isEdit = Boolean(penghapusan);
  const [form, setForm] = useState(KOSONG);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Data siap kirim, menunggu "Apakah Anda yakin?".
  const [konfirmasi, setKonfirmasi] = useState<PenghapusanAsetInput | null>(null);

  useEffect(() => {
    if (open) {
      setForm(
        penghapusan
          ? {
              jenisAset: penghapusan.jenis_aset,
              assetId: (penghapusan.unit_id ?? penghapusan.unit_trailer_id) || "",
              tanggal: penghapusan.tanggal_hapus.slice(0, 10),
              alasan: penghapusan.alasan,
              catatan: penghapusan.catatan ?? ""
            }
          : { ...KOSONG, tanggal: hariIniWib() }
      );
      setErrors({});
      setKonfirmasi(null);
    }
  }, [open, penghapusan]);

  // Mode edit: aset tetap, jadi daftar pilihan aset tidak perlu dimuat.
  const aset = useAsetDihapusPilihan(form.jenisAset, open && !isEdit);
  // Aset yang sedang Bertugas tetap bisa dipilih, tapi ditolak saat disimpan.
  const asetTerpilih = aset.data?.find((a) => a.id === form.assetId);
  const alasanTidakBisa = asetTerpilih?.alasan_tidak_bisa ?? null;
  const labelAset = form.jenisAset === "unit" ? "unit" : "unit trailer";
  const Judul = labelAset[0].toUpperCase() + labelAset.slice(1);

  function set<K extends keyof typeof KOSONG>(key: K, value: (typeof KOSONG)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  function simpan() {
    const next: Record<string, string> = {};
    if (!isEdit) {
      if (!form.assetId) next.assetId = `Pilih ${labelAset} yang dihapus`;
      else if (alasanTidakBisa) next.assetId = alasanTidakBisa;
    }
    if (!form.tanggal) next.tanggal = "Tanggal penghapusan wajib diisi";
    if (!form.alasan.trim()) next.alasan = "Alasan penghapusan wajib diisi";
    setErrors(next);
    if (!isEdit && alasanTidakBisa) toast.error(alasanTidakBisa);
    if (Object.values(next).some(Boolean)) return;

    const input: PenghapusanAsetInput = {
      jenis_aset: form.jenisAset,
      asset_id: form.assetId,
      tanggal_hapus: form.tanggal,
      alasan: form.alasan.trim(),
      catatan: form.catatan.trim() || null
    };
    // Catat baru: selalu tanya dulu — aset yang dihapus keluar dari armada.
    if (isEdit) void kirim(input);
    else setKonfirmasi(input);
  }

  async function kirim(input: PenghapusanAsetInput) {
    const ok = await onSubmit(input);
    setKonfirmasi(null);
    if (ok) onClose();
  }

  const insidenTerbuka = asetTerpilih?.insiden_terbuka ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit penghapusan ${penghapusan?.nomor_berita_acara ?? ""}` : "Catat penghapusan"}
      description={
        isEdit
          ? "Aset & nomor berita acara tidak berubah. Edit hanya bisa selama berita acara bertanda tangan belum diunggah."
          : "Aset yang dihapus otomatis berstatus Diafkirkan, keluar dari armada, dan tidak bisa dipakai job lagi."
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={simpan}
            disabled={busy}
          >
            {busy ? "Menyimpan…" : isEdit ? "Simpan perubahan" : "Simpan penghapusan"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {isEdit ? (
          <Field label={Judul} hint="Aset tidak bisa diganti saat edit.">
            <Input value={penghapusan?.kode_aset ?? ""} disabled />
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
            label={Judul}
            required
            hint={`${Judul} yang sedang Bertugas tidak bisa dihapus — selesaikan job-nya dulu`}
          >
            <Combobox
              value={form.assetId}
              onChange={(v) => set("assetId", v)}
              options={(aset.data ?? []).map((a) => ({
                value: a.id,
                label: a.kode,
                hint: [
                  a.jenis_nama,
                  a.alasan_tidak_bisa ? `${labelStatus(a.status)} — tidak bisa dihapus` : labelStatus(a.status)
                ]
                  .filter(Boolean)
                  .join(" · ")
              }))}
              placeholder={aset.isPending ? "Memuat…" : `Pilih ${labelAset}`}
              searchPlaceholder={`Cari kode ${labelAset}…`}
              emptyText={`Tidak ada ${labelAset} yang bisa dihapus`}
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
                <span>{alasanTidakBisa}</span>
              </div>
            )}
          </Field>

          </>
        )}

        <Field label="Tanggal penghapusan" required>
          <Input
            type="date"
            value={form.tanggal}
            onChange={(e) => set("tanggal", e.target.value)}
            error={errors.tanggal}
          />
        </Field>

        <Field label="Alasan penghapusan" required>
          <Textarea
            rows={3}
            value={form.alasan}
            onChange={(e) => set("alasan", e.target.value)}
            placeholder={`Misal: ${labelAset} rusak berat, tidak ekonomis diperbaiki`}
            error={errors.alasan}
          />
        </Field>

        <Field label="Catatan">
          <Textarea rows={2} value={form.catatan} onChange={(e) => set("catatan", e.target.value)} />
        </Field>
      </div>
      <ConfirmDialog
        open={konfirmasi !== null}
        onClose={() => setKonfirmasi(null)}
        onConfirm={() => konfirmasi && void kirim(konfirmasi)}
        loading={busy}
        variant="danger"
        title={`Hapus ${labelAset} ${asetTerpilih?.kode ?? ""}?`}
        confirmText="Ya, hapus"
        body={
          <>
            Apakah Anda yakin menghapus {labelAset} ini? Statusnya akan menjadi <strong>Diafkirkan</strong> dan{" "}
            {labelAset} keluar dari armada.
            {insidenTerbuka > 0 && (
              <>
                {" "}
                {insidenTerbuka} insiden yang belum selesai akan ditandai <strong>Selesai (diafkirkan)</strong>.
              </>
            )}
          </>
        }
      />
    </Modal>
  );
}
