"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Plus, Sparkles } from "lucide-react";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { NewCustomerInline } from "@/components/jobs/new-customer-inline";
import { ConflictWarning } from "@/components/jobs/conflict-warning";
import { JobStepper } from "@/components/jobs/job-stepper";
import { LocationPicker } from "@/components/jobs/location-picker";
import { createJobAction } from "@/lib/actions/jobs";
import { createCustomerAction } from "@/lib/actions/customers";
import {
  findJobConflicts,
  type ConflictCheckResult
} from "@/lib/queries/job-conflicts";
import type { Customer, Driver, Job, Unit } from "@/lib/types";

interface Props {
  customers: Customer[];
  drivers: Driver[];
  standbyUnits: Unit[];
  activeJobs: Job[];
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
  activeJobs
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [form, setForm] = useState({
    customer_id: "",
    pic_nama: "",
    pic_no_hp: "",
    alat_diangkut: "",
    asal: "",
    tujuan: "",
    asal_lat: null as number | null,
    asal_lng: null as number | null,
    tujuan_lat: null as number | null,
    tujuan_lng: null as number | null,
    unit_id: "",
    driver_id: "",
    etd: "",
    eta: "",
    catatan: ""
  });
  const [error, setError] = useState<Record<string, string>>({});
  const [confirmConflict, setConfirmConflict] =
    useState<ConflictCheckResult | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onUnitChange(unitId: string) {
    const unit = standbyUnits.find((u) => u.id === unitId);
    setForm((f) => {
      const next = { ...f, unit_id: unitId };
      if (unit?.default_driver_id) next.driver_id = unit.default_driver_id;
      return next;
    });
  }

  const selectedUnit = standbyUnits.find((u) => u.id === form.unit_id);
  const driverChangedFromDefault =
    !!selectedUnit?.default_driver_id &&
    !!form.driver_id &&
    form.driver_id !== selectedUnit.default_driver_id;

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
    form.alat_diangkut &&
    form.asal &&
    form.tujuan &&
    form.unit_id &&
    form.driver_id &&
    form.etd;

  async function doSubmit(allowConflict: boolean) {
    setLoading(true);
    const res = await createJobAction(form, { allowConflict });
    setLoading(false);
    if (res.ok) {
      toast.success("Job berhasil dibuat");
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.customer_id) errs.customer_id = "Customer wajib dipilih";
    if (!form.alat_diangkut.trim()) errs.alat_diangkut = "Alat wajib diisi";
    if (!form.asal.trim()) errs.asal = "Lokasi asal wajib diisi";
    if (!form.tujuan.trim()) errs.tujuan = "Lokasi tujuan wajib diisi";
    if (!form.unit_id) errs.unit_id = "Unit wajib dipilih";
    if (!form.driver_id) errs.driver_id = "Driver wajib dipilih";
    if (!form.etd) errs.etd = "ETD wajib diisi";
    if (form.pic_no_hp && !/^(08|\+628)\d{7,12}$/.test(form.pic_no_hp))
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
      <div className="card card-pad-lg">
        <FormSection
          title="Customer & PIC"
          subtitle="Pilih customer dari master data atau tambah baru"
        >
          <Field label="Customer" required>
            <div className="flex flex-wrap gap-2">
              <div style={{ flex: 1, minWidth: 200 }}>
                <Select
                  value={form.customer_id}
                  onChange={(e) => set("customer_id", e.target.value)}
                  error={error.customer_id}
                >
                  <option value="">Pilih customer</option>
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
            <Field label="PIC di lapangan">
              <Input
                placeholder="Bapak/Ibu nama"
                value={form.pic_nama}
                onChange={(e) => set("pic_nama", e.target.value)}
              />
            </Field>
            <Field label="No HP PIC">
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
                standbyUnits.length === 0
                  ? "Tidak ada unit standby"
                  : `${standbyUnits.length} unit standby tersedia`
              }
            >
              <Select
                value={form.unit_id}
                onChange={(e) => onUnitChange(e.target.value)}
                error={error.unit_id}
              >
                <option value="">Pilih unit standby</option>
                {standbyUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.kode_unit} — {u.jenis_unit_nama} ({u.no_polisi})
                  </option>
                ))}
              </Select>
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
              <Select
                value={form.driver_id}
                onChange={(e) => set("driver_id", e.target.value)}
                error={error.driver_id}
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
            <Field label="Tanggal & jam pickup (ETD)" required>
              <Input
                type="datetime-local"
                value={form.etd}
                onChange={(e) => set("etd", e.target.value)}
                error={error.etd}
              />
            </Field>
            <Field
              label="Estimasi sampai (ETA)"
              hint="Bila kosong, sistem cek konflik dengan asumsi durasi 12 jam"
            >
              <Input
                type="datetime-local"
                value={form.eta}
                onChange={(e) => set("eta", e.target.value)}
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
            {selectedUnit && (
              <div
                className="caption"
                style={{
                  fontSize: 11.5,
                  padding: "8px 10px",
                  background: selectedUnit.imei_gps
                    ? "var(--brand-primary-light)"
                    : "var(--bg-muted)",
                  color: selectedUnit.imei_gps
                    ? "var(--brand-primary-dark)"
                    : "var(--text-secondary)",
                  borderRadius: 8,
                  lineHeight: 1.5
                }}
              >
                {selectedUnit.imei_gps
                  ? `Tracking GPS aktif dari unit ${selectedUnit.kode_unit}. Customer akan lihat peta real-time di halaman tracking.`
                  : `Unit ${selectedUnit.kode_unit} belum punya link TrackSolid. Customer akan lihat fallback link-out. Tambahkan di form unit.`}
              </div>
            )}
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
            href="/jobs"
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
                Otomatis setelah simpan
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 16,
                  fontSize: 12,
                  color: "var(--brand-primary-dark)",
                  lineHeight: 1.6
                }}
              >
                <li>Job ID dibuat otomatis</li>
                <li>Share link customer aktif</li>
                <li>
                  Unit berubah ke <strong>Bertugas</strong>
                </li>
                <li>Template WhatsApp siap copy</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="h3" style={{ marginBottom: 12 }}>
            Preview status
          </div>
          <JobStepper status="menunggu_pickup" />
          <div className="caption" style={{ marginTop: 12, lineHeight: 1.5 }}>
            Job akan dibuat dengan status{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              Menunggu pickup
            </strong>
            . Admin update progres seiring waktu.
          </div>
        </div>

        <div
          className="card card-pad"
          style={{ background: "var(--bg-muted)" }}
        >
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Tips
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.5
            }}
          >
            Field PIC bisa berbeda dari customer master — ini untuk PIC yang
            stand-by di site. Customer dapat link tracking lewat WhatsApp.
          </div>
        </div>
      </div>

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
