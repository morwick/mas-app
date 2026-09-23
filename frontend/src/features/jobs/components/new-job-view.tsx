import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { Info, Plus, Sparkles, TriangleAlert, Truck } from "lucide-react";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { NewCustomerInline } from "@/features/jobs/components/new-customer-inline";
import { ConflictWarning } from "@/features/jobs/components/conflict-warning";
import { JobStepper } from "@/features/jobs/components/job-stepper";
import {
  LocationPicker,
  type LocationPickerAvailableUnit
} from "@/features/jobs/components/location-picker";
import { createJob } from "@/features/jobs/api";
import { fleetLocations, unitLocation } from "@/features/tracking/api";
import { createCustomer } from "@/features/customers/api";
import {
  findJobConflicts,
  type ConflictCheckResult
} from "@/lib/job-conflicts";
import { minEtdValue, validateSchedule } from "@/lib/job-schedule";
import type { Customer, Driver, Job, Unit } from "@/types";

/**
 * Data awal saat form dibuka dari penawaran yang sudah deal.
 *
 * Harga tidak punya kolom sendiri di tabel jobs, jadi ringkasannya ikut masuk
 * ke `catatan`; angka resminya tetap tinggal di penawaran, dan job menyimpan
 * `quotation_id` sebagai penunjuknya.
 */
export interface JobPrefill {
  quotation_id: string;
  quote_number: string;
  /** Jumlah baris rute di penawaran — form ini hanya memodelkan satu A → B. */
  jumlah_rute: number;
  customer_id?: string;
  pic_nama?: string;
  pic_no_hp?: string;
  alat_diangkut?: string;
  asal?: string;
  tujuan?: string;
  catatan?: string;
}

interface Props {
  customers: Customer[];
  drivers: Driver[];
  standbyUnits: Unit[];
  activeJobs: Job[];
  prefill?: JobPrefill;
}

function FormSection({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginBottom: 24,
        paddingBottom: 20,
        borderBottom: "0.5px dashed var(--border-default)"
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div className="h3" style={{ marginBottom: 2 }}>
          {title}
        </div>
        {subtitle && <div className="caption">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

export function NewJobView({
  customers,
  drivers,
  standbyUnits,
  activeJobs,
  prefill
}: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [fetchingUnitLoc, setFetchingUnitLoc] = useState(false);
  const [form, setForm] = useState({
    customer_id: prefill?.customer_id ?? "",
    pic_nama: prefill?.pic_nama ?? "",
    pic_no_hp: prefill?.pic_no_hp ?? "",
    alat_diangkut: prefill?.alat_diangkut ?? "",
    asal: prefill?.asal ?? "",
    tujuan: prefill?.tujuan ?? "",
    asal_lat: null as number | null,
    asal_lng: null as number | null,
    tujuan_lat: null as number | null,
    tujuan_lng: null as number | null,
    unit_id: "",
    driver_id: "",
    etd: "",
    eta: "",
    // BR-04: uang jalan sudah diketahui sejak awal — wajib.
    uang_jalan_pagu: "",
    catatan: prefill?.catatan ?? ""
  });
  const [error, setError] = useState<Record<string, string>>({});
  const [confirmConflict, setConfirmConflict] =
    useState<ConflictCheckResult | null>(null);
  const [unitLocations, setUnitLocations] = useState<
    Record<string, { lat: number; lng: number } | null>
  >({});

  // Fetch posisi GPS unit aktif sekali saat mount. Dipakai untuk render
  // marker unit-unit standby di dalam modal pin lokasi (asal & tujuan)
  // — admin bisa langsung lihat unit mana yang paling dekat ke titik
  // yang lagi di-pin.
  useEffect(() => {
    let cancelled = false;
    fleetLocations()
      .then((data) => {
        if (cancelled) return;
        setUnitLocations(data.locations ?? {});
      })
      .catch(() => {
        // diam — modal tetap berfungsi tanpa marker unit
      });
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

  async function useUnitLocationAsAsal() {
    if (!form.unit_id) {
      toast.error("Pilih unit dulu");
      return;
    }
    setFetchingUnitLoc(true);
    try {
      const data = await unitLocation(form.unit_id);
      setForm((f) => ({
        ...f,
        asal: data.address ?? f.asal,
        asal_lat: data.lat,
        asal_lng: data.lng
      }));
      toast.success("Lokasi asal di-set ke posisi unit sekarang");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal ambil lokasi unit");
    } finally {
      setFetchingUnitLoc(false);
    }
  }

  /**
   * PIC job mengikuti customer yang dipilih: begitu customer ganti, nama & no HP
   * PIC diisi ulang dari data master. Tetap bisa ditimpa manual — PIC di lapangan
   * sering berbeda dengan PIC yang tercatat di master customer.
   */
  function onCustomerChange(customerId: string) {
    if (customerId === form.customer_id) return;
    const customer = localCustomers.find((c) => c.id === customerId);
    setForm((f) => ({
      ...f,
      customer_id: customerId,
      pic_nama: customer?.pic_nama ?? "",
      pic_no_hp: customer?.pic_no_hp ?? ""
    }));
    // Nilai baru datang tanpa user menyentuh field-nya; error lama jadi basi.
    setError(({ customer_id: _c, pic_nama: _n, pic_no_hp: _h, ...rest }) => rest);
  }

  function onUnitChange(unitId: string) {
    const unit = standbyUnits.find((u) => u.id === unitId);
    setForm((f) => {
      const next = { ...f, unit_id: unitId };
      if (unit?.default_driver_id) next.driver_id = unit.default_driver_id;
      return next;
    });
  }

  // Batas bawah picker ETD — dihitung sekali saat form dibuka supaya tidak
  // berubah-ubah di tengah pengisian.
  const minEtd = useMemo(() => minEtdValue(), []);

  const selectedUnit = standbyUnits.find((u) => u.id === form.unit_id);
  // Muncul begitu dropdown unit diganti ke unit tanpa GPS — konsekuensinya
  // ditanggung customer, jadi admin perlu tahu sebelum menyimpan.
  const unitWithoutGps =
    selectedUnit && !selectedUnit.imei_gps ? selectedUnit : null;
  const driverChangedFromDefault =
    !!selectedUnit?.default_driver_id &&
    !!form.driver_id &&
    form.driver_id !== selectedUnit.default_driver_id;

  const customerOptions = useMemo<ComboboxOption[]>(
    () =>
      localCustomers.map((c) => ({
        value: c.id,
        label: c.nama_perusahaan,
        // Kota & PIC ikut jadi kata kunci pencarian, bukan sekadar hiasan.
        hint: [c.kota, c.pic_nama].filter(Boolean).join(" · ") || undefined
      })),
    [localCustomers]
  );

  const unitOptions = useMemo<ComboboxOption[]>(
    () =>
      standbyUnits.map((u) => ({
        value: u.id,
        label: `${u.kode_unit} — ${u.jenis_unit_nama}`,
        hint: u.no_polisi
      })),
    [standbyUnits]
  );

  const driverOptions = useMemo<ComboboxOption[]>(
    () =>
      drivers.map((d) => ({
        value: d.id,
        label: d.nama,
        hint:
          d.status === "in_job"
            ? `${d.no_hp} · In Job: ${d.active_job_number ?? "—"}`
            : d.id === selectedUnit?.default_driver_id
              ? `${d.no_hp} · driver tetap unit ini`
              : d.no_hp,
        // Driver yang sedang jalan tetap ditampilkan (biar jelas kenapa tak bisa
        // dipilih) tapi tidak bisa diklik — sama seperti <option disabled>.
        disabled: d.status === "in_job"
      })),
    [drivers, selectedUnit]
  );

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

  const valid =
    form.customer_id &&
    form.pic_nama.trim() &&
    form.pic_no_hp.trim() &&
    form.alat_diangkut &&
    form.asal &&
    form.tujuan &&
    form.unit_id &&
    form.driver_id &&
    form.etd &&
    Number(form.uang_jalan_pagu) > 0;

  async function doSubmit(allowConflict: boolean) {
    setLoading(true);
    const res = await createJob(
      {
        ...form,
        uang_jalan_pagu: Math.round(Number(form.uang_jalan_pagu)),
        quotation_id: prefill?.quotation_id ?? null
      },
      { allowConflict }
    );
    setLoading(false);
    if (res.ok) {
      toast.success("Job berhasil dibuat");
      setConfirmConflict(null);
      navigate(`/jobs/${res.data.id}/confirmation`);
      return;
    }
    if (res.conflicts) {
      setConfirmConflict(res.conflicts);
      return;
    }
    toast.error(res.error);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.customer_id) errs.customer_id = "Customer wajib dipilih";
    if (!form.pic_nama.trim()) errs.pic_nama = "PIC wajib diisi";
    if (!form.alat_diangkut.trim()) errs.alat_diangkut = "Alat wajib diisi";
    if (!form.asal.trim()) errs.asal = "Lokasi asal wajib diisi";
    if (!form.tujuan.trim()) errs.tujuan = "Lokasi tujuan wajib diisi";
    if (!form.unit_id) errs.unit_id = "Unit wajib dipilih";
    if (!form.driver_id) errs.driver_id = "Driver wajib dipilih";
    if (!form.etd) errs.etd = "ETD wajib diisi";
    Object.assign(errs, validateSchedule(form.etd, form.eta));
    //if (!(Number(form.uang_jalan_pagu) > 0)) errs.uang_jalan_pagu = "Uang jalan wajib diisi";
    if (!form.pic_no_hp.trim()) errs.pic_no_hp = "No HP PIC wajib diisi";
    else if (!/^(08|\+628)\d{7,12}$/.test(form.pic_no_hp.trim()))
      errs.pic_no_hp = "Format: 08xxxxxxxxxx atau +628xxxxxxxxxx";
    setError(errs);
    if (Object.keys(errs).length > 0) return;

    await doSubmit(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4"
      style={{ maxWidth: 1000 }}
    >
      {prefill && (
        <div
          className="card card-pad lg:col-span-2"
          style={{
            borderLeft: "3px solid var(--brand-primary)",
            fontSize: 13
          }}
        >
          <strong>Data diambil dari penawaran {prefill.quote_number}.</strong>{" "}
          Customer, alat, dan rute sudah terisi — tinggal pilih unit, driver,
          dan jadwal berangkat.
          {prefill.jumlah_rute > 1 && (
            <>
              {" "}
              Penawaran ini punya {prefill.jumlah_rute - 1} rute lain; masing-masing
              perlu dibuatkan job tersendiri.
            </>
          )}
        </div>
      )}

      <div className="card card-pad-lg">
        <FormSection
          title="Customer & PIC"
          subtitle="Pilih customer dari master data atau tambah baru"
        >
          <Field label="Customer" required>
            <div className="flex flex-wrap gap-2">
              <div style={{ flex: 1, minWidth: 200 }}>
                <Combobox
                  value={form.customer_id}
                  onChange={onCustomerChange}
                  options={customerOptions}
                  placeholder="Pilih customer"
                  searchPlaceholder="Cari nama perusahaan, kota, PIC…"
                  emptyText="Customer tidak ditemukan"
                  clearable
                  error={error.customer_id}
                />
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
            <Field
              label="PIC di lapangan"
              required
              hint="Boleh disesuaikan dengan yang standby di lapangan."
            >
              <Input
                placeholder="Bapak/Ibu nama"
                value={form.pic_nama}
                onChange={(e) => set("pic_nama", e.target.value)}
                error={error.pic_nama}
              />
            </Field>
            <Field label="No HP PIC" required>
              <Input
                type="tel"
                placeholder="0812xxxxxxxx"
                value={form.pic_no_hp}
                onChange={(e) => set("pic_no_hp", e.target.value)}
                error={error.pic_no_hp}
                className="mono"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Detail pengiriman"
          subtitle="Alat yang diangkut, asal, dan tujuan"
        >
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Alat yang diangkut" required>
              <Input
                placeholder="Contoh: Excavator Komatsu PC200-8"
                value={form.alat_diangkut}
                onChange={(e) => set("alat_diangkut", e.target.value)}
                error={error.alat_diangkut}
              />
            </Field>
            <Field label="Lokasi asal" required>
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
                extra={{
                  label: "Pakai lokasi unit",
                  icon: <Truck style={{ width: 12, height: 12 }} />,
                  onClick: useUnitLocationAsAsal,
                  loading: fetchingUnitLoc,
                  disabled: !form.unit_id,
                  hint: form.unit_id
                    ? "Ambil posisi GPS terkini unit yang dipilih"
                    : "Pilih unit dulu di bawah"
                }}
              />
            </Field>
            <Field label="Lokasi tujuan" required>
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
          </div>
        </FormSection>

        <FormSection
          title="Assign unit & driver"
          subtitle="Dropdown unit otomatis filter status Standby"
        >
          <div
            className="grid grid-cols-1 sm:grid-cols-2"
            style={{ gap: 12 }}
          >
            <Field
              label="Unit"
              required
              hint={
                unitWithoutGps
                  ? undefined // peringatan di bawah sudah jadi barisnya sendiri
                  : standbyUnits.length === 0
                    ? "Tidak ada unit standby"
                    : `${standbyUnits.length} unit standby tersedia`
              }
            >
              <Combobox
                value={form.unit_id}
                onChange={onUnitChange}
                options={unitOptions}
                placeholder="Pilih unit standby"
                searchPlaceholder="Cari kode unit, jenis, no polisi…"
                emptyText="Tidak ada unit standby yang cocok"
                clearable
                error={error.unit_id}
              />
              {unitWithoutGps && (
                <p className="field-warning">
                  <TriangleAlert style={{ width: 13, height: 13 }} />
                  <span>
                    Unit {unitWithoutGps.kode_unit} belum punya link TrackSolid
                    — customer tidak melihat peta real-time, hanya link-out.
                    Tambahkan di form unit.
                  </span>
                </p>
              )}
            </Field>
            <Field
              label="Driver"
              required
              hint={
                selectedUnit?.default_driver_nama
                  ? driverChangedFromDefault
                    ? `Override dari driver tetap (${selectedUnit.default_driver_nama})`
                    : `Driver tetap unit ${selectedUnit.kode_unit}`
                  : selectedUnit && !selectedUnit.default_driver_id
                    ? "Unit ini belum punya driver tetap"
                    : undefined
              }
            >
              <Combobox
                value={form.driver_id}
                onChange={(v) => set("driver_id", v)}
                options={driverOptions}
                placeholder="Pilih driver"
                searchPlaceholder="Cari nama atau no HP driver…"
                emptyText="Driver tidak ditemukan"
                clearable
                error={error.driver_id}
              />
            </Field>
            <Field label="Tanggal & jam pickup (ETD)" required>
              <Input
                type="datetime-local"
                min={minEtd}
                value={form.etd}
                onChange={(e) => set("etd", e.target.value)}
                error={error.etd}
              />
            </Field>
            <Field
              label="Estimasi sampai (ETA)"
              hint="Bila kosong, sistem mengisi dari durasi rute (ditandai perkiraan sistem)"
            >
              <Input
                type="datetime-local"
                min={form.etd || minEtd}
                value={form.eta}
                onChange={(e) => set("eta", e.target.value)}
                error={error.eta}
              />
            </Field>
            <Field
              label="Uang jalan"
              required
              hint="Uang jalan yang disepakati untuk perjalanan ini. Driver dapat mengajukan pencairan bertahap dari sini."
            >
              <CurrencyInput
                placeholder="2.500.000"
                value={form.uang_jalan_pagu}
                onChange={(v) => set("uang_jalan_pagu", v)}
                error={error.uang_jalan_pagu}
              />
            </Field>
          </div>
          {conflicts.hasAny && (
            <div style={{ marginTop: 12 }}>
              <ConflictWarning conflicts={conflicts} />
            </div>
          )}
        </FormSection>

        <FormSection title="Catatan" subtitle="Bisa diisi belakangan">
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Catatan internal">
              <Textarea
                rows={2}
                placeholder="Catatan untuk admin (tidak ditampilkan ke customer)"
                value={form.catatan}
                onChange={(e) => set("catatan", e.target.value)}
              />
            </Field>
          </div>
        </FormSection>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 8
          }}
        >
          <Link
            to="/jobs"
            className="btn btn-secondary"
            style={{ textDecoration: "none" }}
          >
            Batal
          </Link>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!valid || loading}
          >
            {loading ? "Menyimpan…" : "Simpan job"}
          </button>
        </div>
      </div>

      {/* Right preview sidebar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          position: "sticky",
          top: 80,
          alignSelf: "start"
        }}
      >
        <div
          className="card card-pad"
          style={{
            background: "var(--brand-primary-light)",
            border: "0.5px solid #B5DFA0"
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start"
            }}
          >
            <Sparkles
              style={{
                width: 18,
                height: 18,
                color: "var(--brand-primary-dark)",
                flexShrink: 0,
                marginTop: 1
              }}
            />
            <div>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--brand-primary-dark)",
                  marginBottom: 4
                }}
              >
                Apa yang akan terjadi setelah disimpan?
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 12,
                  color: "var(--brand-primary-dark)",
                  lineHeight: 1.5,
                  // Preflight Tailwind mematikan list-style; tanpa ini antar
                  // poin menyambung dan sulit dibedakan saat teksnya membungkus.
                  listStyle: "disc outside",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6
                }}
              >
                <li>
                  Tersedia template WhatsApp pemberitahuan ke customer yang
                  siap copy
                </li>
                <li>Customer dapat link tracking melalui WhatsApp</li>
                <li>Driver menerima notifikasi pemberitahuan</li>
                <li>
                  Unit berubah status menjadi <strong>Bertugas</strong>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="h3" style={{ marginBottom: 4 }}>
            Preview status
          </div>
          <div className="caption" style={{ marginBottom: 12, lineHeight: 1.5 }}>
            Job dibuat di tahap pertama, lalu naik seiring progres di lapangan.
          </div>
          {/* Sidebar hanya selebar 280px — stepper horizontal membuat label
              antar tahap saling menimpa, jadi di sini dipakai yang vertikal. */}
          <JobStepper status="ditugaskan" orientation="vertical" />
        </div>
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
          // PIC customer baru langsung dipakai sebagai PIC job — sama seperti
          // memilih customer lama yang sudah punya PIC di master.
          setForm((f) => ({
            ...f,
            customer_id: res.data.id,
            pic_nama: data.pic_nama,
            pic_no_hp: data.pic_no_hp
          }));
          setError(({ customer_id: _c, pic_nama: _n, pic_no_hp: _h, ...rest }) => rest);
          setNewCustomerOpen(false);
          toast.success("Customer ditambahkan");
          return true;
        }}
      />

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
                job aktif lain. Pastikan Anda sudah mengkoordinasikan
                penjadwalan secara manual sebelum simpan.
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

      {/* Silence unused warnings */}
      <Info style={{ display: "none" }} />
    </form>
  );
}
