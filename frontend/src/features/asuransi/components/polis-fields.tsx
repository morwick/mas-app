import { Link } from "react-router-dom";
import { Combobox } from "@/components/ui/combobox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateInput } from "@/components/ui/date-input";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { JENIS_PERTANGGUNGAN, type JenisPertanggungan, type PolisAsuransi, type PolisInput } from "../api";
import { useAsuransiList } from "../queries";

/** Isian polis di form (nominal disimpan sebagai digit polos untuk CurrencyInput). */
export interface PolisIsian {
  asuransi_id: string;
  nomor_polis: string;
  jenis_pertanggungan: JenisPertanggungan;
  mulai: string;
  berakhir: string;
  nilai_pertanggungan: string;
  own_risk: string;
  premi: string;
  catatan: string;
}

export const POLIS_KOSONG: PolisIsian = {
  asuransi_id: "",
  nomor_polis: "",
  jenis_pertanggungan: "all_risk",
  mulai: "",
  berakhir: "",
  nilai_pertanggungan: "",
  own_risk: "",
  premi: "",
  catatan: ""
};

const digit = (n: number | null | undefined) => (n == null ? "" : String(Math.round(n)));
const angka = (d: string) => (d ? Number(d) : null);

export function polisKeIsian(p: PolisAsuransi): PolisIsian {
  return {
    asuransi_id: p.asuransi_id,
    nomor_polis: p.nomor_polis,
    jenis_pertanggungan: p.jenis_pertanggungan,
    mulai: p.mulai,
    berakhir: p.berakhir,
    nilai_pertanggungan: digit(p.nilai_pertanggungan),
    own_risk: digit(p.own_risk),
    premi: digit(p.premi),
    catatan: p.catatan ?? ""
  };
}

export function isianKePolis(isi: PolisIsian): PolisInput {
  return {
    asuransi_id: isi.asuransi_id,
    nomor_polis: isi.nomor_polis.trim(),
    jenis_pertanggungan: isi.jenis_pertanggungan,
    mulai: isi.mulai,
    berakhir: isi.berakhir,
    nilai_pertanggungan: angka(isi.nilai_pertanggungan),
    own_risk: angka(isi.own_risk),
    premi: angka(isi.premi),
    catatan: isi.catatan.trim() || null
  };
}

export type ErrorPolis = Partial<Record<keyof PolisIsian, string>>;

export function periksaPolis(isi: PolisIsian): ErrorPolis {
  const e: ErrorPolis = {};
  if (!isi.asuransi_id) e.asuransi_id = "Pilih asuransi";
  if (!isi.nomor_polis.trim()) e.nomor_polis = "Nomor polis wajib diisi";
  if (!isi.mulai) e.mulai = "Tanggal mulai wajib diisi";
  if (!isi.berakhir) e.berakhir = "Tanggal berakhir wajib diisi";
  else if (isi.mulai && isi.berakhir < isi.mulai) e.berakhir = "Tidak boleh sebelum tanggal mulai";
  return e;
}

/** Isian polis: asuransi, nomor, jenis, periode, nilai, own risk, premi. */
export function PolisFields({
  value,
  onChange,
  error = {},
  disabled
}: {
  value: PolisIsian;
  onChange: (v: PolisIsian) => void;
  error?: ErrorPolis;
  disabled?: boolean;
}) {
  const asuransi = useAsuransiList(false);
  const options = (asuransi.data ?? []).map((a) => ({
    value: a.id,
    label: a.nama,
    hint: a.pic_utama ? `PIC: ${a.pic_utama.nama}` : undefined
  }));
  const set = <K extends keyof PolisIsian>(k: K, v: PolisIsian[K]) => onChange({ ...value, [k]: v });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Asuransi"
        required
        className="sm:col-span-2"
      >
        <Combobox
          value={value.asuransi_id}
          onChange={(v) => set("asuransi_id", v)}
          options={options}
          placeholder={asuransi.isLoading ? "Memuat asuransi…" : "Pilih asuransi"}
          searchPlaceholder="Ketik nama asuransi…"
          emptyText="Asuransi tidak ditemukan"
          error={error.asuransi_id}
          disabled={disabled}
        />
        <p className="field-helper">
          Belum ada di daftar? Tambahkan dulu lewat menu{" "}
          <Link to="/asuransi/new" target="_blank" style={{ textDecoration: "underline" }}>
            Master Data → Asuransi
          </Link>
          .
        </p>
      </Field>
      <Field label="Nomor polis" required>
        <Input
          value={value.nomor_polis}
          onChange={(e) => set("nomor_polis", e.target.value)}
          error={error.nomor_polis}
          disabled={disabled}
        />
      </Field>
      <Field label="Jenis pertanggungan">
        <Select
          value={value.jenis_pertanggungan}
          onChange={(e) => set("jenis_pertanggungan", e.target.value as JenisPertanggungan)}
          disabled={disabled}
        >
          {JENIS_PERTANGGUNGAN.map((j) => (
            <option key={j.value} value={j.value}>
              {j.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Berlaku mulai" required>
        <DateInput value={value.mulai} onChange={(v) => set("mulai", v)} disabled={disabled} error={error.mulai} />
      </Field>
      <Field label="Berlaku sampai" required hint="Diingatkan di dashboard 30 hari sebelum habis">
        <DateInput
          value={value.berakhir}
          onChange={(v) => set("berakhir", v)}
          disabled={disabled}
          error={error.berakhir}
        />
      </Field>
      <Field label="Nilai pertanggungan (Rp)">
        <CurrencyInput
          value={value.nilai_pertanggungan}
          onChange={(v) => set("nilai_pertanggungan", v)}
          disabled={disabled}
        />
      </Field>
      <Field label="Own risk / risiko sendiri per kejadian (Rp)">
        <CurrencyInput value={value.own_risk} onChange={(v) => set("own_risk", v)} disabled={disabled} />
      </Field>
      <Field label="Premi (Rp)">
        <CurrencyInput value={value.premi} onChange={(v) => set("premi", v)} disabled={disabled} />
      </Field>
      <Field label="Catatan" className="sm:col-span-2">
        <Textarea value={value.catatan} onChange={(e) => set("catatan", e.target.value)} disabled={disabled} />
      </Field>
    </div>
  );
}
