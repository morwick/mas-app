/**
 * Detail job di portal driver (web transisi) — alur v2:
 *   ditugaskan → (Terima) → diterima → [kunci uang jalan] → loading (5 foto)
 *   → dalam perjalanan → unloading (5 foto) → serah terima pool (1 foto)
 *   → menunggu validasi admin → selesai.
 * Semua kunci ditegakkan ulang di database; tampilan ini hanya memandu.
 */

import { useMemo, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Truck,
  Package,
  CheckCircle,
  Clock,
  MapPin,
  Phone,
  User,
  Camera,
  BellRing,
  Lock,
  Wallet,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatRupiah } from "@/lib/utils";
import {
  JOB_STATUS_LABEL,
  NEXT_DRIVER_STATUS,
  REQUIRED_SLOTS,
  SLOT_LABEL,
  STAGE_LABEL,
  stageForStatus
} from "@/lib/job-status";
import {
  driverAcceptJob,
  driverRequestUangJalan,
  driverUpdateJobStatus,
  driverUploadPhoto
} from "@/features/driver-portal/api";
import { useDriverUangJalan } from "@/features/driver-portal/queries";
import type { DriverJob, JobPhoto, JobStatus, PhotoSlot, PhotoStage } from "@/types";

interface Props {
  job: DriverJob;
  /** Tujuan tombol kembali. Kosong = sembunyikan tombol (dipakai inline di dashboard). */
  backTo?: string;
}

/** Teks tombol maju per status saat ini. */
const ADVANCE_LABEL: Partial<Record<JobStatus, string>> = {
  diterima: "Tiba di lokasi muat — Mulai Loading",
  loading: "Muat selesai — Berangkat",
  dalam_perjalanan: "Tiba di tujuan — Mulai Bongkar",
  unloading: "Bongkar selesai — Kembali ke Pool",
  serah_terima_pool: "Selesaikan Orderan"
};

const STATUS_CLASS: Record<JobStatus, string> = {
  menunggu_pickup: "bg-gray-100 text-gray-700",
  ditugaskan: "bg-gray-100 text-gray-700",
  diterima: "bg-blue-100 text-blue-700",
  loading: "bg-blue-100 text-blue-700",
  dalam_perjalanan: "bg-brand-primary text-white",
  unloading: "bg-orange-100 text-orange-700",
  serah_terima_pool: "bg-purple-100 text-purple-700",
  menunggu_validasi: "bg-amber-100 text-amber-800",
  selesai: "bg-green-100 text-green-700",
  cancelled: "bg-status-cancelled-bg text-status-cancelled-fg"
};

const AJUKAN_ALERT =
  "Apakah anda yakin ingin mengajukan uang jalan? Anda baru bisa melanjutkan perjalanan setelah admin kasir mengupload bukti transfer uang jalan.";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function photoBySlot(photos: JobPhoto[], stage: PhotoStage): Partial<Record<PhotoSlot, JobPhoto>> {
  const out: Partial<Record<PhotoSlot, JobPhoto>> = {};
  for (const p of photos) {
    if (p.stage === stage && p.slot) out[p.slot] = p;
  }
  return out;
}

export function DriverJobDetailView({ job, backTo }: Props) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [ajukanOpen, setAjukanOpen] = useState(false);
  const [nominal, setNominal] = useState("");
  const [catatanAjukan, setCatatanAjukan] = useState("");

  const uangJalan = useDriverUangJalan(job.id);
  const posisi = uangJalan.data?.posisi ?? null;
  const pengajuanPending = uangJalan.data?.pengajuan.find((p) => p.status === "diajukan") ?? null;

  const accepted = Boolean(job.accepted_at);
  const closed = job.status === "selesai" || job.status === "cancelled";
  const status: JobStatus = job.status === "menunggu_pickup" ? "ditugaskan" : job.status;
  const nextStatus = NEXT_DRIVER_STATUS[status] ?? null;
  const stage = stageForStatus(status);

  const photos = job.photos ?? [];
  const slotsFilled = useMemo(() => (stage ? photoBySlot(photos, stage) : {}), [photos, stage]);
  const requiredSlots = stage ? REQUIRED_SLOTS[stage] : [];
  const missingSlots = requiredSlots.filter((s) => !slotsFilled[s]);

  // Foto tahap ini baru boleh diunggah saat status sudah masuk tahapnya.
  const photoStageOpen =
    (stage === "loading" && status === "loading") ||
    (stage === "unloading" && status === "unloading") ||
    (stage === "serah_terima" && status === "serah_terima_pool");

  // Kunci uang jalan (BR-02) hanya berlaku sebelum tahap muat.
  const lockedByUangJalan = status === "diterima" && (!posisi?.ada_bukti || posisi.pending_request);
  const lockedByPending = Boolean(posisi?.pending_request) && status !== "diterima";
  const needPhotos = photoStageOpen && missingSlots.length > 0;

  const advanceBlockedReason = !accepted
    ? "Terima pekerjaan dulu."
    : lockedByUangJalan || lockedByPending
      ? "Menunggu admin mengunggah bukti transfer uang jalan."
      : needPhotos && stage
        ? `Lengkapi ${missingSlots.length} foto ${STAGE_LABEL[stage].toLowerCase()} dulu.`
        : null;

  async function run(action: () => Promise<{ ok: boolean; error?: string }>): Promise<boolean> {
    setIsPending(true);
    setError(null);
    try {
      const res = await action();
      if (!res.ok) setError(res.error ?? "Terjadi kesalahan");
      return res.ok;
    } finally {
      setIsPending(false);
    }
  }

  const handleAccept = () => void run(() => driverAcceptJob(job.id));

  const handleAdvance = () => {
    if (!nextStatus || advanceBlockedReason) return;
    void run(() => driverUpdateJobStatus(job.id, nextStatus));
  };

  async function handleSlotFile(slot: PhotoSlot, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !stage) return;
    setError(null);
    setUploadingSlot(slot);
    const res = await driverUploadPhoto(job.id, stage, slot, file, {
      fileName: file.name,
      takenAt: new Date().toISOString()
    });
    setUploadingSlot(null);
    if (!res.ok) setError(res.error);
  }

  async function submitAjukan() {
    const n = Number(nominal);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Nominal harus lebih dari nol");
      return;
    }
    if (!window.confirm(AJUKAN_ALERT)) return;
    setAjukanOpen(false);
    const ok = await run(() => driverRequestUangJalan(job.id, Math.round(n), catatanAjukan));
    if (!ok) {
      // Isian tetap ada supaya driver tinggal memperbaiki lalu mengirim ulang.
      setAjukanOpen(true);
      return;
    }
    setNominal("");
    setCatatanAjukan("");
  }

  const canAjukan =
    accepted &&
    !closed &&
    status !== "menunggu_validasi" &&
    (posisi?.sisa ?? 0) > 0 &&
    !posisi?.pending_request;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {backTo && (
          <Link to={backTo}>
            <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">{job.job_number}</h1>
          <p className="text-sm text-text-muted truncate">{job.customer_nama}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${STATUS_CLASS[status]}`}>{JOB_STATUS_LABEL[status]}</span>
        {accepted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
            <CheckCircle className="w-3 h-3" />
            Diterima {formatDateTime(job.accepted_at as string)}
          </span>
        ) : (
          !closed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              <BellRing className="w-3 h-3" />
              Belum dikonfirmasi
            </span>
          )
        )}
      </div>

      {error && (
        <p className="text-[13px] text-danger bg-status-cancelled-bg px-3 py-2 rounded-md">{error}</p>
      )}

      {job.validation_note && status !== "selesai" && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-900">
            <span className="font-semibold">Dikembalikan admin:</span> {job.validation_note}
          </p>
        </div>
      )}

      {/* Fase 2: Terima pekerjaan */}
      {!accepted && !closed && (
        <Card className="p-4 border-amber-300">
          <h3 className="font-bold mb-1">Job baru untuk Anda</h3>
          <p className="text-[13px] text-text-muted mb-3">
            Periksa rute, unit, dan jam berangkat di bawah. Tekan Terima Pekerjaan kalau sudah
            dibaca — kantor akan tahu job ini sudah sampai ke Anda.
          </p>
          <Button
            fullWidth
            size="lg"
            onClick={handleAccept}
            loading={isPending}
            leftIcon={<CheckCircle className="w-4 h-4" />}
          >
            Terima Pekerjaan
          </Button>
        </Card>
      )}

      {/* Fase 3: uang jalan */}
      {accepted && !closed && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold flex items-center gap-2">
              <Wallet className="w-4 h-4 text-brand-primary" />
              Uang jalan
            </h3>
            {uangJalan.isFetching && <RefreshCw className="w-3.5 h-3.5 animate-spin text-text-subtle" />}
          </div>
          {posisi ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-page p-2">
                <div className="text-[11px] text-text-muted">Pagu</div>
                <div className="font-semibold text-[13px]">{formatRupiah(posisi.pagu)}</div>
              </div>
              <div className="rounded-md bg-page p-2">
                <div className="text-[11px] text-text-muted">Diterima</div>
                <div className="font-semibold text-[13px]">{formatRupiah(posisi.cair)}</div>
              </div>
              <div className="rounded-md bg-page p-2">
                <div className="text-[11px] text-text-muted">Sisa</div>
                <div className="font-semibold text-[13px]">{formatRupiah(posisi.sisa)}</div>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-text-muted">Memuat posisi uang jalan…</p>
          )}
          {pengajuanPending && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[13px] text-amber-900">
                Pengajuan {formatRupiah(pengajuanPending.nominal)} menunggu admin kasir mengunggah
                bukti transfer.
              </p>
            </div>
          )}
          {lockedByUangJalan && !pengajuanPending && (
            <div className="flex items-start gap-2 rounded-md bg-page px-3 py-2">
              <Lock className="w-4 h-4 text-text-subtle flex-shrink-0 mt-0.5" />
              <p className="text-[13px] text-text-muted">
                Tahap muat terbuka setelah admin mengunggah bukti transfer uang jalan pertama.
              </p>
            </div>
          )}
          <Button
            fullWidth
            variant="secondary"
            onClick={() => setAjukanOpen(true)}
            disabled={!canAjukan || isPending}
            leftIcon={<Wallet className="w-4 h-4" />}
          >
            Ajukan Uang Jalan
          </Button>
        </Card>
      )}

      {/* Fase 4–6: foto per slot */}
      {accepted && !closed && stage && (
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="font-bold flex items-center gap-2">
              <Camera className="w-4 h-4 text-brand-primary" />
              Foto {STAGE_LABEL[stage].toLowerCase()}
            </h3>
            <p className="text-[12px] text-text-muted">
              {photoStageOpen
                ? `${requiredSlots.length - missingSlots.length}/${requiredSlots.length} foto terisi. Ambil dari kamera, satu foto per slot.`
                : "Slot foto terbuka setelah status masuk tahap ini."}
            </p>
          </div>
          <div className="grid gap-2">
            {requiredSlots.map((slot) => {
              const photo = slotsFilled[slot];
              const busy = uploadingSlot === slot;
              return (
                <div
                  key={slot}
                  className="flex items-center gap-3 rounded-md border border-border bg-card p-2"
                >
                  <div className="w-14 h-14 rounded-md bg-page overflow-hidden flex items-center justify-center flex-shrink-0">
                    {photo ? (
                      <img src={photo.file_url} alt={SLOT_LABEL[slot]} className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-5 h-5 text-text-subtle" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{SLOT_LABEL[slot]}</div>
                    {photo?.kualitas_rendah && (
                      <div className="text-[11px] text-amber-700">Tampak buram — disarankan ambil ulang</div>
                    )}
                    {photo && !photo.kualitas_rendah && (
                      <div className="text-[11px] text-green-700">Terisi</div>
                    )}
                  </div>
                  <label
                    className={`btn btn-sm ${photo ? "btn-secondary" : "btn-primary"} ${
                      !photoStageOpen || busy ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    {busy ? "Mengunggah…" : photo ? "Ulangi" : "Ambil"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={!photoStageOpen || busy}
                      onChange={(e) => void handleSlotFile(slot, e)}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Tombol maju */}
      {accepted && !closed && nextStatus && (
        <Card className="p-4 space-y-2">
          <Button
            fullWidth
            size="lg"
            onClick={handleAdvance}
            loading={isPending}
            disabled={Boolean(advanceBlockedReason)}
            leftIcon={<Truck className="w-4 h-4" />}
          >
            {ADVANCE_LABEL[status]}
          </Button>
          {advanceBlockedReason && (
            <p className="text-[12px] text-text-muted flex items-center gap-1 justify-center">
              <Lock className="w-3 h-3" />
              {advanceBlockedReason}
            </p>
          )}
        </Card>
      )}

      {status === "menunggu_validasi" && (
        <Card className="p-4 border-amber-300">
          <h3 className="font-bold mb-1">Menunggu validasi admin</h3>
          <p className="text-[13px] text-text-muted">
            Orderan sudah Anda selesaikan. Status Anda tetap In Job sampai admin memvalidasi
            semua foto dan data.
          </p>
        </Card>
      )}

      <Card className="p-4 space-y-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-brand-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-muted mb-1">Lokasi Asal</div>
              <div className="font-medium">{job.asal}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-brand-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-muted mb-1">Lokasi Tujuan</div>
              <div className="font-medium">{job.tujuan}</div>
            </div>
          </div>
        </div>
        <div className="divider" />
        <div className="flex items-center gap-2 text-sm">
          <Package className="w-4 h-4 text-text-subtle" />
          <span>{job.alat_diangkut}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-text-subtle" />
          <span>Berangkat {formatDateTime(job.etd)}</span>
        </div>
        {job.eta && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-text-subtle" />
            <span>
              Estimasi sampai {formatDateTime(job.eta)}
              {job.eta_is_estimated ? " (perkiraan sistem)" : ""}
            </span>
          </div>
        )}
        {job.unit_kode && (
          <div className="flex items-center gap-2 text-sm">
            <Truck className="w-4 h-4 text-text-subtle" />
            <span>
              {job.unit_kode}
              {job.unit_no_polisi ? ` · ${job.unit_no_polisi}` : ""}
            </span>
          </div>
        )}
        {job.pic_nama && (
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-text-subtle" />
            <span>PIC: {job.pic_nama}</span>
            {job.pic_no_hp && (
              <a href={`tel:${job.pic_no_hp}`} className="ml-auto inline-flex items-center gap-1 text-brand-dark">
                <Phone className="w-4 h-4" />
                {job.pic_no_hp}
              </a>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={ajukanOpen}
        onClose={() => setAjukanOpen(false)}
        title="Ajukan uang jalan"
        description={posisi ? `Sisa pagu ${formatRupiah(posisi.sisa)}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAjukanOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void submitAjukan()} loading={isPending}>
              Ajukan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Nominal (Rp)" required>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={posisi?.sisa ?? undefined}
              value={nominal}
              onChange={(e) => setNominal(e.target.value)}
              placeholder="contoh: 500000"
            />
          </Field>
          <Field label="Keperluan" hint="Opsional — mis. solar, tol, makan">
            <Textarea value={catatanAjukan} onChange={(e) => setCatatanAjukan(e.target.value)} rows={2} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
