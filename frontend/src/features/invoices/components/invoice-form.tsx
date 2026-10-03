import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DateInput } from "@/components/ui/date-input";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Plus, Save, Trash2 } from "lucide-react";
import { totalUangJalan } from "@/features/invoices/rincian-tagihan";
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
import type { Customer, Invoice, JobBelumDitagihRow, UangJalanTransaksi } from "@/types";
import { formatRupiah, hariIniWIB, tambahHari } from "@/lib/utils";

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
   * Dari tab "Proyek siap ditagih": customer & job yang sudah dicentang di sana
   * langsung mengisi form ini (hanya berlaku saat membuat tagihan baru).
   */
  initialCustomerId?: string;
  initialJobIds?: string[];
}

/** Baris rincian per proyek: teks bebas yang tercetak + nominal yang ditagih. */
interface ProyekForm {
  key: string;
  proyek_id: string;
  proyek_nomor: string;
  uraian: string;
  nominal: string;
  /** Job proyek yang ikut ditagih — tampil sebagai daftar di bawah baris. */
  job_ids: string[];
}

/** Baris di luar proyek (mis. biaya tambahan). */
interface ItemForm {
  key: string;
  /** Hanya untuk tagihan lama yang barisnya terikat job tanpa proyek. */
  job_id: string;
  deskripsi: string;
  dari: string;
  tujuan: string;
  qty: string;
  satuan: string;
  harga_satuan: string;
}

/** Info job untuk daftar job di bawah baris proyek. */
interface JobInfo {
  id: string;
  job_number: string;
  alat: string;
  asal: string;
  tujuan: string;
  uangJalanTotal: number | null;
  uangJalanCair: number | null;
  uangJalanAwal: number | null;
  transaksi: UangJalanTransaksi[];
  loading: string[];
  unloading: string[];
}

let keySeq = 0;
function nextKey(prefix: string) {
  keySeq += 1;
  return `${prefix}-${keySeq}`;
}

function newItem(patch?: Partial<ItemForm>): ItemForm {
  return {
    key: nextKey("it"),
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

function newProyek(patch: Omit<ProyekForm, "key">): ProyekForm {
  return { key: nextKey("pr"), ...patch };
}

function pendek(lokasi: string) {
  return lokasi.split(",")[0].trim();
}

/** Teks awal baris proyek — admin bebas mengubahnya sebelum dicetak. */
function uraianAwal(jobs: JobInfo[]): string {
  const alat = [...new Set(jobs.map((j) => j.alat).filter(Boolean))].join(", ");
  const rute = [...new Set(jobs.map((j) => `${pendek(j.asal)} → ${pendek(j.tujuan)}`))].join("; ");
  return [`Pengangkutan ${alat}`.trim(), rute].filter(Boolean).join("\n");
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
    tanggal: invoice?.tanggal?.slice(0, 10) ?? hariIniWIB(),
    termin_hari: invoice?.termin_hari != null ? String(invoice.termin_hari) : "",
    jatuh_tempo: invoice?.jatuh_tempo?.slice(0, 10) ?? "",
    ppn_aktif: invoice?.ppn_aktif ?? true,
    ppn_persen: String(invoice?.ppn_persen ?? 11),
    pph23_aktif: invoice?.pph23_aktif ?? false,
    pph23_persen: String(invoice?.pph23_persen ?? 2),
    ttd_nama: invoice?.ttd_nama ?? defaultTtdNama,
    ttd_jabatan: invoice?.ttd_jabatan ?? "Admin",
    bank_nama: invoice?.bank_nama ?? defaultBank?.nama ?? "",
    bank_rekening: invoice?.bank_rekening ?? defaultBank?.rekening ?? "",
    bank_atas_nama: invoice?.bank_atas_nama ?? defaultBank?.atas_nama ?? "",
    catatan: invoice?.catatan ?? ""
  });

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === form.customer_id) ?? null,
    [customers, form.customer_id]
  );

  // BATASAN: satu proyek hanya boleh masuk satu tagihan (satu tagihan boleh
  // banyak proyek). Job yang proyeknya sudah ada di tagihan aktif LAIN tidak
  // ditawarkan di sini — backend & database juga menolaknya.
  const jobsCustomer = jobsPerCustomer[form.customer_id] ?? [];
  const jobsTersedia = jobsCustomer.filter(
    (j) => !j.proyek_invoice_id || j.proyek_invoice_id === invoice?.id
  );
  const jobsTertahan = jobsCustomer.filter(
    (j) => j.proyek_invoice_id && j.proyek_invoice_id !== invoice?.id
  );

  /**
   * Info job (rute, uang jalan, surat jalan) — dari daftar "belum ditagih"
   * dulu, lalu dari rincian tagihan tersimpan (mode edit: job yang sudah
   * ditagih di sini tidak lagi ada di daftar "belum ditagih").
   */
  const semuaJobBelumDitagih = useMemo(() => Object.values(jobsPerCustomer).flat(), [jobsPerCustomer]);
  function jobInfo(jobId: string): JobInfo | null {
    const j = semuaJobBelumDitagih.find((x) => x.id === jobId);
    if (j) {
      return {
        id: j.id,
        job_number: j.job_number,
        alat: j.alat_diangkut,
        asal: j.asal,
        tujuan: j.tujuan,
        uangJalanTotal: j.uang_jalan_total,
        uangJalanCair: j.uang_jalan_cair,
        uangJalanAwal: j.uang_jalan_awal ?? null,
        transaksi: j.uang_jalan_transaksi ?? [],
        loading: j.surat_jalan_loading_urls ?? [],
        unloading: j.surat_jalan_unloading_urls ?? []
      };
    }
    const it = invoice?.items.find((x) => x.job_id === jobId);
    if (!it) return null;
    return {
      id: jobId,
      job_number: it.job_number ?? "Job",
      alat: it.deskripsi.replace(/^Pengangkutan\s+/i, ""),
      asal: it.dari ?? "",
      tujuan: it.tujuan ?? "",
      uangJalanTotal: it.uang_jalan_total ?? null,
      uangJalanCair: it.uang_jalan_cair ?? null,
      uangJalanAwal: it.uang_jalan_awal ?? null,
      transaksi: it.uang_jalan_transaksi ?? [],
      loading: it.surat_jalan_loading_urls ?? [],
      unloading: it.surat_jalan_unloading_urls ?? []
    };
  }

  /** Kartu proyek yang sedang diminimize (key baris). */
  const [terlipat, setTerlipat] = useState<Set<string>>(() => new Set());
  function toggleLipat(key: string) {
    setTerlipat((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const [proyekRows, setProyekRows] = useState<ProyekForm[]>(() => {
    if (!invoice) return [];
    if (invoice.proyek?.length) {
      return invoice.proyek.map((p) =>
        newProyek({
          proyek_id: p.proyek_id,
          proyek_nomor: p.proyek_nomor ?? "—",
          uraian: p.uraian,
          nominal: String(p.nominal),
          job_ids: invoice.items
            .filter((it) => it.job_id && it.proyek_id === p.proyek_id)
            .map((it) => it.job_id!)
        })
      );
    }
    // Tagihan lama (per job): baris job dikelompokkan jadi baris proyek —
    // uraian digabung, nominal = jumlah baris-barisnya.
    const perProyek = new Map<string, ProyekForm>();
    for (const it of invoice.items) {
      if (!it.job_id || !it.proyek_id) continue;
      const ada = perProyek.get(it.proyek_id);
      if (ada) {
        ada.job_ids.push(it.job_id);
        ada.nominal = String(Number(ada.nominal) + it.subtotal);
        if (!ada.uraian.split("\n").includes(it.deskripsi)) ada.uraian += `\n${it.deskripsi}`;
      } else {
        perProyek.set(
          it.proyek_id,
          newProyek({
            proyek_id: it.proyek_id,
            proyek_nomor: it.proyek_nomor ?? "—",
            uraian: it.deskripsi,
            nominal: String(it.subtotal),
            job_ids: [it.job_id]
          })
        );
      }
    }
    return [...perProyek.values()];
  });

  const [items, setItems] = useState<ItemForm[]>(() =>
    (invoice?.items ?? [])
      .filter((it) => !(it.job_id && it.proyek_id))
      .map((it) =>
        newItem({
          job_id: it.job_id ?? "",
          deskripsi: it.deskripsi,
          dari: it.dari ?? "",
          tujuan: it.tujuan ?? "",
          qty: String(it.qty),
          satuan: it.satuan,
          harga_satuan: String(it.harga_satuan)
        })
      )
  );

  /** Pilihan "Tambah proyek": proyek yang punya job siap tagih & belum ada di rincian. */
  const proyekOptions = useMemo(() => {
    const sudah = new Set(proyekRows.map((p) => p.proyek_id));
    const perProyek = new Map<string, { nomor: string; jumlah: number }>();
    for (const j of jobsTersedia) {
      if (!j.proyek_id || sudah.has(j.proyek_id)) continue;
      const ada = perProyek.get(j.proyek_id);
      if (ada) ada.jumlah += 1;
      else perProyek.set(j.proyek_id, { nomor: j.proyek_nomor ?? "—", jumlah: 1 });
    }
    return [...perProyek.entries()].map(([id, p]) => ({
      value: id,
      label: p.nomor,
      hint: `${p.jumlah} job siap tagih`
    }));
  }, [jobsTersedia, proyekRows]);

  /** Baris proyek baru dari job-job siap tagih (semua job proyek bila `jobIds` kosong). */
  function barisProyekDari(
    proyekId: string,
    jobIds?: string[],
    sumber: JobBelumDitagihRow[] = jobsTersedia
  ): ProyekForm | null {
    const jobs = sumber.filter(
      (j) => j.proyek_id === proyekId && (!jobIds || jobIds.includes(j.id))
    );
    if (jobs.length === 0) return null;
    const info = jobs.map((j) => jobInfo(j.id)).filter((x): x is JobInfo => x !== null);
    return newProyek({
      proyek_id: proyekId,
      proyek_nomor: jobs[0].proyek_nomor ?? "—",
      uraian: uraianAwal(info),
      nominal: "",
      job_ids: jobs.map((j) => j.id)
    });
  }

  function tambahProyek(proyekId: string) {
    if (!proyekId) return;
    const baris = barisProyekDari(proyekId);
    if (baris) setProyekRows((rows) => [...rows, baris]);
  }

  function tambahSemuaProyek() {
    const baru = proyekOptions
      .map((o) => barisProyekDari(o.value))
      .filter((b): b is ProyekForm => b !== null);
    if (baru.length === 0) {
      toast.error("Semua proyek yang siap tagih sudah ada di rincian");
      return;
    }
    setProyekRows((rows) => [...rows, ...baru]);
  }

  // Diisi sekali di awal dari job-job yang sudah dicentang di tab "Proyek
  // siap ditagih" — hanya untuk tagihan baru, dan hanya sekali supaya tidak
  // menimpa perubahan admin di form setelahnya.
  useEffect(() => {
    if (isEdit || !initialCustomerId || !initialJobIds?.length) return;
    onCustomerChange(initialCustomerId);
    const proyekIds = [
      ...new Set(
        (jobsPerCustomer[initialCustomerId] ?? [])
          .filter((j) => initialJobIds.includes(j.id) && j.proyek_id)
          .map((j) => j.proyek_id!)
      )
    ];
    const baru = proyekIds
      .map((pid) => barisProyekDari(pid, initialJobIds, jobsPerCustomer[initialCustomerId] ?? []))
      .filter((b): b is ProyekForm => b !== null);
    if (baru.length > 0) setProyekRows(baru);
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
    const subtotal =
      proyekRows.reduce((sum, p) => sum + parseRupiah(p.nominal), 0) +
      items.reduce((sum, it) => sum + (Number(it.qty) || 0) * parseRupiah(it.harga_satuan), 0);
    const persen = Number(form.ppn_persen) || 0;
    const ppn = form.ppn_aktif ? Math.round((subtotal * persen) / 100) : 0;
    // BATASAN: PPh 23 dipotong dari subtotal (DPP), bukan dari subtotal + PPN.
    const pph23 = form.pph23_aktif ? Math.round((subtotal * (Number(form.pph23_persen) || 0)) / 100) : 0;
    return { subtotal, ppn, pph23, total: subtotal + ppn - pph23 };
  }, [proyekRows, items, form.ppn_aktif, form.ppn_persen, form.pph23_aktif, form.pph23_persen]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setItem(key: string, patch: Partial<ItemForm>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function setProyek(key: string, patch: Partial<ProyekForm>) {
    setProyekRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  /** Geser baris ke atas/bawah (dipakai baris proyek & baris lain). */
  function geser<T>(rows: T[], index: number, dir: -1 | 1): T[] {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return rows;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
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
    // Ganti customer berarti proyek & job di rincian tidak lagi relevan.
    setProyekRows([]);
    setItems((rows) => rows.filter((r) => !r.job_id));
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
      pph23_aktif: form.pph23_aktif,
      pph23_persen: Number(form.pph23_persen) || 0,
      ttd_nama: form.ttd_nama,
      ttd_jabatan: form.ttd_jabatan,
      bank_nama: form.bank_nama,
      bank_rekening: form.bank_rekening,
      bank_atas_nama: form.bank_atas_nama,
      catatan: form.catatan,
      proyek: proyekRows.map((p) => ({
        proyek_id: p.proyek_id,
        uraian: p.uraian,
        nominal: parseRupiah(p.nominal),
        job_ids: p.job_ids
      })),
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
            <DateInput
              value={form.tanggal}
              onChange={(v) => set("tanggal", v)}
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
            <DateInput
              value={form.jatuh_tempo}
              onChange={(v) => {
                setJatuhTempoManual(true);
                set("jatuh_tempo", v);
              }}
            />
          </Field>
        </div>
      </div>

      {/* ── Rincian ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Rincian tagihan per proyek</p>
            <p className="caption" style={{ color: "var(--text-tertiary)" }}>
              {form.customer_id
                ? `${proyekOptions.length} proyek siap tagih belum masuk rincian`
                : "Pilih customer dulu untuk menarik proyek yang siap ditagih"}
            </p>
            {jobsTertahan.length > 0 && (
              <p className="caption" style={{ color: "var(--status-pickup-text)" }}>
                {jobsTertahan.length} job lain tidak bisa ditagih di sini karena proyeknya sudah masuk
                tagihan{" "}
                {[...new Set(jobsTertahan.map((j) => j.proyek_invoice_number))].join(", ")} — satu
                proyek hanya boleh satu tagihan.
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {proyekOptions.length > 0 && (
              <>
                <div style={{ minWidth: 220 }}>
                  <Combobox
                    value=""
                    onChange={tambahProyek}
                    options={proyekOptions}
                    placeholder="Tambah proyek…"
                    searchPlaceholder="Cari nomor proyek…"
                    emptyText="Tidak ada proyek siap tagih"
                  />
                </div>
                <Button size="sm" variant="secondary" onClick={tambahSemuaProyek}>
                  Tambah semua proyek
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {proyekRows.length === 0 && (
            <p className="caption" style={{ color: "var(--text-tertiary)", textAlign: "center", padding: "12px 0" }}>
              Belum ada proyek di rincian.
            </p>
          )}

          {proyekRows.map((p, idx) => {
            const jobs = p.job_ids.map(jobInfo).filter((x): x is JobInfo => x !== null);
            const uj = totalUangJalan(
              jobs.map((j) => ({ uang_jalan_cair: j.uangJalanCair, uang_jalan_total: j.uangJalanTotal }))
            );
            const lipat = terlipat.has(p.key);
            return (
              <div
                key={p.key}
                style={{ border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    background: "var(--bg-page)",
                    borderBottom: lipat ? undefined : "1px solid var(--border-default)"
                  }}
                >
                  {/* Klik nomor proyek untuk minimize / buka kartu. */}
                  <button
                    type="button"
                    onClick={() => toggleLipat(p.key)}
                    title={lipat ? "Buka rincian proyek" : "Minimize rincian proyek"}
                    aria-expanded={!lipat}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      flex: 1,
                      minWidth: 0,
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                      color: "inherit"
                    }}
                  >
                    <ChevronDown
                      style={{
                        width: 15,
                        height: 15,
                        flexShrink: 0,
                        transition: "transform 150ms",
                        transform: lipat ? "rotate(-90deg)" : undefined
                      }}
                    />
                    <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                      #{idx + 1}
                    </span>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {p.proyek_nomor}
                    </span>
                    <span className="caption">· {p.job_ids.length} job</span>
                    {lipat && (
                      <span className="mono" style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700 }}>
                        {formatRupiah(parseRupiah(p.nominal))}
                      </span>
                    )}
                  </button>
                  <BarisAksi
                    naikDisabled={idx === 0}
                    turunDisabled={idx === proyekRows.length - 1}
                    onNaik={() => setProyekRows((rows) => geser(rows, idx, -1))}
                    onTurun={() => setProyekRows((rows) => geser(rows, idx, 1))}
                    onHapus={() => setProyekRows((rows) => rows.filter((r) => r.key !== p.key))}
                    hapusTitle="Keluarkan proyek dari tagihan"
                  />
                </div>

                {!lipat && (
                  <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div className="grid gap-2.5 grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px]">
                      <Field label="Uraian di invoice" required hint="Teks ini yang tercetak di tagihan">
                        <Textarea
                          rows={3}
                          value={p.uraian}
                          onChange={(e) => setProyek(p.key, { uraian: e.target.value })}
                          placeholder="mis. Pengangkutan Excavator ZX200 Pekanbaru → Dumai"
                        />
                      </Field>
                      <Field label="Nominal ditagih" required>
                        <Input
                          inputMode="numeric"
                          value={displayRupiah(p.nominal)}
                          onChange={(e) => setProyek(p.key, { nominal: e.target.value })}
                          placeholder="15.000.000"
                          leftIcon={<span style={{ fontSize: 12 }}>Rp</span>}
                        />
                      </Field>
                    </div>

                    {/* Daftar job proyek — hanya teks, untuk memeriksa surat
                        jalan & uang jalan sebelum menagih. */}
                    <div>
                      <p className="caption" style={{ marginBottom: 6, fontWeight: 600 }}>
                        Job dalam proyek
                      </p>
                      <div
                        style={{
                          border: "1px solid var(--border-default)",
                          borderRadius: 6,
                          display: "flex",
                          flexDirection: "column"
                        }}
                      >
                        {jobs.map((j, jIdx) => (
                          <details
                            key={j.id}
                            style={{ borderTop: jIdx === 0 ? undefined : "1px solid var(--border-default)" }}
                          >
                            <summary
                              style={{
                                cursor: "pointer",
                                listStyle: "none",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                                padding: "7px 10px",
                                fontSize: 12.5
                              }}
                            >
                              <span className="mono" style={{ fontWeight: 600 }}>
                                {j.job_number}
                              </span>
                              <span style={{ color: "var(--text-secondary)", minWidth: 0 }}>
                                {[j.alat, `${pendek(j.asal)} → ${pendek(j.tujuan)}`].filter(Boolean).join(" · ")}
                              </span>
                              <div style={{ flex: 1 }} />
                              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                                Surat jalan {j.loading.length + j.unloading.length}
                              </span>
                              <span className="mono" style={{ fontSize: 12 }}>
                                UJ {formatRupiah(j.uangJalanCair ?? 0)}
                              </span>
                              <span style={{ fontSize: 11.5, color: "var(--brand-primary-dark)" }}>Lihat</span>
                            </summary>
                            <div style={{ padding: "0 10px 10px" }}>
                              <InfoUangJalanSurat
                                uangJalanTotal={j.uangJalanTotal}
                                uangJalanCair={j.uangJalanCair}
                                suratJalanLoadingUrls={j.loading}
                                suratJalanUnloadingUrls={j.unloading}
                                uangJalanAwal={j.uangJalanAwal}
                                uangJalanTransaksi={j.transaksi}
                              />
                            </div>
                          </details>
                        ))}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 6,
                          marginTop: 8,
                          fontSize: 12.5,
                          color: "var(--text-secondary)"
                        }}
                      >
                        Total uang jalan dikeluarkan:
                        <strong className="mono" style={{ color: "var(--text-primary)" }}>
                          {formatRupiah(uj.cair)}
                        </strong>
                        {uj.total !== uj.cair && <span>(uang jalan {formatRupiah(uj.total)})</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Biaya lain di luar proyek ────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Biaya lain</p>
            <p className="caption" style={{ color: "var(--text-tertiary)" }}>
              Baris di luar proyek, mis. biaya tambahan
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus style={{ width: 14, height: 14 }} />}
            onClick={() => setItems((rows) => [...rows, newItem()])}
          >
            Tambah baris
          </Button>
        </div>
        {items.length > 0 && (
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((it, idx) => (
              <div
                key={it.key}
                className="grid gap-2.5 items-end grid-cols-2 md:grid-cols-[minmax(0,1fr)_80px_100px_170px_auto]"
              >
                <div className="col-span-2 md:col-span-1">
                  <Field label="Uraian" required>
                    <Input
                      value={it.deskripsi}
                      onChange={(e) => setItem(it.key, { deskripsi: e.target.value })}
                      placeholder="mis. Biaya pengawalan"
                    />
                  </Field>
                </div>
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
                    onChange={(e) => setItem(it.key, { harga_satuan: e.target.value })}
                    placeholder="500.000"
                    leftIcon={<span style={{ fontSize: 12 }}>Rp</span>}
                  />
                </Field>
                <div style={{ paddingBottom: 4 }}>
                  <BarisAksi
                    naikDisabled={idx === 0}
                    turunDisabled={idx === items.length - 1}
                    onNaik={() => setItems((rows) => geser(rows, idx, -1))}
                    onTurun={() => setItems((rows) => geser(rows, idx, 1))}
                    onHapus={() => setItems((rows) => rows.filter((r) => r.key !== it.key))}
                    hapusTitle="Hapus baris"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
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

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            id="pph23"
            type="checkbox"
            checked={form.pph23_aktif}
            onChange={(e) => set("pph23_aktif", e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor="pph23" style={{ fontSize: 13.5 }}>
            Potong PPh 23
          </label>
          {form.pph23_aktif && (
            <div style={{ width: 100 }}>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.pph23_persen}
                onChange={(e) => set("pph23_persen", e.target.value)}
                rightAddon={<span style={{ fontSize: 12, paddingRight: 6 }}>%</span>}
              />
            </div>
          )}
          <span className="caption">Dipotong customer dari subtotal (kita pemberi jasa) — mengurangi total.</span>
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border-default)",
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginLeft: "auto",
            width: "100%",
            maxWidth: 380
          }}
        >
          <TotalRow label="Subtotal" value={totals.subtotal} />
          {form.ppn_aktif && (
            <TotalRow label={`PPN ${form.ppn_persen}%`} value={totals.ppn} />
          )}
          {form.pph23_aktif && <TotalRow label={`Pot. PPh 23 (${form.pph23_persen}%)`} value={-totals.pph23} />}
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

/** Tombol naik / turun / hapus di kepala baris rincian. */
function BarisAksi({
  naikDisabled,
  turunDisabled,
  onNaik,
  onTurun,
  onHapus,
  hapusTitle
}: {
  naikDisabled: boolean;
  turunDisabled: boolean;
  onNaik: () => void;
  onTurun: () => void;
  onHapus: () => void;
  hapusTitle: string;
}) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      <button
        type="button"
        className="btn-icon"
        title="Naikkan"
        disabled={naikDisabled}
        onClick={onNaik}
        style={{ opacity: naikDisabled ? 0.35 : 1 }}
      >
        <ArrowUp style={{ width: 14, height: 14 }} />
      </button>
      <button
        type="button"
        className="btn-icon"
        title="Turunkan"
        disabled={turunDisabled}
        onClick={onTurun}
        style={{ opacity: turunDisabled ? 0.35 : 1 }}
      >
        <ArrowDown style={{ width: 14, height: 14 }} />
      </button>
      <button type="button" className="btn-icon" title={hapusTitle} onClick={onHapus}>
        <Trash2 style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}
