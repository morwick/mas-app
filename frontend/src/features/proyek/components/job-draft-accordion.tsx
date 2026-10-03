import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Trash2, TriangleAlert, Truck } from "lucide-react";
import { AccordionItem } from "@/components/ui/accordion";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateTimeInput } from "@/components/ui/datetime-input";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ConflictCheckUnavailable, ConflictWarning } from "@/features/jobs/components/conflict-warning";
import { EstimasiRuteInfo, useEstimasiRute } from "@/features/jobs/components/estimasi-rute";
import { LocationPicker, type LocationPickerAvailableUnit } from "@/features/jobs/components/location-picker";
import { unitLocation } from "@/features/tracking/api";
import { UnitTrailerField } from "@/features/unit-trailer/components/unit-trailer-field";
import { useTrailerUntukUnit } from "@/features/unit-trailer/queries";
import { SalesField } from "@/features/sales/components/sales-field";
import { findJobConflicts } from "@/lib/job-conflicts";
import { minEtdValue } from "@/lib/job-schedule";
import { formatDate, formatRupiah, formatTime, localInputToIso } from "@/lib/utils";
import type { Driver, Job, Unit } from "@/types";
import {
  bagianDariError,
  bagianDariField,
  validasiJob,
  type BagianJob,
  type JobDraft,
  type JobDraftMeta
} from "../job-draft";

interface Props {
  nomor: number;
  value: JobDraft;
  onChange: (patch: Partial<JobDraft>) => void;
  /** Tidak ada = job ini tidak boleh dihapus (proyek minimal 1 job). */
  onRemove?: () => void;
  /** Error hasil submit terakhir (kosong sebelum disubmit). */
  errors: Record<string, string>;
  open: boolean;
  onToggle: () => void;
  onMeta: (meta: JobDraftMeta) => void;
  drivers: Driver[];
  standbyUnits: Unit[];
  /**
   * BATASAN gabung proyek: bila diisi, unit job hanya boleh salah satu unit
   * ini (unit proyek / unit job pertama), walau sedang tidak Stand by.
   */
  unitTerkunci?: Unit[];
  /** Unit dipilih di bagian proyek (proyek dari penawaran); unit trailer tetap per job. */
  sembunyikanUnit?: boolean;
  /** Proyek dari penawaran: pilihan item penawaran (deal) untuk job ini. */
  itemPenawaran?: { options: ComboboxOption[]; onPilih: (itemId: string) => void };
  /** Job aktif di database + job lain di form ini — untuk peringatan bentrok. */
  pembanding: Job[];
  conflictCheckError?: boolean;
  onRetryConflictCheck?: () => void;
  mapUnits: LocationPickerAvailableUnit[];
  /** Kunci ditambah tiap kali form disubmit: bagian yang salah dibuka. */
  submitKe: number;
  /**
   * Form tambah proyek (cukup 1 job): tanpa judul "Job N" dan tanpa accordion —
   * semua bagian langsung terbuka berurutan.
   */
  tunggal?: boolean;
  /**
   * Tombol "Duplikat job sebelumnya" di kartu ini: `sumber` = nomor job
   * terakhir proyek; `onClick` mengisi kartu ini dari job itu.
   */
  duplikat?: { sumber: string; onClick: () => void };
}

const URUTAN: BagianJob[] = ["pengiriman", "unit", "catatan"];

const pendek = (alamat: string) => alamat.split(",")[0].trim();

/** Ringkasan satu baris untuk header job saat tertutup. */
function ringkasJob(d: JobDraft, units: Unit[]): string {
  const unit = units.find((u) => u.id === d.unit_id)?.kode_unit;
  const rute = d.asal || d.tujuan ? `${pendek(d.asal) || "?"} → ${pendek(d.tujuan) || "?"}` : "";
  return [d.alat_diangkut, rute, unit].filter(Boolean).join(" · ") || "Belum diisi";
}

/** Nomor langkah bulat di kiri judul bagian. */
function NomorLangkah({ n, selesai }: { n: number; selesai: boolean }) {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: 999,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        background: selesai ? "var(--brand-primary-light)" : "var(--bg-muted)",
        color: selesai ? "var(--brand-primary-dark)" : "var(--text-secondary)"
      }}
    >
      {selesai ? <Check style={{ width: 12, height: 12 }} /> : n}
    </span>
  );
}

function StatusIsian({ kurang }: { kurang: number }) {
  const lengkap = kurang === 0;
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        padding: "1px 7px",
        borderRadius: 999,
        background: lengkap ? "var(--brand-primary-light)" : "var(--bg-muted)",
        color: lengkap ? "var(--brand-primary-dark)" : "var(--text-secondary)"
      }}
    >
      {lengkap ? "Lengkap" : `${kurang} isian belum diisi`}
    </span>
  );
}

/** Bagian job: accordion biasa, atau blok terbuka berjudul bila `tunggal`. */
function Bagian({
  tunggal,
  title,
  subtitle,
  leading,
  error,
  open,
  onToggle,
  variant,
  children
}: {
  tunggal?: boolean;
  title: string;
  subtitle: string;
  leading: React.ReactNode;
  error: boolean;
  open: boolean;
  onToggle: () => void;
  variant: "flat";
  children: React.ReactNode;
}) {
  if (!tunggal) {
    return (
      <AccordionItem
        title={title}
        subtitle={subtitle}
        leading={leading}
        error={error}
        open={open}
        onToggle={onToggle}
        variant={variant}
      >
        {children}
      </AccordionItem>
    );
  }
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {leading}
        <span className="h3" style={{ color: error ? "var(--status-cancelled-text)" : undefined }}>
          {title}
        </span>
      </div>
      {children}
    </section>
  );
}

/**
 * Satu job di form proyek: accordion berisi tiga bagian bernomor — Detail
 * Pengiriman, Assign Unit & Driver, Catatan Internal. Hanya satu bagian
 * terbuka sekaligus (yang tertutup menampilkan ringkasannya) supaya form
 * tidak penuh. Aturan isiannya ada di job-draft.ts.
 */
export function JobDraftAccordion({
  nomor,
  value: d,
  onChange,
  onRemove,
  errors,
  open,
  onToggle,
  onMeta,
  drivers,
  standbyUnits,
  unitTerkunci,
  sembunyikanUnit,
  itemPenawaran,
  pembanding,
  conflictCheckError,
  onRetryConflictCheck,
  mapUnits,
  submitKe,
  tunggal,
  duplikat
}: Props) {
  const toast = useToast();
  const [bagianAktif, setBagianAktif] = useState<BagianJob | null>("pengiriman");
  const [ambilLokasiUnit, setAmbilLokasiUnit] = useState(false);
  // Batas bawah picker ETD — dihitung sekali supaya tidak berubah di tengah pengisian.
  const minEtd = useMemo(() => minEtdValue(), []);

  const trailer = useTrailerUntukUnit(d.unit_id);
  const estimasi = useEstimasiRute({ lat: d.asal_lat, lng: d.asal_lng }, { lat: d.tujuan_lat, lng: d.tujuan_lng });
  const meta: JobDraftMeta = {
    trailerWajib: Boolean(trailer.data?.wajib),
    trailerPending: Boolean(d.unit_id) && trailer.isPending,
    etaTidakTerhitung: estimasi.isError,
    trailerKode: trailer.data?.trailer?.find((t) => t.id === d.unit_trailer_id)?.kode_trailer ?? null
  };

  // Laporkan keadaan yang dibutuhkan validasi & penyimpanan ke form induk.
  useEffect(() => {
    onMeta(meta);
  }, [meta.trailerWajib, meta.trailerPending, meta.etaTidakTerhitung, meta.trailerKode]);

  // Setelah submit gagal, bagian pertama yang berisi isian salah dibuka.
  useEffect(() => {
    if (submitKe === 0) return;
    const salah = bagianDariError(errors);
    const pertama = URUTAN.find((b) => salah.includes(b));
    if (pertama) setBagianAktif(pertama);
  }, [submitKe]);

  // Isian yang belum lengkap (dihitung terus, tanpa menunggu submit) — untuk
  // penanda "Lengkap / n isian belum diisi" di header job & tiap bagian.
  const kurang = validasiJob(d, meta);
  const jumlahKurang = Object.keys(kurang).length;
  const kurangPerBagian: Record<BagianJob, number> = { pengiriman: 0, unit: 0, catatan: 0 };
  for (const field of Object.keys(kurang)) kurangPerBagian[bagianDariField(field)] += 1;
  const salahSetelahSubmit = new Set(bagianDariError(errors));

  // Unit yang boleh dipilih: unit proyek (terkunci) atau semua unit Stand by.
  const unitBoleh = unitTerkunci && unitTerkunci.length > 0 ? unitTerkunci : standbyUnits;
  const unitSatuSaja = Boolean(unitTerkunci && unitTerkunci.length === 1);
  const selectedUnit = unitBoleh.find((u) => u.id === d.unit_id);
  // Unit tanpa GPS: customer tidak melihat peta real-time — admin perlu tahu.
  const unitWithoutGps = selectedUnit && !selectedUnit.imei_gps ? selectedUnit : null;
  const driver = drivers.find((dr) => dr.id === d.driver_id);

  const unitOptions = useMemo<ComboboxOption[]>(
    () =>
      unitBoleh.map((u) => ({ value: u.id, label: `${u.kode_unit} — ${u.jenis_unit_nama}`, hint: u.no_polisi })),
    [unitBoleh]
  );
  const driverOptions = useMemo<ComboboxOption[]>(
    () =>
      drivers.map((dr) => ({
        value: dr.id,
        label: dr.nama,
        hint:
          dr.status === "in_job"
            ? `${dr.no_hp} · In Job: ${dr.active_job_number ?? "—"}`
            : dr.id === selectedUnit?.default_driver_id
              ? `${dr.no_hp} · driver tetap unit ini`
              : dr.no_hp,
        // Driver yang sedang jalan tetap tampil (biar jelas kenapa) tapi tidak bisa dipilih.
        disabled: dr.status === "in_job"
      })),
    [drivers, selectedUnit]
  );

  const conflicts = useMemo(
    () =>
      findJobConflicts(
        { unitId: d.unit_id, driverId: d.driver_id, etd: d.etd, eta: d.eta || null, excludeJobId: d.key },
        pembanding
      ),
    [d.unit_id, d.driver_id, d.etd, d.eta, d.key, pembanding]
  );

  function onUnitChange(unitId: string) {
    const unit = unitBoleh.find((u) => u.id === unitId);
    // Unit berganti → pilihan unit trailer ikut berganti; driver tetap unit diisi otomatis.
    onChange({
      unit_id: unitId,
      unit_trailer_id: "",
      ...(unit?.default_driver_id ? { driver_id: unit.default_driver_id } : {})
    });
  }

  async function pakaiLokasiUnit() {
    if (!d.unit_id) {
      toast.error("Pilih unit dulu");
      return;
    }
    setAmbilLokasiUnit(true);
    try {
      const data = await unitLocation(d.unit_id);
      onChange({ asal: data.address ?? d.asal, asal_lat: data.lat, asal_lng: data.lng });
      toast.success("Lokasi asal di-set ke posisi unit sekarang");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal ambil lokasi unit");
    } finally {
      setAmbilLokasiUnit(false);
    }
  }

  /** Props bersama tiap bagian: hanya satu yang terbuka. */
  function bagian(k: BagianJob, n: number) {
    const selesai = k !== "catatan" && kurangPerBagian[k] === 0;
    return {
      tunggal,
      variant: "flat" as const,
      open: bagianAktif === k,
      onToggle: () => setBagianAktif((a) => (a === k ? null : k)),
      leading: <NomorLangkah n={n} selesai={selesai} />,
      error: salahSetelahSubmit.has(k) || (k === "unit" && conflicts.hasAny)
    };
  }

  function tombolLanjut(ke: BagianJob, label: string) {
    // Tanpa accordion semua bagian sudah terbuka — tidak perlu tombol lanjut.
    if (tunggal) return null;
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBagianAktif(ke)}>
          Lanjut ke {label}
        </button>
      </div>
    );
  }

  const ringkasPengiriman =
    [d.alat_diangkut, d.asal || d.tujuan ? `${pendek(d.asal) || "?"} → ${pendek(d.tujuan) || "?"}` : ""]
      .filter(Boolean)
      .join(" · ") || "Alat, lokasi asal & tujuan";
  const ringkasUnit =
    [
      selectedUnit?.kode_unit,
      driver?.nama,
      d.etd ? `${formatDate(localInputToIso(d.etd))} ${formatTime(localInputToIso(d.etd))}` : "",
      Number(d.uang_jalan_awal) > 0 ? formatRupiah(Number(d.uang_jalan_awal)) : ""
    ]
      .filter(Boolean)
      .join(" · ") || "Unit, driver, jadwal & uang jalan";

  const isi = (
    <>
      <Bagian title="Detail Pengiriman" subtitle={ringkasPengiriman} {...bagian("pengiriman", 1)}>
        <div style={{ display: "grid", gap: 12 }}>
          {duplikat && (
            // Isi cepat dari job terakhir proyek — kotak info di awal Detail Pengiriman.
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--bg-subtle)",
                border: "0.5px solid var(--border-default)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Copy style={{ width: 15, height: 15, color: "var(--text-tertiary)", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Mirip job sebelumnya?</div>
                  <div className="caption">
                    {`Salin alat, rute, driver, uang jalan, dan sales dari ${duplikat.sumber}.`}
                  </div>
                </div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={duplikat.onClick}>
                Duplikat job sebelumnya
              </button>
            </div>
          )}
          {itemPenawaran && (
            // Proyek dari penawaran: job wajib salah satu item deal penawaran itu.
            <Field label="Item penawaran" required>
              <Combobox
                value={d.quotation_item_id ?? ""}
                onChange={itemPenawaran.onPilih}
                options={itemPenawaran.options}
                placeholder="Pilih item penawaran (deal)"
                searchPlaceholder="Cari rute / alat…"
                emptyText="Tidak ada item deal"
                error={errors.quotation_item_id}
              />
            </Field>
          )}
          <Field label="Alat yang diangkut" required>
            <Input
              placeholder="Contoh: Excavator Komatsu PC200-8"
              value={d.alat_diangkut}
              onChange={(e) => onChange({ alat_diangkut: e.target.value })}
              error={errors.alat_diangkut}
            />
          </Field>
          <SalesField value={d} onChange={onChange} errors={errors} />
          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 12 }}>
            <Field label="Lokasi asal" required>
              <LocationPicker
                value={{ address: d.asal, lat: d.asal_lat, lng: d.asal_lng }}
                onChange={(v) => onChange({ asal: v.address, asal_lat: v.lat, asal_lng: v.lng })}
                placeholder="Alamat titik pickup"
                wajibPin
                error={errors.asal}
                availableUnits={mapUnits}
                extra={{
                  label: "Pakai lokasi unit",
                  icon: <Truck style={{ width: 12, height: 12 }} />,
                  onClick: pakaiLokasiUnit,
                  loading: ambilLokasiUnit,
                  disabled: !d.unit_id,
                  hint: d.unit_id ? "Ambil posisi GPS terkini unit yang dipilih" : "Pilih unit dulu di langkah 2"
                }}
              />
            </Field>
            <Field label="Lokasi tujuan" required>
              <LocationPicker
                value={{ address: d.tujuan, lat: d.tujuan_lat, lng: d.tujuan_lng }}
                onChange={(v) => onChange({ tujuan: v.address, tujuan_lat: v.lat, tujuan_lng: v.lng })}
                placeholder="Alamat titik drop"
                wajibPin
                error={errors.tujuan}
                availableUnits={mapUnits}
              />
            </Field>
          </div>
        </div>
        {tombolLanjut("unit", "Unit & Driver")}
      </Bagian>

      <Bagian title="Assign Unit & Driver" subtitle={ringkasUnit} {...bagian("unit", 2)}>
        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
          {!sembunyikanUnit && (
          <Field
            label="Unit"
            required
            hint={unitTerkunci && unitTerkunci.length > 0 ? "Mengikuti unit proyek (1 proyek = 1 unit)." : undefined}
          >
            <Combobox
              value={d.unit_id}
              onChange={onUnitChange}
              options={unitOptions}
              disabled={unitSatuSaja}
              placeholder="Pilih unit standby"
              searchPlaceholder="Cari kode unit, jenis, no polisi…"
              emptyText="Tidak ada unit standby yang cocok"
              clearable
              error={errors.unit_id}
            />
            {unitWithoutGps && (
              <p className="field-warning">
                <TriangleAlert style={{ width: 13, height: 13 }} />
                <span>Unit {unitWithoutGps.kode_unit} belum punya link TrackSolid — customer hanya dapat link-out.</span>
              </p>
            )}
          </Field>
          )}
          <Field label="Driver" required>
            <Combobox
              value={d.driver_id}
              onChange={(v) => onChange({ driver_id: v })}
              options={driverOptions}
              placeholder="Pilih driver"
              searchPlaceholder="Cari nama atau no HP driver…"
              emptyText="Driver tidak ditemukan"
              clearable
              error={errors.driver_id}
            />
          </Field>
          {/* Hanya tampil bila jenis unit-nya memakai unit trailer. */}
          <UnitTrailerField
            pilihan={trailer.data}
            loading={meta.trailerPending}
            value={d.unit_trailer_id}
            onChange={(v) => onChange({ unit_trailer_id: v })}
            error={errors.unit_trailer_id}
          />
          <Field label="ETD (pickup)" required>
            <DateTimeInput min={minEtd} value={d.etd} onChange={(v) => onChange({ etd: v })} error={errors.etd} />
          </Field>
          <Field label="ETA (sampai)" hint="Opsional — dihitung otomatis dari rute.">
            <DateTimeInput
              min={d.etd || minEtd}
              value={d.eta}
              clearable
              onChange={(v) => onChange({ eta: v })}
              error={errors.eta}
            />
          </Field>
          <Field label="Uang jalan" required>
            <CurrencyInput
              placeholder="2.500.000"
              value={d.uang_jalan_awal}
              onChange={(v) => onChange({ uang_jalan_awal: v })}
              error={errors.uang_jalan_awal}
            />
          </Field>
        </div>
        {/* Estimasi perjalanan (dari lokasi asal & tujuan di langkah 1) tampil
            di sini, dekat ETD/ETA, supaya ETA-nya bisa langsung dipakai. */}
        <div style={{ marginTop: 12 }}>
          <EstimasiRuteInfo
            asal={{ lat: d.asal_lat, lng: d.asal_lng }}
            tujuan={{ lat: d.tujuan_lat, lng: d.tujuan_lng }}
            etd={d.etd}
            onPakaiEta={(eta) => onChange({ eta })}
          />
        </div>
        {conflictCheckError ? (
          <div style={{ marginTop: 12 }}>
            <ConflictCheckUnavailable onRetry={onRetryConflictCheck} />
          </div>
        ) : (
          conflicts.hasAny && (
            <div style={{ marginTop: 12 }}>
              <ConflictWarning conflicts={conflicts} />
            </div>
          )
        )}
        {tombolLanjut("catatan", "Catatan")}
      </Bagian>

      <Bagian
        title="Catatan Internal"
        subtitle={d.catatan.trim() ? d.catatan.trim().split("\n")[0] : "Opsional"}
        {...bagian("catatan", 3)}
      >
        <Textarea
          rows={2}
          aria-label="Catatan internal"
          placeholder="Catatan untuk admin (tidak ditampilkan ke customer)"
          value={d.catatan}
          onChange={(e) => onChange({ catatan: e.target.value })}
        />
      </Bagian>
    </>
  );

  if (tunggal) return <div style={{ display: "grid", gap: 20 }}>{isi}</div>;
  return (
    <AccordionItem
      title={`Job ${nomor}`}
      badge={<StatusIsian kurang={jumlahKurang} />}
      subtitle={ringkasJob(d, unitBoleh)}
      open={open}
      onToggle={onToggle}
      error={Object.keys(errors).length > 0 || conflicts.hasAny}
      actions={
        onRemove && (
          <button type="button" className="btn-icon" title="Hapus job ini dari form" onClick={onRemove}>
            <Trash2 style={{ width: 14, height: 14 }} />
          </button>
        )
      }
    >
      {isi}
    </AccordionItem>
  );
}
