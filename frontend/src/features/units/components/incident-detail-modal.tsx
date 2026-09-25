import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Receipt,
  Wrench
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lightbox } from "@/components/ui/lightbox";
import {
  IncidentActionButtons,
  type IncidentAction
} from "@/features/units/components/incident-actions";
import {
  incidentStatusLabel,
  incidentTypeLabel,
  type Incident
} from "@/types";
import { formatDateTime, formatRupiah } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  incident: Incident | null;
  /** Tanpa ini modal hanya-baca (user tanpa hak kelola operasional). */
  onAction?: (action: IncidentAction) => void;
  onEdit?: () => void;
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

export function IncidentDetailModal({ open, onClose, incident, onAction, onEdit }: Props) {
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
  } | null>(null);

  if (!incident) return null;

  const photoUrls = incident.photos.map((p) => p.file_url);

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
            {onAction && onEdit ? (
              <IncidentActionButtons incident={incident} onAction={onAction} onEdit={onEdit} />
            ) : (
              <span />
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Tutup
            </Button>
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
