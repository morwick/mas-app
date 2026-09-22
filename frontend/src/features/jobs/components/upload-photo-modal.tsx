import { useRef, useState } from "react";
import { CheckCircle2, Upload, X } from "lucide-react";
import imageCompression from "browser-image-compression";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { uploadJobPhoto } from "@/features/jobs/api";

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
  size: string;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPhotoModal({
  open,
  onClose,
  type,
  jobId,
  onDone
}: Props) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).slice(0, 5 - items.length);
    const next: Item[] = arr.map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      preview: URL.createObjectURL(f),
      progress: 0,
      size: fmtSize(f.size)
    }));
    setItems((prev) => [...prev, ...next].slice(0, 5));
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }

  async function doUpload() {
    if (items.length === 0) return;
    setUploading(true);

    const results = await Promise.all(
      items.map(async (item) => {
        try {
          // Dikompres di browser dulu supaya unggahan ringan; backend yang
          // meneruskannya ke Supabase Storage dan mencatat barisnya.
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
          const res = await uploadJobPhoto(jobId, type, compressed, "foto.jpg");
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

  const totalSize = items.reduce((s, i) => s + i.file.size, 0);

  return (
    <Modal
      open={open}
      onClose={uploading ? () => {} : onClose}
      title={`Upload foto ${type === "loading" ? "loading" : "unloading"}`}
      description="Maksimal 5 foto. Otomatis di-resize ke 1920px sebelum upload."
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={uploading}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={doUpload}
            disabled={items.length === 0 || uploading}
          >
            <Upload style={{ width: 14, height: 14 }} />
            {uploading
              ? "Mengupload…"
              : `Upload ${items.length > 0 ? `${items.length} foto` : ""}`}
          </button>
        </>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        style={{
          border: `2px dashed ${
            dragOver ? "var(--brand-primary)" : "var(--border-strong)"
          }`,
          borderRadius: 12,
          padding: 28,
          textAlign: "center",
          marginBottom: 14,
          background: dragOver ? "var(--brand-primary-light)" : "var(--bg-muted)",
          cursor: "pointer",
          transition: "all 120ms ease"
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            margin: "0 auto 12px",
            borderRadius: 99,
            background: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
            border: "0.5px solid var(--border-default)"
          }}
        >
          <Upload style={{ width: 22, height: 22 }} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
          Drag &amp; drop foto di sini
        </div>
        <div className="caption" style={{ marginBottom: 0 }}>
          atau <span className="btn-link">browse</span> · Max 5 foto · JPG/PNG ·
          Auto-resize ke 1920px
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => addFiles(e.target.files)}
      />

      {items.length > 0 && (
        <>
          <div className="caption" style={{ marginBottom: 8 }}>
            {items.length} foto · {fmtSize(totalSize)} total
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 4
            }}
          >
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 10,
                  background: "var(--bg-muted)",
                  borderRadius: 8
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 4,
                    overflow: "hidden",
                    flexShrink: 0,
                    background: "var(--bg-subtle)"
                  }}
                >
                  <img
                    src={it.preview}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover"
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {it.file.name}
                    </span>
                    <span
                      className="caption mono"
                      style={{ fontSize: 11 }}
                    >
                      {it.size}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      background: "var(--bg-subtle)",
                      borderRadius: 99,
                      overflow: "hidden"
                    }}
                  >
                    <div
                      style={{
                        width: `${it.progress}%`,
                        height: "100%",
                        background:
                          it.progress === 100
                            ? "var(--brand-primary)"
                            : "#D89A24",
                        transition: "width 200ms ease"
                      }}
                    />
                  </div>
                  {it.error && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#C13838",
                        marginTop: 4
                      }}
                    >
                      {it.error}
                    </div>
                  )}
                </div>
                {it.progress === 100 ? (
                  <CheckCircle2
                    style={{
                      width: 16,
                      height: 16,
                      color: "var(--brand-primary)"
                    }}
                  />
                ) : it.progress > 0 ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#854F0B"
                    }}
                  >
                    {it.progress}%
                  </span>
                ) : (
                  !uploading && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(it.id);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 6,
                        color: "var(--text-tertiary)",
                        cursor: "pointer",
                        display: "flex"
                      }}
                      aria-label="Hapus"
                    >
                      <X style={{ width: 14, height: 14 }} />
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
