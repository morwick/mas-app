import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  ConflictCheckUnavailable,
  ConflictWarning
} from "@/features/jobs/components/conflict-warning";
import { LocationPicker } from "@/features/jobs/components/location-picker";
import { updateJob } from "@/features/jobs/api";
import {
  findJobConflicts,
  type ConflictCheckResult
} from "@/lib/job-conflicts";
import { minEtdValue, validateSchedule } from "@/lib/job-schedule";
import { isoToLocalInput } from "@/lib/utils";
import type { Customer, Driver, Job, Unit } from "@/types";
import { UnitTrailerField } from "@/features/unit-trailer/components/unit-trailer-field";
import { useTrailerUntukUnit } from "@/features/unit-trailer/queries";

interface Props {
  job: Job;
  customers: Customer[];
  drivers: Driver[];
  units: Unit[];
  activeJobs: Job[];
  /** True bila daftar job aktif gagal dimuat — peringatan bentrok tidak jalan. */
  conflictCheckError?: boolean;
  onRetryConflictCheck?: () => void;
}

export function EditJobView({
  job,
  customers,
  drivers,
  units,
  activeJobs,
  conflictCheckError,
  onRetryConflictCheck
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
    unit_trailer_id: job.unit_trailer_id ?? "",
    driver_id: job.driver_id,
    etd: isoToLocalInput(job.etd ?? null),
    eta: isoToLocalInput(job.eta ?? null),
    catatan: job.catatan ?? ""
  });
  const [error, setError] = useState<Record<string, string>>({});
  // ETD saat form dibuka. Job yang sudah berjalan wajar punya ETD di masa lalu,
  // jadi larangan back-date hanya berlaku bila admin benar-benar mengubahnya.
  const [initialEtd] = useState(() => isoToLocalInput(job.etd ?? null));
  const minEtd = useMemo(() => minEtdValue(), []);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  /**
   * Sama seperti form tambah: PIC ikut customer yang dipilih, tapi tetap bisa
   * ditimpa karena PIC di lapangan bisa beda dengan yang tercatat di master.
   */
  function onCustomerChange(customerId: string) {
    if (customerId === form.customer_id) return;
    const customer = customers.find((c) => c.id === customerId);
    setForm((f) => ({
      ...f,
      customer_id: customerId,
      pic_nama: customer?.pic_nama ?? "",
      pic_no_hp: customer?.pic_no_hp ?? ""
    }));
    setError(({ pic_nama: _n, pic_no_hp: _h, ...rest }) => rest);
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

  // Item nonaktif tetap ditampilkan bila sedang terpilih, supaya job lama yang
  // memakai customer/driver arsip tidak kehilangan nilainya saat diedit.
  const customerOptions = useMemo<ComboboxOption[]>(
    () =>
      customers
        .filter((c) => c.is_active || c.id === form.customer_id)
        .map((c) => ({
          value: c.id,
          label: c.nama_perusahaan,
          hint: [c.kota, c.pic_nama].filter(Boolean).join(" · ") || undefined
        })),
    [customers, form.customer_id]
  );

  const unitOptions = useMemo<ComboboxOption[]>(
    () =>
      units
        .filter((u) => u.id === form.unit_id || u.status === "standby")
        .map((u) => ({
          value: u.id,
          label: `${u.kode_unit} — ${u.jenis_unit_nama}`,
          hint: u.no_polisi
        })),
    [units, form.unit_id]
  );

  const driverOptions = useMemo<ComboboxOption[]>(
    () =>
      drivers
        .filter((d) => d.is_active || d.id === form.driver_id)
        .map((d) => ({ value: d.id, label: d.nama, hint: d.no_hp })),
    [drivers, form.driver_id]
  );

  // Sama seperti form tambah: ganti unit ke yang tanpa GPS → beri tahu
  // konsekuensinya ke halaman tracking customer.
  const selectedUnit = units.find((u) => u.id === form.unit_id);
  const trailer = useTrailerUntukUnit(form.unit_id);
  const trailerTampil = Boolean(trailer.data?.wajib);
  // Wajib bila unit diganti, atau job ini memang sudah memakai trailer. Job lama
  // (dibuat sebelum aturan trailer) tetap bisa diedit hal lainnya.
  const trailerWajib =
    trailerTampil && (form.unit_id !== job.unit_id || Boolean(job.unit_trailer_id));
  const unitWithoutGps =
    selectedUnit && !selectedUnit.imei_gps ? selectedUnit : null;

  // PIC lapangan wajib — tombol simpan mati selama salah satunya kosong.
  const picFilled = !!form.pic_nama.trim() && !!form.pic_no_hp.trim();

  async function doSubmit(allowConflict: boolean) {
    setLoading(true);
    const res = await updateJob(
      job.id,
      { ...form, unit_trailer_id: trailerTampil ? form.unit_trailer_id || null : null },
      { allowConflict }
    );
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
    const errs: Record<string, string> = {};
    Object.assign(
      errs,
      validateSchedule(form.etd, form.eta, {
        checkBackDate: form.etd !== initialEtd
      })
    );
    if (!form.pic_nama.trim()) errs.pic_nama = "PIC wajib diisi";
    if (trailer.isPending) errs.unit_trailer_id = "Tunggu, pilihan unit trailer sedang dimuat";
    else if (trailer.isError)
      errs.unit_trailer_id = "Pilihan unit trailer gagal dimuat — muat ulang halaman lalu coba lagi";
    else if (trailerWajib && !form.unit_trailer_id) errs.unit_trailer_id = "Unit trailer wajib dipilih";
    if (!form.pic_no_hp.trim()) errs.pic_no_hp = "No HP PIC wajib diisi";
    else if (!/^(08|\+628)\d{7,12}$/.test(form.pic_no_hp.trim()))
      errs.pic_no_hp = "Format: 08xxxxxxxxxx atau +628xxxxxxxxxx";
    setError(errs);
    if (Object.keys(errs).length > 0) return;

    await doSubmit(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-[760px]">
      <Card>
        <CardHeader title={`Edit ${job.job_number}`} description={job.customer_nama} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" required>
            <Combobox
              value={form.customer_id}
              onChange={onCustomerChange}
              options={customerOptions}
              placeholder="Pilih customer"
              searchPlaceholder="Cari nama perusahaan, kota, PIC…"
              emptyText="Customer tidak ditemukan"
            />
          </Field>
          <Field
            label="PIC di lapangan"
            required
            hint="Boleh disesuaikan dengan yang standby di lapangan."
          >
            <Input
              value={form.pic_nama}
              onChange={(e) => set("pic_nama", e.target.value)}
              error={error.pic_nama}
            />
          </Field>
          <Field label="No HP PIC" required>
            <Input
              type="tel"
              value={form.pic_no_hp}
              onChange={(e) => set("pic_no_hp", e.target.value)}
              error={error.pic_no_hp}
              className="mono"
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
            <Combobox
              value={form.unit_id}
              onChange={(v) =>
                // Unit berganti → pilihan unit trailer ikut berganti.
                setForm((f) => ({ ...f, unit_id: v, unit_trailer_id: "" }))
              }
              options={unitOptions}
              placeholder="Pilih unit"
              searchPlaceholder="Cari kode unit, jenis, no polisi…"
              emptyText="Tidak ada unit yang cocok"
            />
            {unitWithoutGps && (
              <p className="field-warning">
                <TriangleAlert style={{ width: 13, height: 13 }} />
                <span>
                  Unit {unitWithoutGps.kode_unit} belum punya link TrackSolid —
                  customer tidak melihat peta real-time, hanya link-out.
                  Tambahkan di form unit.
                </span>
              </p>
            )}
          </Field>
          <UnitTrailerField
            pilihan={trailer.data}
            loading={trailer.isPending}
            value={form.unit_trailer_id}
            onChange={(v) => {
              setForm((f) => ({ ...f, unit_trailer_id: v }));
              setError(({ unit_trailer_id: _t, ...rest }) => rest);
            }}
            error={error.unit_trailer_id}
            required={trailerWajib}
            trailerJobIni={job.unit_trailer_id}
          />
          <Field label="Driver" required>
            <Combobox
              value={form.driver_id}
              onChange={(v) => set("driver_id", v)}
              options={driverOptions}
              placeholder="Pilih driver"
              searchPlaceholder="Cari nama atau no HP driver…"
              emptyText="Driver tidak ditemukan"
            />
          </Field>
          <Field label="ETD" required>
            <Input
              type="datetime-local"
              // ETD lama yang sudah lewat tetap boleh tampil; batas hanya
              // berlaku saat admin memilih tanggal baru.
              min={initialEtd < minEtd ? undefined : minEtd}
              value={form.etd}
              onChange={(e) => set("etd", e.target.value)}
              error={error.etd}
            />
          </Field>
          <Field
            label="ETA"
            hint="Boleh dikosongkan — sistem menghitungnya dari durasi rute, asalkan lokasi asal & tujuan sudah dipin di peta."
          >
            <Input
              type="datetime-local"
              min={form.etd || undefined}
              value={form.eta}
              onChange={(e) => set("eta", e.target.value)}
              error={error.eta}
            />
          </Field>
          <Field label="Catatan" className="sm:col-span-2">
            <Textarea
              value={form.catatan}
              onChange={(e) => set("catatan", e.target.value)}
            />
          </Field>
        </div>

        {conflictCheckError ? (
          <div className="mt-4">
            <ConflictCheckUnavailable onRetry={onRetryConflictCheck} />
          </div>
        ) : (
          conflicts.hasAny && (
            <div className="mt-4">
              <ConflictWarning conflicts={conflicts} />
            </div>
          )
        )}
      </Card>
      <div className="flex items-center justify-end gap-2">
        <Link to={`/jobs/${job.id}`}>
          <Button variant="secondary" type="button">
            Batal
          </Button>
        </Link>
        <Button type="submit" loading={loading} disabled={!picFilled}>
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
