"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileText,
  MapPin,
  Package,
  Plus,
  Truck,
  Wallet
} from "lucide-react";
import { Stepper } from "@/components/ui/stepper";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { NewCustomerInline } from "@/components/jobs/new-customer-inline";
import { ConflictWarning } from "@/components/jobs/conflict-warning";
import {
  LocationPicker,
  type LocationPickerAvailableUnit
} from "@/components/jobs/location-picker";
import { createJobAction } from "@/lib/actions/jobs";
import { createCustomerAction } from "@/lib/actions/customers";
import {
  findJobConflicts,
  type ConflictCheckResult
} from "@/lib/queries/job-conflicts";
import type { Customer, Driver, JenisUnit, Job, Unit } from "@/lib/types";

interface Props {
  customers: Customer[];
  drivers: Driver[];
  standbyUnits: Unit[];
  jenisUnit: JenisUnit[];
  activeJobs: Job[];
}

type SumberOrder = "wa" | "telepon" | "email" | "referral" | "repeat" | "lainnya";
type StatusPKP = "pkp" | "non_pkp" | "unknown";
type Termin = "cash" | "top14" | "top30" | "top60" | "lainnya";

const STEPS = [
  { key: "order", label: "1. Order", hint: "Customer & muatan" },
  { key: "rute", label: "2. Rute", hint: "Lokasi A → B" },
  { key: "harga", label: "3. Konfirmasi Harga", hint: "Tarif + sepakat" },
  { key: "detail", label: "4. Detail & Kendaraan", hint: "Legalitas + assign" }
];

const fmtIDR = (n: number) =>
  isNaN(n) || !isFinite(n)
    ? "0"
    : n.toLocaleString("id-ID", { maximumFractionDigits: 0 });

const parseNum = (s: string) => {
  const cleaned = s.replace(/\D/g, "");
  return cleaned === "" ? 0 : Number(cleaned);
};

export function OrderWizardView({
  customers,
  drivers,
  standbyUnits,
  jenisUnit,
  activeJobs
}: Props) {
  const router = useRouter();
  const toast = useToast();

  const [stepKey, setStepKey] = useState<(typeof STEPS)[number]["key"]>("order");
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmConflict, setConfirmConflict] =
    useState<ConflictCheckResult | null>(null);
  const [unitLocations, setUnitLocations] = useState<
    Record<string, { lat: number; lng: number } | null>
  >({});

  const [form, setForm] = useState({
    // Step 1
    customer_id: "",
    pic_nama: "",
    pic_no_hp: "",
    sumber_order: "wa" as SumberOrder,
    alat_diangkut: "",
    estimasi_tonase: "",
    target_tanggal: "",

    // Step 2
    asal: "",
    asal_lat: null as number | null,
    asal_lng: null as number | null,
    tujuan: "",
    tujuan_lat: null as number | null,
    tujuan_lng: null as number | null,
    estimasi_jarak_km: "",
    catatan_rute: "",

    // Step 3 (harga)
    tarif_dasar: "",
    biaya_tol: "",
    biaya_kawal: "",
    biaya_bongkar: "",
    biaya_inap: "",
    ppn_aktif: false,
    ppn_persen: "11",
    harga_sepakat: "",

    // Step 4A (legalitas customer)
    alamat_legal: "",
    pic_kontrak_nama: "",
    pic_kontrak_jabatan: "",
    pic_kontrak_no_hp: "",
    pic_kontrak_email: "",
    npwp: "",
    nib: "",
    status_pkp: "unknown" as StatusPKP,
    termin: "cash" as Termin,

    // Step 4B (kendaraan)
    jenis_unit_id: "",
    unit_id: "",
    driver_id: "",
    etd: "",
    eta: "",
    catatan_ops: ""
  });

  const [error, setError] = useState<Record<string, string>>({});

  // ─── Fetch unit GPS locations (untuk peta di LocationPicker) ─────────
  useEffect(() => {
    let cancelled = false;
    fetch("/api/units/locations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setUnitLocations(data.locations ?? {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const mapUnits = useMemo<LocationPickerAvailableUnit[]>(() => {
    const out: LocationPickerAvailableUnit[] = [];
    for (const u of standbyUnits) {
      const loc = unitLocations[u.id];
      if (!loc) continue;
      out.push({
        id: u.id,
        kode_unit: u.kode_unit,
        jenis_unit_nama: u.jenis_unit_nama,
        lat: loc.lat,
        lng: loc.lng
      });
    }
    return out;
  }, [standbyUnits, unitLocations]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // ─── Auto-fill saat customer dipilih ────────────────────────────────
  useEffect(() => {
    if (!form.customer_id) return;
    const c = localCustomers.find((x) => x.id === form.customer_id);
    if (!c) return;
    setForm((f) => ({
      ...f,
      alamat_legal: f.alamat_legal || c.alamat || ""
    }));
  }, [form.customer_id, localCustomers]);

  // ─── Filter unit berdasarkan jenis kendaraan dipilih ────────────────
  const filteredUnits = useMemo(() => {
    if (!form.jenis_unit_id) return standbyUnits;
    return standbyUnits.filter((u) => u.jenis_unit_id === form.jenis_unit_id);
  }, [form.jenis_unit_id, standbyUnits]);

  // ─── Reset unit_id kalau filter jenis berubah & unit current tidak match ─
  useEffect(() => {
    if (!form.unit_id) return;
    if (!filteredUnits.find((u) => u.id === form.unit_id)) {
      setForm((f) => ({ ...f, unit_id: "", driver_id: "" }));
    }
  }, [form.jenis_unit_id, filteredUnits, form.unit_id]);

  // ─── Auto-set driver default saat unit dipilih ──────────────────────
  function onUnitChange(unitId: string) {
    const unit = standbyUnits.find((u) => u.id === unitId);
    setForm((f) => {
      const next = { ...f, unit_id: unitId };
      if (unit?.default_driver_id) next.driver_id = unit.default_driver_id;
      return next;
    });
  }

  const selectedCustomer = localCustomers.find((c) => c.id === form.customer_id);
  const selectedUnit = standbyUnits.find((u) => u.id === form.unit_id);

  // ─── Hitung harga ────────────────────────────────────────────────────
  const harga = useMemo(() => {
    const tarif = parseNum(form.tarif_dasar);
    const tol = parseNum(form.biaya_tol);
    const kawal = parseNum(form.biaya_kawal);
    const bongkar = parseNum(form.biaya_bongkar);
    const inap = parseNum(form.biaya_inap);
    const subtotal = tarif + tol + kawal + bongkar + inap;
    const ppnPct = parseNum(form.ppn_persen);
    const ppnAmt = form.ppn_aktif ? Math.round((subtotal * ppnPct) / 100) : 0;
    const total = subtotal + ppnAmt;
    const sepakat = parseNum(form.harga_sepakat);
    return { tarif, tol, kawal, bongkar, inap, subtotal, ppnAmt, total, sepakat };
  }, [
    form.tarif_dasar,
    form.biaya_tol,
    form.biaya_kawal,
    form.biaya_bongkar,
    form.biaya_inap,
    form.ppn_aktif,
    form.ppn_persen,
    form.harga_sepakat
  ]);

  // ─── Conflict check ──────────────────────────────────────────────────
  const conflicts = useMemo<ConflictCheckResult>(() => {
    if (!form.unit_id || !form.driver_id || !form.etd)
      return { unit: [], driver: [], hasAny: false };
    return findJobConflicts(
      {
        unitId: form.unit_id,
        driverId: form.driver_id,
        etd: form.etd,
        eta: form.eta || null
      },
      activeJobs
    );
  }, [form.unit_id, form.driver_id, form.etd, form.eta, activeJobs]);

  // ─── Validasi per step ───────────────────────────────────────────────
  function validateStep(key: string): Record<string, string> {
    const errs: Record<string, string> = {};
    if (key === "order") {
      if (!form.customer_id) errs.customer_id = "Customer wajib dipilih";
      if (!form.alat_diangkut.trim())
        errs.alat_diangkut = "Jenis muatan wajib diisi";
      if (form.pic_no_hp && !/^(08|\+628)\d{7,12}$/.test(form.pic_no_hp))
        errs.pic_no_hp = "Format: 08xx atau +628xx";
    }
    if (key === "rute") {
      if (!form.asal.trim()) errs.asal = "Lokasi asal wajib diisi";
      if (!form.tujuan.trim()) errs.tujuan = "Lokasi tujuan wajib diisi";
    }
    if (key === "harga") {
      if (harga.sepakat <= 0)
        errs.harga_sepakat = "Harga sepakat wajib diisi (> 0)";
    }
    if (key === "detail") {
      if (!form.npwp.trim()) errs.npwp = "NPWP customer wajib diisi";
      else if (!/^[\d.\-]{15,25}$/.test(form.npwp.trim()))
        errs.npwp = "Format NPWP tidak valid";
      if (!form.jenis_unit_id)
        errs.jenis_unit_id = "Jenis kendaraan wajib dipilih";
      if (!form.unit_id) errs.unit_id = "TNKB unit wajib dipilih";
      if (!form.driver_id) errs.driver_id = "Driver wajib dipilih";
      if (!form.etd) errs.etd = "ETD wajib diisi";
      if (
        form.pic_kontrak_no_hp &&
        !/^(08|\+628)\d{7,12}$/.test(form.pic_kontrak_no_hp)
      )
        errs.pic_kontrak_no_hp = "Format: 08xx atau +628xx";
    }
    return errs;
  }

  function goNext() {
    const errs = validateStep(stepKey);
    setError(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Lengkapi field wajib dulu");
      return;
    }
    const idx = STEPS.findIndex((s) => s.key === stepKey);
    if (idx < STEPS.length - 1) setStepKey(STEPS[idx + 1].key);
  }

  function goBack() {
    const idx = STEPS.findIndex((s) => s.key === stepKey);
    if (idx > 0) setStepKey(STEPS[idx - 1].key);
  }

  function jumpTo(key: string) {
    const targetIdx = STEPS.findIndex((s) => s.key === key);
    const currentIdx = STEPS.findIndex((s) => s.key === stepKey);
    // Boleh mundur bebas; maju harus lewat validasi step demi step
    if (targetIdx <= currentIdx) setStepKey(key as typeof stepKey);
  }

  // ─── Compose catatan untuk persist field non-DB ──────────────────────
  function buildCatatan(): string {
    const lines: string[] = [];
    lines.push("[Order Wizard]");
    lines.push(`Sumber order: ${form.sumber_order}`);
    if (form.target_tanggal) lines.push(`Target muat: ${form.target_tanggal}`);
    if (form.estimasi_tonase) lines.push(`Estimasi tonase: ${form.estimasi_tonase}`);
    if (form.estimasi_jarak_km)
      lines.push(`Estimasi jarak: ${form.estimasi_jarak_km} km`);
    if (form.catatan_rute) lines.push(`Catatan rute: ${form.catatan_rute}`);

    lines.push("");
    lines.push("--- Harga ---");
    lines.push(
      `Tarif dasar: Rp ${fmtIDR(harga.tarif)} | Tol: Rp ${fmtIDR(harga.tol)} | Kawal: Rp ${fmtIDR(harga.kawal)} | Bongkar: Rp ${fmtIDR(harga.bongkar)} | Inap: Rp ${fmtIDR(harga.inap)}`
    );
    if (form.ppn_aktif)
      lines.push(`PPN ${form.ppn_persen}%: Rp ${fmtIDR(harga.ppnAmt)}`);
    lines.push(`Total penawaran: Rp ${fmtIDR(harga.total)}`);
    lines.push(`Harga SEPAKAT: Rp ${fmtIDR(harga.sepakat)}`);

    lines.push("");
    lines.push("--- Legalitas Customer ---");
    lines.push(`NPWP: ${form.npwp}`);
    if (form.nib) lines.push(`NIB: ${form.nib}`);
    lines.push(`Status: ${form.status_pkp.toUpperCase()}`);
    lines.push(`Termin pembayaran: ${form.termin}`);
    if (form.alamat_legal) lines.push(`Alamat legal: ${form.alamat_legal}`);
    if (form.pic_kontrak_nama)
      lines.push(
        `PIC kontrak: ${form.pic_kontrak_nama}${form.pic_kontrak_jabatan ? ` (${form.pic_kontrak_jabatan})` : ""}${form.pic_kontrak_no_hp ? ` - ${form.pic_kontrak_no_hp}` : ""}${form.pic_kontrak_email ? ` - ${form.pic_kontrak_email}` : ""}`
      );

    if (form.catatan_ops) {
      lines.push("");
      lines.push("--- Catatan operasional ---");
      lines.push(form.catatan_ops);
    }

    return lines.join("\n");
  }

  async function doSubmit(allowConflict: boolean) {
    setLoading(true);
    const res = await createJobAction(
      {
        customer_id: form.customer_id,
        pic_nama: form.pic_nama || null,
        pic_no_hp: form.pic_no_hp || null,
        alat_diangkut: form.alat_diangkut,
        asal: form.asal,
        tujuan: form.tujuan,
        asal_lat: form.asal_lat,
        asal_lng: form.asal_lng,
        tujuan_lat: form.tujuan_lat,
        tujuan_lng: form.tujuan_lng,
        unit_id: form.unit_id,
        driver_id: form.driver_id,
        etd: form.etd,
        eta: form.eta || null,
        catatan: buildCatatan()
      },
      { allowConflict }
    );
    setLoading(false);
    if (res.ok) {
      toast.success("Order dikonfirmasi & Job dibuat");
      setConfirmConflict(null);
      router.push(`/jobs/${res.data.id}/confirmation`);
      router.refresh();
      return;
    }
    if (res.conflicts) {
      setConfirmConflict(res.conflicts);
      return;
    }
    toast.error(res.error);
  }

  async function onFinalSubmit() {
    const errs = validateStep("detail");
    setError(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Lengkapi field wajib di Step 4");
      return;
    }
    await doSubmit(false);
  }

  const isLastStep = stepKey === "detail";

  return (
    <div className="mx-auto" style={{ maxWidth: 1000 }}>
      {/* ─── Header + Stepper ─────────────────────────────────────────── */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 18,
            flexWrap: "wrap"
          }}
        >
          <div>
            <div className="h2" style={{ marginBottom: 4 }}>
              Order Baru — Wizard
            </div>
            <div className="caption">
              Alur 4 tahap: terima order → rute → konfirmasi harga → assign
              kendaraan. Selesai Step 4, order otomatis naik jadi Job aktif.
            </div>
          </div>
          <Link
            href="/jobs"
            className="btn btn-secondary"
            style={{ textDecoration: "none" }}
          >
            Batal
          </Link>
        </div>
        <Stepper steps={STEPS} currentKey={stepKey} />
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 6,
            marginTop: 12,
            flexWrap: "wrap"
          }}
        >
          {STEPS.map((s, i) => {
            const currentIdx = STEPS.findIndex((x) => x.key === stepKey);
            const reachable = i <= currentIdx;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => jumpTo(s.key)}
                disabled={!reachable}
                style={{
                  fontSize: 11,
                  color: reachable
                    ? "var(--text-secondary)"
                    : "var(--text-tertiary)",
                  background: "transparent",
                  border: 0,
                  cursor: reachable ? "pointer" : "not-allowed",
                  padding: "2px 6px",
                  textDecoration: reachable ? "underline" : "none"
                }}
              >
                {s.hint}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── STEP 1: ORDER ────────────────────────────────────────────── */}
      {stepKey === "order" && (
        <div className="card card-pad-lg">
          <SectionHead
            icon={<Package style={{ width: 16, height: 16 }} />}
            title="Step 1 — Terima Order"
            subtitle="Catat informasi awal dari customer yang menghubungi"
          />

          <Field label="Customer" required>
            <div className="flex flex-wrap gap-2">
              <div style={{ flex: 1, minWidth: 200 }}>
                <Select
                  value={form.customer_id}
                  onChange={(e) => set("customer_id", e.target.value)}
                  error={error.customer_id}
                >
                  <option value="">Pilih customer existing</option>
                  {localCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nama_perusahaan}
                    </option>
                  ))}
                </Select>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setNewCustomerOpen(true)}
              >
                <Plus style={{ width: 14, height: 14 }} />
                Customer baru
              </button>
            </div>
          </Field>

          <div
            className="grid grid-cols-1 sm:grid-cols-2"
            style={{ gap: 12, marginTop: 12 }}
          >
            <Field label="Nama PIC customer (yang menghubungi)">
              <Input
                placeholder="Bapak/Ibu nama"
                value={form.pic_nama}
                onChange={(e) => set("pic_nama", e.target.value)}
              />
            </Field>
            <Field label="No HP / WA PIC">
              <Input
                type="tel"
                placeholder="08xxxxxxxxxx"
                value={form.pic_no_hp}
                onChange={(e) => set("pic_no_hp", e.target.value)}
                error={error.pic_no_hp}
                className="mono"
              />
            </Field>
            <Field label="Sumber order">
              <Select
                value={form.sumber_order}
                onChange={(e) =>
                  set("sumber_order", e.target.value as SumberOrder)
                }
              >
                <option value="wa">WhatsApp</option>
                <option value="telepon">Telepon</option>
                <option value="email">Email</option>
                <option value="referral">Referral</option>
                <option value="repeat">Repeat customer</option>
                <option value="lainnya">Lainnya</option>
              </Select>
            </Field>
            <Field label="Target tanggal muat">
              <Input
                type="date"
                value={form.target_tanggal}
                onChange={(e) => set("target_tanggal", e.target.value)}
              />
            </Field>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-[2fr_1fr]"
            style={{ gap: 12, marginTop: 12 }}
          >
            <Field label="Jenis muatan / alat yang diangkut" required>
              <Input
                placeholder="Contoh: Excavator Komatsu PC200-8"
                value={form.alat_diangkut}
                onChange={(e) => set("alat_diangkut", e.target.value)}
                error={error.alat_diangkut}
              />
            </Field>
            <Field label="Estimasi tonase / dimensi">
              <Input
                placeholder="Contoh: 20 ton"
                value={form.estimasi_tonase}
                onChange={(e) => set("estimasi_tonase", e.target.value)}
              />
            </Field>
          </div>
        </div>
      )}

      {/* ─── STEP 2: RUTE ─────────────────────────────────────────────── */}
      {stepKey === "rute" && (
        <div className="card card-pad-lg">
          <SectionHead
            icon={<MapPin style={{ width: 16, height: 16 }} />}
            title="Step 2 — Rute Pengangkutan"
            subtitle="Tentukan lokasi muat (A) dan lokasi bongkar (B)"
          />

          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Lokasi muat (A)" required>
              <LocationPicker
                value={{
                  address: form.asal,
                  lat: form.asal_lat,
                  lng: form.asal_lng
                }}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    asal: v.address,
                    asal_lat: v.lat,
                    asal_lng: v.lng
                  }))
                }
                placeholder="Alamat lengkap titik pickup"
                error={error.asal}
                availableUnits={mapUnits}
              />
            </Field>
            <Field label="Lokasi bongkar (B)" required>
              <LocationPicker
                value={{
                  address: form.tujuan,
                  lat: form.tujuan_lat,
                  lng: form.tujuan_lng
                }}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    tujuan: v.address,
                    tujuan_lat: v.lat,
                    tujuan_lng: v.lng
                  }))
                }
                placeholder="Alamat lengkap titik drop"
                error={error.tujuan}
                availableUnits={mapUnits}
              />
            </Field>
            <div
              className="grid grid-cols-1 sm:grid-cols-2"
              style={{ gap: 12 }}
            >
              <Field
                label="Estimasi jarak (km)"
                hint="Boleh kosong — sistem hitung dari koordinat"
              >
                <Input
                  type="number"
                  placeholder="Contoh: 120"
                  value={form.estimasi_jarak_km}
                  onChange={(e) => set("estimasi_jarak_km", e.target.value)}
                />
              </Field>
              <Field label="Catatan rute">
                <Input
                  placeholder="Jalan rusak, jembatan timbang, izin khusus…"
                  value={form.catatan_rute}
                  onChange={(e) => set("catatan_rute", e.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 3: HARGA ────────────────────────────────────────────── */}
      {stepKey === "harga" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]" style={{ gap: 16 }}>
          <div className="card card-pad-lg">
            <SectionHead
              icon={<Wallet style={{ width: 16, height: 16 }} />}
              title="Step 3 — Konfirmasi Harga"
              subtitle="Hitung komponen penawaran, lalu input harga sepakat dengan customer"
            />

            <div
              className="grid grid-cols-1 sm:grid-cols-2"
              style={{ gap: 12 }}
            >
              <Field label="Tarif dasar rute (Rp)">
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.tarif_dasar}
                  onChange={(e) => set("tarif_dasar", e.target.value)}
                  className="mono"
                />
              </Field>
              <Field label="Biaya tol & retribusi (Rp)">
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.biaya_tol}
                  onChange={(e) => set("biaya_tol", e.target.value)}
                  className="mono"
                />
              </Field>
              <Field label="Biaya kawal / patwal (Rp)">
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.biaya_kawal}
                  onChange={(e) => set("biaya_kawal", e.target.value)}
                  className="mono"
                />
              </Field>
              <Field label="Biaya bongkar muat (Rp)">
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.biaya_bongkar}
                  onChange={(e) => set("biaya_bongkar", e.target.value)}
                  className="mono"
                />
              </Field>
              <Field label="Biaya menginap driver (Rp)">
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.biaya_inap}
                  onChange={(e) => set("biaya_inap", e.target.value)}
                  className="mono"
                />
              </Field>
              <div>
                <label className="field-label" style={{ display: "block" }}>
                  PPN
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      fontSize: 13,
                      cursor: "pointer"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.ppn_aktif}
                      onChange={(e) => set("ppn_aktif", e.target.checked)}
                    />
                    Tambahkan PPN
                  </label>
                  <Input
                    type="number"
                    value={form.ppn_persen}
                    onChange={(e) => set("ppn_persen", e.target.value)}
                    disabled={!form.ppn_aktif}
                    style={{ width: 70 }}
                    className="mono"
                  />
                  <span className="caption">%</span>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: "0.5px dashed var(--border-default)"
              }}
            >
              <Field label="Harga SEPAKAT dengan customer (Rp)" required>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.harga_sepakat}
                  onChange={(e) => set("harga_sepakat", e.target.value)}
                  error={error.harga_sepakat}
                  className="mono"
                  style={{ fontSize: 16, fontWeight: 600 }}
                />
              </Field>
              <div className="caption" style={{ marginTop: 4 }}>
                Boleh berbeda dari total penawaran (hasil negosiasi). Wajib diisi
                sebelum lanjut.
              </div>
            </div>
          </div>

          {/* Right side: ringkasan harga */}
          <div
            style={{
              position: "sticky",
              top: 80,
              alignSelf: "start"
            }}
          >
            <div className="card card-pad">
              <div className="h3" style={{ marginBottom: 12 }}>
                Ringkasan Harga
              </div>
              <PriceRow label="Tarif dasar" value={harga.tarif} />
              <PriceRow label="Tol & retribusi" value={harga.tol} />
              <PriceRow label="Kawal" value={harga.kawal} />
              <PriceRow label="Bongkar muat" value={harga.bongkar} />
              <PriceRow label="Menginap driver" value={harga.inap} />
              <PriceRow label="Subtotal" value={harga.subtotal} bold />
              {form.ppn_aktif && (
                <PriceRow
                  label={`PPN ${form.ppn_persen}%`}
                  value={harga.ppnAmt}
                />
              )}
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: "0.5px solid var(--border-default)"
                }}
              >
                <PriceRow
                  label="Total penawaran"
                  value={harga.total}
                  bold
                  big
                />
              </div>
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  background:
                    harga.sepakat > 0
                      ? "var(--brand-primary-light)"
                      : "var(--bg-muted)",
                  borderRadius: 8
                }}
              >
                <div
                  className="eyebrow"
                  style={{
                    color:
                      harga.sepakat > 0
                        ? "var(--brand-primary-dark)"
                        : "var(--text-tertiary)"
                  }}
                >
                  Harga sepakat
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color:
                      harga.sepakat > 0
                        ? "var(--brand-primary-dark)"
                        : "var(--text-tertiary)"
                  }}
                >
                  Rp {fmtIDR(harga.sepakat)}
                </div>
                {harga.sepakat > 0 && harga.total > 0 && (
                  <div
                    className="caption"
                    style={{ marginTop: 2, fontSize: 11 }}
                  >
                    {harga.sepakat === harga.total
                      ? "Sama dengan penawaran"
                      : harga.sepakat > harga.total
                        ? `+ Rp ${fmtIDR(harga.sepakat - harga.total)} dari penawaran`
                        : `− Rp ${fmtIDR(harga.total - harga.sepakat)} dari penawaran`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 4: DETAIL & KENDARAAN ───────────────────────────────── */}
      {stepKey === "detail" && (
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16 }}>
          {/* 4A: Legalitas customer */}
          <div className="card card-pad-lg">
            <SectionHead
              icon={<Building2 style={{ width: 16, height: 16 }} />}
              title="4A — Detail & Legalitas Customer"
              subtitle="Diisi admin — data administrasi untuk invoice & dokumen"
            />

            <Field label="Nama perusahaan customer">
              <Input
                value={selectedCustomer?.nama_perusahaan ?? ""}
                disabled
                style={{ background: "var(--bg-muted)" }}
              />
            </Field>
            <div style={{ marginTop: 12 }}>
              <Field
                label="Alamat sesuai NPWP / domisili"
                hint="Auto-fill dari master customer kalau ada"
              >
                <Textarea
                  rows={2}
                  placeholder="Alamat lengkap perusahaan"
                  value={form.alamat_legal}
                  onChange={(e) => set("alamat_legal", e.target.value)}
                />
              </Field>
            </div>

            <div
              className="grid grid-cols-1 sm:grid-cols-2"
              style={{ gap: 12, marginTop: 12 }}
            >
              <Field label="Nama PIC kontrak">
                <Input
                  placeholder="Berwenang teken"
                  value={form.pic_kontrak_nama}
                  onChange={(e) => set("pic_kontrak_nama", e.target.value)}
                />
              </Field>
              <Field label="Jabatan">
                <Input
                  placeholder="Direktur / Manager / Procurement"
                  value={form.pic_kontrak_jabatan}
                  onChange={(e) => set("pic_kontrak_jabatan", e.target.value)}
                />
              </Field>
              <Field label="No HP PIC kontrak">
                <Input
                  type="tel"
                  placeholder="08xxxxxxxxxx"
                  value={form.pic_kontrak_no_hp}
                  onChange={(e) => set("pic_kontrak_no_hp", e.target.value)}
                  error={error.pic_kontrak_no_hp}
                  className="mono"
                />
              </Field>
              <Field label="Email PIC kontrak">
                <Input
                  type="email"
                  placeholder="pic@perusahaan.co.id"
                  value={form.pic_kontrak_email}
                  onChange={(e) => set("pic_kontrak_email", e.target.value)}
                />
              </Field>
            </div>

            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "0.5px dashed var(--border-default)"
              }}
            >
              <div
                className="eyebrow"
                style={{ marginBottom: 8, color: "var(--text-secondary)" }}
              >
                <FileText
                  style={{
                    width: 12,
                    height: 12,
                    display: "inline-block",
                    marginRight: 4,
                    verticalAlign: -2
                  }}
                />
                Data Legalitas Perusahaan
              </div>
              <div
                className="grid grid-cols-1 sm:grid-cols-2"
                style={{ gap: 12 }}
              >
                <Field label="NPWP" required>
                  <Input
                    placeholder="00.000.000.0-000.000"
                    value={form.npwp}
                    onChange={(e) => set("npwp", e.target.value)}
                    error={error.npwp}
                    className="mono"
                  />
                </Field>
                <Field label="NIB">
                  <Input
                    placeholder="13 digit"
                    value={form.nib}
                    onChange={(e) => set("nib", e.target.value)}
                    className="mono"
                  />
                </Field>
                <Field label="Status PKP">
                  <Select
                    value={form.status_pkp}
                    onChange={(e) =>
                      set("status_pkp", e.target.value as StatusPKP)
                    }
                  >
                    <option value="unknown">Belum diketahui</option>
                    <option value="pkp">PKP</option>
                    <option value="non_pkp">Non-PKP</option>
                  </Select>
                </Field>
                <Field label="Termin pembayaran">
                  <Select
                    value={form.termin}
                    onChange={(e) => set("termin", e.target.value as Termin)}
                  >
                    <option value="cash">Cash / di muka</option>
                    <option value="top14">TOP 14 hari</option>
                    <option value="top30">TOP 30 hari</option>
                    <option value="top60">TOP 60 hari</option>
                    <option value="lainnya">Lainnya</option>
                  </Select>
                </Field>
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                background: "var(--brand-primary-light)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--brand-primary-dark)",
                lineHeight: 1.5
              }}
            >
              Harga sepakat:{" "}
              <strong className="mono">Rp {fmtIDR(harga.sepakat)}</strong>
              <br />
              <span style={{ fontSize: 11, opacity: 0.85 }}>
                ↑ otomatis dari Step 3
              </span>
            </div>
          </div>

          {/* 4B: Kendaraan */}
          <div className="card card-pad-lg">
            <SectionHead
              icon={<Truck style={{ width: 16, height: 16 }} />}
              title="4B — Assign Kendaraan"
              subtitle="Diisi PIC operasional — pilih jenis & TNKB unit yang sesuai"
            />

            <Field label="Jenis kendaraan" required>
              <Select
                value={form.jenis_unit_id}
                onChange={(e) => set("jenis_unit_id", e.target.value)}
                error={error.jenis_unit_id}
              >
                <option value="">Pilih jenis kendaraan</option>
                {jenisUnit.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nama}
                  </option>
                ))}
              </Select>
            </Field>

            <div style={{ marginTop: 12 }}>
              <Field
                label="TNKB unit"
                required
                hint={
                  form.jenis_unit_id
                    ? `${filteredUnits.length} unit ${jenisUnit.find((j) => j.id === form.jenis_unit_id)?.nama ?? ""} standby`
                    : "Pilih jenis kendaraan dulu untuk filter daftar"
                }
              >
                <Select
                  value={form.unit_id}
                  onChange={(e) => onUnitChange(e.target.value)}
                  error={error.unit_id}
                  disabled={!form.jenis_unit_id}
                >
                  <option value="">Pilih TNKB</option>
                  {filteredUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.no_polisi} — {u.kode_unit}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div
              className="grid grid-cols-1 sm:grid-cols-2"
              style={{ gap: 12, marginTop: 12 }}
            >
              <Field
                label="Driver"
                required
                hint={
                  selectedUnit?.default_driver_nama
                    ? `Default: ${selectedUnit.default_driver_nama}`
                    : undefined
                }
              >
                <Select
                  value={form.driver_id}
                  onChange={(e) => set("driver_id", e.target.value)}
                  error={error.driver_id}
                  disabled={!form.unit_id}
                >
                  <option value="">Pilih driver</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nama} — {d.no_hp}
                      {d.id === selectedUnit?.default_driver_id
                        ? "  (default)"
                        : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tanggal & jam berangkat (ETD)" required>
                <Input
                  type="datetime-local"
                  value={form.etd}
                  onChange={(e) => set("etd", e.target.value)}
                  error={error.etd}
                />
              </Field>
              <Field label="Estimasi sampai (ETA)">
                <Input
                  type="datetime-local"
                  value={form.eta}
                  onChange={(e) => set("eta", e.target.value)}
                />
              </Field>
              <Field label="Catatan operasional">
                <Input
                  placeholder="Izin masuk lokasi, jadwal khusus…"
                  value={form.catatan_ops}
                  onChange={(e) => set("catatan_ops", e.target.value)}
                />
              </Field>
            </div>

            {conflicts.hasAny && (
              <div style={{ marginTop: 12 }}>
                <ConflictWarning conflicts={conflicts} />
              </div>
            )}

            {/* Ringkasan singkat sebelum submit */}
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                background: "var(--bg-muted)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.6
              }}
            >
              <CheckCircle2
                style={{
                  width: 14,
                  height: 14,
                  display: "inline-block",
                  marginRight: 4,
                  verticalAlign: -2,
                  color: "var(--brand-primary-dark)"
                }}
              />
              Saat dikonfirmasi, order ini langsung jadi <strong>Job aktif</strong>{" "}
              dengan status <strong>Menunggu pickup</strong>. Field harga &
              legalitas disimpan di catatan job.
            </div>
          </div>
        </div>
      )}

      {/* ─── Bottom Navigation ────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          marginTop: 16
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={goBack}
          disabled={stepKey === "order"}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Kembali
        </button>
        {!isLastStep ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={goNext}
          >
            Lanjut
            <ArrowRight style={{ width: 14, height: 14 }} />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onFinalSubmit}
            disabled={loading}
          >
            {loading ? "Memproses…" : "Konfirmasi & Buat Job"}
            <CheckCircle2 style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>

      {/* ─── Customer baru modal ──────────────────────────────────────── */}
      <NewCustomerInline
        open={newCustomerOpen}
        onClose={() => setNewCustomerOpen(false)}
        onCreate={async (data) => {
          const res = await createCustomerAction(data);
          if (res.ok) {
            setLocalCustomers((prev) => [
              {
                id: res.data.id,
                nama_perusahaan: res.data.nama_perusahaan,
                is_active: true,
                created_at: new Date().toISOString()
              } as Customer,
              ...prev
            ]);
            set("customer_id", res.data.id);
            setNewCustomerOpen(false);
            toast.success("Customer ditambahkan");
          } else toast.error(res.error);
        }}
      />

      {/* ─── Konflik konfirm dialog ───────────────────────────────────── */}
      <ConfirmDialog
        open={confirmConflict !== null}
        onClose={() => setConfirmConflict(null)}
        title="Tetap simpan meski ada bentrok jadwal?"
        body={
          confirmConflict && (
            <div className="space-y-3 text-left">
              <p>
                Job ini bentrok dengan{" "}
                {(confirmConflict.unit.length || 0) +
                  (confirmConflict.driver.length || 0)}{" "}
                job aktif lain. Pastikan koordinasi penjadwalan sudah dilakukan
                manual.
              </p>
              <ConflictWarning conflicts={confirmConflict} />
            </div>
          )
        }
        confirmText="Ya, tetap simpan"
        variant="danger"
        loading={loading}
        onConfirm={() => doSubmit(true)}
      />
    </div>
  );
}

// ─── Sub-komponen ──────────────────────────────────────────────────────

function SectionHead({
  icon,
  title,
  subtitle
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: "0.5px solid var(--border-default)"
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "var(--brand-primary-light)",
          color: "var(--brand-primary-dark)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}
      >
        {icon}
      </div>
      <div>
        <div className="h3" style={{ marginBottom: 2 }}>
          {title}
        </div>
        {subtitle && <div className="caption">{subtitle}</div>}
      </div>
    </div>
  );
}

function PriceRow({
  label,
  value,
  bold,
  big
}: {
  label: string;
  value: number;
  bold?: boolean;
  big?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        padding: "4px 0",
        fontSize: big ? 14 : 12.5,
        fontWeight: bold ? 600 : 400,
        color: bold ? "var(--text-primary)" : "var(--text-secondary)"
      }}
    >
      <span>{label}</span>
      <span className="mono">Rp {fmtIDR(value)}</span>
    </div>
  );
}
