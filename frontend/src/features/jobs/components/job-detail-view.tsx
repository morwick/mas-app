import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { queryClient } from "@/lib/api/query";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Copy,
  Eye,
  ExternalLink,
  FileText,
  FolderKanban,
  Link as LinkIcon,
  MessageCircle,
  Pencil,
  Printer,
  Trash2,
  Truck,
  UserRound,
  RefreshCw
} from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { TagihanJobInfo } from "./tagihan-job-info";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Lightbox } from "@/components/ui/lightbox";
import { useToast } from "@/components/ui/toast";
import { JobStepper } from "@/features/jobs/components/job-stepper";
import { UpdateStatusModal } from "@/features/jobs/components/update-status-modal";
import { UploadPhotoModal } from "@/features/jobs/components/upload-photo-modal";
import { PhotoSlots } from "@/features/jobs/components/photo-slots";
import { ValidationPanel } from "@/features/jobs/components/validation-panel";
import {
  GantiDriverModal,
  GantiTrailerModal,
  GantiUnitModal,
  GantiUnitUlangModal,
  penggantiBatalDariRiwayat,
  bolehPenggantian
} from "@/features/jobs/components/penggantian-modal";
import { useRiwayatGantiTruk } from "@/features/jobs/queries";
import { updateJobStatus } from "@/features/jobs/api";
import { deleteJobPhoto } from "@/features/jobs/api";
import type {
  Driver,
  Job,
  JobStatus,
  JobStatusHistoryEntry,
  PhotoSlot,
  PhotoStage,
  SumberDana,
  UangJalan,
  UangJalanRequest,
  UangJalanRingkasan,
  Unit
} from "@/types";
import { UangJalanCard } from "@/features/uang-jalan/components/uang-jalan-card";
import type { TambahanDibatalkan } from "@/features/uang-jalan/api";
import { formatDateTime, formatRupiah, TZ_WIB } from "@/lib/utils";

interface Props {
  job: Job;
  unit: Unit | null;
  driver: Driver | null;
  history: JobStatusHistoryEntry[];
  sumberDana: SumberDana[];
  uangJalan: UangJalan[];
  uangJalanRingkasan: UangJalanRingkasan;
  uangJalanPengajuan?: UangJalanRequest[];
  /** Pengajuan tambahan yang dibatalkan — riwayat di kartu uang jalan. */
  uangJalanDibatalkan?: TambahanDibatalkan[];
  /** Finance: hanya melihat — tidak ada tombol aksi apa pun. */
  hanyaLihat?: boolean;
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

const JUDUL_PENGGANTIAN: Record<string, string> = {
  ganti_truk: "Ganti truk",
  ganti_driver: "Ganti driver",
  ganti_trailer: "Ganti unit trailer",
  ganti_unit: "Ganti unit (job pengganti)"
};

export function JobDetailView({
  job,
  unit,
  driver,
  history,
  sumberDana,
  uangJalan,
  uangJalanRingkasan,
  uangJalanPengajuan = [],
  uangJalanDibatalkan = [],
  hanyaLihat = false
}: Props) {
  const toast = useToast();

  const photos = job.photos ?? [];
  // Foto lama (sebelum v2) tanpa slot tetap ditampilkan sebagai arsip.
  const legacyPhotos = photos.filter((p) => !p.slot);
  const allPhotoUrls = photos.map((p) => p.file_url);

  const [statusOpen, setStatusOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{ stage: PhotoStage; slot: PhotoSlot | null } | null>(null);
  // Penggantian saat job berjalan: driver (sakit/kabur), unit trailer, atau unit (job pengganti).
  const [penggantian, setPenggantian] = useState<"driver" | "trailer" | "unit" | null>(null);
  const riwayatGantiTruk = useRiwayatGantiTruk(job.id);
  // Job lama yang job penggantinya dibatalkan → "Selesaikan job dengan unit lain".
  const [gantiUlang, setGantiUlang] = useState(false);
  const penggantiBatal = penggantiBatalDariRiwayat(job, riwayatGantiTruk.data ?? []);
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
  // Job boleh dibatalkan selama uang jalan belum cair. Sesudah itu uangnya
  // sudah di tangan driver dan penutupannya lewat alur normal.
  const uangJalanCair = (job.uang_jalan_cair ?? 0) > 0;

  async function onUpdateStatus(next: JobStatus, notes?: string) {
    setPending(true);
    const res = await updateJobStatus(job.id, next, notes);
    setPending(false);
    setStatusOpen(false);
    if (res.ok) {
      toast.success("Status diperbarui");
    } else toast.error(res.error);
  }

  async function onDeletePhoto() {
    if (!deletePhoto) return;
    setPending(true);
    const res = await deleteJobPhoto(job.id, deletePhoto.id);
    setPending(false);
    setDeletePhoto(null);
    if (res.ok) {
      toast.success("Foto dihapus");
    } else toast.error(res.error);
  }

  return (
    <div className="flex flex-col gap-4">
      {!hanyaLihat && job.status === "menunggu_validasi" && (
        <ValidationPanel
          job={job}
          uangJalan={{
            total: uangJalanRingkasan.uang_jalan,
            cair: uangJalanRingkasan.cair,
            pending: uangJalanPengajuan.filter((r) => r.status === "diajukan").length
          }}
        />
      )}
      {job.validation_note && job.status !== "menunggu_validasi" && job.status !== "selesai" && (
        <div className="card card-pad" style={{ borderColor: "#e0c06a", background: "#fffaf0" }}>
          <div className="caption">Dikembalikan ke driver dengan catatan</div>
          <div className="text-[13px]">{job.validation_note}</div>
        </div>
      )}
      {/* Header card with stepper */}
      <div className="card">
        {/* Info job di atas (lebar penuh, nomor penawaran & proyek tidak terdesak),
            tombol aksi di baris sendiri di bawahnya. */}
        <div
          style={{
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}
        >
          <div style={{ minWidth: 0 }}>
            {/* Baris atas: badge penawaran & proyek (kiri), status job (kanan atas). */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
                {/* Hanya muncul untuk job yang lahir dari penawaran — job yang
                    dibuat langsung memang tidak punya, dan itu sah. */}
                {!hanyaLihat && job.quotation_id && job.quotation_number && (
                  <Link
                    to={`/quotations/${job.quotation_id}`}
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
                {job.proyek_id && job.proyek_nomor && (
                  <Link
                    to={`/proyek/${job.proyek_id}`}
                    className="mono"
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "var(--status-pickup-bg)",
                      color: "var(--status-pickup-text)",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4
                    }}
                    title="Lihat proyek induk job ini"
                  >
                    <FolderKanban style={{ width: 12, height: 12 }} />
                    {job.proyek_nomor}
                  </Link>
                )}
              </div>
              <StatusBadge status={job.status} />
            </div>
            {/* Nomor job besar + alat yang diangkut kecil di sampingnya. */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <span className="h1 mono">{job.job_number}</span>
              <span className="muted" style={{ fontSize: 14 }}>
                — {job.alat_diangkut}
              </span>
            </div>
            <div className="body muted" style={{ marginTop: 2 }}>
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
            <div className="caption" style={{ marginTop: 4 }}>
              Dibuat {formatDateTime(job.created_at)}
              {job.created_by_nama ? ` oleh ${job.created_by_nama}` : ""}
            </div>
            <TagihanJobInfo job={job} />
            {job.diganti_oleh_job_id && (
              <div className="caption" style={{ marginTop: 4 }}>
                Unit rusak — diganti{" "}
                <Link to={`/jobs/${job.diganti_oleh_job_id}`} className="mono">
                  {job.diganti_oleh_job_number}
                </Link>
                . Job ini tidak ditagih; uang jalannya tetap dihitung sebagai biaya.
              </div>
            )}
            {job.menggantikan_job_id && (
              <div className="caption" style={{ marginTop: 4 }}>
                Job pengganti untuk{" "}
                <Link to={`/jobs/${job.menggantikan_job_id}`} className="mono">
                  {job.menggantikan_job_number}
                </Link>{" "}
                (unit rusak).
              </div>
            )}
          </div>
          {!hanyaLihat && (
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
              paddingTop: 14,
              borderTop: "0.5px dashed var(--border-default)"
            }}
          >
            <Link
              to={`/jobs/${job.id}/surat-jalan`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ textDecoration: "none" }}
            >
              <Printer style={{ width: 14, height: 14 }} />
              Cetak surat jalan
            </Link>
            <Link
              to={`/jobs/${job.id}/edit`}
              className="btn btn-secondary btn-sm"
              style={{ textDecoration: "none" }}
            >
              <Pencil style={{ width: 14, height: 14 }} />
              Edit
            </Link>
            {bolehPenggantian(job) && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPenggantian("driver")}
                  title="Driver sakit / kabur: ganti driver di job yang sama."
                >
                  <UserRound style={{ width: 14, height: 14 }} />
                  Ganti driver
                </button>
                {job.unit_trailer_id && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPenggantian("trailer")}
                    title="Unit trailer rusak: ganti trailer di job yang sama."
                  >
                    <Truck style={{ width: 14, height: 14 }} />
                    Ganti unit trailer
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPenggantian("unit")}
                  title="Unit rusak / insiden: buat job pengganti di proyek yang sama."
                >
                  <Truck style={{ width: 14, height: 14 }} />
                  Ganti unit
                </button>
              </>
            )}
            {penggantiBatal.length > 0 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setGantiUlang(true)}
                title={`Job pengganti ${penggantiBatal.join(", ")} dibatalkan: buat job baru dengan unit lain.`}
              >
                <Truck style={{ width: 14, height: 14 }} />
                Selesaikan job dengan unit lain
              </button>
            )}
            {!closed && (
              // Membuka UpdateStatusModal: ubah status manual, termasuk
              // membatalkan job. Modalnya sendiri yang menyaring opsi
              // "Batalkan job" begitu uang jalan sudah cair.
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                onClick={() => setStatusOpen(true)}
              >
                <RefreshCw style={{ width: 14, height: 14 }} />
                Update Status Job
              </button>
            )}
          </div>
          )}
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
              {/* Alat diangkut sudah jadi judul di header — tidak diulang di sini. */}
              <DetailField label="Asal" value={job.asal} />
              <DetailField label="Tujuan" value={job.tujuan} />
              <DetailField label="ETD" value={formatDateTime(job.etd)} mono />
              <DetailField label="ETA" value={job.eta ? formatDateTime(job.eta) : "—"} mono />
            </div>
            {/* Unit & driver menjadi bagian detail pengiriman, di atas catatan internal. */}
            {(unit || driver) && (
              <>
                <div className="divider" style={{ margin: "14px 0" }} />
                <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 16 }}>
                  {/* Unit */}
                  {unit && (
                    <div>
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
                        {!hanyaLihat && (
                          <Link
                            to={`/units/${unit.id}`}
                            className="btn-link"
                            style={{ display: "inline-flex" }}
                          >
                            <ArrowRight style={{ width: 14, height: 14 }} />
                          </Link>
                        )}
                      </div>
                      {job.unit_trailer_kode && (
                        <div
                          className="caption"
                          style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--border-default)" }}
                        >
                          Unit trailer: <strong style={{ color: "var(--text-primary)" }}>{job.unit_trailer_kode}</strong>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Driver */}
                  {driver && (
                    <div>
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
                        {!hanyaLihat && (
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
                        )}
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
                                  timeZone: TZ_WIB,
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
                </div>
              </>
            )}
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

          {/* Foto per slot (BR-06) */}
          {(["loading", "unloading", "serah_terima"] as PhotoStage[]).map((stage) => (
            <PhotoSlots
              key={stage}
              stage={stage}
              photos={photos}
              reference={
                stage === "loading"
                  ? { lat: job.asal_lat, lng: job.asal_lng }
                  : stage === "unloading"
                    ? { lat: job.tujuan_lat, lng: job.tujuan_lng }
                    : undefined
              }
              onOpen={(p) => setLightbox({ images: allPhotoUrls, index: allPhotoUrls.indexOf(p.file_url) })}
              onDelete={closed || hanyaLihat ? undefined : (p) => setDeletePhoto({ id: p.id, path: p.file_path })}
              onUpload={closed || hanyaLihat ? undefined : (slot) => setUploadTarget({ stage, slot })}
            />
          ))}
          {legacyPhotos.length > 0 && (
            <PhotoSection
              title="Foto arsip (tanpa slot)"
              photos={legacyPhotos}
              onUpload={() => setUploadTarget({ stage: "loading", slot: null })}
              onOpen={(i) => setLightbox({ images: legacyPhotos.map((p) => p.file_url), index: i })}
              onDelete={hanyaLihat ? undefined : (p) => setDeletePhoto({ id: p.id, path: p.file_path })}
              canUpload={!closed && !hanyaLihat}
              max={5}
            />
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Pantau & bagikan: link lacak untuk customer + TrackSolid unit. */}
          {!hanyaLihat && (
            <div className="card card-pad">
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Pantau &amp; bagikan
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12.5, fontWeight: 600 }}>
                <LinkIcon style={{ width: 14, height: 14, color: "var(--brand-primary-dark)" }} />
                Link lacak customer
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  wordBreak: "break-all",
                  background: "var(--bg-subtle)",
                  padding: 8,
                  borderRadius: 6,
                  marginBottom: 8
                }}
              >
                {shareUrl}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => {
                    navigator.clipboard?.writeText(shareUrl);
                    toast.success("Link disalin");
                  }}
                >
                  <Copy style={{ width: 13, height: 13 }} />
                  Copy link
                </button>
                <Link
                  to={`/track/${job.share_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ textDecoration: "none" }}
                >
                  <Eye style={{ width: 13, height: 13 }} />
                  Preview
                </Link>
              </div>

              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "0.5px dashed var(--border-default)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>TrackSolid</span>
                {unit && (
                  <Link to={`/units/${unit.id}/edit`} className="btn-link" style={{ fontSize: 11 }}>
                    Edit di unit
                  </Link>
                )}
              </div>
              {/* BATASAN: form unit menyimpan IMEI saja bila admin mengetik IMEI (bukan
                  link) — tracksolid_share_link kosong tapi GPS tetap terpasang. Pesan
                  "belum punya" hanya untuk unit tanpa link DAN tanpa IMEI. */}
              {unit?.tracksolid_share_link ? (
                <a
                  href={unit.tracksolid_share_link}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ width: "100%", textDecoration: "none", marginTop: 8 }}
                >
                  <ExternalLink style={{ width: 13, height: 13 }} />
                  Buka di TrackSolid
                </a>
              ) : unit?.imei_gps ? (
                <>
                  <div className="caption mono" style={{ marginTop: 6 }}>
                    IMEI {unit.imei_gps}
                  </div>
                  <Link
                    to={`/tracking/${job.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ width: "100%", textDecoration: "none", marginTop: 8 }}
                  >
                    <ExternalLink style={{ width: 13, height: 13 }} />
                    Lihat lokasi di Pantau
                  </Link>
                </>
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", margin: "6px 0 0" }}>
                  Unit {unit?.kode_unit ?? "ini"} belum punya IMEI / link TrackSolid.
                </p>
              )}
            </div>
          )}

          <UangJalanCard
            jobId={job.id}
            sumberDana={sumberDana}
            transaksi={uangJalan}
            ringkasan={uangJalanRingkasan}
            pengajuan={uangJalanPengajuan}
            hanyaLihat={hanyaLihat}
            nomorTagihan={job.invoice_id ? job.invoice_number : null}
            tanggalAwal={job.created_at}
            dibatalkan={uangJalanDibatalkan}
          />

          {(riwayatGantiTruk.data ?? []).length > 0 && (
            <div className="card">
              <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--border-default)" }}>
                <div className="h3">Riwayat penggantian</div>
                <div className="caption">Ganti driver, unit trailer, atau unit selama job berjalan</div>
              </div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                {(riwayatGantiTruk.data ?? []).map((r) => (
                  <div key={r.id} style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ fontWeight: 600 }}>{JUDUL_PENGGANTIAN[r.jenis] ?? "Penggantian"}</div>
                    {r.unit_baru_kode && r.unit_lama_kode !== r.unit_baru_kode && (
                      <div>
                        Unit: {r.unit_lama_kode ?? "—"} → {r.unit_baru_kode}
                      </div>
                    )}
                    {r.unit_trailer_lama_kode !== r.unit_trailer_baru_kode && (
                      <div>
                        Unit trailer: {r.unit_trailer_lama_kode ?? "—"} → {r.unit_trailer_baru_kode ?? "—"}
                      </div>
                    )}
                    {r.driver_baru_nama && r.driver_lama_nama !== r.driver_baru_nama && (
                      <div>
                        Driver: {r.driver_lama_nama ?? "—"} → {r.driver_baru_nama}
                      </div>
                    )}
                    {(r.uang_jalan_dikembalikan > 0 || r.kasbon > 0) && (
                      <div>
                        Uang jalan dikembalikan {formatRupiah(r.uang_jalan_dikembalikan)} · kasbon supir{" "}
                        {formatRupiah(r.kasbon)}
                      </div>
                    )}
                    {r.job_pengganti_id && (
                      <div>
                        Job pengganti:{" "}
                        <Link to={`/jobs/${r.job_pengganti_id}`} className="mono">
                          {r.job_pengganti_number ?? "lihat"}
                        </Link>
                        {r.job_pengganti_status === "cancelled" && (
                          <span className="badge badge-cancelled" style={{ marginLeft: 6 }}>
                            Dibatalkan
                          </span>
                        )}
                      </div>
                    )}
                    {/* Job pengganti dibatalkan → muatan tetap harus diantar dengan unit lain. */}
                    {!hanyaLihat && r.job_pengganti_id && penggantiBatal.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setGantiUlang(true)}>
                          <Truck style={{ width: 14, height: 14 }} />
                          Selesaikan job dengan unit lain
                        </button>
                      </div>
                    )}
                    <div style={{ color: "var(--text-secondary)" }}>Alasan: {r.alasan}</div>
                    <div className="caption">
                      {formatDateTime(r.diganti_pada)}
                      {r.diganti_oleh_nama ? ` · oleh ${r.diganti_oleh_nama}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
        uangJalanCair={uangJalanCair}
        onConfirm={onUpdateStatus}
      />
      <UploadPhotoModal
        open={uploadTarget !== null}
        onClose={() => setUploadTarget(null)}
        type={uploadTarget?.stage ?? "loading"}
        slot={uploadTarget?.slot ?? null}
        jobId={job.id}
        onDone={() => queryClient.invalidateQueries()}
      />
      {penggantian === "driver" && (
        <GantiDriverModal job={job} driverNama={driver?.nama} onClose={() => setPenggantian(null)} />
      )}
      {penggantian === "trailer" && <GantiTrailerModal job={job} onClose={() => setPenggantian(null)} />}
      {gantiUlang && (
        <GantiUnitUlangModal job={job} penggantiBatal={penggantiBatal} onClose={() => setGantiUlang(false)} />
      )}
      {penggantian === "unit" && (
        <GantiUnitModal job={job} unitKode={unit?.kode_unit} onClose={() => setPenggantian(null)} />
      )}
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
  onDelete?: (p: { id: string; file_path: string }) => void;
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
              {onDelete && (
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
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
