import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { ConflictWarning } from "@/features/jobs/components/conflict-warning";
import { LocationPicker } from "@/features/jobs/components/location-picker";
import { updateJob } from "@/features/jobs/api";
import {
  findJobConflicts,
  type ConflictCheckResult
} from "@/lib/job-conflicts";
import type { Customer, Driver, Job, Unit } from "@/types";

interface Props {
  job: Job;
  customers: Customer[];
  drivers: Driver[];
  units: Unit[];
  activeJobs: Job[];
}

function toLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export function EditJobView({
  job,
  customers,
  drivers,
  units,
  activeJobs
}: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [confirmConflict, setConfirmConflict] =
    useState<ConflictCheckResult | null>(null);
  const [form, setForm] = useState({
    customer_id: job.customer_id,
    pic_nama: job.pic_nama ?? "",
    pic_no_hp: job.pic_no_hp ?? "",
    alat_diangkut: job.alat_diangkut,
    asal: job.asal,
    tujuan: job.tujuan,
    asal_lat: job.asal_lat ?? null,
    asal_lng: job.asal_lng ?? null,
    tujuan_lat: job.tujuan_lat ?? null,
    tujuan_lng: job.tujuan_lng ?? null,
    unit_id: job.unit_id,
    driver_id: job.driver_id,
    etd: toLocalDateTime(job.etd),
    eta: toLocalDateTime(job.eta),
    catatan: job.catatan ?? ""
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const conflicts = useMemo<ConflictCheckResult>(() => {
    if (!form.unit_id || !form.driver_id || !form.etd)
      return { unit: [], driver: [], hasAny: false };
    return findJobConflicts(
      {
        unitId: form.unit_id,
        driverId: form.driver_id,
        etd: form.etd,
        eta: form.eta || null,
        excludeJobId: job.id
      },
      activeJobs
    );
  }, [form.unit_id, form.driver_id, form.etd, form.eta, activeJobs, job.id]);

  async function doSubmit(allowConflict: boolean) {
    setLoading(true);
    const res = await updateJob(job.id, form, { allowConflict });
    setLoading(false);
    if (res.ok) {
      toast.success("Perubahan disimpan");
      setConfirmConflict(null);
      navigate(`/jobs/${job.id}`);
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
    await doSubmit(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-[760px]">
      <Card>
        <CardHeader title={`Edit ${job.job_number}`} description={job.customer_nama} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" required>
            <Select
              value={form.customer_id}
              onChange={(e) => set("customer_id", e.target.value)}
            >
              {customers
                .filter((c) => c.is_active || c.id === form.customer_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama_perusahaan}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="PIC di lapangan">
            <Input
              value={form.pic_nama}
              onChange={(e) => set("pic_nama", e.target.value)}
            />
          </Field>
          <Field label="No HP PIC">
            <Input
              type="tel"
              value={form.pic_no_hp}
              onChange={(e) => set("pic_no_hp", e.target.value)}
            />
          </Field>
          <Field label="Alat" required className="sm:col-span-2">
            <Input
              value={form.alat_diangkut}
              onChange={(e) => set("alat_diangkut", e.target.value)}
            />
          </Field>
          <Field label="Asal" required className="sm:col-span-2">
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
            />
          </Field>
          <Field label="Tujuan" required className="sm:col-span-2">
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
            />
          </Field>
          <Field label="Unit" required>
            <Select
              value={form.unit_id}
              onChange={(e) => set("unit_id", e.target.value)}
            >
              {units
                .filter((u) => u.id === form.unit_id || u.status === "standby")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.kode_unit} — {u.jenis_unit_nama}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Driver" required>
            <Select
              value={form.driver_id}
              onChange={(e) => set("driver_id", e.target.value)}
            >
              {drivers
                .filter((d) => d.is_active || d.id === form.driver_id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nama}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="ETD" required>
            <Input
              type="datetime-local"
              value={form.etd}
              onChange={(e) => set("etd", e.target.value)}
            />
          </Field>
          <Field
            label="ETA"
            hint="Bila kosong, sistem cek konflik dengan asumsi durasi 12 jam"
          >
            <Input
              type="datetime-local"
              value={form.eta}
              onChange={(e) => set("eta", e.target.value)}
            />
          </Field>
          <Field label="Catatan" className="sm:col-span-2">
            <Textarea
              value={form.catatan}
              onChange={(e) => set("catatan", e.target.value)}
            />
          </Field>
        </div>

        {conflicts.hasAny && (
          <div className="mt-4">
            <ConflictWarning conflicts={conflicts} />
          </div>
        )}
      </Card>
      <div className="flex items-center justify-end gap-2">
        <Link to={`/jobs/${job.id}`}>
          <Button variant="secondary" type="button">
            Batal
          </Button>
        </Link>
        <Button type="submit" loading={loading}>
          Simpan perubahan
        </Button>
      </div>

      <ConfirmDialog
        open={confirmConflict !== null}
        onClose={() => setConfirmConflict(null)}
        title="Tetap simpan meski ada bentrok jadwal?"
        body={
          confirmConflict && (
            <div className="space-y-3 text-left">
              <p>
                Perubahan ini menyebabkan bentrok dengan job aktif lain.
                Pastikan Anda sudah mengkoordinasikan penjadwalan secara manual
                sebelum simpan.
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
