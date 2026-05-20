"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  Camera,
  Copy,
  Eye,
  ExternalLink,
  History,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  PowerOff,
  Printer,
  Truck,
  Trash2
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Lightbox } from "@/components/ui/lightbox";
import { useToast } from "@/components/ui/toast";
import { JobStepper } from "@/components/jobs/job-stepper";
import { UpdateStatusModal } from "@/components/jobs/update-status-modal";
import { UploadPhotoModal } from "@/components/jobs/upload-photo-modal";
import {
  cancelJobAction,
  updateJobStatusAction
} from "@/lib/actions/jobs";
import { deleteJobPhotoAction } from "@/lib/actions/photos";
import type {
  Driver,
  Job,
  JobStatus,
  JobStatusHistoryEntry,
  Unit
} from "@/lib/types";
import { formatDateTime, timeAgo } from "@/lib/utils";

interface Props {
  job: Job;
  unit: Unit | null;
  driver: Driver | null;
  history: JobStatusHistoryEntry[];
}

export function JobDetailView({ job, unit, driver, history }: Props) {
  const router = useRouter();
  const toast = useToast();

  const loadingPhotos = (job.photos ?? []).filter((p) => p.type === "loading");
  const unloadingPhotos = (job.photos ?? []).filter((p) => p.type === "unloading");

  const [statusOpen, setStatusOpen] = useState(false);
  const [uploadType, setUploadType] = useState<"loading" | "unloading" | null>(
    null
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [deletePhoto, setDeletePhoto] = useState<{
    id: string;
    path: string;
  } | null>(null);

  const shareUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/track/${job.share_token}`;
    }
    return `/track/${job.share_token}`;
  }, [job.share_token]);

  const closed = job.status === "selesai" || job.status === "cancelled";

  async function onUpdateStatus(next: JobStatus, notes?: string) {
    setPending(true);
    const res = await updateJobStatusAction(job.id, next, notes);
    setPending(false);
    setStatusOpen(false);
    if (res.ok) {
      toast.success("Status diperbarui");
      router.refresh();
    } else toast.error(res.error);
  }

  async function onCancel() {
    setPending(true);
    await cancelJobAction(job.id);
    setPending(false);
  }

  async function onDeletePhoto() {
    if (!deletePhoto) return;
    setPending(true);
    const res = await deleteJobPhotoAction(deletePhoto.id, deletePhoto.path);
    setPending(false);
    setDeletePhoto(null);
    if (res.ok) {
      toast.success("Foto dihapus");
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-subtle">
              Nomor job
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <h1 className="text-h1">{job.job_number}</h1>
              <StatusBadge status={job.status} size="md" />
            </div>
            <p className="text-[13px] text-text mt-1">
              {job.customer_nama}
              {job.pic_nama && (
                <span className="text-text-muted"> · PIC {job.pic_nama}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/jobs/${job.id}/surat-jalan`}
              target="_blank"
              rel="noreferrer"
            >
              <Button
                variant="secondary"
                leftIcon={<Printer className="w-4 h-4" />}
              >
                Cetak surat jalan
              </Button>
            </Link>
            <Link href={`/jobs/${job.id}/edit`}>
              <Button variant="secondary" leftIcon={<Pencil className="w-4 h-4" />}>
                Edit
              </Button>
            </Link>
            {!closed && (
              <Button
                leftIcon={<ArrowRight className="w-4 h-4" />}
                onClick={() => setStatusOpen(true)}
              >
                Update status
              </Button>
            )}
          </div>
        </div>
        {job.cancelled_reason && (
          <p className="mt-3 text-[13px] text-status-cancelled-fg bg-status-cancelled-bg px-3 py-2 rounded-md">
            Dibatalkan: {job.cancelled_reason}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Progress pengiriman" />
        <div className="hidden sm:block">
          <JobStepper status={job.status} />
        </div>
        <div className="sm:hidden">
          <JobStepper status={job.status} orientation="vertical" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Detail pengiriman" />
          <dl className="grid gap-3 text-[13px]">
            <Row icon={<Truck className="w-4 h-4" />} label="Alat">
              {job.alat_diangkut}
            </Row>
            <Row icon={<MapPin className="w-4 h-4" />} label="Asal">
              {job.asal}
            </Row>
            <Row icon={<MapPin className="w-4 h-4" />} label="Tujuan">
              {job.tujuan}
            </Row>
            <Row icon={<CalendarClock className="w-4 h-4" />} label="ETD">
              {formatDateTime(job.etd)}
            </Row>
            {job.eta && (
              <Row icon={<CalendarClock className="w-4 h-4" />} label="ETA">
                {formatDateTime(job.eta)}
              </Row>
            )}
            {job.pic_no_hp && (
              <Row icon={<Phone className="w-4 h-4" />} label="PIC">
                {job.pic_nama} ({job.pic_no_hp})
              </Row>
            )}
          </dl>
        </Card>

        <Card>
          <CardHeader title="Unit & driver" />
          <div className="grid gap-3 text-[13px]">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-md bg-brand-light text-brand-dark flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{unit?.kode_unit}</p>
                  {unit && <StatusBadge status={unit.status} />}
                </div>
                <p className="text-text-muted text-[12px]">
                  {unit?.jenis_unit_nama} · {unit?.no_polisi}
                </p>
              </div>
              {unit && (
                <Link
                  href={`/units/${unit.id}`}
                  className="text-[12px] text-brand-dark hover:underline shrink-0"
                >
                  Lihat
                </Link>
              )}
            </div>
            <div className="border-t border-border/70 pt-3 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-light text-brand-dark flex items-center justify-center text-[12px] font-medium shrink-0">
                {driver?.nama
                  .replace(/^(Pak|Bapak|Bu|Ibu)\s+/i, "")
                  .split(" ")
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join("")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{driver?.nama}</p>
                <p className="text-text-muted text-[12px]">{driver?.no_hp}</p>
              </div>
              {driver && (
                <a
                  href={`https://wa.me/${driver.no_hp.replace(/^\+?0/, "62")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] text-brand-dark hover:underline shrink-0 inline-flex items-center gap-1"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Tracking GPS (TrackSolid)"
          action={
            <Link href={`/jobs/${job.id}/edit`}>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Pencil className="w-3.5 h-3.5" />}
              >
                Edit link
              </Button>
            </Link>
          }
        />
        {job.tracksolid_share_link ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[12px] font-mono text-text-muted break-all bg-page px-3 py-2 rounded-md border border-border flex-1 min-w-0">
              {job.tracksolid_share_link}
            </div>
            <a href={job.tracksolid_share_link} target="_blank" rel="noreferrer">
              <Button
                variant="secondary"
                leftIcon={<ExternalLink className="w-4 h-4" />}
              >
                Buka
              </Button>
            </a>
          </div>
        ) : (
          <p className="text-[13px] text-text-muted">
            Belum ada link TrackSolid. Tambahkan agar customer bisa lihat lokasi
            real-time.
          </p>
        )}
      </Card>

      <PhotoSection
        title="Foto loading"
        photos={loadingPhotos}
        onUpload={() => setUploadType("loading")}
        onOpen={(i) =>
          setLightbox({
            images: loadingPhotos.map((p) => p.file_url),
            index: i
          })
        }
        onDelete={(p) => setDeletePhoto({ id: p.id, path: p.file_path })}
        canUpload={!closed}
        max={5}
      />
      <PhotoSection
        title="Foto unloading"
        photos={unloadingPhotos}
        onUpload={() => setUploadType("unloading")}
        onOpen={(i) =>
          setLightbox({
            images: unloadingPhotos.map((p) => p.file_url),
            index: i
          })
        }
        onDelete={(p) => setDeletePhoto({ id: p.id, path: p.file_path })}
        canUpload={!closed}
        max={5}
      />

      <Card>
        <CardHeader
          title="Share link customer"
          description="Customer akses tracking tanpa login."
          action={
            <Link href={`/track/${job.share_token}`} target="_blank" rel="noreferrer">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Eye className="w-3.5 h-3.5" />}
              >
                Lihat sebagai customer
              </Button>
            </Link>
          }
        />
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 bg-page rounded-md px-3 py-2 text-[12px] font-mono border border-border break-all">
            {shareUrl}
          </div>
          <Button
            variant="secondary"
            leftIcon={<Copy className="w-4 h-4" />}
            onClick={() => {
              navigator.clipboard?.writeText(shareUrl);
              toast.success("Link disalin");
            }}
          >
            Salin
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Riwayat perubahan"
          action={
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="text-[12px] text-brand-dark hover:underline inline-flex items-center gap-1"
            >
              <History className="w-3.5 h-3.5" />
              {historyOpen ? "Sembunyikan" : "Tampilkan"}
            </button>
          }
        />
        {historyOpen && (
          <ol className="flex flex-col gap-3 text-[13px]">
            {history.map((h) => (
              <li key={h.id} className="flex items-start gap-3">
                <span className="w-2 h-2 mt-2 rounded-full bg-brand shrink-0" />
                <div className="flex-1 min-w-0">
                  <p>
                    <span className="text-text-muted">
                      {h.status_old ? `${h.status_old} →` : "Dibuat →"}
                    </span>{" "}
                    <span className="font-medium">{h.status_new}</span>
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {formatDateTime(h.changed_at)} · oleh {h.changed_by_nama}
                    {h.notes ? ` · ${h.notes}` : ""}
                  </p>
                </div>
                <span className="text-[10px] text-text-subtle whitespace-nowrap">
                  {timeAgo(h.changed_at)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {!closed && (
        <Card className="border-danger/30">
          <CardHeader
            title="Zona berbahaya"
            description="Batalkan job bila pengiriman tidak jadi dilakukan."
            action={
              <Button
                variant="danger"
                leftIcon={<PowerOff className="w-4 h-4" />}
                onClick={() => setCancelOpen(true)}
              >
                Batalkan job
              </Button>
            }
          />
        </Card>
      )}

      <UpdateStatusModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        current={job.status}
        onConfirm={onUpdateStatus}
      />
      <UploadPhotoModal
        open={uploadType !== null}
        onClose={() => setUploadType(null)}
        type={uploadType ?? "loading"}
        jobId={job.id}
        onDone={() => router.refresh()}
      />
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Batalkan job ini?"
        body="Status job akan menjadi Dibatalkan dan unit akan kembali Standby. Tindakan ini tidak bisa diundo."
        confirmText="Ya, batalkan"
        variant="danger"
        loading={pending}
        onConfirm={onCancel}
      />
      <ConfirmDialog
        open={deletePhoto !== null}
        onClose={() => setDeletePhoto(null)}
        title="Hapus foto?"
        body="Foto akan dihapus permanen dari job ini."
        confirmText="Ya, hapus"
        variant="danger"
        loading={pending}
        onConfirm={onDeletePhoto}
      />
      <Lightbox
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        images={lightbox?.images ?? []}
        initialIndex={lightbox?.index ?? 0}
      />
    </div>
  );
}

function Row({
  icon,
  label,
  children
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-text-muted mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-text-subtle">
          {label}
        </p>
        <p className="mt-0.5">{children}</p>
      </div>
    </div>
  );
}

interface PhotoSectionProps {
  title: string;
  photos: { id: string; file_path: string; file_url: string }[];
  onUpload: () => void;
  onOpen: (i: number) => void;
  onDelete: (p: { id: string; file_path: string }) => void;
  canUpload: boolean;
  max: number;
}

function PhotoSection({
  title,
  photos,
  onUpload,
  onOpen,
  onDelete,
  canUpload,
  max
}: PhotoSectionProps) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={`${photos.length} / ${max} foto`}
        action={
          canUpload &&
          photos.length < max && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Camera className="w-3.5 h-3.5" />}
              onClick={onUpload}
            >
              Upload foto
            </Button>
          )
        }
      />
      {photos.length === 0 ? (
        <p className="text-[13px] text-text-muted">Belum ada foto.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {photos.map((p, i) => (
            <div
              key={p.id}
              className="aspect-square rounded-md overflow-hidden border border-border bg-page relative group"
            >
              <button
                type="button"
                onClick={() => onOpen(i)}
                className="w-full h-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.file_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
              <button
                type="button"
                onClick={() => onDelete(p)}
                className="absolute top-1 right-1 w-7 h-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Hapus foto"
              >
                <Trash2 className="w-3.5 h-3.5 text-status-cancelled-fg" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
