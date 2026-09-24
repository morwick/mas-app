import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/input";
import type { TrailerUntukUnit } from "../api";

interface Props {
  /** Hasil pilihan trailer untuk unit terpilih; undefined = belum pilih unit / memuat. */
  pilihan: TrailerUntukUnit | undefined;
  loading: boolean;
  value: string;
  onChange: (id: string) => void;
  error?: string;
  /** Wajib diisi? Default mengikuti `pilihan.wajib`. */
  required?: boolean;
}

/**
 * Pilihan Unit Trailer di form job. Hanya tampil bila jenis unit dari unit
 * yang dipilih punya jenis unit trailer; selain itu tidak dirender sama sekali.
 */
export function UnitTrailerField({ pilihan, loading, value, onChange, error, required }: Props) {
  if (loading) {
    return (
      <Field label="Unit trailer">
        <p className="caption">Memeriksa unit trailer untuk unit ini…</p>
      </Field>
    );
  }
  if (!pilihan?.wajib) return null;

  return (
    <Field
      label="Unit trailer"
      required={required ?? true}
      hint={
        pilihan.trailer.length === 0
          ? "Belum ada unit trailer untuk jenis unit ini — tambahkan dulu di menu Unit Trailer."
          : "Unit ini wajib memakai unit trailer."
      }
    >
      <Combobox
        value={value}
        onChange={onChange}
        options={pilihan.trailer.map((t) => ({
          value: t.id,
          label: t.kode_trailer,
          hint: [t.jenis_nama, t.status === "perbaikan" ? "sedang perbaikan" : null].filter(Boolean).join(" · ")
        }))}
        placeholder="Pilih unit trailer"
        searchPlaceholder="Cari kode trailer atau jenisnya…"
        emptyText="Tidak ada unit trailer yang cocok"
        error={error}
      />
    </Field>
  );
}
