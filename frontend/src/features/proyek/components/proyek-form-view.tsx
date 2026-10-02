import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Flag, MapPin, Plus } from "lucide-react";
import { AccordionItem } from "@/components/ui/accordion";
import { StatusBadge } from "@/components/ui/badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field, Input } from "@/components/ui/input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import { createCustomer } from "@/features/customers/api";
import type { LocationPickerAvailableUnit } from "@/features/jobs/components/location-picker";
import { NewCustomerInline } from "@/features/jobs/components/new-customer-inline";
import { buildPrefill, type JobPrefill } from "@/features/jobs/quotation-prefill";
import { fleetLocations } from "@/features/tracking/api";
import { BENTROK_JADWAL_MESSAGE, findJobConflicts } from "@/lib/job-conflicts";
import { formatDate, formatTime } from "@/lib/utils";
import type { Customer, Driver, Job, ProyekDetail, Quotation, QuotationItem, Unit } from "@/types";
import { cariProyekPenawaran, createProyek, updateProyek } from "../api";
import { useProyek } from "../queries";
import {
  META_AWAL,
  draftSebagaiJob,
  jobDraftBaru,
  keJobInput,
  validasiJob,
  type JobDraft,
  type JobDraftMeta
} from "../job-draft";
import { JobDraftAccordion } from "./job-draft-accordion";
import { ProyekReview } from "./proyek-review";

const FORMAT_HP = /^(08|\+628)\d{7,12}$/;

interface Props {
  /** Ada = form edit proyek; kosong = proyek baru. */
  proyek?: ProyekDetail;
  customers: Customer[];
  drivers: Driver[];
  /** Semua unit — pilihan job baru hanya yang berstatus standby. */
  units: Unit[];
  activeJobs: Job[];
  /** True bila daftar job aktif gagal dimuat — peringatan bentrok tidak jalan. */
  conflictCheckError?: boolean;
  onRetryConflictCheck?: () => void;
  /** Isian awal dari item penawaran yang deal (proyek baru / gabung proyek). */
  prefill?: JobPrefill;
  /** Unit yang dipilih di tombol "Buat / Gabung Proyek" penawaran. */
  unitAwal?: string;
  /**
   * Penawaran asal proyek. BATASAN: job di proyek dari penawaran wajib salah
   * satu item deal penawaran itu (1 proyek = 1 penawaran + 1 unit).
   */
  penawaran?: Quotation;
  /**
   * Halaman "Tambah job ke proyek" (/proyek/:id/tambah-job): data proyek hanya
   * dilihat, isi job baru. Tanpa ini, form proyek yang sudah ada = edit PIC saja.
   */
  tambahJob?: boolean;
}

function prefillKeDraft(p: JobPrefill, unit?: Unit): JobDraft {
  return jobDraftBaru({
    alat_diangkut: p.alat_diangkut ?? "",
    asal: p.asal ?? "",
    tujuan: p.tujuan ?? "",
    catatan: p.catatan ?? "",
    quotation_id: p.quotation_id,
    quotation_item_id: p.quotation_item_id,
    ...isiUnit(unit)
  });
}

/** Unit terpilih + driver tetapnya sebagai driver awal. */
function isiUnit(unit?: Unit): Partial<JobDraft> {
  if (!unit) return {};
  return { unit_id: unit.id, ...(unit.default_driver_id ? { driver_id: unit.default_driver_id } : {}) };
}

/**
 * Item deal yang boleh dipakai job di proyek ini. BATASAN: semua job satu
 * proyek memakai satu unit, jadi hanya item dengan jenis unit yang sama dengan
 * item acuan (item yang diklik di penawaran). `jenisAcuan` undefined = tanpa
 * filter; null = item lama tanpa jenis unit (hanya cocok dengan sesamanya).
 */
function itemCocok(it: QuotationItem, jenisAcuan: string | null | undefined): boolean {
  return it.keputusan === "deal" && (jenisAcuan === undefined || (it.jenis_unit_id ?? null) === jenisAcuan);
}

/** Pilihan item untuk Combobox item di job (tanpa item yang sudah dipakai job lain). */
function opsiItemPenawaran(
  q: Quotation,
  jenisAcuan: string | null | undefined,
  dipakai: Set<string> = new Set()
): ComboboxOption[] {
  return q.items
    .map((it, i) => ({ it, no: i + 1 }))
    .filter(({ it }) => itemCocok(it, jenisAcuan) && !dipakai.has(it.id))
    .map(({ it, no }) => ({
      value: it.id,
      label: `Item ${no}: ${it.dari} → ${it.tujuan}`,
      hint: it.nama_alat ?? undefined
    }));
}

/** Unit proyek dari penawaran diperiksa di bagian proyek, bukan per job —
 *  errornya tidak ditampilkan dobel di job (unit trailer tetap per job). */
function tanpaIsianUnit(errs: Record<string, string>, dariPenawaran: boolean): Record<string, string> {
  if (!dariPenawaran) return errs;
  const { unit_id: _u, ...sisa } = errs;
  return sisa;
}

/** Label kecil di atas nilai — isian ringkasan job tersimpan. */
function IsianJob({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="caption" style={{ color: "var(--text-tertiary)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

/** Job yang sudah tersimpan (edit proyek & tambah job): hanya dilihat, tanpa tombol ubah. */
function JobTersimpan({ job, drivers, units }: { job: Job; drivers: Driver[]; units: Unit[] }) {
  const [open, setOpen] = useState(false);
  const unit = units.find((u) => u.id === job.unit_id);
  const driver = drivers.find((d) => d.id === job.driver_id);
  return (
    <AccordionItem
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span className="mono">{job.job_number}</span>
          <StatusBadge status={job.status} />
        </span>
      }
      subtitle={`${job.alat_diangkut} · ${job.asal.split(",")[0]} → ${job.tujuan.split(",")[0]}`}
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr]" style={{ gap: 16 }}>
        {/* Detail pengiriman: alat, rute (asal → tujuan, alamat lengkap), jadwal. */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="eyebrow">Detail pengiriman</div>
          <IsianJob label="Alat diangkut">{job.alat_diangkut}</IsianJob>
          <div>
            <div className="caption" style={{ color: "var(--text-tertiary)", marginBottom: 6 }}>
              Rute
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "16px 1fr", columnGap: 8, rowGap: 2 }}>
              <MapPin style={{ width: 14, height: 14, marginTop: 2, color: "var(--text-tertiary)" }} />
              <div style={{ fontSize: 13 }}>
                <div className="caption">Asal</div>
                {job.asal}
              </div>
              {/* Garis penghubung asal → tujuan. */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ width: 1, minHeight: 14, background: "var(--border-default)" }} />
              </div>
              <div />
              <Flag style={{ width: 14, height: 14, marginTop: 2, color: "var(--brand-primary-dark)" }} />
              <div style={{ fontSize: 13 }}>
                <div className="caption">Tujuan</div>
                {job.tujuan}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2" style={{ gap: 12 }}>
            <IsianJob label="ETD">
              <span className="mono">
                {formatDate(job.etd)} {formatTime(job.etd)}
              </span>
            </IsianJob>
            <IsianJob label="ETA">
              <span className="mono">{job.eta ? `${formatDate(job.eta)} ${formatTime(job.eta)}` : "—"}</span>
            </IsianJob>
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="eyebrow">Unit &amp; driver</div>
          <IsianJob label="Unit">
            {unit?.kode_unit ?? "—"}
            {job.unit_trailer_kode ? <span className="caption"> + trailer {job.unit_trailer_kode}</span> : null}
          </IsianJob>
          <IsianJob label="Driver">{driver?.nama ?? "—"}</IsianJob>
          {job.catatan && (
            <IsianJob label="Catatan internal">
              <span style={{ whiteSpace: "pre-wrap" }}>{job.catatan}</span>
            </IsianJob>
          )}
        </section>
      </div>
    </AccordionItem>
  );
}

/**
 * Form proyek (buat & edit):
 * - bagian Proyek: checkbox "Jalan kosongan". Dicentang = tanpa customer
 *   (dropdown & tombol customer baru disembunyikan, PIC opsional); tidak
 *   dicentang = customer, PIC lapangan, dan No HP PIC wajib;
 * - bagian Job: tiap job satu accordion berisi Detail Pengiriman, Assign Unit &
 *   Driver, dan Catatan Internal; tombol "Tambah job" menambah item baru.
 * Proyek baru diisi dalam 2 langkah: (1) isi data, (2) review lalu simpan.
 * Form edit langsung menyimpan (1 langkah).
 * BATASAN: proyek baru wajib minimal 1 job. Proyek & semua job baru disimpan
 * dalam satu transaksi di server (database juga menolak proyek tanpa job).
 */
export function ProyekFormView({
  proyek,
  customers,
  drivers,
  units,
  activeJobs,
  conflictCheckError,
  onRetryConflictCheck,
  prefill,
  unitAwal,
  penawaran,
  tambahJob
}: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const edit = Boolean(proyek);
  // BATASAN: halaman edit proyek hanya mengubah PIC lapangan (customer & job
  // tidak). Job baru ditambahkan di halaman terpisah "Tambah job ke proyek".
  const modePic = edit && !tambahJob;
  const modeTambahJob = edit && Boolean(tambahJob);
  // Edit proyek & tambah job: job yang dibatalkan tidak ditampilkan.
  const jobTampil = (proyek?.jobs ?? []).filter((j) => j.status !== "cancelled");
  const standbyUnits = useMemo(() => units.filter((u) => u.status === "standby"), [units]);
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  // Popup loading memblokir klik selama proses simpan.
  const [busy, setBusy] = useState<string | null>(null);

  const customerAwal = localCustomers.find((c) => c.id === (proyek?.customer_id ?? prefill?.customer_id));
  const [klien, setKlien] = useState({
    customer_id: proyek?.customer_id ?? prefill?.customer_id ?? "",
    pic_nama: proyek?.pic_nama ?? prefill?.pic_nama ?? customerAwal?.pic_nama ?? "",
    pic_no_hp: proyek?.pic_no_hp ?? prefill?.pic_no_hp ?? customerAwal?.pic_no_hp ?? ""
  });
  const [klienErr, setKlienErr] = useState<Record<string, string>>({});
  // Jalan kosongan = proyek tanpa customer. Proyek lama tanpa customer dibuka
  // dalam keadaan tercentang.
  const [kosongan, setKosongan] = useState(() => (proyek ? !proyek.customer_id : false));
  // Proyek baru: 1 = isi data, 2 = review & simpan.
  const [langkah, setLangkah] = useState<1 | 2>(1);

  // BATASAN gabung proyek: job baru di proyek yang sudah ada memakai salah
  // satu unit proyek (bisa >1 setelah ganti unit karena rusak). Database &
  // backend juga menjaga.
  const unitProyek = useMemo(() => {
    const ids = new Set((proyek?.jobs ?? []).filter((j) => j.status !== "cancelled").map((j) => j.unit_id));
    return units.filter((u) => ids.has(u.id));
  }, [proyek, units]);
  const unitDariId = (id?: string) => units.find((u) => u.id === id);
  // Job baru di proyek dari penawaran ikut penawaran itu.
  const quotationProyek = penawaran?.id ?? null;

  const [drafts, setDrafts] = useState<JobDraft[]>(() => {
    const unitDefault = unitDariId(unitAwal) ?? (unitProyek.length === 1 ? unitProyek[0] : undefined);
    if (edit && !tambahJob) return [];
    if (prefill) return [prefillKeDraft(prefill, unitDefault)];
    return [jobDraftBaru({ quotation_id: quotationProyek, ...isiUnit(unitDefault) })];
  });
  // Proyek baru dari penawaran: unit dipilih sekali di bagian proyek dan
  // dipakai semua job-nya (1 proyek = 1 penawaran + 1 unit). Unit trailer
  // tetap dipilih per job.
  const dariPenawaran = !edit && !!penawaran;
  const [unitPenawaran, setUnitPenawaran] = useState(() => (dariPenawaran ? (unitAwal ?? "") : ""));
  const itemAwal = penawaran?.items.find((it) => it.id === prefill?.quotation_item_id);
  const jenisItemAwal = itemAwal?.jenis_unit_id;
  // Jenis unit acuan untuk memilih item job: item yang diklik di penawaran,
  // atau (tambah job ke proyek yang ada) jenis unit proyek.
  const jenisAcuan: string | null | undefined = itemAwal
    ? (itemAwal.jenis_unit_id ?? null)
    : (units.find((u) => (proyek?.jobs ?? []).some((j) => j.unit_id === u.id))?.jenis_unit_id ?? undefined);
  const opsiUnitPenawaran = useMemo<ComboboxOption[]>(
    () =>
      units
        // Hanya unit Stand by yang bisa dipakai proyek baru dari penawaran.
        .filter((u) => u.is_active && u.status === "standby")
        .filter((u) => !jenisItemAwal || u.jenis_unit_id === jenisItemAwal)
        .map((u) => ({
          value: u.id,
          label: `${u.kode_unit} — ${u.jenis_unit_nama}`,
          hint: u.no_polisi
        })),
    [units, jenisItemAwal]
  );

  // Setiap unit dipilih/diganti, dicek apakah penawaran & unit itu sudah punya
  // proyek. Bila ada, muncul checkbox untuk menggabungkan job ke proyek itu.
  const cariGabung = useQuery({
    queryKey: ["proyek", "cari", penawaran?.id ?? "", unitPenawaran],
    queryFn: () => cariProyekPenawaran(penawaran!.id, unitPenawaran),
    enabled: dariPenawaran && !!unitPenawaran
  });
  const detailGabung = useProyek(dariPenawaran && unitPenawaran ? cariGabung.data?.id : undefined);
  const proyekAda = dariPenawaran && unitPenawaran && cariGabung.data ? (detailGabung.data ?? null) : null;
  const [gabungDicentang, setGabungDicentang] = useState(false);
  const gabung = proyekAda && gabungDicentang ? proyekAda : null;
  // Hanya pencarian pertama per unit (bukan refetch latar belakang) yang
  // membekukan halaman.
  const memeriksaGabung = cariGabung.isLoading || (!!cariGabung.data && detailGabung.isLoading);

  // Hanya satu job terbuka sekaligus supaya form tidak penuh; job lain tampil
  // sebagai satu baris ringkasan.
  const [jobTerbuka, setJobTerbuka] = useState<string | null>(() => drafts[0]?.key ?? null);
  const [metas, setMetas] = useState<Record<string, JobDraftMeta>>({});
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [submitKe, setSubmitKe] = useState(0);

  // Posisi GPS unit untuk marker di peta pin lokasi (diambil sekali).
  const [unitLocations, setUnitLocations] = useState<Record<string, { lat: number; lng: number } | null>>({});
  useEffect(() => {
    let batal = false;
    fleetLocations()
      .then((data) => !batal && setUnitLocations(data.locations ?? {}))
      .catch(() => {
        // diam — peta tetap berfungsi tanpa marker unit
      });
    return () => {
      batal = true;
    };
  }, []);
  const mapUnits = useMemo<LocationPickerAvailableUnit[]>(
    () =>
      standbyUnits.flatMap((u) => {
        const loc = unitLocations[u.id];
        return loc ? [{ id: u.id, kode_unit: u.kode_unit, jenis_unit_nama: u.jenis_unit_nama, lat: loc.lat, lng: loc.lng }] : [];
      }),
    [standbyUnits, unitLocations]
  );

  const customerOptions = useMemo<ComboboxOption[]>(
    () =>
      localCustomers
        .filter((c) => c.is_active || c.id === klien.customer_id)
        .map((c) => ({
          value: c.id,
          label: c.nama_perusahaan,
          // Kota & PIC ikut jadi kata kunci pencarian.
          hint: [c.kota, c.pic_nama].filter(Boolean).join(" · ") || undefined
        })),
    [localCustomers, klien.customer_id]
  );

  // BATASAN: customer proyek yang sudah masuk tagihan tidak bisa diganti
  // (data customer di tagihan sudah di-snapshot; database juga menolak).
  const customerTerkunci = Boolean(proyek?.invoice_number);
  // Proyek dari penawaran: customer langsung dari surat penawaran.
  const customerDariPenawaran = Boolean(penawaran);

  /** PIC mengikuti customer yang dipilih (tetap bisa ditimpa manual). */
  function onCustomerChange(customerId: string) {
    if (customerId === klien.customer_id) return;
    const c = localCustomers.find((x) => x.id === customerId);
    setKlien((k) =>
      customerId ? { customer_id: customerId, pic_nama: c?.pic_nama ?? "", pic_no_hp: c?.pic_no_hp ?? "" } : { ...k, customer_id: "" }
    );
    setKlienErr({});
  }

  function ubahKosongan(v: boolean) {
    setKosongan(v);
    // Jalan kosongan tidak punya customer — pilihan customer dikosongkan.
    if (v) setKlien((k) => ({ ...k, customer_id: "" }));
    setKlienErr({});
  }

  /** Unit proyek (dari penawaran) berganti → semua job ikut unit itu. */
  function ubahUnitPenawaran(unitId: string) {
    const unit = unitDariId(unitId);
    setUnitPenawaran(unitId);
    setGabungDicentang(false);
    setKlienErr(({ unit: _u, ...rest }) => rest);
    setDrafts((ds) =>
      ds.map((d) => ({
        ...d,
        unit_id: unitId,
        unit_trailer_id: "",
        driver_id: d.driver_id || unit?.default_driver_id || ""
      }))
    );
  }

  /** Centang gabung: PIC awal mengikuti proyek tujuan (tetap bisa diubah). */
  function ubahGabung(v: boolean) {
    setGabungDicentang(v);
    if (v && proyekAda?.pic_nama) {
      setKlien((k) => ({ ...k, pic_nama: proyekAda.pic_nama ?? "", pic_no_hp: proyekAda.pic_no_hp ?? "" }));
    }
  }

  // Proyek dari penawaran & unit yang sama ditemukan → otomatis dicentang
  // "Gabungkan" (masih bisa dilepas bila memang ingin proyek baru).
  const idProyekAda = proyekAda?.id;
  useEffect(() => {
    if (idProyekAda) ubahGabung(true);
  }, [idProyekAda]);

  function validasiKlien(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (dariPenawaran && !unitPenawaran) errs.unit = "Unit wajib dipilih";
    // BATASAN: tanpa centang "Jalan kosongan", customer wajib dipilih dan
    // PIC & No HP wajib diisi (backend juga mewajibkan PIC bila ada customer).
    if (!kosongan && !klien.customer_id) errs.customer_id = "Customer wajib dipilih — atau centang Jalan kosongan";
    if (!kosongan && !klien.pic_nama.trim()) errs.pic_nama = "PIC wajib diisi";
    if (!kosongan && !klien.pic_no_hp.trim()) errs.pic_no_hp = "No HP PIC wajib diisi";
    else if (klien.pic_no_hp.trim() && !FORMAT_HP.test(klien.pic_no_hp.trim()))
      errs.pic_no_hp = "Format: 08xxxxxxxxxx atau +628xxxxxxxxxx";
    return errs;
  }

  /**
   * Unit yang boleh dipakai job ke-`index`: unit proyek (form edit), atau
   * unit job pertama (job ke-2 dst. di proyek baru). Kosong = bebas.
   */
  function unitTerkunciUntuk(index: number): Unit[] | undefined {
    if (unitProyek.length > 0) return unitProyek;
    const pertama = unitDariId(drafts[0]?.unit_id);
    return index > 0 && pertama ? [pertama] : undefined;
  }

  function ubahDraft(key: string, patch: Partial<JobDraft>) {
    const ubahUnitJobPertama = !proyek && key === drafts[0]?.key && "unit_id" in patch;
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key === key) return { ...d, ...patch };
        // Job ke-2 dst. selalu ikut unit job pertama (1 proyek = 1 unit).
        if (ubahUnitJobPertama) return { ...d, unit_id: patch.unit_id ?? "", unit_trailer_id: "" };
        return d;
      })
    );
    // Isian yang diubah tidak lagi menampilkan error lamanya.
    setErrors((e) => {
      const lama = e[key];
      if (!lama) return e;
      const sisa = Object.fromEntries(Object.entries(lama).filter(([k]) => !(k in patch)));
      return { ...e, [key]: sisa };
    });
  }

  /** Pilih item penawaran untuk job: rute & alat diisi dari item itu. */
  function pilihItem(key: string, itemId: string) {
    const item = penawaran?.items.find((it) => it.id === itemId);
    if (!penawaran || !item) return;
    const isi = buildPrefill(penawaran, item, null);
    ubahDraft(key, {
      quotation_id: penawaran.id,
      quotation_item_id: item.id,
      alat_diangkut: isi.alat_diangkut ?? "",
      asal: isi.asal ?? "",
      tujuan: isi.tujuan ?? "",
      asal_lat: null,
      asal_lng: null,
      tujuan_lat: null,
      tujuan_lng: null,
      catatan: isi.catatan ?? ""
    });
  }

  // Item deal penawaran yang belum dipakai job di form ini.
  const itemTersisa = (penawaran?.items ?? []).filter(
    (it) => itemCocok(it, jenisAcuan) && !drafts.some((d) => d.quotation_item_id === it.id)
  );

  function tambahDraft() {
    if (dariPenawaran && penawaran) {
      // Job berikutnya dari item deal lain penawaran yang sama.
      const item = itemTersisa[0];
      if (!item) return;
      const isi = buildPrefill(penawaran, item, null);
      const baru = jobDraftBaru({
        ...prefillKeDraft(isi, unitDariId(unitPenawaran)),
        key: undefined
      });
      setDrafts((ds) => [...ds, baru]);
      setJobTerbuka(baru.key);
      return;
    }
    const terkunci = unitTerkunciUntuk(drafts.length);
    const baru = jobDraftBaru({
      quotation_id: quotationProyek,
      ...isiUnit(terkunci && terkunci.length === 1 ? terkunci[0] : undefined)
    });
    setDrafts((ds) => [...ds, baru]);
    setJobTerbuka(baru.key);
  }

  function hapusDraft(key: string) {
    setDrafts((ds) => ds.filter((d) => d.key !== key));
  }

  function toggle(key: string) {
    setJobTerbuka((k) => (k === key ? null : key));
  }

  /** Pembanding bentrok per job: job aktif + job lain di form ini. */
  function pembandingUntuk(key: string): Job[] {
    const lain = drafts
      .map((d, i) => (d.key === key ? null : draftSebagaiJob(d, i + 1)))
      .filter((j): j is Job => j !== null);
    return [...activeJobs, ...lain];
  }

  /** Periksa semua isian; true = boleh lanjut ke review / disimpan. */
  function periksa(): boolean {
    // Digabung ke proyek yang ada: customer & PIC mengikuti proyek itu.
    const errKlien = gabung ? {} : validasiKlien();
    const errJob = Object.fromEntries(
      drafts.map((d) => [
        d.key,
        {
          ...tanpaIsianUnit(validasiJob(d, metas[d.key] ?? META_AWAL), dariPenawaran),
          // BATASAN: proyek dari penawaran → tiap job wajib dari item deal penawaran itu.
          ...(penawaran && !d.quotation_item_id ? { quotation_item_id: "Pilih item penawaran" } : {})
        }
      ])
    );
    setKlienErr(errKlien);
    setErrors(errJob);
    setSubmitKe((n) => n + 1);
    const jobSalah = drafts.filter((d) => Object.keys(errJob[d.key]).length > 0).map((d) => d.key);
    if (Object.keys(errKlien).length > 0 || jobSalah.length > 0) {
      if (jobSalah.length > 0) setJobTerbuka(jobSalah[0]);
      toast.error("Periksa kembali isian yang ditandai merah");
      return false;
    }
    if (memeriksaGabung) {
      toast.error("Tunggu, sedang memeriksa proyek dari penawaran ini");
      return false;
    }
    if (!edit && drafts.length === 0) {
      toast.error("Proyek wajib memiliki minimal 1 job");
      return false;
    }
    // Bentrok jadwal tidak bisa di-"tetap simpan" — server juga menolaknya.
    const bentrok = drafts.some(
      (d) =>
        findJobConflicts(
          { unitId: d.unit_id, driverId: d.driver_id, etd: d.etd, eta: d.eta || null, excludeJobId: d.key },
          pembandingUntuk(d.key)
        ).hasAny
    );
    if (bentrok) {
      toast.error(BENTROK_JADWAL_MESSAGE);
      return false;
    }
    return true;
  }

  /** Kembali ke langkah 1 dari review; `jobKey` = langsung buka job itu. */
  function kembaliIsi(jobKey?: string) {
    setLangkah(1);
    if (jobKey) setJobTerbuka(jobKey);
    window.scrollTo({ top: 0 });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (langkah === 1) {
      if (!periksa()) return;
      // Proyek baru: tampilkan review dulu sebelum disimpan.
      if (!edit) {
        setLangkah(2);
        window.scrollTo({ top: 0 });
        return;
      }
    }
    await simpan();
  }

  async function simpan() {
    const isianKlien = {
      customer_id: kosongan ? null : klien.customer_id || null,
      pic_nama: klien.pic_nama.trim() || null,
      pic_no_hp: klien.pic_no_hp.trim() || null
    };
    const jobs = drafts.map((d) => keJobInput(d, metas[d.key] ?? META_AWAL));

    // Edit proyek, atau gabung ke proyek dari penawaran & unit yang sama.
    const tujuan = proyek ?? gabung;
    setBusy(
      gabung ? `Menggabungkan job ke proyek ${gabung.nomor_proyek}…` : edit ? "Menyimpan perubahan proyek…" : "Menyimpan proyek & job…"
    );
    if (tujuan) {
      const klienTujuan = gabung ? { ...isianKlien, customer_id: gabung.customer_id } : isianKlien;
      const res = await updateProyek(tujuan.id, { ...klienTujuan, jobs_baru: jobs });
      setBusy(null);
      if (!res.ok) {
        toast.error(res.conflicts ? BENTROK_JADWAL_MESSAGE : res.error);
        return;
      }
      const n = res.data.jobs_baru.length;
      toast.success(
        gabung
          ? `${n} job digabung ke proyek ${gabung.nomor_proyek}`
          : n > 0
            ? `Proyek diperbarui, ${n} job ditambahkan`
            : "Proyek diperbarui"
      );
      navigate(n === 1 ? `/jobs/${res.data.jobs_baru[0].id}/confirmation` : `/proyek/${tujuan.id}`);
      return;
    }
    const res = await createProyek({ ...isianKlien, jobs });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.conflicts ? BENTROK_JADWAL_MESSAGE : res.error);
      return;
    }
    toast.success(`Proyek ${res.data.nomor_proyek} dengan ${res.data.jobs.length} job berhasil dibuat`);
    // Satu job → halaman konfirmasi (template WhatsApp & link tracking) seperti dulu.
    navigate(res.data.jobs.length === 1 ? `/jobs/${res.data.jobs[0].id}/confirmation` : `/proyek/${res.data.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex flex-col" style={{ maxWidth: 960, gap: 16 }}>
      {!edit && (
        <div className="card card-pad">
          <Stepper
            steps={[
              { key: "isi", label: "Isi data proyek & job" },
              { key: "review", label: "Review & simpan" }
            ]}
            currentKey={langkah === 1 ? "isi" : "review"}
          />
        </div>
      )}

      {langkah === 2 && (
        <ProyekReview
          gabungKe={gabung?.nomor_proyek}
          kosongan={kosongan}
          customerNama={
            penawaran?.customer_nama ??
            localCustomers.find((c) => c.id === klien.customer_id)?.nama_perusahaan ??
            null
          }
          picNama={klien.pic_nama}
          picNoHp={klien.pic_no_hp}
          drafts={drafts}
          metas={metas}
          units={units}
          drivers={drivers}
          onUbah={kembaliIsi}
        />
      )}

      {/* Langkah 1 tetap ter-render saat review supaya isian & data yang
          sudah dimuat (unit trailer, estimasi rute) tidak hilang. */}
      {/* `display` ditulis eksplisit: class `flex` mengalahkan atribut `hidden`,
          sehingga form sempat tetap tampil di halaman review. */}
      <div
        hidden={langkah === 2}
        style={{ gap: 16, display: langkah === 2 ? "none" : "flex", flexDirection: "column" }}
      >
        {prefill && !edit && (
          <div className="card card-pad" style={{ borderLeft: "3px solid var(--brand-primary)", fontSize: 13 }}>
            <strong>
              Data diambil dari penawaran {prefill.quote_number} ({prefill.item_label}).
            </strong>{" "}
            Customer, alat, dan rute sudah terisi — tinggal pilih unit, driver, dan jadwal berangkat.
          </div>
        )}

        <div className="card card-pad-lg">
          <div style={{ marginBottom: 14 }}>
            <div className="h3" style={{ marginBottom: 2 }}>
              {proyek ? (modeTambahJob ? `Tambah job ke proyek ${proyek.nomor_proyek}` : `Proyek ${proyek.nomor_proyek}`) : "Proyek baru"}
            </div>
            <div className="caption">
              {proyek
                ? `Dibuat ${formatDate(proyek.created_at)}${proyek.created_by_nama ? ` oleh ${proyek.created_by_nama}` : ""}`
                : "Nomor proyek dibuat otomatis saat disimpan (urut per bulan)."}
            </div>
          </div>
          <label
            hidden={customerDariPenawaran}
            style={{
              display: customerDariPenawaran ? "none" : "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13.5,
              fontWeight: 500,
              cursor: customerTerkunci || edit ? "not-allowed" : "pointer",
              marginBottom: 12
            }}
          >
            <input
              type="checkbox"
              checked={kosongan}
              // Proyek yang sudah ada: customer tidak bisa diubah (hanya PIC).
              disabled={customerTerkunci || customerDariPenawaran || edit}
              onChange={(e) => ubahKosongan(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Jalan kosongan (tanpa customer)
          </label>
          {!kosongan && (
            <Field
              label="Customer"
              required
              hint={
                customerTerkunci
                  ? `Tidak bisa diganti — proyek sudah masuk tagihan ${proyek?.invoice_number}.`
                  : modePic
                    ? "Customer tidak bisa diubah — yang bisa diubah hanya PIC di lapangan."
                    : undefined
              }
            >
              <div className="flex flex-wrap gap-2">
                <div style={{ flex: 1, minWidth: 200 }}>
                  <Combobox
                    value={klien.customer_id}
                    onChange={onCustomerChange}
                    options={customerOptions}
                    placeholder="Pilih customer"
                    searchPlaceholder="Cari nama perusahaan, kota, PIC…"
                    emptyText="Customer tidak ditemukan"
                    clearable
                    disabled={customerTerkunci || customerDariPenawaran || edit}
                    error={klienErr.customer_id}
                  />
                </div>
                {!customerTerkunci && !customerDariPenawaran && !edit && (
                  <button type="button" className="btn btn-secondary" onClick={() => setNewCustomerOpen(true)}>
                    <Plus style={{ width: 14, height: 14 }} />
                    Customer baru
                  </button>
                )}
              </div>
            </Field>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12, marginTop: 12 }}>
            <Field
              label="PIC di lapangan"
              required={!kosongan}
              hint="Boleh disesuaikan dengan yang standby di lapangan."
            >
              <Input
                placeholder="Bapak/Ibu nama"
                value={klien.pic_nama}
                onChange={(e) => setKlien((k) => ({ ...k, pic_nama: e.target.value }))}
                error={klienErr.pic_nama}
                disabled={modeTambahJob}
              />
            </Field>
            <Field label="No HP PIC" required={!kosongan}>
              <Input
                type="tel"
                placeholder="0812xxxxxxxx"
                value={klien.pic_no_hp}
                onChange={(e) => setKlien((k) => ({ ...k, pic_no_hp: e.target.value }))}
                error={klienErr.pic_no_hp}
                disabled={modeTambahJob}
                className="mono"
              />
            </Field>
          </div>
          {dariPenawaran && (
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12, marginTop: 12 }}>
              <Field label="Unit" required hint="Dipakai semua job proyek ini.">
                <Combobox
                  value={unitPenawaran}
                  onChange={ubahUnitPenawaran}
                  options={opsiUnitPenawaran}
                  placeholder="Pilih unit"
                  searchPlaceholder="Cari kode unit, jenis, no polisi…"
                  emptyText="Tidak ada unit yang cocok"
                  error={klienErr.unit}
                />
              </Field>
            </div>
          )}
          {proyekAda && (
            <label
              style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginTop: 12, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={gabungDicentang}
                onChange={(e) => ubahGabung(e.target.checked)}
                style={{ width: 16, height: 16, marginTop: 2 }}
              />
              <span>
                Gabungkan dengan proyek <strong className="mono">{proyekAda.nomor_proyek}</strong> yang sudah ada
                <span className="caption" style={{ display: "block" }}>
                  Unit ini sudah punya proyek dari penawaran {penawaran?.quote_number}. Tidak dicentang = proyek baru.
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="card card-pad-lg">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
            <div>
              <div className="h3" style={{ marginBottom: 2 }}>
                Job
              </div>
              <div className="caption">
                {modePic
                  ? "Job proyek ini hanya ditampilkan. Job baru ditambahkan lewat Tambah job di detail proyek."
                  : modeTambahJob
                    ? "Job yang sudah ada hanya ditampilkan. Isi job baru di bawah."
                    : "Proyek baru dibuat dengan 1 job. Job lain ditambahkan lewat Tambah job di proyek."}
              </div>
            </div>
            {/* BATASAN: tambah proyek cukup 1 job — tombol tambah job hanya di halaman tambah job. */}
            {modeTambahJob && (!dariPenawaran || itemTersisa.length > 0) && (
              <button type="button" className="btn btn-secondary" onClick={tambahDraft}>
                <Plus style={{ width: 14, height: 14 }} />
                {dariPenawaran ? "Tambah job (item lain)" : "Tambah job"}
              </button>
            )}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {jobTampil.map((j) => <JobTersimpan key={j.id} job={j} drivers={drivers} units={units} />)}
            {drafts.map((d, i) => (
              <JobDraftAccordion
                key={d.key}
                nomor={jobTampil.length + i + 1}
                value={d}
                onChange={(patch) => ubahDraft(d.key, patch)}
                // BATASAN: proyek baru minimal 1 job — item terakhir tidak bisa dihapus.
                onRemove={edit || drafts.length > 1 ? () => hapusDraft(d.key) : undefined}
                errors={errors[d.key] ?? {}}
                open={jobTerbuka === d.key}
                onToggle={() => toggle(d.key)}
                onMeta={(m) => setMetas((ms) => ({ ...ms, [d.key]: m }))}
                drivers={drivers}
                standbyUnits={standbyUnits}
                unitTerkunci={unitTerkunciUntuk(i)}
                sembunyikanUnit={dariPenawaran}
                itemPenawaran={
                  penawaran
                    ? {
                        options: opsiItemPenawaran(
                          penawaran,
                          jenisAcuan,
                          new Set(drafts.filter((x) => x.key !== d.key).map((x) => x.quotation_item_id ?? ""))
                        ),
                        onPilih: (id) => pilihItem(d.key, id)
                      }
                    : undefined
                }
                pembanding={pembandingUntuk(d.key)}
                conflictCheckError={conflictCheckError}
                onRetryConflictCheck={onRetryConflictCheck}
                mapUnits={mapUnits}
                submitKe={submitKe}
                // Tambah proyek cukup 1 job → tanpa judul "Job 1" & tanpa accordion.
                tunggal={!edit}
              />
            ))}
            {modeTambahJob && drafts.length === 0 && (
              <div className="caption">Klik "Tambah job" untuk menambahkan job baru ke proyek ini.</div>
            )}
          </div>
        </div>

      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {langkah === 2 ? (
          <button type="button" className="btn btn-secondary" onClick={() => kembaliIsi()} disabled={busy !== null}>
            Kembali
          </button>
        ) : (
          <Link
            to={proyek ? `/proyek/${proyek.id}` : "/proyek"}
            className="btn btn-secondary"
            style={{ textDecoration: "none" }}
          >
            Batal
          </Link>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy !== null}>
          {proyek
            ? modeTambahJob
              ? "Simpan job"
              : "Simpan perubahan"
            : langkah === 1
              ? "Lanjut ke review"
              : gabung
                ? `Gabungkan job ke proyek ${gabung.nomor_proyek}`
                : "Simpan proyek"}
        </button>
      </div>

      <NewCustomerInline
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onCreate={async (data) => {
          const res = await createCustomer(data);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          setLocalCustomers((prev) => [
            {
              id: res.data.id,
              nama_perusahaan: res.data.nama_perusahaan,
              pic_nama: data.pic_nama,
              pic_no_hp: data.pic_no_hp,
              is_active: true,
              created_at: new Date().toISOString()
            } as Customer,
            ...prev
          ]);
          // PIC customer baru langsung dipakai sebagai PIC proyek.
          setKosongan(false);
          setKlien({ customer_id: res.data.id, pic_nama: data.pic_nama, pic_no_hp: data.pic_no_hp });
          setKlienErr({});
          setNewCustomerOpen(false);
          toast.success("Customer ditambahkan");
          return true;
        }}
      />
      {/* Popup loading juga membekukan halaman selama mencari proyek dari
          penawaran & unit yang sama setelah unit dipilih/diganti. */}
      <LoadingOverlay
        message={busy ?? (dariPenawaran && memeriksaGabung ? "Mencari proyek dari penawaran & unit yang sama…" : null)}
      />
    </form>
  );
}
