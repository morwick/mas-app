"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import imageCompression from "browser-image-compression";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import {
  createIncidentAction,
  registerIncidentPhotoAction
} from "@/lib/actions/incidents";
import { incidentTypeLabel } from "@/lib/types";
import type { IncidentType, Job } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  unitId: string;
  activeJobs: Job[];
}

interface PhotoItem {
  id: string;
  file: File;
  preview: string;
  progress: number;
  error?: string;
}

function nowLocalDateTime(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

const tipeOptions: IncidentType[] = ["kecelakaan", "kerusakan", "breakdown", "lainnya"];

export function IncidentFormModal({ open, onClose, unitId, activeJobs }: Props) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    tipe: "kerusakan" as IncidentType,
    tanggal: nowLocalDateTime(),
    lokasi: "",
    deskripsi: "",
    biaya_repair: "",
    vendor_repair: "",
    job_id: ""
  });
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [error, setError] = useState<Record<string, string>>({});

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).slice(0, 5 - items.length);
    const next: PhotoItem[] = arr.map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      preview: URL.createObjectURL(f),
      progress: 0
    }));
    setItems((prev) => [...prev, ...next].slice(0, 5));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  function reset() {
    setForm({
      tipe: "kerusakan",
      tanggal: nowLocalDateTime(),
      lokasi: "",
      deskripsi: "",
      biaya_repair: "",
      vendor_repair: "",
      job_id: ""
    });
    setItems([]);
    setError({});
  }

  async function submit() {
    const errs: Record<string, string> = {};
    if (!form.tipe) errs.tipe = "Pilih tipe insiden";
    if (!form.deskripsi.trim()) errs.deskripsi = "Deskripsi wajib diisi";
    if (!form.tanggal) errs.tanggal = "Tanggal wajib diisi";
    setError(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    const res = await createIncidentAction({
      unit_id: unitId,
      tipe: form.tipe,
      tanggal: form.tanggal,
      lokasi: form.lokasi,
      deskripsi: form.deskripsi,
      biaya_repair: form.biaya_repair ? Number(form.biaya_repair) : null,
      vendor_repair: form.vendor_repair,
      job_id: form.job_id || null
    });
    if (!res.ok) {
      setSubmitting(false);
      toast.error(res.error);
      return;
    }

    const incidentId = res.data.id;

    // Upload foto satu per satu kalau ada
    if (items.length > 0) {
      const supabase = createClient();
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

          const ts = Date.now();
          const rand = Math.random().toString(36).slice(2, 8);
          const path = `${unitId}/${incidentId}/${ts}-${rand}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("incident-photos")
            .upload(path, compressed, {
              contentType: "image/jpeg",
              cacheControl: "3600"
            });
          if (upErr) throw upErr;
          setItems((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, progress: 80 } : p))
          );

          const r = await registerIncidentPhotoAction({
            incident_id: incidentId,
            file_path: path,
            file_size: compressed.size
          });
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
    toast.success("Insiden berhasil dicatat");
    reset();
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Catat insiden"
      description="Tipe kerusakan/breakdown otomatis set unit ke Perbaikan."
      maxWidth="max-w-[640px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={submit} loading={submitting}>
            Simpan insiden
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
        {activeJobs.length > 0 && (
          <Field
            label="Job terkait (opsional)"
            hint="Pilih job aktif kalau insiden terjadi saat job berlangsung"
          >
            <Select
              value={form.job_id}
              onChange={(e) => set("job_id", e.target.value)}
            >
              <option value="">— Tidak terkait job —</option>
              {activeJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_number} — {j.customer_nama}
                </option>
              ))}
            </Select>
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
          <Field label="Biaya repair (Rp)" hint="Bila sudah diketahui">
            <Input
              type="number"
              min={0}
              placeholder="0"
              value={form.biaya_repair}
              onChange={(e) => set("biaya_repair", e.target.value)}
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

        <Field label={`Foto bukti (${items.length}/5)`}>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={items.length >= 5}
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
