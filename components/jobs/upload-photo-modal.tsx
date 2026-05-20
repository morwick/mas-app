"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import imageCompression from "browser-image-compression";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { registerJobPhotoAction } from "@/lib/actions/photos";

interface Props {
  open: boolean;
  onClose: () => void;
  type: "loading" | "unloading";
  jobId: string;
  onDone: () => void;
}

interface Item {
  id: string;
  file: File;
  preview: string;
  progress: number;
  error?: string;
}

export function UploadPhotoModal({ open, onClose, type, jobId, onDone }: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).slice(0, 5 - items.length);
    const next: Item[] = arr.map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      preview: URL.createObjectURL(f),
      progress: 0
    }));
    setItems((prev) => [...prev, ...next].slice(0, 5));
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  async function doUpload() {
    if (items.length === 0) return;
    setUploading(true);
    const supabase = createClient();

    const results = await Promise.all(
      items.map(async (item) => {
        try {
          // 1. Compress client-side
          const compressed = await imageCompression(item.file, {
            maxSizeMB: 1.5,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            fileType: "image/jpeg",
            initialQuality: 0.85
          });

          setItems((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, progress: 30 } : p))
          );

          // 2. Upload to Supabase Storage
          const ext = "jpg";
          const ts = Date.now();
          const rand = Math.random().toString(36).slice(2, 8);
          const path = `${jobId}/${type}/${ts}-${rand}.${ext}`;

          const { error: upErr } = await supabase.storage
            .from("job-photos")
            .upload(path, compressed, {
              contentType: "image/jpeg",
              cacheControl: "3600"
            });
          if (upErr) throw upErr;

          setItems((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, progress: 70 } : p))
          );

          // 3. Register in DB via server action
          const res = await registerJobPhotoAction({
            job_id: jobId,
            type,
            file_path: path,
            file_size: compressed.size
          });
          if (!res.ok) throw new Error(res.error);

          setItems((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, progress: 100 } : p))
          );
          return { ok: true as const };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload gagal";
          setItems((prev) =>
            prev.map((p) =>
              p.id === item.id ? { ...p, error: msg, progress: 0 } : p
            )
          );
          return { ok: false as const, msg };
        }
      })
    );

    const fails = results.filter((r) => !r.ok).length;
    setUploading(false);

    if (fails === 0) {
      toast.success(
        `${items.length} foto ${
          type === "loading" ? "loading" : "unloading"
        } ter-upload`
      );
      setItems([]);
      onDone();
      onClose();
    } else {
      toast.error(`${fails} foto gagal di-upload, sisanya berhasil`);
      onDone();
    }
  }

  return (
    <Modal
      open={open}
      onClose={uploading ? () => {} : onClose}
      title={`Upload foto ${type === "loading" ? "loading" : "unloading"}`}
      description="Maksimal 5 foto. Foto akan otomatis di-resize sebelum upload."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={uploading}>
            Batal
          </Button>
          <Button
            onClick={doUpload}
            disabled={items.length === 0 || uploading}
            loading={uploading}
          >
            Upload {items.length > 0 && `(${items.length})`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 hover:border-brand hover:bg-brand-light/20 transition-colors text-text-muted"
        >
          <Upload className="w-6 h-6" />
          <span className="text-[13px] font-medium">Klik untuk pilih foto</span>
          <span className="text-[11px]">PNG, JPG · max 5 foto</span>
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
                {!uploading && (
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    className="absolute top-1 right-1 w-6 h-6 bg-white/90 hover:bg-white rounded-full flex items-center justify-center"
                    aria-label="Hapus"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {uploading && (
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
    </Modal>
  );
}
