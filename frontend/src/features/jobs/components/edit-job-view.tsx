import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { TriangleAlert, Truck } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DateTimeInput } from "@/components/ui/datetime-input";
import { useToast } from "@/components/ui/toast";
import {
  ConflictCheckUnavailable,
  ConflictWarning
} from "@/features/jobs/components/conflict-warning";
import {
  LocationPicker,
  type LocationPickerAvailableUnit
} from "@/features/jobs/components/location-picker";
import {
  ETA_TIDAK_TERHITUNG_MESSAGE,
  EstimasiRuteInfo,
  useEstimasiRute
} from "@/features/jobs/components/estimasi-rute";
import { updateJob } from "@/features/jobs/api";
import { fleetLocations, unitLocation } from "@/features/tracking/api";
import {
  BENTROK_JADWAL_MESSAGE,
  findJobConflicts,
  type ConflictCheckResult
} from "@/lib/job-conflicts";
import { minEtdValue, validateSchedule } from "@/lib/job-schedule";
import { isoToLocalInput } from "@/lib/utils";
import type { Driver, Job, Unit } from "@/types";
import { UnitTrailerField } from "@/features/unit-trailer/components/unit-trailer-field";
import { useTrailerUntukUnit } from "@/features/unit-trailer/queries";
import {
  SalesField,
  keSalesInput,
  validasiSales,
  type IsianSales
} from "@/features/sales/components/sales-field";

interface Props {
  job: Job;
  drivers: Driver[];
  units: Unit[];
  activeJobs: Job[];
  /** True bila daftar job aktif gagal dimuat — peringatan bentrok tidak jalan. */
  conflictCheckError?: boolean;
  onRetryConflictCheck?: () => void;
}

export function EditJobView({
  job,
  drivers,
  units,
  activeJobs,
  conflictCheckError,
  onRetryConflictCheck
}: Props) {
  const navigate = useNavigate();
  // Asal halaman (mis. job dibuka dari detail proyek) ikut kembali ke detail job.
  const { state: asalHalaman } = useLocation();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
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
  const [sales, setSales] = useState<IsianSales>({
    sales_id: job.sales_id ?? "",
    sales_nama: job.sales_nama ?? "",
    sales_no_hp: job.sales_no_hp ?? ""
  });
  const [error, setError] = useState<Record<string, string>>({});
  // ETD saat form dibuka. Job yang sudah berjalan wajar punya ETD di masa lalu,
  // jadi larangan back-date hanya berlaku bila admin benar-benar mengubahnya.
  const [initialEtd] = useState(() => isoToLocalInput(job.etd ?? null));
  const minEtd = useMemo(() => minEtdValue(), []);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const estimasi = useEstimasiRute(
    { lat: form.asal_lat, lng: form.asal_lng },
    { lat: form.tujuan_lat, lng: form.tujuan_lng }
  );
  // Rute tersimpan masih berlaku bila titik tidak diubah — server memakai durasinya.
  const titikSama =
    form.asal_lat === (job.asal_lat ?? null) &&
    form.asal_lng === (job.asal_lng ?? null) &&
    form.tujuan_lat === (job.tujuan_lat ?? null) &&
    form.tujuan_lng === (job.tujuan_lng ?? null);
  const adaDurasiTersimpan = titikSama && job.route_duration_min != null;

  // Sama seperti form tambah: posisi GPS unit standby tampil sebagai marker di
  // modal pin lokasi, supaya admin bisa lihat unit terdekat ke titik yang dipin.
  const [unitLocations, setUnitLocations] = useState<
    Record<string, { lat: number; lng: number } | null>
  >({});
  const [fetchingUnitLoc, setFetchingUnitLoc] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fleetLocations()
      .then((data) => {
        if (!cancelled) setUnitLocations(data.locations ?? {});
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
    for (const u of units) {
      if (u.status !== "standby") continue;
      const loc = unitLocations[u.id];
      if (!loc) continue;
      out.push({ id: u.id, kode_unit: u.kode_unit, jenis_unit_nama: u.jenis_unit_nama, lat: loc.lat, lng: loc.lng });
    }
    return out;
  }, [units, unitLocations]);

  async function useUnitLocationAsAsal() {
    if (!form.unit_id) {
      toast.error("Pilih unit dulu");
      return;
    }
    setFetchingUnitLoc(true);
    try {
      const data = await unitLocation(form.unit_id);
      setForm((f) => ({ ...f, asal: data.address ?? f.asal, asal_lat: data.lat, asal_lng: data.lng }));
      toast.success("Lokasi asal di-set ke posisi unit sekarang");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal ambil lokasi unit");
    } finally {
      setFetchingUnitLoc(false);
    }
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
  // memakai driver arsip tidak kehilangan nilainya saat diedit.
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
  // BATASAN: uang jalan sudah dicairkan → unit, unit trailer & driver terkunci
  // (dijaga juga backend). Penggantian lewat Ganti driver / unit di detail job.
  const penugasanTerkunci = Boolean(job.ada_pencairan_uang_jalan);
  const alasanTerkunci = "Terkunci — uang jalan sudah dicairkan. Gunakan Ganti driver / Ganti unit di detail job.";
  const trailer = useTrailerUntukUnit(form.unit_id);
  const trailerTampil = Boolean(trailer.data?.wajib);
  // Wajib bila unit diganti, atau job ini memang sudah memakai trailer. Job lama
  // (dibuat sebelum aturan trailer) tetap bisa diedit hal lainnya.
  const trailerWajib =
    trailerTampil && (form.unit_id !== job.unit_id || Boolean(job.unit_trailer_id));
  const unitWithoutGps =
    selectedUnit && !selectedUnit.imei_gps ? selectedUnit : null;

  async function doSubmit() {
    setLoading(true);
    const res = await updateJob(
      job.id,
      {
        ...form,
        unit_trailer_id: trailerTampil ? form.unit_trailer_id || null : null,
        ...keSalesInput(sales)
      }
    );
    setLoading(false);
    if (res.ok) {
      toast.success("Perubahan disimpan");
      navigate(`/jobs/${job.id}`, { state: asalHalaman });
      return;
    }
    toast.error(res.conflicts ? BENTROK_JADWAL_MESSAGE : res.error);
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
    // ETA kosong hanya boleh bila sistem bisa menghitungnya dari rute.
    if (!form.eta && estimasi.isError && !adaDurasiTersimpan) errs.eta = ETA_TIDAK_TERHITUNG_MESSAGE;
    if (!form.alat_diangkut.trim()) errs.alat_diangkut = "Alat wajib diisi";
    Object.assign(errs, validasiSales(sales));
    // Sama seperti form tambah: lokasi wajib dipin di peta supaya koordinatnya
    // tersimpan; alamat di kotak teks tetap boleh dilengkapi setelah dipin.
    if (form.asal_lat === null || form.asal_lng === null) errs.asal = "Pin lokasi asal di peta";
    else if (!form.asal.trim()) errs.asal = "Alamat lokasi asal wajib diisi";
    if (form.tujuan_lat === null || form.tujuan_lng === null) errs.tujuan = "Pin lokasi tujuan di peta";
    else if (!form.tujuan.trim()) errs.tujuan = "Alamat lokasi tujuan wajib diisi";
    if (trailer.isPending) errs.unit_trailer_id = "Tunggu, pilihan unit trailer sedang dimuat";
    else if (trailer.isError)
      errs.unit_trailer_id = "Pilihan unit trailer gagal dimuat — muat ulang halaman lalu coba lagi";
    else if (trailerWajib && !form.unit_trailer_id) errs.unit_trailer_id = "Unit trailer wajib dipilih";
    setError(errs);
    if (Object.keys(errs).length > 0) return;
    // Bentrok jadwal tidak bisa di-"tetap simpan" — server juga menolaknya.
    if (conflicts.hasAny) {
      toast.error(BENTROK_JADWAL_MESSAGE);
      return;
    }

    await doSubmit();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader title={`Edit ${job.job_number}`} description={job.customer_nama} />
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Customer, PIC lapangan, dan No HP PIC milik proyek — diubah dari
              form proyek, bukan per job. */}
          <div className="sm:col-span-2 caption" style={{ fontSize: 12.5 }}>
            Customer: <strong>{job.customer_nama}</strong>
            {job.pic_nama ? ` · PIC ${job.pic_nama}${job.pic_no_hp ? ` (${job.pic_no_hp})` : ""}` : ""}
            {job.proyek_id && (
              <>
                {" — "}
                <Link to={`/proyek/${job.proyek_id}/edit`}>ubah di proyek {job.proyek_nomor}</Link>
              </>
            )}
          </div>
          <Field label="Alat" required className="sm:col-span-2">
            <Input
              value={form.alat_diangkut}
              onChange={(e) => set("alat_diangkut", e.target.value)}
              error={error.alat_diangkut}
            />
          </Field>
          <div className="sm:col-span-2">
            <SalesField value={sales} onChange={(patch) => setSales((s) => ({ ...s, ...patch }))} errors={error} />
          </div>
          <Field label="Lokasi asal" required className="sm:col-span-2">
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
              placeholder="Lengkapi alamat titik pickup (nama gedung, nomor, dll.)"
              wajibPin
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
          <Field label="Lokasi tujuan" required className="sm:col-span-2">
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
              placeholder="Lengkapi alamat titik drop (nama gedung, nomor, dll.)"
              wajibPin
              error={error.tujuan}
              availableUnits={mapUnits}
            />
          </Field>
          {/* Dibungkus kondisi supaya tidak ada baris grid kosong sebelum dipin. */}
          {form.asal_lat !== null && form.tujuan_lat !== null && (
            <div className="sm:col-span-2">
              <EstimasiRuteInfo
                asal={{ lat: form.asal_lat, lng: form.asal_lng }}
                tujuan={{ lat: form.tujuan_lat, lng: form.tujuan_lng }}
                etd={form.etd}
                onPakaiEta={(eta) => set("eta", eta)}
              />
            </div>
          )}
          <Field label="Unit" required hint={penugasanTerkunci ? alasanTerkunci : undefined}>
            <Combobox
              disabled={penugasanTerkunci}
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
            disabled={penugasanTerkunci}
            hint={penugasanTerkunci ? alasanTerkunci : undefined}
          />
          <Field label="Driver" required hint={penugasanTerkunci ? alasanTerkunci : undefined}>
            <Combobox
              disabled={penugasanTerkunci}
              value={form.driver_id}
              onChange={(v) => set("driver_id", v)}
              options={driverOptions}
              placeholder="Pilih driver"
              searchPlaceholder="Cari nama atau no HP driver…"
              emptyText="Driver tidak ditemukan"
            />
          </Field>
          <Field label="ETD" required>
            <DateTimeInput
              // ETD lama yang sudah lewat tetap boleh tampil; batas hanya
              // berlaku saat admin memilih tanggal baru.
              min={initialEtd < minEtd ? undefined : minEtd}
              value={form.etd}
              onChange={(v) => set("etd", v)}
              error={error.etd}
            />
          </Field>
          <Field
            label="ETA"
            hint="Boleh dikosongkan — sistem mengisinya dari ETD + estimasi durasi perjalanan truk."
          >
            <DateTimeInput
              min={form.etd || undefined}
              value={form.eta}
              clearable
              onChange={(v) => set("eta", v)}
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
        <Link to={`/jobs/${job.id}`} state={asalHalaman}>
          <Button variant="secondary" type="button">
            Batal
          </Button>
        </Link>
        <Button type="submit" loading={loading}>
          Simpan perubahan
        </Button>
      </div>

    </form>
  );
}
