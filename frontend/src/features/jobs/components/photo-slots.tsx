/**
 * Foto per slot untuk satu tahap (BR-06): judul per sisi kendaraan, penanda
 * kualitas rendah, waktu pengambilan, dan jarak ke titik acuan job.
 */

import { Camera, AlertTriangle, MapPin, Clock, Trash2, Upload } from "lucide-react";
import { REQUIRED_SLOTS, SLOT_LABEL, STAGE_LABEL } from "@/lib/job-status";
import { haversineKm } from "@/lib/routing/eta";
import { formatDateTime } from "@/lib/utils";
import type { JobPhoto, PhotoSlot, PhotoStage } from "@/types";

interface Props {
  stage: PhotoStage;
  photos: JobPhoto[];
  /** Titik acuan (lokasi muat/bongkar) untuk menghitung jarak foto. */
  reference?: { lat: number | null | undefined; lng: number | null | undefined };
  onOpen: (photo: JobPhoto) => void;
  onDelete?: (photo: JobPhoto) => void;
  onUpload?: (slot: PhotoSlot) => void;
}

export function PhotoSlots({ stage, photos, reference, onOpen, onDelete, onUpload }: Props) {
  const slots = REQUIRED_SLOTS[stage];
  const bySlot = new Map<PhotoSlot, JobPhoto>();
  for (const p of photos) if (p.stage === stage && p.slot) bySlot.set(p.slot, p);
  const filled = slots.filter((s) => bySlot.has(s)).length;

  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 10 }}>
        <div>
          <div className="h3">{STAGE_LABEL[stage]}</div>
          <div className="caption">
            {filled}/{slots.length} slot terisi
          </div>
        </div>
        <span className={`badge ${filled === slots.length ? "badge-selesai" : "badge-perbaikan"}`}>
          {filled === slots.length ? "Lengkap" : "Belum lengkap"}
        </span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        {slots.map((slot) => {
          const p = bySlot.get(slot);
          const jarak =
            p?.lat != null && p?.lng != null && reference?.lat != null && reference?.lng != null
              ? haversineKm(p.lat, p.lng, reference.lat, reference.lng)
              : null;
          return (
            <div
              key={slot}
              className="rounded-lg border border-border bg-card overflow-hidden flex flex-col"
            >
              {p ? (
                <button
                  type="button"
                  onClick={() => onOpen(p)}
                  className="block w-full"
                  style={{ aspectRatio: "4/3", background: "var(--bg-subtle)", overflow: "hidden" }}
                >
                  <img src={p.file_url} alt={SLOT_LABEL[slot]} className="w-full h-full object-cover" />
                </button>
              ) : (
                <div
                  className="flex items-center justify-center text-text-subtle"
                  style={{ aspectRatio: "4/3", background: "var(--bg-subtle)" }}
                >
                  <Camera style={{ width: 22, height: 22 }} />
                </div>
              )}
              <div style={{ padding: "8px 10px" }} className="flex flex-col gap-1">
                <div className="text-[12.5px] font-medium">{SLOT_LABEL[slot]}</div>
                {p ? (
                  <>
                    {p.kualitas_rendah && (
                      <div className="text-[11px] text-amber-700 flex items-center gap-1">
                        <AlertTriangle style={{ width: 12, height: 12 }} />
                        Kualitas rendah
                        {p.sharpness_score != null ? ` (${Math.round(p.sharpness_score)})` : ""}
                      </div>
                    )}
                    {p.taken_at && (
                      <div className="text-[11px] text-text-muted flex items-center gap-1">
                        <Clock style={{ width: 11, height: 11 }} />
                        {formatDateTime(p.taken_at)}
                      </div>
                    )}
                    {jarak != null && (
                      <div className="text-[11px] text-text-muted flex items-center gap-1">
                        <MapPin style={{ width: 11, height: 11 }} />
                        {jarak < 1 ? `${Math.round(jarak * 1000)} m` : `${jarak.toFixed(1)} km`} dari titik acuan
                      </div>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        className="btn-link text-[11px]"
                        style={{ color: "#c13838", alignSelf: "flex-start" }}
                        onClick={() => onDelete(p)}
                      >
                        <Trash2 style={{ width: 11, height: 11 }} /> Hapus
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-[11px] text-text-subtle">Belum ada</div>
                    {onUpload && (
                      <button
                        type="button"
                        className="btn-link text-[11px]"
                        style={{ alignSelf: "flex-start" }}
                        onClick={() => onUpload(slot)}
                      >
                        <Upload style={{ width: 11, height: 11 }} /> Unggah
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
