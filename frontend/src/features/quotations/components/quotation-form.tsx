import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DateInput } from "@/components/ui/date-input";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  createQuotation,
  updateQuotation,
  type QuotationInput
} from "@/features/quotations/api";
import { useCustomerQuotationCounts } from "@/features/customers/queries";
import { teksKecamatan } from "@/features/kecamatan/api";
import { useKecamatan } from "@/features/kecamatan/queries";
import { useJenisUnit } from "@/features/settings/queries";
import { RekomendasiHargaPanel } from "./rekomendasi-harga-panel";
import type { Customer, Kecamatan, Quotation } from "@/types";
import { formatRupiah, hariIniWIB, tambahHari } from "@/lib/utils";

interface Props {
  customers: Customer[];
  /** Diisi saat mode edit. Kosong = buat penawaran baru. */
  quotation?: Quotation;
  /** Pratinjau nomor untuk mode buat baru — nomor final ditetapkan saat simpan. */
  nextNumber?: string;
  defaultTtdNama: string;
}

interface ItemForm {
  key: string;
  /** Teks yang dicetak di surat — otomatis dari kecamatan, boleh diubah. */
  dari: string;
  tujuan: string;
  dari_kecamatan_kode: string;
  tujuan_kecamatan_kode: string;
  jenis_unit_id: string;
  qty: string;
  satuan: string;
  nama_alat: string;
  harga_satuan: string;
}

let keySeq = 0;
function newItem(): ItemForm {
  keySeq += 1;
  return {
    key: `it-${keySeq}`,
    dari: "",
    tujuan: "",
    dari_kecamatan_kode: "",
    tujuan_kecamatan_kode: "",
    jenis_unit_id: "",
    qty: "1",
    satuan: "Unit",
    nama_alat: "",
    harga_satuan: ""
  };
}

/** Ambil digit saja — admin terbiasa mengetik "5.000.000" dengan titik. */
function parseRupiah(s: string): number {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function displayRupiah(s: string): string {
  const n = parseRupiah(s);
  return n ? new Intl.NumberFormat("id-ID").format(n) : "";
}

/**
 * Teks rute yang dicetak di surat. Otomatis mengikuti kecamatan; kolom isian
 * baru muncul kalau admin ingin mengubahnya (mis. menulis nama site).
 */
function TeksSurat({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [ubah, setUbah] = useState(false);
  if (ubah) {
    return (
      <div style={{ marginTop: 6 }}>
        <Input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setUbah(false)}
          placeholder="Teks di surat, mis. Site PT X, Kec. Tampan"
        />
      </div>
    );
  }
  if (!value) return null;
  return (
    <p className="field-helper" style={{ marginTop: 4 }}>
      Di surat: <span style={{ color: "var(--text-primary)" }}>{value}</span> ·{" "}
      <button
        type="button"
        onClick={() => setUbah(true)}
        style={{
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          color: "var(--brand-primary-dark)",
          textDecoration: "underline",
          textUnderlineOffset: 2,
          font: "inherit"
        }}
      >
        ubah
      </button>
    </p>
  );
}

/** Tanggal + 1 hari — batas minimum "Berlaku sampai" di date picker. */
function besok(iso: string): string {
  return tambahHari(iso, 1);
}

export function QuotationForm({
  customers,
  quotation,
  nextNumber,
  defaultTtdNama
}: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(quotation);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    customer_id: quotation?.customer_id ?? "",
    pic_sapaan: quotation?.pic_sapaan ?? "Bapak",
    pic_nama: quotation?.pic_nama ?? "",
    kota_terbit: quotation?.kota_terbit ?? "Pekanbaru",
    tanggal: quotation?.tanggal?.slice(0, 10) ?? hariIniWIB(),
    berlaku_sampai: quotation?.berlaku_sampai?.slice(0, 10) ?? "",
    perihal: quotation?.perihal ?? "Surat Penawaran Pengangkutan Alat",
    objek: quotation?.objek ?? "",
    lampiran: quotation?.lampiran ?? "-",
    ppn_aktif: quotation?.ppn_aktif ?? true,
    ppn_persen: String(quotation?.ppn_persen ?? 11),
    ttd_nama: quotation?.ttd_nama ?? defaultTtdNama,
    ttd_jabatan: quotation?.ttd_jabatan ?? "Admin",
    catatan: quotation?.catatan ?? ""
  });

  const [items, setItems] = useState<ItemForm[]>(() => {
    if (quotation?.items?.length) {
      return quotation.items.map((it) => {
        keySeq += 1;
        return {
          key: `it-${keySeq}`,
          dari: it.dari,
          tujuan: it.tujuan,
          dari_kecamatan_kode: it.dari_kecamatan_kode ?? "",
          tujuan_kecamatan_kode: it.tujuan_kecamatan_kode ?? "",
          jenis_unit_id: it.jenis_unit_id ?? "",
          qty: String(it.qty),
          satuan: it.satuan,
          nama_alat: it.nama_alat ?? "",
          harga_satuan: String(it.harga_satuan)
        };
      });
    }
    return [newItem()];
  });

  const quotationCounts = useCustomerQuotationCounts();
  const jumlahPenawaranCustomer = form.customer_id
    ? (quotationCounts.data?.[form.customer_id] ?? 0)
    : 0;

  const kecamatan = useKecamatan();
  const jenisUnit = useJenisUnit();

  const kecamatanByKode = useMemo(() => {
    const m = new Map<string, Kecamatan>();
    for (const k of kecamatan.data ?? []) m.set(k.kode, k);
    return m;
  }, [kecamatan.data]);

  const kecamatanOptions = useMemo<ComboboxOption[]>(
    () =>
      (kecamatan.data ?? []).map((k) => ({
        value: k.kode,
        label: teksKecamatan(k),
        // Nama resmi ikut dicari: "kota bogor" vs "kabupaten bogor".
        hint: `${k.kab_kota_resmi}, ${k.provinsi}`
      })),
    [kecamatan.data]
  );

  // Jenis unit nonaktif tetap muncul kalau sudah terpilih di item (edit).
  const jenisUnitOptions = useMemo<ComboboxOption[]>(() => {
    const dipakai = new Set(items.map((it) => it.jenis_unit_id));
    return (jenisUnit.data ?? [])
      .filter((j) => j.is_active || dipakai.has(j.id))
      .map((j) => ({ value: j.id, label: j.nama }));
  }, [jenisUnit.data, items]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === form.customer_id) ?? null,
    [customers, form.customer_id]
  );

  // Perhitungan di sini hanya untuk pratinjau. Angka yang tersimpan dan
  // tercetak dihitung ulang oleh database dari baris rincian.
  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (sum, it) =>
        sum + (Number(it.qty) || 0) * parseRupiah(it.harga_satuan),
      0
    );
    const persen = Number(form.ppn_persen) || 0;
    const ppn = form.ppn_aktif ? Math.round((subtotal * persen) / 100) : 0;
    return { subtotal, ppn, total: subtotal + ppn };
  }, [items, form.ppn_aktif, form.ppn_persen]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setItem(key: string, patch: Partial<ItemForm>) {
    setItems((rows) =>
      rows.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
  }

  /** Pilih kecamatan; teks di surat selalu ikut kecamatan yang baru dipilih. */
  function pilihKecamatan(key: string, sisi: "dari" | "tujuan", kode: string) {
    const kodeField = sisi === "dari" ? "dari_kecamatan_kode" : "tujuan_kecamatan_kode";
    const baru = kecamatanByKode.get(kode);
    setItem(key, { [kodeField]: kode, [sisi]: baru ? teksKecamatan(baru) : "" });
  }

  function addItem() {
    setItems((rows) => [...rows, newItem()]);
  }

  function removeItem(key: string) {
    setItems((rows) =>
      rows.length === 1 ? rows : rows.filter((r) => r.key !== key)
    );
  }

  function moveItem(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    setItems((rows) => {
      const next = [...rows];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // Customer dipilih → prefill PIC dari master, tapi hanya kalau admin belum
  // mengetik sendiri. Ketikan manual tidak boleh tertimpa.
  function onCustomerChange(id: string) {
    const c = customers.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      customer_id: id,
      pic_nama: f.pic_nama.trim() ? f.pic_nama : (c?.pic_nama ?? ""),
      pic_sapaan: c?.pic_sapaan ?? f.pic_sapaan
    }));
  }

  function buildPayload(): QuotationInput {
    return {
      customer_id: form.customer_id,
      pic_sapaan: form.pic_sapaan as "Bapak" | "Ibu",
      pic_nama: form.pic_nama,
      kota_terbit: form.kota_terbit,
      tanggal: form.tanggal,
      berlaku_sampai: form.berlaku_sampai,
      perihal: form.perihal,
      objek: form.objek,
      lampiran: form.lampiran,
      ppn_aktif: form.ppn_aktif,
      ppn_persen: Number(form.ppn_persen) || 0,
      ttd_nama: form.ttd_nama,
      ttd_jabatan: form.ttd_jabatan,
      catatan: form.catatan,
      items: items.map((it) => ({
        dari: it.dari,
        tujuan: it.tujuan,
        dari_kecamatan_kode: it.dari_kecamatan_kode,
        tujuan_kecamatan_kode: it.tujuan_kecamatan_kode,
        jenis_unit_id: it.jenis_unit_id,
        qty: Number(it.qty) || 0,
        satuan: it.satuan,
        nama_alat: it.nama_alat,
        harga_satuan: parseRupiah(it.harga_satuan)
      }))
    };
  }

  async function onSubmit() {
    setError(null);
    if (form.berlaku_sampai && form.tanggal && form.berlaku_sampai <= form.tanggal) {
      const msg = "Surat berlaku sampai harus setelah tanggal surat";
      setError(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    const payload = buildPayload();

    const res = isEdit
      ? await updateQuotation(quotation!.id, payload)
      : await createQuotation(payload);

    setLoading(false);

    if (!res.ok) {
      setError(res.error);
      toast.error(res.error);
      return;
    }

    if (isEdit) {
      toast.success("Penawaran diperbarui");
      navigate(`/quotations/${quotation!.id}`);
    } else {
      const data = res.data as { id: string; quote_number: string };
      toast.success(`Penawaran ${data.quote_number} dibuat`);
      navigate(`/quotations/${data.id}`);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Header */}
      <div className="toolbar">
        <Link
          to={isEdit ? `/quotations/${quotation!.id}` : "/quotations"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-secondary)",
            textDecoration: "none"
          }}
        >
          <ArrowLeft style={{ width: 15, height: 15 }} />
          Kembali
        </Link>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
          {isEdit ? quotation!.quote_number : nextNumber}
        </span>
      </div>

      {!isEdit && (
        <p className="caption" style={{ color: "var(--text-tertiary)" }}>
          Nomor di atas adalah perkiraan. Nomor final ditetapkan saat penawaran
          disimpan, supaya tidak ada nomor yang hangus kalau form ini ditutup.
        </p>
      )}

      {/* ── Tujuan surat ─────────────────────────────────────────────── */}
      <div className="card card-pad">
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Ditujukan kepada
        </p>
        <div className="split-2" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Field label="Customer" required>
            <Combobox
              value={form.customer_id}
              onChange={onCustomerChange}
              options={customers.map((c) => ({ value: c.id, label: c.nama_perusahaan }))}
              placeholder="— pilih customer —"
              searchPlaceholder="Cari nama customer…"
            />
            {/* Riwayat penawaran customer terpilih — dibuka di tab baru supaya
                isian form ini tidak hilang. */}
            {form.customer_id && !quotationCounts.isLoading && (
              <p className="field-helper">
                {jumlahPenawaranCustomer > 0 ? (
                  <a
                    href={`/quotations?customer_id=${form.customer_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontWeight: 600,
                      color: "var(--brand-primary-dark)",
                      textDecoration: "underline",
                      textUnderlineOffset: 2
                    }}
                  >
                    Lihat {jumlahPenawaranCustomer} penawaran customer ini
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  "Belum pernah ada penawaran untuk customer ini"
                )}
              </p>
            )}
          </Field>

          <Field
            label="Kota customer"
            hint={
              selectedCustomer && !selectedCustomer.kota
                ? "Belum diisi di master customer — baris “Di ___” akan kosong"
                : "Diambil dari master customer"
            }
          >
            <Input
              value={selectedCustomer?.kota ?? ""}
              readOnly
              placeholder="—"
              style={{ background: "var(--bg-page)" }}
            />
          </Field>

          <Field label="Sapaan PIC">
            <Select
              value={form.pic_sapaan ?? "Bapak"}
              onChange={(e) => set("pic_sapaan", e.target.value as "Bapak" | "Ibu")}
            >
              <option value="Bapak">Bapak</option>
              <option value="Ibu">Ibu</option>
            </Select>
          </Field>

          <Field label="Nama PIC" hint="Muncul di baris “Up : …”">
            <Input
              value={form.pic_nama}
              onChange={(e) => set("pic_nama", e.target.value)}
              placeholder="mis. Afiq"
            />
          </Field>
        </div>
      </div>

      {/* ── Identitas surat ──────────────────────────────────────────── */}
      <div className="card card-pad">
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Identitas surat
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Field label="Kota penerbitan" required>
            <Input
              value={form.kota_terbit}
              onChange={(e) => set("kota_terbit", e.target.value)}
            />
          </Field>
          <Field label="Tanggal surat" required>
            <DateInput
              value={form.tanggal}
              onChange={(v) => set("tanggal", v)}
            />
          </Field>
          <Field label="Berlaku sampai" required hint="Harus setelah tanggal surat">
            <DateInput
              value={form.berlaku_sampai}
              onChange={(v) => set("berlaku_sampai", v)}
              min={form.tanggal ? besok(form.tanggal) : undefined}
            />
          </Field>
          <Field label="Lampiran">
            <Input
              value={form.lampiran}
              onChange={(e) => set("lampiran", e.target.value)}
              placeholder="-"
            />
          </Field>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", marginTop: 4 }}>
          <Field label="Perihal" required>
            <Input
              value={form.perihal}
              onChange={(e) => set("perihal", e.target.value)}
            />
          </Field>
          <Field
            label="Objek yang diangkut"
            hint="Dipakai di kalimat pembuka surat"
          >
            <Input
              value={form.objek}
              onChange={(e) => set("objek", e.target.value)}
              placeholder="mis. Excavator ZX60C"
            />
          </Field>
        </div>
      </div>

      {/* ── Rincian ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Rincian biaya</p>
            <p className="caption" style={{ color: "var(--text-tertiary)" }}>
              Setiap baris jadi satu baris tabel di surat
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus style={{ width: 14, height: 14 }} />}
            onClick={addItem}
          >
            Tambah baris
          </Button>
        </div>

        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((it, idx) => (
            <div
              key={it.key}
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: 12,
                background: "var(--bg-page)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10
                }}
              >
                <span
                  className="mono"
                  style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}
                >
                  Baris {idx + 1}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Naikkan"
                    disabled={idx === 0}
                    onClick={() => moveItem(idx, -1)}
                    style={{ opacity: idx === 0 ? 0.35 : 1 }}
                  >
                    <GripVertical style={{ width: 14, height: 14, transform: "rotate(90deg)" }} />
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Hapus baris"
                    disabled={items.length === 1}
                    onClick={() => removeItem(it.key)}
                    style={{ opacity: items.length === 1 ? 0.35 : 1 }}
                  >
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
                <Field label="Jenis unit" required>
                  <Combobox
                    value={it.jenis_unit_id}
                    onChange={(v) => setItem(it.key, { jenis_unit_id: v })}
                    options={jenisUnitOptions}
                    placeholder="— pilih jenis unit —"
                    searchPlaceholder="Cari jenis unit…"
                  />
                </Field>
                <Field label="Dari (kecamatan)" required>
                  <Combobox
                    value={it.dari_kecamatan_kode}
                    onChange={(v) => pilihKecamatan(it.key, "dari", v)}
                    options={kecamatanOptions}
                    placeholder={kecamatan.isLoading ? "Memuat kecamatan…" : "— pilih kecamatan —"}
                    searchPlaceholder="Ketik kecamatan / kota…"
                    minQueryLength={2}
                    maxResults={50}
                  />
                  <TeksSurat value={it.dari} onChange={(v) => setItem(it.key, { dari: v })} />
                </Field>
                <Field label="Tujuan (kecamatan)" required>
                  <Combobox
                    value={it.tujuan_kecamatan_kode}
                    onChange={(v) => pilihKecamatan(it.key, "tujuan", v)}
                    options={kecamatanOptions}
                    placeholder={kecamatan.isLoading ? "Memuat kecamatan…" : "— pilih kecamatan —"}
                    searchPlaceholder="Ketik kecamatan / kota…"
                    minQueryLength={2}
                    maxResults={50}
                  />
                  <TeksSurat value={it.tujuan} onChange={(v) => setItem(it.key, { tujuan: v })} />
                </Field>
              </div>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: 10 }}>
                <Field label="Jumlah" required>
                  <Input
                    type="number"
                    min={1}
                    value={it.qty}
                    onChange={(e) => setItem(it.key, { qty: e.target.value })}
                  />
                </Field>
                <Field label="Satuan">
                  <Input
                    value={it.satuan}
                    onChange={(e) => setItem(it.key, { satuan: e.target.value })}
                    placeholder="Unit"
                  />
                </Field>
                <Field label="Nama alat">
                  <Input
                    value={it.nama_alat}
                    onChange={(e) => setItem(it.key, { nama_alat: e.target.value })}
                    placeholder="mis. ZX60C"
                  />
                </Field>
                <Field label="Harga satuan" required>
                  <Input
                    inputMode="numeric"
                    value={displayRupiah(it.harga_satuan)}
                    onChange={(e) =>
                      setItem(it.key, { harga_satuan: e.target.value })
                    }
                    placeholder="5.000.000"
                    leftIcon={<span style={{ fontSize: 12 }}>Rp</span>}
                  />
                </Field>
              </div>

              <RekomendasiHargaPanel
                dariKecamatanKode={it.dari_kecamatan_kode}
                tujuanKecamatanKode={it.tujuan_kecamatan_kode}
                jenisUnitId={it.jenis_unit_id}
                jenisUnitNama={jenisUnit.data?.find((j) => j.id === it.jenis_unit_id)?.nama}
                customerId={form.customer_id}
                kecualiQuotationId={quotation?.id}
                onPakai={(harga) => setItem(it.key, { harga_satuan: String(harga) })}
              />

              <div
                style={{
                  marginTop: 8,
                  textAlign: "right",
                  fontSize: 12.5,
                  color: "var(--text-secondary)"
                }}
              >
                Jumlah baris:{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {formatRupiah(
                    (Number(it.qty) || 0) * parseRupiah(it.harga_satuan)
                  )}
                </strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Pajak & total ────────────────────────────────────────────── */}
      <div className="card card-pad">
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Pajak & total
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <input
            id="ppn"
            type="checkbox"
            checked={form.ppn_aktif}
            onChange={(e) => set("ppn_aktif", e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor="ppn" style={{ fontSize: 13.5 }}>
            Kenakan PPN
          </label>
          {form.ppn_aktif && (
            <div style={{ width: 100 }}>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.ppn_persen}
                onChange={(e) => set("ppn_persen", e.target.value)}
                rightAddon={<span style={{ fontSize: 12, paddingRight: 6 }}>%</span>}
              />
            </div>
          )}
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border-default)",
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6
          }}
        >
          <TotalRow label="Subtotal" value={totals.subtotal} />
          {form.ppn_aktif && (
            <TotalRow
              label={`PPN ${form.ppn_persen}%`}
              value={totals.ppn}
            />
          )}
          <TotalRow label="Total" value={totals.total} strong />
        </div>
      </div>

      {/* ── Penanda tangan & catatan ─────────────────────────────────── */}
      <div className="card card-pad">
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Penanda tangan
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Field label="Nama">
            <Input
              value={form.ttd_nama}
              onChange={(e) => set("ttd_nama", e.target.value)}
            />
          </Field>
          <Field label="Jabatan">
            <Input
              value={form.ttd_jabatan}
              onChange={(e) => set("ttd_jabatan", e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Catatan internal"
          hint="Hanya untuk tim — tidak ikut tercetak di surat"
        >
          <Textarea
            value={form.catatan}
            onChange={(e) => set("catatan", e.target.value)}
            placeholder="mis. customer minta diskon, sudah dinego turun dari 5.5jt"
          />
        </Field>
      </div>

      {error && (
        <div
          style={{
            border: "1px solid #f0c2c2",
            background: "#fdf1f1",
            color: "#a32b2b",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingBottom: 8 }}>
        <Link to={isEdit ? `/quotations/${quotation!.id}` : "/quotations"}>
          <Button variant="secondary">Batal</Button>
        </Link>
        <Button
          onClick={onSubmit}
          loading={loading}
          leftIcon={<Save style={{ width: 15, height: 15 }} />}
        >
          {isEdit ? "Simpan perubahan" : "Simpan penawaran"}
        </Button>
      </div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        fontSize: strong ? 15 : 13,
        fontWeight: strong ? 700 : 400,
        color: strong ? "var(--text-primary)" : "var(--text-secondary)"
      }}
    >
      <span>{label}</span>
      <span className="mono">{formatRupiah(value)}</span>
    </div>
  );
}
