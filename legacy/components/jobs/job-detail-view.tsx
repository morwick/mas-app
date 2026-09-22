"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Copy,
  Eye,
  ExternalLink,
  FileText,
  Flag,
  History,
  Link as LinkIcon,
  MapPin,
  MessageCircle,
  Pencil,
  Printer,
  RotateCw,
  Trash2,
  Truck,
  X
} from "lucide-react";
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
  SumberDana,
  UangJalan,
  UangJalanRingkasan,
  Unit
} from "@/lib/types";
import { UangJalanCard } from "@/components/uang-jalan/uang-jalan-card";
import { formatDateTime } from "@/lib/utils";

interface Props {
  job: Job;
  unit: Unit | null;
  driver: Driver | null;
  history: JobStatusHistoryEntry[];
  sumberDana: SumberDana[];
  uangJalan: UangJalan[];
  uangJalanRingkasan: UangJalanRingkasan;
}

function driverInitials(nama: string) {
  return nama
    .replace(/^(Pak|Bapak|Bu|Ibu)\s+/i, "")
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

export function JobDetailView({
  job,
  unit,
  driver,
  history,
  sumberDana,
  uangJalan,
  uangJalanRingkasan
}: Props) {
  const router = useRouter();
  const toast = useToast();

  const loadingPhotos = (job.photos ?? []).filter((p) => p.type === "loading");
  const unloadingPhotos = (job.photos ?? []).filter(
    (p) => p.type === "unloading"
  );

  const [statusOpen, setStatusOpen] = useState(false);
  const [uploadType, setUploadType] = useState<"loading" | "unloading" | null>(
    null
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [deletePhoto, setDeletePhoto] = useState<{
    id: string;
    path: string;
  } | null>(null);

  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const shareUrl = `${origin}/track/${job.share_token}`;

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
      {/* Header card with stepper */}
      <div className="card">
        <div
          style={{
            padding: 20,
            display: "flex",
            alignItems: "flex-start",
            gap: 20,
            flexWrap: "wrap"
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 6,
                flexWrap: "wrap"
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 8px",
                  background: "var(--bg-subtle)",
                  borderRadius: 6
                }}
              >
                {job.job_number}
              </span>
              <StatusBadge status={job.status} />
              {/* Hanya muncul untuk job yang lahir dari penawaran — job yang
                  dibuat langsung memang tidak punya, dan itu sah. */}
              {job.quotation_id && job.quotation_number && (
                <Link
                  href={`/quotations/${job.quotation_id}`}
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "var(--brand-primary-light)",
                    color: "var(--brand-primary-dark)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4
                  }}
                  title="Lihat penawaran asal job ini"
                >
                  <FileText style={{ width: 12, height: 12 }} />
                  {job.quotation_number}
                </Link>
              )}
              <span className="caption mono">
                Dibuat {formatDateTime(job.created_at)}
              </span>
            </div>
            <div className="h1" style={{ marginBottom: 4 }}>
              {job.alat_diangkut}
            </div>
            <div className="body muted">
              {job.customer_nama}
              {job.pic_nama && (
                <>
                  {" · PIC "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {job.pic_nama}
                  </strong>
                </>
              )}
            </div>
          </div>
          <div
            style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          >
            <Link
              href={`/jobs/${job.id}/surat-jalan`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ textDecoration: "none" }}
            >
              <Printer style={{ width: 14, height: 14 }} />
              Cetak surat jalan
            </Link>
            <Link
              href={`/jobs/${job.id}/edit`}
              className="btn btn-secondary btn-sm"
              style={{ textDecoration: "none" }}
            >
              <Pencil style={{ width: 14, height: 14 }} />
              Edit
            </Link>
            {!closed && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ color: "#C13838", borderColor: "#F5C0C0" }}
                onClick={() => setCancelOpen(true)}
              >
                Cancel job
              </button>
            )}
            {!closed && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStatusOpen(true)}
              >
                <RotateCw style={{ width: 14, height: 14 }} />
                Update status
              </button>
            )}
          </div>
        </div>
        <div
          style={{
            padding: "20px 20px 24px",
            borderTop: "0.5px solid var(--border-default)",
            background: "var(--bg-muted)"
          }}
        >
          <JobStepper status={job.status} />
        </div>
      </div>

      {job.cancelled_reason && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--status-cancelled-bg)",
            color: "var(--status-cancelled-text)",
            borderRadius: 8,
            fontSize: 13
          }}
        >
          <strong>Dibatalkan:</strong> {job.cancelled_reason}
        </div>
      )}

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1.6fr_1fr]">
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Detail pengiriman */}
          <div className="card card-pad-lg">
            <div className="h3" style={{ marginBottom: 14 }}>
              Detail pengiriman
            </div>
            <div
              className="grid grid-cols-1 sm:grid-cols-2"
              style={{ gap: 16 }}
            >
              <DetailField label="Alat diangkut" value={job.alat_diangkut} />
              <DetailField
                label="ETD"
                value={formatDateTime(job.etd)}
                mono
              />
              <DetailField label="Asal" value={job.asal} />
              <DetailField
                label="ETA"
                value={job.eta ? formatDateTime(job.eta) : "—"}
                mono
              />
              <DetailField label="Tujuan" value={job.tujuan} fullWidth />
            </div>
            {job.catatan && (
              <>
                <div className="divider" style={{ margin: "14px 0" }} />
                <DetailField
                  label="Catatan internal"
                  value={job.catatan}
                  fullWidth
                />
              </>
            )}
          </div>

          {/* Bukti terima barang.
              Diambil driver di lokasi bongkar, jadi lampiran tagihan sudah
              lengkap tanpa menunggu surat jalan fisik kembali ke kantor. */}
          {job.pod_at && (
            <div className="card card-pad">
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Bukti terima barang
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  alignItems: "flex-start",
                  flexWrap: "wrap"
                }}
              >
                <div style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{job.pod_penerima_nama}</div>
                  {job.pod_penerima_jabatan && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {job.pod_penerima_jabatan}
                    </div>
                  )}
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Diterima {formatDateTime(job.pod_at)}
                  </div>
                  {job.pod_catatan && (
                    <div style={{ fontSize: 12.5, marginTop: 6 }}>
                      {job.pod_catatan}
                    </div>
                  )}
                </div>
                {job.pod_signature_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={job.pod_signature_url}
                    alt="Tanda tangan penerima"
                    style={{
                      height: 80,
                      width: "auto",
                      background: "white",
                      border: "1px solid var(--border-default)",
                      borderRadius: 6
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Photos sections */}
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
            onDelete={(p) =>
              setDeletePhoto({ id: p.id, path: p.file_path })
            }
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
            onDelete={(p) =>
              setDeletePhoto({ id: p.id, path: p.file_path })
            }
            canUpload={
              !closed && (job.status === "unloading" || job.status === "selesai")
            }
            max={5}
          />
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Share link card */}
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
                alignItems: "center",
                gap: 8,
                marginBottom: 8
              }}
            >
              <LinkIcon
                style={{
                  width: 16,
                  height: 16,
                  color: "var(--brand-primary-dark)"
                }}
              />
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--brand-primary-dark)"
                }}
              >
                Share link customer
              </div>
            </div>
            <div
              style={{
                background: "white",
                padding: 8,
                borderRadius: 6,
                marginBottom: 10,
                border: "0.5px solid #B5DFA0"
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  wordBreak: "break-all"
                }}
              >
                {shareUrl}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ flex: 1, background: "white" }}
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl);
                  toast.success("Link disalin");
                }}
              >
                <Copy style={{ width: 13, height: 13 }} />
                Copy link
              </button>
              <Link
                href={`/track/${job.share_token}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ background: "white", textDecoration: "none" }}
              >
                <Eye style={{ width: 13, height: 13 }} />
                Preview
              </Link>
            </div>
          </div>

          {/* TrackSolid */}
          <div className="card card-pad">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10
              }}
            >
              <div className="eyebrow">TrackSolid</div>
              {unit && (
                <Link
                  href={`/units/${unit.id}/edit`}
                  className="btn-link"
                  style={{ fontSize: 11 }}
                >
                  Edit di unit
                </Link>
              )}
            </div>
            {unit?.tracksolid_share_link ? (
              <a
                href={unit.tracksolid_share_link}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ width: "100%", textDecoration: "none" }}
              >
                <ExternalLink style={{ width: 13, height: 13 }} />
                Buka di TrackSolid
              </a>
            ) : (
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--text-tertiary)",
                  margin: 0
                }}
              >
                Unit {unit?.kode_unit ?? "ini"} belum punya link TrackSolid.
              </p>
            )}
          </div>

          {/* Unit */}
          {unit && (
            <div className="card card-pad">
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Unit
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: "var(--bg-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-secondary)"
                  }}
                >
                  <Truck style={{ width: 20, height: 20 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{unit.kode_unit}</div>
                  <div className="caption">
                    {unit.jenis_unit_nama} · {unit.no_polisi}
                  </div>
                </div>
                <Link
                  href={`/units/${unit.id}`}
                  className="btn-link"
                  style={{ display: "inline-flex" }}
                >
                  <ArrowRight style={{ width: 14, height: 14 }} />
                </Link>
              </div>
            </div>
          )}

          {/* Driver */}
          {driver && (
            <div className="card card-pad">
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Driver
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 99,
                    background: "var(--brand-primary)",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: 13
                  }}
                >
                  {driverInitials(driver.nama)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{driver.nama}</div>
                  <div className="caption mono">{driver.no_hp}</div>
                </div>
                <a
                  href={`https://wa.me/${driver.no_hp.replace(/^\+?0/, "62")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-sm btn-icon"
                  style={{ textDecoration: "none" }}
                  title="WhatsApp"
                >
                  <MessageCircle style={{ width: 14, height: 14 }} />
                </a>
              </div>

              {/* Konfirmasi driver.
                  Job yang sudah dibuat belum tentu sudah sampai ke orangnya.
                  Sebelum ada penanda ini, job yang tidak dibaca driver baru
                  ketahuan saat truk tidak berangkat. */}
              {!closed && (
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    fontSize: 12.5
                  }}
                >
                  {job.accepted_at ? (
                    <>
                      <CheckCircle2
                        style={{
                          width: 14,
                          height: 14,
                          marginTop: 2,
                          color: "var(--brand-primary)",
                          flexShrink: 0
                        }}
                      />
                      <span>
                        Diterima driver{" "}
                        {new Date(job.accepted_at).toLocaleString("id-ID", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle
                        style={{
                          width: 14,
                          height: 14,
                          marginTop: 2,
                          color: "#B45309",
                          flexShrink: 0
                        }}
                      />
                      <span style={{ color: "#92400E" }}>
                        Belum dikonfirmasi driver. Job ini belum dibuka di
                        portal — hubungi driver kalau ETD sudah dekat.
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <UangJalanCard
            jobId={job.id}
            sumberDana={sumberDana}
            transaksi={uangJalan}
            ringkasan={uangJalanRingkasan}
          />

          {/* Audit log */}
          <div className="card">
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "0.5px solid var(--border-default)"
              }}
            >
              <div className="h3">Riwayat status</div>
              <div className="caption">Auto-log perubahan status</div>
            </div>
            <div style={{ padding: 14 }}>
              {history.length === 0 ? (
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-tertiary)",
                    textAlign: "center",
                    padding: 12
                  }}
                >
                  Belum ada perubahan.
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 0 }}
                >
                  {history.map((h, i) => (
                    <div
                      key={h.id}
                      style={{
                        display: "flex",
                        gap: 12,
                        paddingBottom: i === history.length - 1 ? 0 : 14,
                        position: "relative"
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          flexShrink: 0,
                          paddingTop: 4
                        }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 99,
                            background:
                              i === 0
                                ? "var(--brand-primary)"
                                : "var(--text-tertiary)"
                          }}
                        />
                        {i < history.length - 1 && (
                          <div
                            style={{
                              position: "absolute",
                              top: 14,
                              left: 3.5,
                              width: 1,
                              bottom: -14,
                              background: "var(--border-default)"
                            }}
                          />
                        )}
                      </div>
                      <div style={{ flex: 1, paddingBottom: 4 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 2
                          }}
                        >
                          <StatusBadge status={h.status_new} />
                        </div>
                        <div className="caption mono">
                          {formatDateTime(h.changed_at)}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: "var(--text-tertiary)"
                          }}
                        >
                          oleh {h.changed_by_nama}
                          {h.notes ? ` · ${h.notes}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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

      {/* Silence unused imports */}
      <MapPin style={{ display: "none" }} />
      <Flag style={{ display: "none" }} />
      <History style={{ display: "none" }} />
      <X style={{ display: "none" }} />
      <Button style={{ display: "none" }} />
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  fullWidth
}: {
  label: string;
  value: string;
  mono?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div style={{ gridColumn: fullWidth ? "1 / -1" : "auto" }}>
      <div
        className="eyebrow"
        style={{ marginBottom: 4, fontSize: 10.5 }}
      >
        {label}
      </div>
      <div
        className={mono ? "mono" : ""}
        style={{ fontSize: 14, fontWeight: 500 }}
      >
        {value}
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
    <div className="card">
      <div
        style={{
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "0.5px solid var(--border-default)"
        }}
      >
        <div>
          <div className="h3">{title}</div>
          <div className="caption" style={{ fontSize: 11 }}>
            {photos.length} / {max} foto
          </div>
        </div>
        {canUpload && photos.length < max && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onUpload}
          >
            <Camera style={{ width: 14, height: 14 }} />
            Upload foto
          </button>
        )}
      </div>
      <div
        className="grid"
        style={{
          padding: 14,
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 10
        }}
      >
        {photos.length === 0 ? (
          <div
            style={{
              gridColumn: "1 / -1",
              padding: 24,
              textAlign: "center",
              border: "1px dashed var(--border-strong)",
              borderRadius: 8,
              color: "var(--text-tertiary)",
              fontSize: 12.5
            }}
          >
            Belum ada foto {title.toLowerCase().replace("foto ", "")}.
          </div>
        ) : (
          photos.map((p, i) => (
            <div
              key={p.id}
              style={{
                aspectRatio: "1",
                borderRadius: 8,
                overflow: "hidden",
                border: "0.5px solid var(--border-default)",
                background: "var(--bg-page)",
                position: "relative"
              }}
            >
              <button
                type="button"
                onClick={() => onOpen(i)}
                style={{
                  width: "100%",
                  height: "100%",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer"
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.file_url}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block"
                  }}
                />
              </button>
              <button
                type="button"
                onClick={() => onDelete(p)}
                aria-label="Hapus foto"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 26,
                  height: 26,
                  borderRadius: 99,
                  background: "rgba(255,255,255,0.92)",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer"
                }}
              >
                <Trash2
                  style={{ width: 13, height: 13, color: "#C13838" }}
                />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
