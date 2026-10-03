import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { DateTimeInput } from "@/components/ui/datetime-input";
import { useToast } from "@/components/ui/toast";
import { useUnitIncidents, useUnits } from "@/features/units/queries";
import { useDrivers } from "@/features/drivers/queries";
import { useSumberDana } from "@/features/uang-jalan/queries";
import { useTrailerUntukUnit } from "@/features/unit-trailer/queries";
import { UnitTrailerField } from "@/features/unit-trailer/components/unit-trailer-field";
import { unitLocation } from "@/features/tracking/api";
import { formatDateTime, formatRupiah, isoToLocalInput, localInputToIso } from "@/lib/utils";
import { incidentTypeLabel, labelStatusInsiden, type Incident, type Job } from "@/types";
import { gantiDriver, gantiTrailer, gantiUnit, type PengembalianKasbon } from "../api";

/**
 * Penggantian hanya untuk job yang sedang berjalan (dijaga juga di database):
 * diterima, loading, dalam perjalanan, unloading, serah terima pool.
 */
export const STATUS_BOLEH_PENGGANTIAN = [
  "diterima",
  "loading",
  "dalam_perjalanan",
  "unloading",
  "serah_terima_pool"
] as const;

export function bolehPenggantian(job: Pick<Job, "status">): boolean {
  return (STATUS_BOLEH_PENGGANTIAN as readonly string[]).includes(job.status);
}

// ── Bagian bersama ──────────────────────────────────────────────────────────

interface Insiden {
  tanggal: string;
  lokasi: string;
  deskripsi: string;
}

/** Isian insiden kerusakan; lokasi diisi dari GPS terakhir unit bila ada. */
function useInsiden(unitId: string, deskripsiAwal: string) {
  const [insiden, setInsiden] = useState<Insiden>(() => ({
    tanggal: isoToLocalInput(),
    lokasi: "",
    deskripsi: deskripsiAwal
  }));
  const [lokasiStatus, setLokasiStatus] = useState<"memuat" | "ada" | "tidak_ada">("memuat");
  useEffect(() => {
    let batal = false;
    unitLocation(unitId)
      .then((loc) => {
        if (batal) return;
        const lokasi = loc.address || `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;
        setInsiden((i) => ({ ...i, lokasi: i.lokasi || lokasi }));
        setLokasiStatus("ada");
      })
      .catch(() => {
        if (!batal) setLokasiStatus("tidak_ada");
      });
    return () => {
      batal = true;
    };
  }, [unitId]);
  return { insiden, setInsiden, lokasiStatus };
}

function BagianInsiden({
  judul,
  insiden,
  onChange,
  lokasiStatus,
  error
}: {
  judul: string;
  insiden: Insiden;
  onChange: (patch: Partial<Insiden>) => void;
  lokasiStatus: "memuat" | "ada" | "tidak_ada";
  error: Record<string, string>;
}) {
  return (
    <>
      <div className="field-label" style={{ marginTop: 4 }}>
        {judul}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tanggal & jam" required>
          <DateTimeInput value={insiden.tanggal} onChange={(v) => onChange({ tanggal: v })} error={error.insidenTanggal} />
        </Field>
        <Field
          label="Lokasi"
          hint={
            lokasiStatus === "memuat"
              ? "Mengambil lokasi terakhir unit…"
              : lokasiStatus === "ada"
                ? "Diisi dari lokasi GPS terakhir unit."
                : "Lokasi GPS tidak tersedia — isi manual."
          }
        >
          <Input value={insiden.lokasi} onChange={(e) => onChange({ lokasi: e.target.value })} placeholder="Mis. KM 120 tol Cipali" />
        </Field>
      </div>
      <Field label="Deskripsi insiden" required>
        <Textarea value={insiden.deskripsi} onChange={(e) => onChange({ deskripsi: e.target.value })} error={error.insidenDeskripsi} />
      </Field>
    </>
  );
}

function validasiInsiden(i: Insiden): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!i.tanggal) errs.insidenTanggal = "Tanggal & jam insiden wajib diisi";
  if (!i.deskripsi.trim()) errs.insidenDeskripsi = "Deskripsi insiden wajib diisi";
  return errs;
}

/**
 * Insiden terbuka yang sudah dicatat untuk job ini (mis. dilaporkan operator)
 * dan belum dipakai pergantian unit — bisa dipakai saat Ganti unit.
 */
export function insidenTerdaftarJob(job: Pick<Job, "id">, incidents: Incident[]): Incident[] {
  return incidents.filter((i) => i.job_id === job.id && i.status !== "resolved" && !i.dari_ganti_unit);
}

/** Detail singkat insiden terdaftar di modal Ganti unit. */
function KartuInsiden({ incident }: { incident: Incident }) {
  return (
    <div style={{ display: "grid", gap: 2, fontSize: 12.5 }}>
      <div style={{ fontWeight: 600 }}>
        {incidentTypeLabel[incident.tipe]} · {formatDateTime(incident.tanggal)}
      </div>
      <div className="caption">
        {labelStatusInsiden(incident)}
        {incident.lokasi ? ` · ${incident.lokasi}` : ""}
        {incident.created_by_nama ? ` · dicatat ${incident.created_by_nama}` : ""}
      </div>
      <div style={{ whiteSpace: "pre-wrap" }}>{incident.deskripsi}</div>
    </div>
  );
}

interface IsianKasbon {
  dikembalikan: string;
  sumberDanaId: string;
  kasbon: string;
}

const KASBON_KOSONG: IsianKasbon = { dikembalikan: "", sumberDanaId: "", kasbon: "" };

/**
 * Uang jalan di tangan supir lama: dikembalikan ke kas dan/atau dicatat
 * sebagai kasbon supir. BATASAN: jumlah keduanya ≤ uang jalan yang sudah cair
 * (dijaga juga di database).
 */
function BagianPengembalianKasbon({
  cair,
  value,
  onChange,
  error
}: {
  cair: number;
  value: IsianKasbon;
  onChange: (patch: Partial<IsianKasbon>) => void;
  error: Record<string, string>;
}) {
  const sumberDana = useSumberDana();
  const opsiKas = (sumberDana.data ?? [])
    .filter((s) => s.is_active)
    .map((s) => ({ value: s.id, label: s.nama, hint: s.bank ?? undefined }));
  const terpakai = cair - (Number(value.dikembalikan) || 0) - (Number(value.kasbon) || 0);
  return (
    <>
      <div className="field-label" style={{ marginTop: 4 }}>
        Uang jalan di supir lama
      </div>
      <p className="caption" style={{ marginTop: -8 }}>
        Sudah cair {formatRupiah(cair)}. Isi yang dikembalikan ke kas dan/atau yang dijadikan kasbon supir; sisanya
        ({formatRupiah(Math.max(terpakai, 0))}) dianggap sudah terpakai untuk job ini.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dikembalikan ke kas">
          <CurrencyInput placeholder="0" value={value.dikembalikan} onChange={(v) => onChange({ dikembalikan: v })} error={error.dikembalikan} />
        </Field>
        <Field label="Kas penerima" required={Number(value.dikembalikan) > 0}>
          <Combobox
            value={value.sumberDanaId}
            onChange={(v) => onChange({ sumberDanaId: v })}
            options={opsiKas}
            placeholder="Pilih kas"
            searchPlaceholder="Cari kas…"
            emptyText="Kas tidak ditemukan"
            clearable
            error={error.sumberDana}
          />
        </Field>
        <Field label="Dijadikan kasbon supir" hint="Dicatat di riwayat kasbon supir lama.">
          <CurrencyInput placeholder="0" value={value.kasbon} onChange={(v) => onChange({ kasbon: v })} error={error.kasbon} />
        </Field>
      </div>
    </>
  );
}

function validasiKasbon(v: IsianKasbon, cair: number): Record<string, string> {
  const errs: Record<string, string> = {};
  const kembali = Number(v.dikembalikan) || 0;
  const kasbon = Number(v.kasbon) || 0;
  if (kembali > 0 && !v.sumberDanaId) errs.sumberDana = "Pilih kas yang menerima uang";
  if (kembali + kasbon > cair) errs.kasbon = `Dikembalikan + kasbon melebihi uang jalan yang sudah cair (${formatRupiah(cair)})`;
  return errs;
}

function keInputKasbon(v: IsianKasbon): PengembalianKasbon {
  const kembali = Math.round(Number(v.dikembalikan) || 0);
  return {
    uang_jalan_dikembalikan: kembali,
    sumber_dana_id: kembali > 0 ? v.sumberDanaId || null : null,
    kasbon: Math.round(Number(v.kasbon) || 0)
  };
}

function FooterModal({ formId, label, busy, onClose }: { formId: string; label: string; busy: boolean; onClose: () => void }) {
  return (
    <>
      <Button variant="secondary" onClick={onClose} disabled={busy}>
        Batal
      </Button>
      <Button type="submit" form={formId} loading={busy}>
        {label}
      </Button>
    </>
  );
}

// ── Ganti driver ────────────────────────────────────────────────────────────

/** Driver sakit / kabur: job & proyek sama, driver diganti. */
export function GantiDriverModal({ job, driverNama, onClose }: { job: Job; driverNama?: string; onClose: () => void }) {
  const toast = useToast();
  const drivers = useDrivers(false, true);
  const cair = job.uang_jalan_cair ?? 0;
  const [driverId, setDriverId] = useState("");
  const [alasan, setAlasan] = useState("");
  const [kasbon, setKasbon] = useState<IsianKasbon>(KASBON_KOSONG);
  const [error, setError] = useState<Record<string, string>>({});
  // Popup loading memblokir klik selama proses.
  const [busy, setBusy] = useState<string | null>(null);

  const opsiDriver = (drivers.data ?? [])
    .filter((d) => d.id !== job.driver_id)
    .map((d) => ({ value: d.id, label: d.nama, hint: d.no_hp }));

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = { ...validasiKasbon(kasbon, cair) };
    if (!driverId) errs.driver = "Pilih driver pengganti";
    if (!alasan.trim()) errs.alasan = "Alasan wajib diisi";
    setError(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy("Mengganti driver…");
    const res = await gantiDriver(job.id, { driver_id: driverId, alasan: alasan.trim(), ...keInputKasbon(kasbon) });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Driver berhasil diganti.");
    onClose();
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Ganti driver"
      description={`Driver saat ini: ${driverNama ?? "—"}. Job & proyek tetap sama.`}
      footer={<FooterModal formId="ganti-driver-form" label="Ganti driver" busy={busy !== null} onClose={onClose} />}
    >
      <form id="ganti-driver-form" onSubmit={simpan} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Driver pengganti" required hint="Hanya driver yang sedang Stand by.">
          <Combobox
            value={driverId}
            onChange={setDriverId}
            options={opsiDriver}
            placeholder={drivers.isLoading ? "Memuat driver…" : "Pilih driver"}
            searchPlaceholder="Cari nama driver…"
            emptyText="Tidak ada driver Stand by"
            error={error.driver}
          />
        </Field>
        <Field label="Alasan" required>
          <Textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. supir sakit, supir kabur…" error={error.alasan} />
        </Field>
        <BagianPengembalianKasbon cair={cair} value={kasbon} onChange={(p) => setKasbon((k) => ({ ...k, ...p }))} error={error} />
      </form>
      <LoadingOverlay message={busy} />
    </Modal>
  );
}

// ── Ganti unit trailer ──────────────────────────────────────────────────────

/** Unit trailer rusak: job & proyek sama; trailer lama dicatat insiden. */
export function GantiTrailerModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const toast = useToast();
  const trailer = useTrailerUntukUnit(job.unit_id);
  const [trailerId, setTrailerId] = useState("");
  const [alasan, setAlasan] = useState("");
  const { insiden, setInsiden, lokasiStatus } = useInsiden(
    job.unit_id,
    `Unit trailer ${job.unit_trailer_kode ?? ""} rusak saat menjalankan job ${job.job_number}`
  );
  const [error, setError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Pilihan trailer pengganti: trailer yang cocok dengan unit, selain trailer sekarang.
  const pilihan = useMemo(
    () =>
      trailer.data
        ? { ...trailer.data, trailer: trailer.data.trailer.filter((t) => t.id !== job.unit_trailer_id) }
        : undefined,
    [trailer.data, job.unit_trailer_id]
  );

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = { ...validasiInsiden(insiden) };
    if (!trailerId) errs.trailer = "Pilih unit trailer pengganti";
    if (!alasan.trim()) errs.alasan = "Alasan wajib diisi";
    setError(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy("Mengganti unit trailer…");
    const res = await gantiTrailer(job.id, {
      unit_trailer_id: trailerId,
      alasan: alasan.trim(),
      insiden_tanggal: localInputToIso(insiden.tanggal),
      insiden_lokasi: insiden.lokasi.trim() || null,
      insiden_deskripsi: insiden.deskripsi.trim()
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Unit trailer berhasil diganti. Insiden trailer lama tercatat.");
    onClose();
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Ganti unit trailer"
      description={`Unit trailer saat ini: ${job.unit_trailer_kode ?? "—"}. Job & proyek tetap sama.`}
      footer={<FooterModal formId="ganti-trailer-form" label="Ganti unit trailer" busy={busy !== null} onClose={onClose} />}
    >
      <form id="ganti-trailer-form" onSubmit={simpan} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <UnitTrailerField pilihan={pilihan} loading={trailer.isLoading} value={trailerId} onChange={setTrailerId} error={error.trailer} />
        <Field label="Alasan" required>
          <Textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. ban trailer pecah…" error={error.alasan} />
        </Field>
        <BagianInsiden
          judul={`Insiden kerusakan unit trailer lama${job.unit_trailer_kode ? ` (${job.unit_trailer_kode})` : ""}`}
          insiden={insiden}
          onChange={(p) => setInsiden((i) => ({ ...i, ...p }))}
          lokasiStatus={lokasiStatus}
          error={error}
        />
      </form>
      <LoadingOverlay message={busy} />
    </Modal>
  );
}

// ── Ganti unit (job pengganti) ──────────────────────────────────────────────

/**
 * Unit rusak / insiden → job pengganti (mulai dari awal) di proyek yang sama.
 * Job lama ditutup Selesai dengan catatan "Unit rusak - diganti JOB-xxx";
 * uang jalan yang sudah cair tetap jadi biaya job lama.
 */
export function GantiUnitModal({
  job,
  unitKode,
  onClose
}: {
  job: Job;
  unitKode?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const units = useUnits();
  const drivers = useDrivers(false, true);
  const cair = job.uang_jalan_cair ?? 0;
  const [unitId, setUnitId] = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [driverId, setDriverId] = useState(job.driver_id);
  // BATASAN: ETD job pengganti tidak boleh lebih awal dari ETD job awal
  // (dijaga juga backend). Nilai awal = yang lebih akhir dari sekarang & ETD job awal.
  const etdMinimal = isoToLocalInput(job.etd);
  const [etd, setEtd] = useState(() => {
    const sekarang = isoToLocalInput();
    return sekarang > etdMinimal ? sekarang : etdMinimal;
  });
  const [eta, setEta] = useState("");
  const [uangJalan, setUangJalan] = useState("");
  const [alasan, setAlasan] = useState("");
  const [kasbon, setKasbon] = useState<IsianKasbon>(KASBON_KOSONG);
  const { insiden, setInsiden, lokasiStatus } = useInsiden(
    job.unit_id,
    `Unit ${unitKode ?? ""} rusak saat menjalankan job ${job.job_number}`
  );
  // Insiden terbuka job ini (mis. dari operator): bisa dipakai, tanpa insiden baru.
  const incidents = useUnitIncidents(job.unit_id);
  const terdaftar = useMemo(() => insidenTerdaftarJob(job, incidents.data ?? []), [job, incidents.data]);
  const [pakaiTerdaftar, setPakaiTerdaftar] = useState(true);
  const [insidenId, setInsidenId] = useState("");
  const insidenDipakai = pakaiTerdaftar && terdaftar.length > 0;
  // Pilihan awal: insiden terdaftar pertama (berubah bila daftar dimuat ulang).
  useEffect(() => {
    if (!terdaftar.some((i) => i.id === insidenId)) setInsidenId(terdaftar[0]?.id ?? "");
  }, [terdaftar, insidenId]);
  const trailer = useTrailerUntukUnit(unitId);
  const [error, setError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const opsiUnit = (units.data ?? [])
    .filter((u) => u.is_active && u.status === "standby" && u.id !== job.unit_id)
    .map((u) => ({ value: u.id, label: u.kode_unit, hint: [u.jenis_unit_nama, u.no_polisi].filter(Boolean).join(" · ") }));
  // Driver sekarang boleh tetap memegang job pengganti.
  const opsiDriver = [
    { value: job.driver_id, label: "Driver saat ini", hint: "Tetap memegang job pengganti" },
    ...(drivers.data ?? []).filter((d) => d.id !== job.driver_id).map((d) => ({ value: d.id, label: d.nama, hint: d.no_hp }))
  ];

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {
      ...(insidenDipakai ? {} : validasiInsiden(insiden)),
      ...validasiKasbon(kasbon, cair)
    };
    if (insidenDipakai && !insidenId) errs.insidenId = "Pilih insiden yang dipakai";
    if (!unitId) errs.unit = "Pilih unit pengganti";
    if (trailer.data?.wajib && !trailerId) errs.trailer = "Unit trailer wajib dipilih untuk unit ini";
    if (!driverId) errs.driver = "Pilih driver";
    if (!etd) errs.etd = "ETD wajib diisi";
    else if (etd < etdMinimal) errs.etd = "ETD tidak boleh lebih awal dari ETD job awal";
    if (!(Number(uangJalan) > 0)) errs.uangJalan = "Uang jalan job pengganti wajib diisi";
    if (!alasan.trim()) errs.alasan = "Alasan wajib diisi";
    setError(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy("Membuat job pengganti…");
    const res = await gantiUnit(job.id, {
      unit_id: unitId,
      unit_trailer_id: trailer.data?.wajib ? trailerId : null,
      driver_id: driverId,
      etd,
      eta: eta || null,
      uang_jalan_awal: Math.round(Number(uangJalan)),
      alasan: alasan.trim(),
      ...(insidenDipakai
        ? { insiden_id: insidenId }
        : {
            insiden_tanggal: localInputToIso(insiden.tanggal),
            insiden_lokasi: insiden.lokasi.trim() || null,
            insiden_deskripsi: insiden.deskripsi.trim()
          }),
      ...keInputKasbon(kasbon)
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Job pengganti ${res.data.job_number} dibuat. ${job.job_number} ditutup (unit rusak).`);
    onClose();
    navigate(`/jobs/${res.data.id}`);
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Ganti unit (job pengganti)"
      // Isiannya banyak (unit, driver, jadwal, uang jalan, insiden, kasbon) — modal lebar.
      maxWidth="max-w-[880px]"
      description={`Unit ${unitKode ?? "—"} rusak: dibuat job baru di proyek yang sama, ${job.job_number} ditutup Selesai.`}
      footer={<FooterModal formId="ganti-unit-form" label="Buat job pengganti" busy={busy !== null} onClose={onClose} />}
    >
      <form id="ganti-unit-form" onSubmit={simpan} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unit pengganti" required hint="Hanya unit berstatus Stand by.">
            <Combobox
              value={unitId}
              onChange={(v) => {
                setUnitId(v);
                setTrailerId("");
              }}
              options={opsiUnit}
              placeholder={units.isLoading ? "Memuat unit…" : "Pilih unit"}
              searchPlaceholder="Cari kode unit atau no. polisi…"
              emptyText="Tidak ada unit Stand by"
              error={error.unit}
            />
          </Field>
          <Field label="Driver" required>
            <Combobox
              value={driverId}
              onChange={(v) => setDriverId(v || job.driver_id)}
              options={opsiDriver}
              placeholder="Pilih driver"
              searchPlaceholder="Cari nama driver…"
              emptyText="Tidak ada driver Stand by"
              error={error.driver}
            />
          </Field>
          {unitId && (
            <UnitTrailerField pilihan={trailer.data} loading={trailer.isLoading} value={trailerId} onChange={setTrailerId} error={error.trailer} />
          )}
          <Field label="ETD (berangkat)" required>
            <DateTimeInput value={etd} onChange={setEtd} error={error.etd} min={etdMinimal} />
          </Field>
          <Field label="ETA (sampai)" hint="Opsional — dihitung otomatis dari rute.">
            <DateTimeInput value={eta} onChange={setEta} clearable />
          </Field>
          <Field label="Uang jalan job pengganti" required>
            <CurrencyInput placeholder="2.500.000" value={uangJalan} onChange={setUangJalan} error={error.uangJalan} />
          </Field>
        </div>
        <Field label="Alasan" required>
          <Textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. gardan patah di KM 120…" error={error.alasan} />
        </Field>
        {terdaftar.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={pakaiTerdaftar}
                onChange={(e) => setPakaiTerdaftar(e.target.checked)}
                style={{ accentColor: "var(--brand-primary)" }}
              />
              Gunakan insiden yang sudah terdaftar
            </label>
            {pakaiTerdaftar && (
              <div style={{ display: "grid", gap: 6 }}>
                {terdaftar.map((inc) => (
                  <label
                    key={inc.id}
                    className="card"
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: 10,
                      cursor: "pointer",
                      borderColor: inc.id === insidenId ? "var(--brand-primary)" : undefined
                    }}
                  >
                    {/* Lebih dari satu insiden terbuka → pilih salah satu. */}
                    {terdaftar.length > 1 && (
                      <input
                        type="radio"
                        name="insiden-terdaftar"
                        checked={inc.id === insidenId}
                        onChange={() => setInsidenId(inc.id)}
                        aria-label={`Pakai insiden ${incidentTypeLabel[inc.tipe]} ${formatDateTime(inc.tanggal)}`}
                        style={{ accentColor: "var(--brand-primary)" }}
                      />
                    )}
                    <KartuInsiden incident={inc} />
                  </label>
                ))}
                {error.insidenId && <p className="field-error">{error.insidenId}</p>}
                <p className="caption">Insiden ini dipakai untuk pergantian unit — tidak dibuat insiden baru.</p>
              </div>
            )}
          </div>
        )}
        {!insidenDipakai && (
          <BagianInsiden
            judul={`Insiden kerusakan unit lama${unitKode ? ` (${unitKode})` : ""}`}
            insiden={insiden}
            onChange={(p) => setInsiden((i) => ({ ...i, ...p }))}
            lokasiStatus={lokasiStatus}
            error={error}
          />
        )}
        <BagianPengembalianKasbon cair={cair} value={kasbon} onChange={(p) => setKasbon((k) => ({ ...k, ...p }))} error={error} />
      </form>
      <LoadingOverlay message={busy} />
    </Modal>
  );
}
