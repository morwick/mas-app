import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

export interface SlotDokumen {
  key: string;
  label: string;
  /** Waktu unggah file yang sudah ada; null = belum pernah diunggah. */
  diunggah: string | null;
}

/**
 * Unggah dokumen bertanda tangan (PDF / gambar). Setiap slot opsional —
 * boleh diisi sebagian, sisanya menyusul. File baru menggantikan file lama.
 */
export function UnggahDokumenModal({
  open,
  onClose,
  judul,
  slot,
  busy,
  onUnggah
}: {
  open: boolean;
  onClose: () => void;
  judul: string;
  slot: SlotDokumen[];
  busy: boolean;
  /** Dipanggil untuk slot yang diisi saja; kembalikan true bila semua berhasil. */
  onUnggah: (file: Record<string, File>) => Promise<boolean>;
}) {
  const [file, setFile] = useState<Record<string, File>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setFile({});
      setError("");
    }
  }, [open]);

  async function simpan() {
    if (Object.keys(file).length === 0) {
      setError("Pilih minimal satu file untuk diunggah");
      return;
    }
    if (await onUnggah(file)) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={judul}
      description="PDF / JPG / PNG / WEBP, maks. 10 MB. Tidak wajib sekaligus — yang belum ada bisa diunggah nanti. Setelah ada dokumen bertanda tangan, transaksi tidak bisa diedit / dibatalkan."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="button" className="btn btn-primary" onClick={simpan} disabled={busy}>
            {busy ? "Mengunggah…" : "Unggah"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {slot.map((s) => (
          <Field
            key={s.key}
            label={s.label}
            hint={s.diunggah ? `Sudah diunggah ${formatDateTime(s.diunggah)} — pilih file baru untuk mengganti.` : "Belum diunggah."}
          >
            <input
              type="file"
              aria-label={s.label}
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setError("");
                setFile((prev) => {
                  const next = { ...prev };
                  if (f) next[s.key] = f;
                  else delete next[s.key];
                  return next;
                });
              }}
            />
          </Field>
        ))}
        {error && <p className="field-error">{error}</p>}
      </div>
    </Modal>
  );
}
