import { useState, type FormEvent } from "react";
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
  Upload,
  BellRing,
  Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea, Field } from "@/components/ui/input";
import { SignaturePad } from "./signature-pad";
import {
  driverAcceptJob,
  driverSubmitPod,
  driverUpdateJobStatus,
  driverUploadPhoto
} from "@/features/driver-portal/api";
import type { DriverJob } from "@/types";
import type { Job } from "@/types";

interface Props {
  job: DriverJob;
}

/**
 * Langkah berikutnya untuk tiap status. Sengaja hanya satu — driver maju
 * selangkah demi selangkah, dan koreksi status yang terlanjur salah adalah
 * wewenang admin. Aturan yang sama dijaga ulang di database, jadi tampilan
 * ini boleh saja tertinggal versi lama tanpa merusak data.
 */
const nextStatusOf: Record<Job["status"], Job["status"] | null> = {
  menunggu_pickup: "loading",
  loading: "dalam_perjalanan",
  dalam_perjalanan: "unloading",
  // Dari unloading job ditutup lewat form serah terima, bukan tombol status —
  // supaya tidak ada job selesai yang tidak punya bukti terima.
  unloading: null,
  selesai: null,
  cancelled: null
};

const statusLabel: Record<Job["status"], string> = {
  menunggu_pickup: "Menunggu Pickup",
  loading: "Loading",
  dalam_perjalanan: "Dalam Perjalanan",
  unloading: "Unloading",
  selesai: "Selesai",
  cancelled: "Dibatalkan"
};

const actionLabel: Record<Job["status"], string> = {
  menunggu_pickup: "Menunggu Pickup",
  loading: "Mulai Loading",
  dalam_perjalanan: "Berangkat",
  unloading: "Mulai Bongkar",
  selesai: "Selesaikan Job",
  cancelled: "Dibatalkan"
};

const statusColor: Record<Job["status"], string> = {
  menunggu_pickup: "bg-gray-100 text-gray-700",
  loading: "bg-blue-100 text-blue-700",
  dalam_perjalanan: "bg-brand-primary text-white",
  unloading: "bg-orange-100 text-orange-700",
  selesai: "bg-green-100 text-green-700",
  cancelled: "bg-status-cancelled-bg text-status-cancelled-fg"
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function DriverJobDetailView({ job }: Props) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<"loading" | "unloading" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pod, setPod] = useState({
    penerima_nama: "",
    penerima_jabatan: "",
    catatan: ""
  });
  const [signature, setSignature] = useState<string | null>(null);

  /** Jalankan aksi dengan indikator sibuk; hasil gagal ditampilkan di banner. */
  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setIsPending(true);
    try {
      const res = await action();
      if (!res.ok) setError(res.error ?? "Terjadi kesalahan");
    } finally {
      setIsPending(false);
    }
  }

  const accepted = Boolean(job.accepted_at);
  const closed = job.status === "selesai" || job.status === "cancelled";
  const nextStatus = nextStatusOf[job.status];

  const handleAccept = () => {
    setError(null);
    void run(() => driverAcceptJob(job.id));
  };

  const handleAdvance = () => {
    if (!nextStatus) return;
    setError(null);
    void run(() => driverUpdateJobStatus(job.id, nextStatus));
  };

  const handleSubmitPod = () => {
    if (!pod.penerima_nama.trim()) {
      setError("Nama penerima wajib diisi");
      return;
    }
    if (!signature) {
      setError("Minta penerima tanda tangan dulu");
      return;
    }
    setError(null);
    void run(() =>
      driverSubmitPod({
        jobId: job.id,
        penerima_nama: pod.penerima_nama,
        penerima_jabatan: pod.penerima_jabatan,
        catatan: pod.catatan,
        signature_data_url: signature
      })
    );
  };

  const handleUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uploadFor) return;
    const input = e.currentTarget.elements.namedItem("photo") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setError("Pilih foto dulu");
      return;
    }
    setError(null);
    setUploading(true);
    const res = await driverUploadPhoto(job.id, uploadFor, file, file.name);
    setUploading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setUploadFor(null);
  };

  const canUploadLoading =
    accepted && (job.status === "loading" || job.status === "dalam_perjalanan");
  const canUploadUnloading =
    accepted && (job.status === "unloading" || job.status === "selesai");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link to="/driver/dashboard">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">{job.job_number}</h1>
          <p className="text-sm text-text-muted truncate">{job.customer_nama}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${statusColor[job.status]}`}>
          {statusLabel[job.status]}
        </span>
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
        <p className="text-[13px] text-danger bg-status-cancelled-bg px-3 py-2 rounded-md">
          {error}
        </p>
      )}

      {/* Konfirmasi job — pintu pertama sebelum tombol lain terbuka. */}
      {!accepted && !closed && (
        <Card className="p-4 border-amber-300">
          <h3 className="font-bold mb-1">Job baru untuk Anda</h3>
          <p className="text-[13px] text-text-muted mb-3">
            Periksa rute, unit, dan jam berangkat di bawah. Tekan Terima Job
            kalau sudah dibaca — kantor akan tahu job ini sudah sampai ke Anda.
          </p>
          <Button
            fullWidth
            size="lg"
            onClick={handleAccept}
            loading={isPending}
            leftIcon={<CheckCircle className="w-4 h-4" />}
          >
            Terima Job
          </Button>
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

        {(job.unit_kode || job.unit_no_polisi) && (
          <div className="flex items-center gap-2 text-sm">
            <Truck className="w-4 h-4 text-text-subtle" />
            <span>
              {job.unit_kode}
              {job.unit_no_polisi ? ` (${job.unit_no_polisi})` : ""}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-text-subtle" />
          <span>Berangkat: {formatDateTime(job.etd)}</span>
        </div>

        {job.eta && (
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-text-subtle" />
            <span>Perkiraan tiba: {formatDateTime(job.eta)}</span>
          </div>
        )}

        {(job.pic_nama || job.pic_no_hp) && <div className="divider" />}

        {job.pic_nama && (
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-text-subtle" />
            <span>{job.pic_nama}</span>
          </div>
        )}
        {job.pic_no_hp && (
          <a
            href={`tel:${job.pic_no_hp}`}
            className="flex items-center gap-2 text-sm text-brand-primary hover:underline"
          >
            <Phone className="w-4 h-4" />
            {job.pic_no_hp}
          </a>
        )}

        {job.catatan && (
          <>
            <div className="divider" />
            <div>
              <div className="text-xs text-text-muted mb-1">Catatan</div>
              <div className="text-sm whitespace-pre-wrap">{job.catatan}</div>
            </div>
          </>
        )}
      </Card>

      {(canUploadLoading || canUploadUnloading) && (
        <Card className="p-4">
          <h3 className="font-bold mb-3">Dokumentasi Foto</h3>
          <div className="flex gap-2">
            {canUploadLoading && (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setUploadFor("loading")}
                leftIcon={<Upload className="w-4 h-4" />}
              >
                Foto Loading
              </Button>
            )}
            {canUploadUnloading && (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setUploadFor("unloading")}
                leftIcon={<Upload className="w-4 h-4" />}
              >
                Foto Unloading
              </Button>
            )}
          </div>
          {job.photos && job.photos.length > 0 && (
            <p className="mt-3 text-[12px] text-text-muted">
              {job.photos.length} foto sudah terkirim ke kantor.
            </p>
          )}
        </Card>
      )}

      {/* Serah terima — pintu keluar job, menggantikan tombol "Selesai".
          Ditaruh setelah kartu foto supaya driver melihat dokumentasi dulu
          sebelum menutup pekerjaan. */}
      {accepted && job.status === "unloading" && (
        <Card className="p-4">
          <h3 className="font-bold mb-1">Serah terima barang</h3>
          <p className="text-[13px] text-text-muted mb-3">
            Isi nama penerima dan minta tanda tangannya di layar. Setelah
            tersimpan, job otomatis ditandai selesai dan kantor bisa langsung
            menagihkan tanpa menunggu surat jalan kembali.
          </p>

          <Field label="Nama penerima" required>
            <Input
              value={pod.penerima_nama}
              onChange={(e) =>
                setPod((p) => ({ ...p, penerima_nama: e.target.value }))
              }
              placeholder="Nama orang yang menerima di lokasi"
            />
          </Field>
          <Field label="Jabatan / keterangan">
            <Input
              value={pod.penerima_jabatan}
              onChange={(e) =>
                setPod((p) => ({ ...p, penerima_jabatan: e.target.value }))
              }
              placeholder="mis. Kepala gudang"
            />
          </Field>
          <Field label="Tanda tangan penerima" required>
            <SignaturePad onChange={setSignature} disabled={isPending} />
          </Field>
          <Field label="Catatan serah terima">
            <Textarea
              value={pod.catatan}
              onChange={(e) =>
                setPod((p) => ({ ...p, catatan: e.target.value }))
              }
              placeholder="Opsional — mis. ada lecet di bodi kanan"
            />
          </Field>

          <Button
            fullWidth
            size="lg"
            loading={isPending}
            onClick={handleSubmitPod}
            leftIcon={<CheckCircle className="w-4 h-4" />}
          >
            Simpan serah terima & selesaikan job
          </Button>
        </Card>
      )}

      {/* Bukti terima yang sudah tersimpan. */}
      {job.pod_at && (
        <Card className="p-4">
          <h3 className="font-bold mb-2">Bukti terima</h3>
          <div className="text-[13px] space-y-1">
            <div>
              Diterima oleh <strong>{job.pod_penerima_nama}</strong>
              {job.pod_penerima_jabatan ? ` (${job.pod_penerima_jabatan})` : ""}
            </div>
            <div className="text-text-muted">
              {formatDateTime(job.pod_at)}
            </div>
            {job.pod_catatan && (
              <div className="text-text-muted">{job.pod_catatan}</div>
            )}
          </div>
          {job.pod_signature_url && (
            <img
              src={job.pod_signature_url}
              alt="Tanda tangan penerima"
              className="mt-3 h-24 w-auto border border-border rounded-md bg-white"
            />
          )}
        </Card>
      )}

      {!closed && nextStatus && (
        <Card className="p-4">
          <h3 className="font-bold mb-3">Update Status</h3>
          {accepted ? (
            <Button
              fullWidth
              size="lg"
              onClick={handleAdvance}
              loading={isPending}
              leftIcon={
                nextStatus === "loading" || nextStatus === "unloading" ? (
                  <Package className="w-4 h-4" />
                ) : nextStatus === "dalam_perjalanan" ? (
                  <Truck className="w-4 h-4" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )
              }
            >
              {actionLabel[nextStatus]}
            </Button>
          ) : (
            <div className="flex items-start gap-2 text-[13px] text-text-muted">
              <Lock className="w-4 h-4 flex-shrink-0 mt-0.5 text-text-subtle" />
              <span>
                Terima job dulu di atas. Setelah itu tombol{" "}
                {actionLabel[nextStatus]} terbuka.
              </span>
            </div>
          )}
        </Card>
      )}

      {uploadFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-4">
            <h3 className="font-bold mb-4">
              Upload Foto {uploadFor === "loading" ? "Loading" : "Unloading"}
            </h3>
            <form onSubmit={handleUpload} className="space-y-4">
              <input
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                required
                className="w-full text-sm"
              />
              <p className="text-[12px] text-text-muted">
                Maksimal 5 MB per foto.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => setUploadFor(null)}
                  disabled={uploading}
                >
                  Batal
                </Button>
                <Button type="submit" fullWidth loading={uploading}>
                  Upload
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
