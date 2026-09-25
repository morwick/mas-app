import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { ArrowLeft, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Combobox } from "@/components/ui/combobox";
import { InfoUangJalanSurat } from "./info-uang-jalan-surat";
import {
  createInvoice,
  updateInvoice,
  type InvoiceInput
} from "@/features/invoices/api";
import type { Customer, Invoice, JobBelumDitagihRow } from "@/types";
import { formatRupiah } from "@/lib/utils";

interface Props {
  customers: Customer[];
  /** Diisi saat mode edit. Kosong = buat tagihan baru. */
  invoice?: Invoice;
  /** Pratinjau nomor untuk mode buat baru — nomor final ditetapkan saat simpan. */
  nextNumber?: string;
  defaultTtdNama: string;
  /**
   * Job yang belum ditagih, dikelompokkan per customer. Dimuat di server untuk
   * semua customer sekaligus supaya memilih customer tidak perlu menunggu
   * permintaan baru — daftarnya kecil (hanya job selesai yang belum ditagih).
   */
  jobsPerCustomer: Record<string, JobBelumDitagihRow[]>;
  /** Rekening default yang tercetak di tagihan. */
  defaultBank?: {
    nama?: string | null;
    rekening?: string | null;
    atas_nama?: string | null;
  };
  /**
   * Dari tab "Job siap ditagih": customer & job yang sudah dicentang di sana
   * langsung mengisi form ini (hanya berlaku saat membuat tagihan baru).
   */
  initialCustomerId?: string;
  initialJobIds?: string[];
}

interface ItemForm {
  key: string;
  job_id: string;
  deskripsi: string;
  dari: string;
  tujuan: string;
  qty: string;
  satuan: string;
  harga_satuan: string;
}

let keySeq = 0;
function newItem(patch?: Partial<ItemForm>): ItemForm {
  keySeq += 1;
  return {
    key: `it-${keySeq}`,
    job_id: "",
    deskripsi: "",
    dari: "",
    tujuan: "",
    qty: "1",
    satuan: "Unit",
    harga_satuan: "",
    ...patch
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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function tambahHari(iso: string, hari: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

export function InvoiceForm({
  customers,
  invoice,
  nextNumber,
  defaultTtdNama,
  jobsPerCustomer,
  defaultBank,
  initialCustomerId,
  initialJobIds
}: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(invoice);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    customer_id: invoice?.customer_id ?? "",
    pic_sapaan: invoice?.pic_sapaan ?? "Bapak",
    pic_nama: invoice?.pic_nama ?? "",
    kota_terbit: invoice?.kota_terbit ?? "Pekanbaru",
    tanggal: invoice?.tanggal?.slice(0, 10) ?? todayISO(),
    termin_hari: invoice?.termin_hari != null ? String(invoice.termin_hari) : "",
    jatuh_tempo: invoice?.jatuh_tempo?.slice(0, 10) ?? "",
    ppn_aktif: invoice?.ppn_aktif ?? true,
    ppn_persen: String(invoice?.ppn_persen ?? 11),
    ttd_nama: invoice?.ttd_nama ?? defaultTtdNama,
    ttd_jabatan: invoice?.ttd_jabatan ?? "Admin",
    bank_nama: invoice?.bank_nama ?? defaultBank?.nama ?? "",
    bank_rekening: invoice?.bank_rekening ?? defaultBank?.rekening ?? "",
    bank_atas_nama: invoice?.bank_atas_nama ?? defaultBank?.atas_nama ?? "",
    catatan: invoice?.catatan ?? ""
  });

  const [items, setItems] = useState<ItemForm[]>(() => {
    if (invoice?.items?.length) {
      return invoice.items.map((it) =>
        newItem({
          job_id: it.job_id ?? "",
          deskripsi: it.deskripsi,
          dari: it.dari ?? "",
          tujuan: it.tujuan ?? "",
          qty: String(it.qty),
          satuan: it.satuan,
          harga_satuan: String(it.harga_satuan)
        })
      );
    }
    return [newItem()];
  });

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === form.customer_id) ?? null,
    [customers, form.customer_id]
  );

  const jobsTersedia = jobsPerCustomer[form.customer_id] ?? [];

  /**
   * Uang jalan & surat jalan job yang sudah dipilih di suatu baris — dicari
   * dari daftar "belum ditagih" dulu, lalu dari rincian tagihan tersimpan
   * (mode edit, untuk job yang sudah tidak lagi ada di daftar "belum ditagih").
   */
  function infoUangJalanUntukJob(jobId: string) {
    const dariTersedia = jobsTersedia.find((j) => j.id === jobId);
    if (dariTersedia) {
      return {
        pagu: dariTersedia.uang_jalan_pagu,
        cair: dariTersedia.uang_jalan_cair,
        urls: dariTersedia.surat_jalan_urls
      };
    }
    const dariInvoice = invoice?.items.find((x) => x.job_id === jobId);
    return {
      pagu: dariInvoice?.uang_jalan_pagu ?? null,
      cair: dariInvoice?.uang_jalan_cair ?? null,
      urls: dariInvoice?.surat_jalan_urls ?? []
    };
  }

  // Diisi sekali di awal dari job-job yang sudah dicentang di tab "Job siap
  // ditagih" — hanya untuk tagihan baru, dan hanya sekali supaya tidak
  // menimpa perubahan admin di form setelahnya.
  useEffect(() => {
    if (isEdit || !initialCustomerId || !initialJobIds?.length) return;
    onCustomerChange(initialCustomerId);
    const dipilih = (jobsPerCustomer[initialCustomerId] ?? []).filter((j) =>
      initialJobIds.includes(j.id)
    );
    if (dipilih.length > 0) {
      setItems(
        dipilih.map((j) =>
          newItem({
            job_id: j.id,
            deskripsi: `Pengangkutan ${j.alat_diangkut}`,
            dari: j.asal,
            tujuan: j.tujuan
          })
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jatuh tempo mengikuti tanggal + termin selama admin belum mengetiknya
  // sendiri. Begitu diketik manual, nilainya dibiarkan — kesepakatan khusus
  // tidak boleh tertimpa tiap kali tanggal tagihan digeser.
  const [jatuhTempoManual, setJatuhTempoManual] = useState(
    Boolean(invoice?.jatuh_tempo)
  );
  useEffect(() => {
    if (jatuhTempoManual) return;
    const termin = Number(form.termin_hari);
    if (!form.tanggal || !Number.isFinite(termin) || !form.termin_hari) return;
    setForm((f) => ({ ...f, jatuh_tempo: tambahHari(f.tanggal, termin) }));
  }, [form.tanggal, form.termin_hari, jatuhTempoManual]);

  // Perhitungan di sini hanya untuk pratinjau. Angka yang tersimpan dan
  // tercetak dihitung ulang oleh database dari baris rincian.
  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (sum, it) => sum + (Number(it.qty) || 0) * parseRupiah(it.harga_satuan),
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
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeItem(key: string) {
    setItems((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.key !== key)));
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

  /**
   * Baris diisi dari job yang dipilih. Ini inti modul: uraian, asal, dan
   * tujuan sudah tercatat saat job dibuat, jadi tidak perlu diketik ulang di
   * tagihan — dan tidak bisa berbeda dari yang benar-benar dikerjakan.
   */
  function pilihJob(key: string, jobId: string) {
    if (!jobId) {
      setItem(key, { job_id: "" });
      return;
    }
    const job = jobsTersedia.find((j) => j.id === jobId);
    if (!job) return;
    setItem(key, {
      job_id: jobId,
      deskripsi: `Pengangkutan ${job.alat_diangkut}`,
      dari: job.asal,
      tujuan: job.tujuan
    });
  }

  /** Tambahkan semua job yang belum ditagih sekaligus — untuk rekap bulanan. */
  function tambahSemuaJob() {
    const sudahAda = new Set(items.map((i) => i.job_id).filter(Boolean));
    const baru = jobsTersedia
      .filter((j) => !sudahAda.has(j.id))
      .map((j) =>
        newItem({
          job_id: j.id,
          deskripsi: `Pengangkutan ${j.alat_diangkut}`,
          dari: j.asal,
          tujuan: j.tujuan
        })
      );
    if (baru.length === 0) {
      toast.error("Semua job yang tersedia sudah ada di rincian");
      return;
    }
    // Baris kosong pertama dibuang supaya tidak menyisakan baris hampa di atas.
    setItems((rows) => {
      const bersih = rows.filter(
        (r) => r.job_id || r.deskripsi.trim() || parseRupiah(r.harga_satuan)
      );
      return [...bersih, ...baru];
    });
  }

  function onCustomerChange(id: string) {
    const c = customers.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      customer_id: id,
      pic_nama: f.pic_nama.trim() ? f.pic_nama : (c?.pic_nama ?? ""),
      pic_sapaan: c?.pic_sapaan ?? f.pic_sapaan,
      // Termin diambil dari master customer supaya jatuh tempo tidak perlu
      // dihitung manual tiap kali menagih.
      termin_hari: f.termin_hari || (c?.termin_hari != null ? String(c.termin_hari) : ""),
      // PPN mengikuti status PKP customer — non-PKP tidak boleh dipungut PPN.
      ppn_aktif: c ? Boolean(c.status_pkp) : f.ppn_aktif
    }));
    // Ganti customer berarti job di rincian tidak lagi relevan.
    setItems((rows) =>
      rows.map((r) => (r.job_id ? { ...r, job_id: "" } : r))
    );
  }

  function buildPayload(): InvoiceInput {
    return {
      customer_id: form.customer_id,
      pic_sapaan: form.pic_sapaan as "Bapak" | "Ibu",
      pic_nama: form.pic_nama,
      kota_terbit: form.kota_terbit,
      tanggal: form.tanggal,
      termin_hari: form.termin_hari ? Number(form.termin_hari) : null,
      jatuh_tempo: form.jatuh_tempo || null,
      ppn_aktif: form.ppn_aktif,
      ppn_persen: Number(form.ppn_persen) || 0,
      ttd_nama: form.ttd_nama,
      ttd_jabatan: form.ttd_jabatan,
      bank_nama: form.bank_nama,
      bank_rekening: form.bank_rekening,
      bank_atas_nama: form.bank_atas_nama,
      catatan: form.catatan,
      items: items.map((it) => ({
        job_id: it.job_id || null,
        deskripsi: it.deskripsi,
        dari: it.dari,
        tujuan: it.tujuan,
        qty: Number(it.qty) || 0,
        satuan: it.satuan,
        harga_satuan: parseRupiah(it.harga_satuan)
      }))
    };
  }

  async function onSubmit() {
    setLoading(true);
    setError(null);
    const payload = buildPayload();

    const res = isEdit
      ? await updateInvoice(invoice!.id, payload)
      : await createInvoice(payload);

    setLoading(false);

    if (!res.ok) {
      setError(res.error);
      toast.error(res.error);
      return;
    }

    if (isEdit) {
      toast.success("Tagihan diperbarui");
      navigate(`/invoices/${invoice!.id}`);
    } else {
      const data = res.data as { id: string; invoice_number: string };
      toast.success(`Tagihan ${data.invoice_number} dibuat`);
      navigate(`/invoices/${data.id}`);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="toolbar">
        <Link
          to={isEdit ? `/invoices/${invoice!.id}` : "/invoices"}
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
        <span
          className="mono"
          style={{ fontSize: 12.5, color: "var(--text-secondary)" }}
        >
          {isEdit ? invoice!.invoice_number : nextNumber}
        </span>
      </div>

      {!isEdit && (
        <p className="caption" style={{ color: "var(--text-tertiary)" }}>
          Nomor di atas adalah perkiraan. Nomor final ditetapkan saat tagihan
          disimpan, supaya tidak ada nomor yang hangus kalau form ini ditutup.
        </p>
      )}

      {/* ── Ditagihkan kepada ────────────────────────────────────────── */}
      <div className="card card-pad">
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Ditagihkan kepada
        </p>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
          }}
        >
          <Field label="Customer" required>
            <Combobox
              value={form.customer_id}
              onChange={onCustomerChange}
              options={customers.map((c) => ({ value: c.id, label: c.nama_perusahaan }))}
              placeholder="— pilih customer —"
              searchPlaceholder="Cari nama customer…"
              disabled={isEdit}
            />
          </Field>

          <Field
            label="NPWP"
            hint={
              selectedCustomer && !selectedCustomer.npwp
                ? "Belum diisi di master customer"
                : "Diambil dari master customer"
            }
          >
            <Input
              value={selectedCustomer?.npwp ?? invoice?.customer_npwp ?? ""}
              readOnly
              placeholder="—"
              style={{ background: "var(--bg-page)" }}
            />
          </Field>

          <Field label="Sapaan PIC">
            <Select
              value={form.pic_sapaan ?? "Bapak"}
              onChange={(e) =>
                set("pic_sapaan", e.target.value as "Bapak" | "Ibu")
              }
            >
              <option value="Bapak">Bapak</option>
              <option value="Ibu">Ibu</option>
            </Select>
          </Field>

          <Field label="Nama PIC">
            <Input
              value={form.pic_nama}
              onChange={(e) => set("pic_nama", e.target.value)}
              placeholder="mis. Afiq"
            />
          </Field>
        </div>

        {selectedCustomer && !selectedCustomer.status_pkp && form.ppn_aktif && (
          <p
            className="caption"
            style={{ marginTop: 10, color: "#B45309" }}
          >
            Customer ini tercatat non-PKP, tapi PPN sedang aktif. Periksa lagi
            sebelum tagihan dikirim.
          </p>
        )}
      </div>

      {/* ── Identitas tagihan ────────────────────────────────────────── */}
      <div className="card card-pad">
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Identitas tagihan
        </p>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))"
          }}
        >
          <Field label="Kota penerbitan" required>
            <Input
              value={form.kota_terbit}
              onChange={(e) => set("kota_terbit", e.target.value)}
            />
          </Field>
          <Field label="Tanggal tagihan" required>
            <Input
              type="date"
              value={form.tanggal}
              onChange={(e) => set("tanggal", e.target.value)}
            />
          </Field>
          <Field label="Termin (hari)" hint="Dari master customer">
            <Input
              type="number"
              min={0}
              value={form.termin_hari}
              onChange={(e) => set("termin_hari", e.target.value)}
              placeholder="30"
            />
          </Field>
          <Field
            label="Jatuh tempo"
            hint={
              jatuhTempoManual
                ? "Disetel manual"
                : "Otomatis dari tanggal + termin"
            }
          >
            <Input
              type="date"
              value={form.jatuh_tempo}
              onChange={(e) => {
                setJatuhTempoManual(true);
                set("jatuh_tempo", e.target.value);
              }}
            />
          </Field>
        </div>
      </div>

      {/* ── Rincian ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Rincian tagihan</p>
            <p className="caption" style={{ color: "var(--text-tertiary)" }}>
              {form.customer_id
                ? `${jobsTersedia.length} job selesai belum ditagih untuk customer ini`
                : "Pilih customer dulu untuk menarik job yang belum ditagih"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {jobsTersedia.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={tambahSemuaJob}
              >
                Tarik semua job
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Plus style={{ width: 14, height: 14 }} />}
              onClick={() => setItems((rows) => [...rows, newItem()])}
            >
              Tambah baris
            </Button>
          </div>
        </div>

        <div
          className="card-pad"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
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
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text-secondary)"
                  }}
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
                    <GripVertical
                      style={{ width: 14, height: 14, transform: "rotate(90deg)" }}
                    />
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

              <Field
                label="Job yang ditagihkan"
                hint="Kosongkan untuk baris di luar job (mis. biaya tambahan)"
              >
                <Combobox
                  value={it.job_id}
                  onChange={(v) => pilihJob(it.key, v)}
                  options={[
                    // Job yang sudah dipilih di baris ini tetap tampil walau sudah tidak
                    // ada di daftar "belum ditagih" saat mode edit.
                    ...(it.job_id && !jobsTersedia.some((j) => j.id === it.job_id)
                      ? [
                          {
                            value: it.job_id,
                            label:
                              invoice?.items.find((x) => x.job_id === it.job_id)?.job_number ??
                              "Job terpilih"
                          }
                        ]
                      : []),
                    ...jobsTersedia.map((j) => ({
                      value: j.id,
                      label: j.job_number,
                      hint: `${j.asal} → ${j.tujuan}`
                    }))
                  ]}
                  placeholder="— tanpa job —"
                  searchPlaceholder="Cari nomor job atau rute…"
                  emptyText="Tidak ada job yang belum ditagih"
                  disabled={!form.customer_id}
                  clearable
                />
              </Field>

              {it.job_id &&
                (() => {
                  const info = infoUangJalanUntukJob(it.job_id);
                  return (
                    <div style={{ marginTop: -2, marginBottom: 4 }}>
                      <InfoUangJalanSurat
                        uangJalanPagu={info.pagu}
                        uangJalanCair={info.cair}
                        suratJalanUrls={info.urls}
                      />
                    </div>
                  );
                })()}

              <div
                style={{
                  display: "grid",
                  gap: 10,
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  marginTop: 4
                }}
              >
                <Field label="Uraian" required>
                  <Input
                    value={it.deskripsi}
                    onChange={(e) =>
                      setItem(it.key, { deskripsi: e.target.value })
                    }
                    placeholder="mis. Pengangkutan Excavator ZX60C"
                  />
                </Field>
                <Field label="Dari">
                  <Input
                    value={it.dari}
                    onChange={(e) => setItem(it.key, { dari: e.target.value })}
                    placeholder="mis. Pekanbaru"
                  />
                </Field>
                <Field label="Tujuan">
                  <Input
                    value={it.tujuan}
                    onChange={(e) => setItem(it.key, { tujuan: e.target.value })}
                    placeholder="mis. Siak Hulu"
                  />
                </Field>
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12
          }}
        >
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
                rightAddon={
                  <span style={{ fontSize: 12, paddingRight: 6 }}>%</span>
                }
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
            <TotalRow label={`PPN ${form.ppn_persen}%`} value={totals.ppn} />
          )}
          <TotalRow label="Total tagihan" value={totals.total} strong />
        </div>
      </div>

      {/* ── Rekening & penanda tangan ────────────────────────────────── */}
      <div className="card card-pad">
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Rekening pembayaran
        </p>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))"
          }}
        >
          <Field label="Bank">
            <Input
              value={form.bank_nama}
              onChange={(e) => set("bank_nama", e.target.value)}
              placeholder="mis. BRI"
            />
          </Field>
          <Field label="No rekening">
            <Input
              className="mono"
              value={form.bank_rekening}
              onChange={(e) => set("bank_rekening", e.target.value)}
              placeholder="0000-00-000000-00-0"
            />
          </Field>
          <Field label="Atas nama">
            <Input
              value={form.bank_atas_nama}
              onChange={(e) => set("bank_atas_nama", e.target.value)}
              placeholder="PT. Mitra Angkutan Sejati"
            />
          </Field>
        </div>

        <p className="eyebrow" style={{ margin: "16px 0 12px" }}>
          Penanda tangan
        </p>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
          }}
        >
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
          hint="Hanya untuk tim — tidak ikut tercetak di tagihan"
        >
          <Textarea
            value={form.catatan}
            onChange={(e) => set("catatan", e.target.value)}
            placeholder="mis. minta dikirim ke email finance, bukan PIC lapangan"
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

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          paddingBottom: 8
        }}
      >
        <Link to={isEdit ? `/invoices/${invoice!.id}` : "/invoices"}>
          <Button variant="secondary">Batal</Button>
        </Link>
        <Button
          onClick={onSubmit}
          loading={loading}
          leftIcon={<Save style={{ width: 15, height: 15 }} />}
        >
          {isEdit ? "Simpan perubahan" : "Simpan tagihan"}
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
