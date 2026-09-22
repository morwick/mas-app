"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Receipt,
  Trash2,
  Wrench
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbox } from "@/components/ui/lightbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  deleteIncidentAction,
  resolveIncidentAction,
  setIncidentStatusAction
} from "@/lib/actions/incidents";
import {
  incidentStatusLabel,
  incidentTypeLabel,
  type Incident
} from "@/lib/types";
import { formatDateTime, formatRupiah } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  incident: Incident | null;
}

const tipeIconColor: Record<string, string> = {
  kecelakaan: "text-status-cancelled-fg bg-status-cancelled-bg",
  kerusakan: "text-status-perbaikan-fg bg-status-perbaikan-bg",
  breakdown: "text-status-perbaikan-fg bg-status-perbaikan-bg",
  lainnya: "text-status-info-fg bg-status-info-bg"
};

const statusBadgeVariant: Record<
  string,
  "warning" | "info" | "brand" | "neutral"
> = {
  open: "warning",
  in_progress: "info",
  resolved: "brand"
};

export function IncidentDetailModal({ open, onClose, incident }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [setStandby, setSetStandby] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
  } | null>(null);

  if (!incident) return null;

  const photoUrls = incident.photos.map((p) => p.file_url);

  async function startProgress() {
    setPending(true);
    const res = await setIncidentStatusAction(incident!.id, "in_progress");
    setPending(false);
    if (res.ok) {
      toast.success("Insiden ditandai dalam penanganan");
      router.refresh();
    } else toast.error(res.error);
  }

  async function doResolve() {
    setPending(true);
    const res = await resolveIncidentAction(incident!.id, {
      setUnitToStandby: setStandby
    });
    setPending(false);
    setResolveOpen(false);
    if (res.ok) {
      toast.success("Insiden ditandai selesai");
      onClose();
      router.refresh();
    } else toast.error(res.error);
  }

  async function doDelete() {
    setPending(true);
    const res = await deleteIncidentAction(incident!.id);
    setPending(false);
    setDeleteOpen(false);
    if (res.ok) {
      toast.success("Insiden dihapus");
      onClose();
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={
          <span className="flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-md flex items-center justify-center ${
                tipeIconColor[incident.tipe] ?? ""
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </span>
            {incidentTypeLabel[incident.tipe]}
          </span>
        }
        description={`Dicatat ${formatDateTime(incident.created_at)} · oleh ${
          incident.created_by_nama ?? "Sistem"
        }`}
        maxWidth="max-w-[640px]"
        footer={
          <div className="flex items-center justify-between w-full flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={pending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Hapus
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClose} disabled={pending}>
                Tutup
              </Button>
              {incident.status === "open" && (
                <Button onClick={startProgress} loading={pending}>
                  Tandai dalam penanganan
                </Button>
              )}
              {incident.status !== "resolved" && (
                <Button
                  variant={incident.status === "in_progress" ? "primary" : "secondary"}
                  onClick={() => setResolveOpen(true)}
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                  disabled={pending}
                >
                  Selesaikan
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge variant={statusBadgeVariant[incident.status]}>
              {incidentStatusLabel[incident.status]}
            </Badge>
            {incident.job_number && (
              <Badge variant="neutral">Job {incident.job_number}</Badge>
            )}
          </div>

          <div className="grid gap-3 text-[13px]">
            <Row
              icon={<CalendarClock className="w-4 h-4" />}
              label="Tanggal kejadian"
            >
              {formatDateTime(incident.tanggal)}
            </Row>
            {incident.lokasi && (
              <Row icon={<MapPin className="w-4 h-4" />} label="Lokasi">
                {incident.lokasi}
              </Row>
            )}
            <Row icon={<Wrench className="w-4 h-4" />} label="Deskripsi">
              <span className="whitespace-pre-wrap">{incident.deskripsi}</span>
            </Row>
            {(incident.biaya_repair !== null || incident.vendor_repair) && (
              <Row icon={<Receipt className="w-4 h-4" />} label="Repair">
                {incident.biaya_repair !== null && incident.biaya_repair !== undefined ? (
                  <span className="font-medium">
                    {formatRupiah(incident.biaya_repair)}
                  </span>
                ) : null}
                {incident.vendor_repair && (
                  <span className="text-text-muted">
                    {incident.biaya_repair !== null && incident.biaya_repair !== undefined ? " · " : ""}
                    {incident.vendor_repair}
                  </span>
                )}
              </Row>
            )}
            {incident.resolved_at && (
              <Row
                icon={<CheckCircle2 className="w-4 h-4 text-brand" />}
                label="Diselesaikan pada"
              >
                {formatDateTime(incident.resolved_at)}
              </Row>
            )}
          </div>

          {photoUrls.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-subtle mb-2">
                Foto bukti
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photoUrls.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightbox({ images: photoUrls, index: i })}
                    className="aspect-square rounded-md overflow-hidden border border-border bg-page"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        title="Tandai insiden selesai?"
        body={
          <div className="space-y-3">
            <p>
              Status insiden akan berubah jadi <strong>Selesai</strong>. Tindakan
              ini bisa di-revert dengan ubah status manual nanti.
            </p>
            <label className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={setStandby}
                onChange={(e) => setSetStandby(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-brand"
              />
              <span>
                Kembalikan unit{" "}
                <strong>{incident.unit_kode ?? "ini"}</strong> ke status{" "}
                <strong>Standby</strong> setelah ini
              </span>
            </label>
          </div>
        }
        confirmText="Ya, selesaikan"
        variant="primary"
        loading={pending}
        onConfirm={doResolve}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Hapus catatan insiden?"
        body="Tindakan ini permanen. Semua foto bukti juga akan dihapus."
        confirmText="Ya, hapus"
        variant="danger"
        loading={pending}
        onConfirm={doDelete}
      />

      <Lightbox
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        images={lightbox?.images ?? []}
        initialIndex={lightbox?.index ?? 0}
      />
    </>
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
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
