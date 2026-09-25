import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import imageCompression from "browser-image-compression";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useToast } from "@/components/ui/toast";
import { Combobox } from "@/components/ui/combobox";
import {
  createIncident,
  updateIncident,
  uploadIncidentPhoto
} from "@/features/units/api";
import { incidentTypeLabel } from "@/types";
import type { Incident, IncidentType, Job } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  unitId: string;
  activeJobs: Job[];
  /** Diisi = mode edit insiden ini; kosong = tambah insiden baru. */
  incident?: Incident | null;
}

const MAX_FOTO = 5;

interface PhotoItem {
  id: string;
  file: File;
  preview: string;
  progress: number;
  error?: string;
}

/** Waktu (default: sekarang) dalam format input datetime-local, zona lokal. */
function toLocalDateTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

const tipeOptions: IncidentType[] = ["kecelakaan", "kerusakan", "breakdown", "lainnya"];

function initialForm(incident?: Incident | null) {
  return {
    tipe: (incident?.tipe ?? "kerusakan") as IncidentType,
    tanggal: toLocalDateTime(incident?.tanggal),
    lokasi: incident?.lokasi ?? "",
    deskripsi: incident?.deskripsi ?? "",
    biaya_repair:
      incident?.biaya_repair != null ? String(Math.round(incident.biaya_repair)) : "",
    vendor_repair: incident?.vendor_repair ?? "",
    job_id: incident?.job_id ?? ""
  };
}

export function IncidentFormModal({ open, onClose, unitId, activeJobs, incident }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!incident;
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(() => initialForm(incident));
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [error, setError] = useState<Record<string, string>>({});
  const existingPhotos = incident?.photos.length ?? 0;
  const maxBaru = Math.max(0, MAX_FOTO - existingPhotos);

  // Tiap kali dibuka, isi ulang dari insiden yang diedit (atau kosong untuk tambah).
  useEffect(() => {
    if (!open) return;
    setForm(initialForm(incident));
    setItems([]);
    setError({});
  }, [open, incident]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).slice(0, maxBaru - items.length);
    const next: PhotoItem[] = arr.map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      preview: URL.createObjectURL(f),
      progress: 0
    }));
    setItems((prev) => [...prev, ...next].slice(0, maxBaru));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  async function submit() {
    const errs: Record<string, string> = {};
    if (!form.tipe) errs.tipe = "Pilih tipe insiden";
    if (!form.deskripsi.trim()) errs.deskripsi = "Deskripsi wajib diisi";
    if (!form.tanggal) errs.tanggal = "Tanggal wajib diisi";
    setError(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    const fields = {
      tipe: form.tipe,
      tanggal: form.tanggal,
      lokasi: form.lokasi,
      deskripsi: form.deskripsi,
      biaya_repair: form.biaya_repair ? Number(form.biaya_repair) : null,
      vendor_repair: form.vendor_repair,
      job_id: form.job_id || null
    };
    let incidentId: string;
    if (incident) {
      const res = await updateIncident(incident.id, fields);
      if (!res.ok) {
        setSubmitting(false);
        toast.error(res.error);
        return;
      }
      incidentId = incident.id;
    } else {
      const res = await createIncident({ unit_id: unitId, ...fields });
      if (!res.ok) {
        setSubmitting(false);
        toast.error(res.error);
        return;
      }
      incidentId = res.data.id;
    }

    // Upload foto satu per satu kalau ada — dikompres di browser, diteruskan
    // backend ke Supabase Storage.
    if (items.length > 0) {
      for (const item of items) {
        try {
          const compressed = await imageCompression(item.file, {
            maxSizeMB: 1.5,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            fileType: "image/jpeg",
            initialQuality: 0.85
          });
          setItems((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, progress: 40 } : p))
          );
          const r = await uploadIncidentPhoto(incidentId, compressed, "foto.jpg");
          if (!r.ok) throw new Error(r.error);
          setItems((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, progress: 100 } : p))
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload foto gagal";
          setItems((prev) =>
            prev.map((p) =>
              p.id === item.id ? { ...p, error: msg, progress: 0 } : p
            )
          );
        }
      }
    }

    setSubmitting(false);
    toast.success(isEdit ? "Insiden berhasil diperbarui" : "Insiden berhasil dicatat");
    onClose();
  }

  // Job insiden yang diedit mungkin sudah selesai — tetap tampilkan sebagai pilihan.
  const jobOptions = activeJobs.map((j) => ({
    value: j.id,
    label: j.job_number,
    hint: j.customer_nama
  }));
  if (incident?.job_id && !jobOptions.some((o) => o.value === incident.job_id)) {
    jobOptions.unshift({
      value: incident.job_id,
      label: incident.job_number ?? "Job terkait",
      hint: ""
    });
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={isEdit ? "Edit insiden" : "Catat insiden"}
      description={
        incident?.status === "in_progress"
          ? "Insiden sedang dalam penanganan — unit tetap berstatus Perbaikan."
          : "Selama insiden belum ditangani, unit otomatis berstatus Breakdown."
      }
      maxWidth="max-w-[640px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={submit} loading={submitting}>
            {isEdit ? "Simpan perubahan" : "Simpan insiden"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Tipe insiden" required>
          <div className="grid grid-cols-2 gap-2">
            {tipeOptions.map((t) => {
              const active = form.tipe === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("tipe", t)}
                  className={cn(
                    "p-3 rounded-md border text-[13px] font-medium transition-colors text-left",
                    active
                      ? "border-brand bg-brand-light/40 text-brand-dark"
                      : "border-border bg-white hover:border-border-hover"
                  )}
                >
                  {incidentTypeLabel[t]}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal & jam" required>
            <Input
              type="datetime-local"
              value={form.tanggal}
              onChange={(e) => set("tanggal", e.target.value)}
              error={error.tanggal}
            />
          </Field>
          <Field label="Lokasi">
            <Input
              placeholder="Mis. KM 45 tol Cipali, atau workshop Cikarang"
              value={form.lokasi}
              onChange={(e) => set("lokasi", e.target.value)}
            />
          </Field>
        </div>
        {jobOptions.length > 0 && (
          <Field
            label="Job terkait (opsional)"
            hint="Pilih job aktif kalau insiden terjadi saat job berlangsung"
          >
            <Combobox
              value={form.job_id}
              onChange={(v) => set("job_id", v)}
              options={jobOptions}
              placeholder="— Tidak terkait job —"
              searchPlaceholder="Cari nomor job atau customer…"
              clearable
            />
          </Field>
        )}
        <Field label="Deskripsi insiden" required>
          <Textarea
            rows={4}
            placeholder="Ceritakan kronologi & dampak insiden secara detail"
            value={form.deskripsi}
            onChange={(e) => set("deskripsi", e.target.value)}
            error={error.deskripsi}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Biaya repair" hint="Bila sudah diketahui">
            <CurrencyInput
              placeholder="0"
              value={form.biaya_repair}
              onChange={(v) => set("biaya_repair", v)}
            />
          </Field>
          <Field label="Vendor repair">
            <Input
              placeholder="Nama bengkel / supplier"
              value={form.vendor_repair}
              onChange={(e) => set("vendor_repair", e.target.value)}
            />
          </Field>
        </div>

        <Field
          label={`Foto bukti (${existingPhotos + items.length}/${MAX_FOTO})`}
          hint={existingPhotos > 0 ? `${existingPhotos} foto sudah tersimpan` : undefined}
        >
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={items.length >= maxBaru}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-4 hover:border-brand hover:bg-brand-light/20 transition-colors text-text-muted disabled:opacity-50"
            >
              <Upload className="w-5 h-5" />
              <span className="text-[12px] font-medium">Klik untuk pilih foto</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            {items.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="relative aspect-square rounded-md overflow-hidden border border-border bg-page"
                  >
                    <img
                      src={it.preview}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    {!submitting && (
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        className="absolute top-1 right-1 w-6 h-6 bg-white/90 hover:bg-white rounded-full flex items-center justify-center"
                        aria-label="Hapus"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {submitting && it.progress > 0 && it.progress < 100 && (
                      <div className="absolute inset-x-0 bottom-0 bg-black/40 p-1">
                        <div className="h-1 bg-white/30 rounded overflow-hidden">
                          <div
                            className="h-full bg-brand transition-all"
                            style={{ width: `${it.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {it.error && (
                      <div className="absolute inset-0 bg-status-cancelled-bg/95 text-status-cancelled-fg flex items-center justify-center text-[10px] p-2 text-center">
                        {it.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
