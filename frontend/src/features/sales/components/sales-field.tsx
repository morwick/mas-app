import { useMemo } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field, Input } from "@/components/ui/input";
import { useSales } from "../queries";

/** Isian sales di form job. Semua kosong = job tanpa sales. */
export interface IsianSales {
  /** Sales dari daftar; kosong bila nama baru diketik. */
  sales_id: string;
  sales_nama: string;
  sales_no_hp: string;
}

export const SALES_KOSONG: IsianSales = { sales_id: "", sales_nama: "", sales_no_hp: "" };

const FORMAT_HP = /^(08|\+628)\d{7,12}$/;

/** Hanya format No HP yang diperiksa — sales & No HP-nya opsional. */
export function validasiSales(s: IsianSales): Record<string, string> {
  const hp = s.sales_no_hp.trim();
  if (hp && !FORMAT_HP.test(hp)) return { sales_no_hp: "Format: 08xxxxxxxxxx atau +628xxxxxxxxxx" };
  return {};
}

/** Bentuk payload API (JobCreate / JobUpdate). */
export function keSalesInput(s: IsianSales) {
  return {
    sales_id: s.sales_id || null,
    sales_nama: s.sales_nama.trim() || null,
    sales_no_hp: s.sales_no_hp.trim() || null
  };
}

/** Nilai combobox untuk sales baru (belum punya id). */
const BARU = "baru:";

/**
 * Sales + No HP sales: dropdown yang bisa diketik. Nama yang ada di daftar
 * tinggal dipilih (No HP terisi otomatis); nama yang belum ada dipakai sebagai
 * sales baru dan tersimpan ke master bersama job-nya.
 */
export function SalesField({
  value,
  onChange,
  errors
}: {
  value: IsianSales;
  onChange: (patch: Partial<IsianSales>) => void;
  errors: Record<string, string | undefined>;
}) {
  const sales = useSales();

  const options = useMemo<ComboboxOption[]>(() => {
    const daftar: ComboboxOption[] = (sales.data ?? []).map((s) => ({
      value: s.id,
      label: s.nama,
      hint: s.no_hp ?? undefined
    }));
    // Sales job yang belum ada di daftar (daftar belum dimuat / nama baru)
    // tetap ditampilkan sebagai pilihan terpilih.
    if (value.sales_id && !daftar.some((o) => o.value === value.sales_id)) {
      daftar.unshift({ value: value.sales_id, label: value.sales_nama });
    } else if (!value.sales_id && value.sales_nama) {
      daftar.unshift({ value: BARU + value.sales_nama, label: value.sales_nama, hint: "Sales baru" });
    }
    return daftar;
  }, [sales.data, value.sales_id, value.sales_nama]);

  const terpilih = value.sales_id || (value.sales_nama ? BARU + value.sales_nama : "");

  function pilih(v: string) {
    if (!v) return onChange({ sales_id: "", sales_nama: "", sales_no_hp: "" });
    if (v.startsWith(BARU)) return;
    const s = sales.data?.find((x) => x.id === v);
    if (s) onChange({ sales_id: s.id, sales_nama: s.nama, sales_no_hp: s.no_hp ?? "" });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
      <Field label="Sales" hint="Opsional. Ketik nama baru bila belum ada di daftar.">
        <Combobox
          value={terpilih}
          onChange={pilih}
          options={options}
          placeholder="Pilih atau ketik nama sales"
          searchPlaceholder="Cari / ketik nama sales…"
          emptyText={sales.isPending ? "Memuat daftar sales…" : "Belum ada data sales"}
          onCreate={(nama) => onChange({ sales_id: "", sales_nama: nama, sales_no_hp: "" })}
          createLabel={(nama) => `Tambah "${nama}" sebagai sales baru`}
          clearable
        />
      </Field>
      <Field
        label="No HP Sales"
        hint={value.sales_id ? "Mengubah nomor ini ikut memperbarui data sales." : undefined}
      >
        <Input
          type="tel"
          placeholder="0812xxxxxxxx"
          value={value.sales_no_hp}
          onChange={(e) => onChange({ sales_no_hp: e.target.value })}
          error={errors.sales_no_hp}
          disabled={!terpilih}
          className="mono"
        />
      </Field>
    </div>
  );
}
