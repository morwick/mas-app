import { useRef, useState } from "react";
import { FileText, Paperclip, Trash2, Undo2, Upload, X } from "lucide-react";
import { Button } from "./button";

/** Sama dengan batas backend (`validate_document`) & bucket `dokumen-master`. */
export const DOKUMEN_MAKS_BYTES = 10 * 1024 * 1024;
const TIPE_DOKUMEN = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];

/** Pesan error bila file tidak bisa dipakai, null bila lolos. */
export function cekFileDokumen(file: File): string | null {
  if (!TIPE_DOKUMEN.includes(file.type)) return "Format file harus PDF, JPG, PNG, atau WEBP";
  if (file.size > DOKUMEN_MAKS_BYTES) return "Ukuran file melebihi 10 MB";
  if (file.size === 0) return "File kosong";
  return null;
}

/** Isian satu dokumen opsional di form: file baru, atau lepas dokumen tersimpan. */
export interface NilaiDokumen {
  file: File | null;
  hapus: boolean;
}

export const DOKUMEN_KOSONG: NilaiDokumen = { file: null, hapus: false };

interface DokumenInputProps {
  /** Nama dokumen untuk teks tombol, mis. "SIM", "STNK". */
  nama: string;
  value: NilaiDokumen;
  onChange: (v: NilaiDokumen) => void;
  /** Signed URL dokumen yang sudah tersimpan (mode edit). */
  url?: string | null;
  disabled?: boolean;
}

/**
 * Lampiran dokumen opsional (PDF / foto). File baru baru dikirim saat form
 * disimpan — bersama isian lainnya dalam satu permintaan.
 */
export function DokumenInput({ nama, value, onChange, url, disabled }: DokumenInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const tersimpan = Boolean(url) && !value.hapus;

  function pilih(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const salah = cekFileDokumen(file);
    setError(salah);
    if (!salah) onChange({ file, hapus: false });
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {value.file ? (
          <>
            <span className="caption flex items-center gap-1" style={{ minWidth: 0, wordBreak: "break-all" }}>
              <Paperclip className="w-3.5 h-3.5 shrink-0" />
              {value.file.name}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              leftIcon={<X className="w-3.5 h-3.5" />}
              onClick={() => onChange(DOKUMEN_KOSONG)}
              disabled={disabled}
            >
              Batal
            </Button>
          </>
        ) : tersimpan ? (
          <a href={url!} target="_blank" rel="noreferrer">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<FileText className="w-3.5 h-3.5" />}
            >
              Lihat dokumen {nama}
            </Button>
          </a>
        ) : value.hapus ? (
          <>
            <span className="caption" style={{ color: "var(--status-danger-text)" }}>
              Dokumen {nama} dihapus saat disimpan
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              leftIcon={<Undo2 className="w-3.5 h-3.5" />}
              onClick={() => onChange(DOKUMEN_KOSONG)}
              disabled={disabled}
            >
              Urungkan
            </Button>
          </>
        ) : (
          <span className="caption" style={{ color: "var(--text-tertiary)" }}>
            Belum ada dokumen
          </span>
        )}
        {!disabled && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            leftIcon={<Upload className="w-3.5 h-3.5" />}
            onClick={() => ref.current?.click()}
          >
            {value.file || tersimpan ? "Ganti file" : `Upload ${nama}`}
          </Button>
        )}
        {!disabled && tersimpan && !value.file && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={() => onChange({ file: null, hapus: true })}
          >
            Hapus
          </Button>
        )}
        <input ref={ref} type="file" accept=".pdf,image/*" hidden onChange={pilih} />
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
