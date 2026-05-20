"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Info, Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { NewCustomerInline } from "@/components/jobs/new-customer-inline";
import { ConflictWarning } from "@/components/jobs/conflict-warning";
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
    unit_id: "",
    driver_id: "",
    etd: "",
    eta: "",
    tracksolid_share_link: "",
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

  // Real-time conflict detection saat user edit field-field relevan.
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-[760px]">
      <Card>
        <CardHeader
          title="Job baru"
          description="Isi detail pengiriman. Sistem akan membuat nomor job & share link otomatis."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" required>
            <div className="flex items-stretch gap-2">
              <div className="flex-1">
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
              <Button
                variant="secondary"
                type="button"
                size="md"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setNewCustomerOpen(true)}
              >
                Baru
              </Button>
            </div>
          </Field>

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
            />
          </Field>

          <Field label="Alat yang diangkut" required className="sm:col-span-2">
            <Input
              placeholder="Contoh: Excavator Komatsu PC200"
              value={form.alat_diangkut}
              onChange={(e) => set("alat_diangkut", e.target.value)}
              error={error.alat_diangkut}
            />
          </Field>

          <Field label="Lokasi asal" required className="sm:col-span-2">
            <Textarea
              placeholder="Alamat lengkap titik pickup"
              value={form.asal}
              onChange={(e) => set("asal", e.target.value)}
              error={error.asal}
            />
          </Field>
          <Field label="Lokasi tujuan" required className="sm:col-span-2">
            <Textarea
              placeholder="Alamat lengkap titik drop"
              value={form.tujuan}
              onChange={(e) => set("tujuan", e.target.value)}
              error={error.tujuan}
            />
          </Field>

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
                  {d.id === selectedUnit?.default_driver_id ? "  (default)" : ""}
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
          <div className="mt-4">
            <ConflictWarning conflicts={conflicts} />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="TrackSolid & catatan"
          description="Opsional, bisa diisi setelah job dibuat"
        />
        <div className="flex flex-col gap-4">
          <Field
            label="TrackSolid share link"
            hint="Buka TrackSolid → pilih device → Share Location → copy link"
          >
            <div className="flex flex-col gap-2">
              <Input
                placeholder="https://tracksolid.com/share/..."
                value={form.tracksolid_share_link}
                onChange={(e) => set("tracksolid_share_link", e.target.value)}
                rightAddon={
                  <a
                    href="https://www.tracksolid.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] text-brand-dark hover:underline px-2"
                  >
                    Buka <ExternalLink className="w-3 h-3" />
                  </a>
                }
              />
              <div className="flex items-start gap-2 text-[12px] text-text-muted bg-status-info-bg/40 border border-status-info-fg/10 rounded-md p-2.5">
                <Info className="w-4 h-4 text-status-info-fg shrink-0 mt-0.5" />
                <span>
                  Link ini akan ditampilkan ke customer sebagai peta lokasi
                  real-time. Bila tidak diisi sekarang, bisa ditambahkan kapan
                  saja dari halaman detail job.
                </span>
              </div>
            </div>
          </Field>
          <Field label="Catatan internal">
            <Textarea
              placeholder="Catatan untuk admin (tidak ditampilkan ke customer)"
              value={form.catatan}
              onChange={(e) => set("catatan", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Link href="/jobs">
          <Button variant="secondary" type="button">
            Batal
          </Button>
        </Link>
        <Button type="submit" disabled={!valid} loading={loading}>
          Simpan job
        </Button>
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
    </form>
  );
}
